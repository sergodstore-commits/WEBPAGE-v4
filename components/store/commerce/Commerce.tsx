'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Trophy,
  Truck,
  UserRound,
} from 'lucide-react';
import { api, date, deliveryLabels, money, paymentLabels, price } from '@/lib/client';
import type { CartItem, Order, Product, Settings, User } from '@/lib/types';
import {
  useRemote,
  Status,
  Loading,
  Empty,
  PageIntro,
  RemoteError,
  ProductImage,
  availability,
} from '../shared';
import styles from './Commerce.module.css';
const CHECKOUT_KEY = 'sergod-store-checkout-v1';

type DeliveryForm = {
  method: 'pickup' | 'shipping';
  carrier_id: string;
  recipient: string;
  phone: string;
  commune: string;
  region: string;
  address: string;
  agency: string;
};
const initialDelivery: DeliveryForm = {
  method: 'pickup',
  carrier_id: '',
  recipient: '',
  phone: '',
  commune: '',
  region: 'Atacama',
  address: '',
  agency: '',
};
export function Cart({
  cart,
  setCart,
  settings,
  user,
  ready,
}: {
  cart: CartItem[];
  setCart: (v: CartItem[]) => void;
  settings: Settings;
  user: User | null;
  ready: boolean;
}) {
  const products = useRemote<Product[]>('/products?kind=store'),
    preorders = useRemote<Product[]>('/products?kind=preorder');
  const [delivery, setDelivery] = useState<DeliveryForm>(initialDelivery),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const key = useRef('');
  const intro = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = intro.current?.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
    intro.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [step]);
  useEffect(() => {
    if (user)
      setDelivery((d) => ({
        ...d,
        recipient: user.address.recipient || user.name,
        phone: user.address.phone || user.phone,
        commune: user.address.commune || '',
        region: user.address.region || 'Atacama',
        address: user.address.address || '',
        agency: user.address.agency || '',
      }));
  }, [user]);
  useEffect(() => {
    key.current = '';
    setError('');
  }, [cart, delivery]);
  const all = [...(products.data || []), ...(preorders.data || [])],
    rows = cart.map((i) => ({ ...i, product: all.find((p) => p.id === i.product_id) })),
    subtotal = rows.reduce((sum, i) => sum + (i.product ? price(i.product) * i.quantity : 0), 0),
    original = rows.reduce((sum, i) => sum + (i.product ? i.product.price * i.quantity : 0), 0),
    carriers = settings.carriers.filter((c) => c.enabled),
    carrier = carriers.find((c) => c.id === delivery.carrier_id),
    shipping =
      step === 'checkout' && delivery.method === 'shipping' && carrier && !carrier.collect
        ? carrier.price
        : 0;
  const unavailable = rows.some(
    (i) =>
      !i.product ||
      Boolean(availability(i.product)) ||
      i.quantity > Math.min(100, i.product.available, i.product.max_per_customer || 999),
  );
  function field(name: keyof DeliveryForm, value: string) {
    setDelivery((d) => ({ ...d, [name]: value }));
  }
  async function checkout(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (step !== 'checkout') {
      if (!unavailable) setStep('checkout');
      return;
    }
    if (busy) return;
    if (!user) {
      setError('Inicia sesión para continuar con la compra.');
      return;
    }
    if (!user.email_verified) {
      setError(
        'Verifica tu correo electrónico antes de comprar. Puedes solicitar un nuevo enlace en tu cuenta.',
      );
      return;
    }
    if (unavailable) {
      setError('Revisa las cantidades y los artículos sin disponibilidad antes de continuar.');
      return;
    }
    setBusy(true);
    try {
      if (!key.current) key.current = crypto.randomUUID();
      const result = await api<{ order: Order; payment_url: string }>('/checkout', {
        method: 'POST',
        body: JSON.stringify({ items: cart, delivery, idempotency_key: key.current }),
      });
      if (!result.payment_url)
        throw new Error(
          'No se recibió un enlace de pago. Revisa tu pedido antes de volver a intentarlo.',
        );
      localStorage.setItem(CHECKOUT_KEY, JSON.stringify({ orderId: result.order.id }));
      window.location.assign(result.payment_url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  if (!ready || products.loading || preorders.loading) return <Loading />;
  if (products.error || preorders.error)
    return (
      <div className={`store-page ${styles.page}`}>
        <RemoteError
          error={products.error || preorders.error}
          reload={() => {
            products.reload();
            preorders.reload();
          }}
        />
      </div>
    );
  return (
    <div className={`store-page ${styles.page}`}>
      <div ref={intro} className={styles.intro}>
        <PageIntro
          eyebrow="TU PRÓXIMA PARTIDA"
          title={step === 'cart' ? 'Tu carrito' : 'Entrega y pago'}
          body={
            step === 'cart'
              ? 'Revisa tus artículos y cantidades antes de continuar.'
              : 'Elige cómo recibir tu pedido y revisa el total antes de ir a Flow.'
          }
        />
      </div>
      {cart.length > 0 && (
        <ol className={styles.steps} aria-label="Pasos de la compra">
          <li aria-current={step === 'cart' ? 'step' : undefined}>
            <span>1</span>Carrito
          </li>
          <li aria-current={step === 'checkout' ? 'step' : undefined}>
            <span>2</span>Entrega y revisión
          </li>
          <li>
            <span>3</span>Pago en Flow
          </li>
        </ol>
      )}
      {!cart.length ? (
        <Empty
          icon={<ShoppingBag size={30} />}
          title="Tu carrito está esperando"
          body="Explora la tienda y añade los artículos que quieras llevar a tu colección."
        >
          <Link href="/tienda" className="store-button">
            Ir a la tienda <ArrowRight size={17} />
          </Link>
        </Empty>
      ) : (
        <form className="store-checkout-layout" onSubmit={checkout}>
          <div>
            {step === 'checkout' && (
              <button
                type="button"
                className="store-text-link store-back-cart"
                disabled={busy}
                onClick={() => setStep('cart')}
              >
                <ArrowLeft size={16} />
                Volver al carrito
              </button>
            )}
            <div className="store-cart-items">
              {rows.map((row) => {
                const p = row.product,
                  limit = p
                    ? Math.min(
                        100,
                        p.available,
                        (p.kind === 'preorder' ? p.max_per_customer : 100) || 100,
                      )
                    : 0,
                  issue = !p
                    ? 'Este artículo ya no está publicado.'
                    : availability(p) ||
                      (row.quantity > limit ? `Solo puedes comprar ${limit} unidades.` : '');
                return (
                  <div className="store-cart-item" key={row.product_id}>
                    <Link href={p ? `/producto/${p.slug}` : '/tienda'}>
                      <ProductImage src={p?.images[0]} name={p?.name || 'Artículo no disponible'} />
                    </Link>
                    <div className="store-cart-item-name">
                      {p && <small>{p.kind === 'preorder' ? 'PREVENTA' : p.category}</small>}
                      <Link href={p ? `/producto/${p.slug}` : '/tienda'}>
                        {p?.name || 'Artículo no disponible'}
                      </Link>
                      {p && <span>{money(price(p))} por unidad</span>}
                      {issue && <p className="store-inline-error">{issue}</p>}
                    </div>
                    <div className="store-cart-item-controls">
                      <div className="store-quantity">
                        <button
                          type="button"
                          aria-label={`Disminuir cantidad de ${p?.name || 'artículo'}`}
                          disabled={row.quantity <= 1 || busy}
                          onClick={() =>
                            setCart(
                              cart.map((i) =>
                                i.product_id === row.product_id
                                  ? { ...i, quantity: i.quantity - 1 }
                                  : i,
                              ),
                            )
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          aria-label={`Cantidad de ${p?.name || 'artículo'}`}
                          type="number"
                          min={1}
                          max={Math.max(1, limit)}
                          value={row.quantity}
                          disabled={busy}
                          onChange={(e) =>
                            setCart(
                              cart.map((i) =>
                                i.product_id === row.product_id
                                  ? {
                                      ...i,
                                      quantity: Math.max(
                                        1,
                                        Math.min(100, Math.trunc(Number(e.target.value)) || 1),
                                      ),
                                    }
                                  : i,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Aumentar cantidad de ${p?.name || 'artículo'}`}
                          disabled={row.quantity >= limit || busy}
                          onClick={() =>
                            setCart(
                              cart.map((i) =>
                                i.product_id === row.product_id
                                  ? { ...i, quantity: i.quantity + 1 }
                                  : i,
                              ),
                            )
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <strong>{p ? money(price(p) * row.quantity) : '—'}</strong>
                      <button
                        type="button"
                        className="store-icon-button"
                        aria-label={`Eliminar ${p?.name || 'artículo'}`}
                        disabled={busy}
                        onClick={() => setCart(cart.filter((i) => i.product_id !== row.product_id))}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {step === 'checkout' && (
              <fieldset
                className={`store-delivery-form ${styles.fieldset}`}
                disabled={busy}
                aria-labelledby="delivery-heading"
              >
                <h2 id="delivery-heading">¿Cómo quieres recibir tu pedido?</h2>
                <div className="store-delivery-options">
                  <label className={delivery.method === 'pickup' ? 'is-selected' : ''}>
                    <input
                      type="radio"
                      name="method"
                      value="pickup"
                      checked={delivery.method === 'pickup'}
                      onChange={() => field('method', 'pickup')}
                    />
                    <Store size={21} />
                    <span>
                      <strong>Retiro en local</strong>
                      <small>Sin costo de envío</small>
                    </span>
                  </label>
                  <label
                    className={`${delivery.method === 'shipping' ? 'is-selected' : ''} ${!carriers.length ? 'is-disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="method"
                      value="shipping"
                      disabled={!carriers.length}
                      checked={delivery.method === 'shipping'}
                      onChange={() => field('method', 'shipping')}
                    />
                    <Truck size={21} />
                    <span>
                      <strong>Envío</strong>
                      <small>
                        {carriers.length
                          ? 'Con transportista habilitado'
                          : 'Sin opciones habilitadas'}
                      </small>
                    </span>
                  </label>
                </div>
                {delivery.method === 'pickup' ? (
                  <div className="store-pickup-details">
                    <h3>{settings.address || 'Retiro en SERGOD STORE, Copiapó'}</h3>
                    {settings.hours && <p className="store-preline">{settings.hours}</p>}
                    {settings.pickup_instructions && (
                      <p className="store-preline">{settings.pickup_instructions}</p>
                    )}
                    {!settings.address && (
                      <p>La dirección de retiro aún no ha sido configurada por la tienda.</p>
                    )}
                    <p>Espera a que tu pedido figure como «Listo para retiro» antes de venir.</p>
                  </div>
                ) : (
                  <div className="store-field-grid">
                    <label className="store-label store-span-2">
                      Transportista
                      <select
                        required
                        value={delivery.carrier_id}
                        onChange={(e) => field('carrier_id', e.target.value)}
                      >
                        <option value="">Selecciona un transportista</option>
                        {carriers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {c.mode === 'agency' ? 'Retiro en agencia' : 'A domicilio'} ·{' '}
                            {c.collect ? 'Por pagar' : money(c.price)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {carrier?.collect && (
                      <div className="store-shipping-notice store-span-2">
                        <Truck size={19} />
                        <p>
                          <strong>Envío por pagar al recibir.</strong> El transportista cobrará el
                          flete por separado. Ese importe no está incluido en el total que pagarás
                          en Flow.
                        </p>
                      </div>
                    )}
                    <label className="store-label">
                      Nombre del destinatario
                      <input
                        required
                        autoComplete="shipping name"
                        value={delivery.recipient}
                        onChange={(e) => field('recipient', e.target.value)}
                      />
                    </label>
                    <label className="store-label">
                      Teléfono de contacto
                      <input
                        required
                        type="tel"
                        autoComplete="shipping tel"
                        value={delivery.phone}
                        onChange={(e) => field('phone', e.target.value)}
                        placeholder="+56 9 1234 5678"
                      />
                    </label>
                    <label className="store-label">
                      Región
                      <input
                        required
                        autoComplete="shipping address-level1"
                        value={delivery.region}
                        onChange={(e) => field('region', e.target.value)}
                      />
                    </label>
                    <label className="store-label">
                      Comuna
                      <input
                        required
                        autoComplete="shipping address-level2"
                        value={delivery.commune}
                        onChange={(e) => field('commune', e.target.value)}
                      />
                    </label>
                    {carrier?.mode === 'agency' ? (
                      <label className="store-label store-span-2">
                        Agencia de destino
                        <input
                          required
                          value={delivery.agency}
                          onChange={(e) => field('agency', e.target.value)}
                          placeholder="Nombre y dirección de la agencia"
                        />
                      </label>
                    ) : (
                      <label className="store-label store-span-2">
                        Dirección de entrega
                        <input
                          required
                          autoComplete="shipping street-address"
                          value={delivery.address}
                          onChange={(e) => field('address', e.target.value)}
                          placeholder="Calle, número, departamento y referencia"
                        />
                      </label>
                    )}
                  </div>
                )}
              </fieldset>
            )}
            {step === 'cart' && (
              <Link href="/tienda" className="store-text-link store-continue-shopping">
                <ArrowLeft size={16} />
                Seguir comprando
              </Link>
            )}
          </div>
          <aside className="store-order-summary" aria-labelledby="cart-summary-title">
            <h2 id="cart-summary-title">Resumen de la compra</h2>
            <dl>
              <div>
                <dt>Artículos ({cart.reduce((s, i) => s + i.quantity, 0)})</dt>
                <dd>{money(original)}</dd>
              </div>
              {original > subtotal && (
                <div>
                  <dt>Descuentos</dt>
                  <dd>−{money(original - subtotal)}</dd>
                </div>
              )}
              <div>
                <dt>Entrega</dt>
                <dd>
                  {step === 'cart'
                    ? 'Por elegir'
                    : delivery.method === 'pickup'
                      ? 'Retiro gratis'
                      : carrier?.collect
                        ? 'Por pagar'
                        : carrier
                          ? money(shipping)
                          : 'Por elegir'}
                </dd>
              </div>
              <div className="store-total">
                <dt>{step === 'checkout' ? 'Total a pagar online' : 'Total'}</dt>
                <dd>{money(subtotal + shipping)}</dd>
              </div>
            </dl>
            {carrier?.collect && delivery.method === 'shipping' && (
              <p className="store-summary-note">El flete se paga directamente al transportista.</p>
            )}
            <Status message={error} error />
            {unavailable && (
              <Status
                message="Hay artículos o cantidades sin disponibilidad. Ajusta el carrito para continuar."
                error
              />
            )}
            {step === 'cart' ? (
              <button
                key="review-delivery"
                type="button"
                className="store-button store-full"
                disabled={unavailable}
                onClick={(e) => {
                  e.preventDefault();
                  setStep('checkout');
                }}
              >
                Continuar con la compra <ArrowRight size={17} />
              </button>
            ) : !user ? (
              <>
                <p className="store-summary-note">
                  Inicia sesión para guardar tu pedido y continuar con el pago.
                </p>
                <Link href="/cuenta?next=carrito" className="store-button store-full">
                  Iniciar sesión <ArrowRight size={17} />
                </Link>
              </>
            ) : !user.email_verified ? (
              <>
                <p className="store-summary-note">
                  Debes verificar tu correo para realizar la compra.
                </p>
                <Link href="/cuenta" className="store-button store-full">
                  Verificar mi cuenta
                </Link>
              </>
            ) : (
              <button
                key="submit-payment"
                type="submit"
                className="store-button store-full"
                disabled={busy || unavailable || (delivery.method === 'shipping' && !carrier)}
              >
                {busy ? (
                  <>
                    <span className="store-spinner" />
                    Preparando tu pago…
                  </>
                ) : (
                  <>
                    Ir a pagar con Flow <ArrowRight size={17} />
                  </>
                )}
              </button>
            )}
            <div className="store-summary-security">
              <ShieldCheck size={18} />
              <span>El pedido se confirma después de que Flow verifique el pago.</span>
            </div>
            <details className={styles.reservation}>
              <summary>Reserva de unidades: {settings.reservation_minutes} minutos</summary>
              <p className="store-summary-note">
                Las unidades se reservan durante {settings.reservation_minutes} minutos. Al terminar
                ese plazo verificamos el pago con Flow antes de liberar las unidades. Si el pago se
                confirma después de liberar la reserva, la tienda revisará la disponibilidad.
              </p>
            </details>
          </aside>
        </form>
      )}
    </div>
  );
}

export function Account({
  pathname,
  user,
  ready,
  refreshUser,
}: {
  pathname: string;
  user: User | null;
  ready: boolean;
  refreshUser: () => Promise<void>;
}) {
  const [paymentNotice, setPaymentNotice] = useState(false);
  useEffect(() => {
    setPaymentNotice(
      new URLSearchParams(window.location.search).get('payment') === 'verification_pending',
    );
  }, []);
  if (pathname === '/cuenta/verificar')
    return <TokenAction action="verify" refreshUser={refreshUser} />;
  if (pathname === '/cuenta/restablecer')
    return <TokenAction action="reset" refreshUser={refreshUser} />;
  if (!ready) return <Loading />;
  return (
    <>
      {paymentNotice && (
        <Status message="Todavía no pudimos verificar el resultado con Flow. Consulta tu pedido en Mis pedidos y actualiza el estado del pago antes de volver a comprar." />
      )}
      {user ? (
        <AccountDashboard user={user} refreshUser={refreshUser} />
      ) : (
        <AuthForms refreshUser={refreshUser} />
      )}
    </>
  );
}
function AuthForms({ refreshUser }: { refreshUser: () => Promise<void> }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const router = useRouter();
  function change(mode: 'login' | 'register' | 'forgot') {
    setMode(mode);
    setMessage('');
    setError('');
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData(e.currentTarget),
      body = Object.fromEntries(form.entries());
    try {
      const result = await api<{ message?: string }>(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (mode === 'login') {
        await refreshUser();
        if (new URLSearchParams(window.location.search).get('next') === 'carrito')
          router.push('/carrito');
      } else if (mode === 'register') {
        setMessage(
          result.message ||
            'Tu cuenta fue creada. Revisa tu correo y abre el enlace de verificación antes de comprar.',
        );
        await refreshUser();
      } else
        setMessage(
          result.message ||
            'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.',
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`store-page store-auth-page ${styles.page} ${styles.auth}`}>
      <div className="store-auth-copy">
        <div className="store-eyebrow">TU ESPACIO EN SERGOD</div>
        <h1>
          Tu colección.
          <br />
          Tus próximas partidas.
        </h1>
        <p>
          Guarda tus datos, consulta tus compras y sigue el estado de tus pedidos desde un solo
          lugar.
        </p>
        <div className="store-auth-benefit">
          <Package size={21} />
          <div>
            <strong>Pedidos y preventas</strong>
            <span>Revisa pagos, preparación y entrega.</span>
          </div>
        </div>
        <div className="store-auth-benefit">
          <Trophy size={21} />
          <div>
            <strong>Datos para torneos</strong>
            <span>Añade tu Konami ID y código KLU.</span>
          </div>
        </div>
        <Link href="/tienda" className="store-text-link">
          Explorar la tienda <ArrowRight size={16} />
        </Link>
      </div>
      <div className="store-auth-card">
        {mode !== 'forgot' && (
          <div className="store-auth-tabs">
            <button
              disabled={busy}
              aria-pressed={mode === 'login'}
              onClick={() => change('login')}
              className={mode === 'login' ? 'is-active' : ''}
            >
              Iniciar sesión
            </button>
            <button
              disabled={busy}
              aria-pressed={mode === 'register'}
              onClick={() => change('register')}
              className={mode === 'register' ? 'is-active' : ''}
            >
              Crear cuenta
            </button>
          </div>
        )}
        <h2>
          {mode === 'login'
            ? 'Qué bueno verte de nuevo'
            : mode === 'register'
              ? 'Bienvenido a la comunidad'
              : 'Recupera tu contraseña'}
        </h2>
        <p>
          {mode === 'login'
            ? 'Ingresa con tu correo y contraseña.'
            : mode === 'register'
              ? 'Te enviaremos un correo para verificar tu cuenta.'
              : 'Escribe el correo asociado a tu cuenta.'}
        </p>
        <Status message={message} />
        <Status message={error} error />
        <form className="store-form" onSubmit={submit} key={mode}>
          {mode === 'register' && (
            <label className="store-label">
              Nombre completo
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                placeholder="Tu nombre"
              />
            </label>
          )}
          <label className="store-label">
            Correo electrónico
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="tu@correo.cl"
            />
          </label>
          {mode !== 'forgot' && (
            <label className="store-label">
              Contraseña
              <input
                name="password"
                type="password"
                minLength={mode === 'register' ? 12 : 1}
                maxLength={128}
                required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? 'Al menos 12 caracteres' : 'Tu contraseña'}
              />
              {mode === 'register' && <small>Usa al menos 12 caracteres.</small>}
            </label>
          )}
          {mode === 'login' && (
            <button
              type="button"
              className="store-text-link store-forgot"
              onClick={() => change('forgot')}
            >
              Olvidé mi contraseña
            </button>
          )}
          <button className="store-button store-full" disabled={busy}>
            {busy
              ? 'Un momento…'
              : mode === 'login'
                ? 'Iniciar sesión'
                : mode === 'register'
                  ? 'Crear mi cuenta'
                  : 'Enviar enlace'}
            {!busy && <ArrowRight size={16} />}
          </button>
        </form>
        {mode === 'forgot' && (
          <button className="store-text-link store-auth-back" onClick={() => change('login')}>
            <ArrowLeft size={15} />
            Volver a iniciar sesión
          </button>
        )}
      </div>
    </div>
  );
}
function TokenAction({
  action,
  refreshUser,
}: {
  action: 'verify' | 'reset';
  refreshUser: () => Promise<void>;
}) {
  const [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  const attempted = useRef(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('token') || '';
    setToken(value);
    if (!value)
      setError('El enlace no incluye un token válido. Solicita un nuevo enlace desde tu cuenta.');
    if (action === 'verify' && value && !attempted.current) {
      attempted.current = true;
      setBusy(true);
      api('/auth/verify', { method: 'POST', body: JSON.stringify({ token: value }) })
        .then(async () => {
          setMessage('Tu correo está verificado. Ya puedes continuar con tus compras.');
          setDone(true);
          await refreshUser();
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(false));
    }
  }, [action, refreshUser]);
  async function reset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get('password') !== data.get('confirmation')) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password: data.get('password') }),
      });
      setDone(true);
      setMessage('Tu contraseña fue actualizada. Ahora puedes iniciar sesión.');
      await refreshUser();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`store-page store-token-page ${styles.page}`}>
      <div className="store-auth-card">
        <div className="store-empty-icon">
          <ShieldCheck size={27} />
        </div>
        <h1>{action === 'verify' ? 'Verificación de correo' : 'Nueva contraseña'}</h1>
        {busy && action === 'verify' && <Loading />}
        <Status message={message} />
        <Status message={error} error />
        {action === 'reset' && !done && token && (
          <form className="store-form" onSubmit={reset}>
            <label className="store-label">
              Nueva contraseña
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
              <small>Al menos 12 caracteres.</small>
            </label>
            <label className="store-label">
              Confirma la contraseña
              <input
                type="password"
                name="confirmation"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </label>
            <button className="store-button" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
        <Link href="/cuenta" className="store-text-link store-auth-back">
          Ir a mi cuenta <ArrowRight size={17} />
        </Link>
      </div>
    </div>
  );
}
function AccountDashboard({ user, refreshUser }: { user: User; refreshUser: () => Promise<void> }) {
  const [tab, setTab] = useState<'orders' | 'profile'>('orders'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const orders = useRemote<Order[]>('/orders');
  async function logout() {
    setBusy(true);
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      await refreshUser();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await api<{ message?: string }>('/auth/resend', {
        method: 'POST',
        body: '{}',
      });
      setMessage(result.message || 'Enviamos un nuevo enlace. Revisa tu correo electrónico.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    const fields = Object.fromEntries(new FormData(e.currentTarget).entries());
    const { name, phone, konami_id, klu_code, ...address } = fields;
    try {
      await api('/account', {
        method: 'PATCH',
        body: JSON.stringify({ name, phone, konami_id, klu_code, address }),
      });
      await refreshUser();
      setMessage('Tus datos fueron guardados correctamente.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`store-page ${styles.page}`}>
      <PageIntro
        eyebrow="MI CUENTA"
        title={`Hola, ${user.name.split(' ')[0]}`}
        body="Tus datos, tus pedidos y tus próximas partidas."
      >
        <button className="store-button store-button-secondary" disabled={busy} onClick={logout}>
          Cerrar sesión
        </button>
      </PageIntro>
      {!user.email_verified && (
        <div className="store-verification">
          <div>
            <strong>Verifica tu correo para poder comprar</strong>
            <p>
              Enviamos un enlace a {user.email}. Revisa también la carpeta de correo no deseado.
            </p>
          </div>
          <button className="store-button store-button-secondary" disabled={busy} onClick={resend}>
            Reenviar correo
          </button>
        </div>
      )}
      <Status message={message} />
      <Status message={error} error />
      <div className="store-account-layout">
        <aside className="store-account-nav">
          <button
            aria-pressed={tab === 'orders'}
            className={tab === 'orders' ? 'is-active' : ''}
            onClick={() => setTab('orders')}
          >
            <Package size={18} />
            Mis pedidos
          </button>
          <button
            aria-pressed={tab === 'profile'}
            className={tab === 'profile' ? 'is-active' : ''}
            onClick={() => setTab('profile')}
          >
            <UserRound size={18} />
            Mis datos
          </button>
          {user.role === 'admin' && (
            <Link href="/admin">
              <Store size={18} />
              Administrar tienda <ArrowRight size={16} />
            </Link>
          )}
        </aside>
        <div className="store-account-content">
          {tab === 'orders' ? (
            <>
              <div className="store-panel-heading">
                <h2>Pedidos y preventas</h2>
                <button className="store-text-link" onClick={orders.reload}>
                  Actualizar
                </button>
              </div>
              {orders.loading ? (
                <Loading />
              ) : orders.error ? (
                <RemoteError error={orders.error} reload={orders.reload} />
              ) : orders.data?.length ? (
                <div className="store-order-list">
                  {orders.data.map((o) => (
                    <Link key={o.id} href={`/cuenta/pedidos/${o.id}`} className="store-order-row">
                      <div>
                        <strong>Pedido #{o.number}</strong>
                        {o.payment_environment === 'sandbox' && (
                          <small>Prueba sandbox, sin cobro real</small>
                        )}
                        <small>{date(o.created_at)}</small>
                      </div>
                      <div>
                        <span className={styles.stateLabel}>Pago</span>
                        <span className={`store-pill store-payment-${o.payment_status}`}>
                          {o.payment_status === 'pending' && o.reservation_released_at
                            ? 'Pago por verificar'
                            : paymentLabels[o.payment_status] || o.payment_status}
                        </span>
                        <small>
                          {o.payment_status === 'pending' && o.reservation_released_at
                            ? 'Reserva liberada'
                            : `Entrega: ${deliveryLabels[o.fulfillment_status] || o.fulfillment_status}`}
                        </small>
                      </div>
                      <strong>{money(o.total)}</strong>
                      <ArrowRight size={18} />
                    </Link>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Aquí comienza tu historial"
                  body="Cuando realices una compra, podrás consultar aquí el pago y la entrega."
                >
                  <Link href="/tienda" className="store-button">
                    Explorar artículos <ArrowRight size={16} />
                  </Link>
                </Empty>
              )}
            </>
          ) : (
            <form className="store-profile-form store-form" onSubmit={save}>
              <h2>Datos personales</h2>
              <div className="store-field-grid">
                <label className="store-label">
                  Nombre completo
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={user.name}
                    autoComplete="name"
                  />
                </label>
                <label className="store-label">
                  Teléfono
                  <input
                    name="phone"
                    type="tel"
                    maxLength={30}
                    defaultValue={user.phone}
                    autoComplete="tel"
                  />
                </label>
                <label className="store-label store-span-2">
                  Correo electrónico
                  <input value={user.email} disabled readOnly />
                  <small>
                    {user.email_verified ? 'Correo verificado' : 'Pendiente de verificación'}
                  </small>
                </label>
              </div>
              <div className="store-form-section">
                <h3>Dirección de entrega</h3>
                <p>Estos datos se completarán al comprar. Podrás cambiarlos en cada pedido.</p>
                <div className="store-field-grid">
                  <label className="store-label">
                    Destinatario
                    <input
                      name="recipient"
                      defaultValue={user.address.recipient || ''}
                      autoComplete="shipping name"
                    />
                  </label>
                  <label className="store-label">
                    Región
                    <input
                      name="region"
                      defaultValue={user.address.region || ''}
                      autoComplete="shipping address-level1"
                    />
                  </label>
                  <label className="store-label">
                    Comuna
                    <input
                      name="commune"
                      defaultValue={user.address.commune || ''}
                      autoComplete="shipping address-level2"
                    />
                  </label>
                  <label className="store-label">
                    Agencia preferida (opcional)
                    <input name="agency" defaultValue={user.address.agency || ''} />
                  </label>
                  <label className="store-label store-span-2">
                    Dirección
                    <input
                      name="address"
                      defaultValue={user.address.address || ''}
                      autoComplete="shipping street-address"
                    />
                  </label>
                </div>
              </div>
              <div className="store-form-section">
                <h3>Datos para torneos</h3>
                <p>Son opcionales. Puedes agregarlos cuando los necesites.</p>
                <div className="store-field-grid">
                  <label className="store-label">
                    Konami ID
                    <input name="konami_id" defaultValue={user.konami_id} maxLength={50} />
                  </label>
                  <label className="store-label">
                    Código KLU
                    <input name="klu_code" defaultValue={user.klu_code} maxLength={50} />
                  </label>
                </div>
              </div>
              <button className="store-button" disabled={busy}>
                {busy ? 'Guardando…' : 'Guardar mis datos'}
                <Check size={16} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
export function OrderDetail({
  id,
  user,
  ready,
  cart,
  setCart,
}: {
  id: string;
  user: User | null;
  ready: boolean;
  cart: CartItem[];
  setCart: (v: CartItem[]) => void;
}) {
  const remote = useRemote<Order>(ready && user ? `/orders/${encodeURIComponent(id)}` : null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const checked = useRef(false),
    cleared = useRef(false);
  async function refresh() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/orders/${encodeURIComponent(id)}/refresh`, { method: 'POST', body: '{}' });
      remote.reload();
      setMessage('Consultamos el estado del pago con Flow.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (remote.data?.payment_status === 'approved' && !cleared.current) {
      cleared.current = true;
      try {
        const checkout = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || 'null');
        if (checkout?.orderId === remote.data.id) {
          const purchased = new Map<string, number>(
            remote.data.items.map((i) => [i.product_id, i.quantity]),
          );
          setCart(
            cart
              .map((i) => ({ ...i, quantity: i.quantity - (purchased.get(i.product_id) || 0) }))
              .filter((i) => i.quantity > 0),
          );
          localStorage.removeItem(CHECKOUT_KEY);
        }
      } catch {}
    }
  }, [remote.data, cart, setCart]);
  useEffect(() => {
    if (
      remote.data?.payment_status === 'pending' &&
      remote.data.can_refresh_payment &&
      !checked.current
    ) {
      checked.current = true;
      refresh();
    }
  }, [remote.data]);
  if (!ready || remote.loading) return <Loading />;
  if (!user)
    return (
      <div className={`store-page ${styles.page}`}>
        <Empty
          icon={<UserRound size={30} />}
          title="Inicia sesión para ver tu pedido"
          body="El estado del pago y la entrega están disponibles en tu cuenta."
        >
          <Link href="/cuenta" className="store-button">
            Iniciar sesión
          </Link>
        </Empty>
      </div>
    );
  if (remote.error)
    return (
      <div className={`store-page ${styles.page}`}>
        <RemoteError error={remote.error} reload={remote.reload} />
      </div>
    );
  const o = remote.data;
  if (!o) return null;
  const delivery = o.delivery;
  const releasedPending = o.payment_status === 'pending' && Boolean(o.reservation_released_at);
  return (
    <div className={`store-page ${styles.page}`}>
      <Link href="/cuenta" className="store-text-link">
        <ArrowLeft size={16} />
        Mis pedidos
      </Link>
      <PageIntro
        eyebrow="DETALLE DE LA COMPRA"
        title={`Pedido #${o.number}`}
        body={date(o.created_at)}
      />
      {o.payment_environment === 'sandbox' && (
        <div className="store-message" role="status">
          Pedido de prueba sandbox · sin cobro real.
        </div>
      )}
      <div
        className="store-order-status"
        data-payment={o.payment_status}
        role="region"
        aria-label="Estado del pago"
      >
        <div>
          <span className={`store-pill store-payment-${o.payment_status}`}>
            {releasedPending ? 'Pago por verificar' : paymentLabels[o.payment_status]}
          </span>
          <h2>
            {o.payment_status === 'approved'
              ? 'Tu pago está confirmado'
              : o.payment_status === 'pending'
                ? releasedPending
                  ? 'La reserva terminó; estamos verificando el pago'
                  : 'Estamos esperando la confirmación del pago'
                : o.payment_status === 'expired'
                  ? 'El plazo de reserva terminó'
                  : o.payment_status === 'rejected'
                    ? 'El pago no fue aprobado'
                    : 'Estamos revisando el pago'}
          </h2>
          <p>
            {o.payment_status === 'approved'
              ? 'Puedes seguir la preparación y entrega de tu pedido en esta página.'
              : o.payment_status === 'pending'
                ? releasedPending
                  ? 'Las unidades fueron liberadas al terminar la reserva. Si ya pagaste o tu pago está en trámite, espera la confirmación antes de volver a comprar. Si el pago se aprueba, revisaremos la disponibilidad para completar tu pedido.'
                  : `Confirmaremos tu pedido cuando Flow verifique el pago.${o.expires_at ? ' El plazo de reserva termina el ' + date(o.expires_at) + '; después consultamos el pago antes de liberar las unidades.' : ''}`
                : o.payment_status === 'expired'
                  ? 'Las unidades reservadas fueron liberadas. Puedes volver a comprar según disponibilidad.'
                  : o.payment_status === 'rejected'
                    ? 'Puedes volver a la tienda y realizar una nueva compra.'
                    : 'La tienda revisará el resultado antes de confirmar el pedido.'}
          </p>
        </div>
        {o.payment_status === 'pending' && o.can_refresh_payment && (
          <div className="store-order-status-actions">
            <button
              className="store-button store-button-secondary"
              disabled={busy}
              onClick={refresh}
            >
              {busy ? 'Consultando…' : 'Actualizar pago'}
            </button>
            {o.payment_url && !releasedPending && (
              <a className="store-button" href={o.payment_url}>
                Continuar pago <ArrowRight size={16} />
              </a>
            )}
          </div>
        )}
      </div>
      <Status message={message} />
      <Status message={error} error />
      <div className="store-order-detail-grid">
        <div>
          <section className="store-order-panel">
            <h2>Artículos del pedido</h2>
            {o.items.map((i, index) => (
              <div className="store-order-item" key={i.product_id + index}>
                <ProductImage src={i.image} name={i.name} />
                <div>
                  <strong>{i.name}</strong>
                  <small>
                    {i.quantity} × {money(i.unit_price)}
                    {i.kind === 'preorder' ? ' · Preventa' : ''}
                  </small>
                  <small>SKU: {i.sku}</small>
                </div>
                <strong>{money(i.quantity * i.unit_price)}</strong>
              </div>
            ))}
            <dl className="store-order-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(o.subtotal)}</dd>
              </div>
              <div>
                <dt>Entrega</dt>
                <dd>
                  {delivery.method === 'pickup'
                    ? 'Retiro gratis'
                    : delivery.collect
                      ? 'Por pagar'
                      : money(o.shipping_price)}
                </dd>
              </div>
              <div className="store-total">
                <dt>
                  {o.payment_status === 'approved'
                    ? o.payment_method === 'flow'
                      ? 'Total pagado online'
                      : 'Total pagado'
                    : o.payment_status === 'pending'
                      ? 'Total a pagar online'
                      : 'Total del pedido'}
                </dt>
                <dd>{money(o.total)}</dd>
              </div>
            </dl>
          </section>
          {o.events && o.events.length > 0 && (
            <section className="store-order-panel">
              <h2>Historial del pedido</h2>
              <ol className="store-timeline">
                {o.events.map((event) => (
                  <li key={event.id}>
                    <span />
                    <div>
                      <p>{event.message}</p>
                      <small>{date(event.created_at)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
        <aside>
          <section className="store-order-panel">
            <h2>{delivery.method === 'pickup' ? 'Retiro en local' : 'Información de envío'}</h2>
            <span className="store-pill">{deliveryLabels[o.fulfillment_status]}</span>
            <dl className="store-order-delivery">
              {delivery.method === 'pickup' ? (
                <>
                  {delivery.address && (
                    <div>
                      <dt>Dirección</dt>
                      <dd>{String(delivery.address)}</dd>
                    </div>
                  )}
                  {delivery.hours && (
                    <div>
                      <dt>Horario</dt>
                      <dd>{String(delivery.hours)}</dd>
                    </div>
                  )}
                  {delivery.instructions && (
                    <div>
                      <dt>Instrucciones</dt>
                      <dd>{String(delivery.instructions)}</dd>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <dt>Destinatario</dt>
                    <dd>{String(delivery.recipient || o.customer_name)}</dd>
                  </div>
                  <div>
                    <dt>Teléfono</dt>
                    <dd>{String(delivery.phone || '—')}</dd>
                  </div>
                  <div>
                    <dt>Destino</dt>
                    <dd>
                      {String(delivery.agency || delivery.address || '—')}
                      <br />
                      {String(delivery.commune || '')}
                      {delivery.region ? `, ${delivery.region}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Transportista</dt>
                    <dd>{o.carrier || String(delivery.carrier || 'Por confirmar')}</dd>
                  </div>
                  {o.tracking && (
                    <div>
                      <dt>Número de seguimiento</dt>
                      <dd>{o.tracking}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
            {Boolean(delivery.collect) && (
              <p className="store-shipping-notice">
                El flete se paga por separado al transportista y no forma parte del total online.
              </p>
            )}
          </section>
          <section className="store-order-panel">
            <h2>Datos de la compra</h2>
            <p>
              {o.customer_name}
              <br />
              {o.customer_email}
            </p>
            <p className="store-muted">
              Medio de pago: {o.payment_method === 'flow' ? 'Flow' : o.payment_method}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
