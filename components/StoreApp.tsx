'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  HeartHandshake,
  ImageIcon,
  MapPin,
  Menu,
  Minus,
  Newspaper,
  Package,
  PackageOpen,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Trophy,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import { api, date, deliveryLabels, money, paymentLabels, price } from '@/lib/client';
import type { CartItem, Order, Post, Product, Settings, User } from '@/lib/types';
import './store.css';

const CART_KEY = 'sergod-store-cart-v1';
const CHECKOUT_KEY = 'sergod-store-checkout-v1';
const emptySettings: Settings = {
  name: 'SERGOD STORE',
  description: '',
  address: '',
  hours: '',
  pickup_instructions: '',
  phone: '',
  email: '',
  reservation_minutes: 20,
  carriers: [],
};
const sections = [
  { href: '/tienda', label: 'Tienda' },
  { href: '/preventas', label: 'Preventas' },
  { href: '/comunidad', label: 'Comunidad' },
  { href: '/noticias', label: 'Noticias' },
  { href: '/torneos', label: 'Torneos' },
];
type Remote<T> = { data: T | null; loading: boolean; error: string; reload: () => void };

function useRemote<T>(path: string | null): Remote<T> {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(Boolean(path)),
    [error, setError] = useState(''),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    api<T>(path)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, loading, error, reload: () => setVersion((v) => v + 1) };
}
function Status({ message, error = false }: { message: string; error?: boolean }) {
  return message ? (
    <div
      className={`store-message ${error ? 'store-message-error' : ''}`}
      role={error ? 'alert' : 'status'}
    >
      {error ? <span aria-hidden="true">!</span> : <Check size={18} />}
      <div>{message}</div>
    </div>
  ) : null;
}
function Loading() {
  return (
    <div className="store-loading" role="status">
      <span className="store-spinner" />
      Cargando información…
    </div>
  );
}
function Empty({
  icon = <PackageOpen size={30} />,
  title,
  body,
  children,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="store-empty">
      <div className="store-empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  );
}
function PageIntro({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="store-page-intro">
      <div>
        {eyebrow && <div className="store-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </div>
      {children}
    </div>
  );
}
function RemoteError({ error, reload }: { error: string; reload: () => void }) {
  return (
    <div className="store-error-box">
      <Status message={error} error />
      <button className="store-button store-button-secondary" onClick={reload}>
        Volver a intentar
      </button>
    </div>
  );
}
function ProductImage({
  src,
  name,
  className = '',
}: {
  src?: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`store-product-image ${className}`}>
      {src && !failed ? (
        <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <div className="store-no-image">
          <ImageIcon size={34} strokeWidth={1} />
          <span>Sin imagen disponible</span>
        </div>
      )}
    </div>
  );
}
function availability(p: Product) {
  const now = Date.now();
  if (p.kind === 'preorder' && p.opens_at && new Date(p.opens_at).getTime() > now)
    return 'La preventa aún no abre';
  if (p.kind === 'preorder' && p.closes_at && new Date(p.closes_at).getTime() <= now)
    return 'Preventa finalizada';
  if (p.available < 1) return 'Agotado';
  return '';
}
function ProductCard({
  product: p,
  add,
}: {
  product: Product;
  add: (p: Product, n?: number) => void;
}) {
  const closed = availability(p);
  return (
    <article className="store-product-card">
      <Link href={`/producto/${p.slug}`} className="store-product-visual">
        <ProductImage src={p.images[0]} name={p.name} />
        {p.discount_percent > 0 && <span className="store-discount">−{p.discount_percent}%</span>}
        {p.kind === 'preorder' && <span className="store-kind-label">Preventa</span>}
      </Link>
      <div className="store-product-content">
        <p className="store-product-category">{p.category || 'Coleccionables'}</p>
        <Link href={`/producto/${p.slug}`} className="store-product-title">
          {p.name}
        </Link>
        <div className="store-product-price">
          <strong>{money(price(p))}</strong>
          {p.discount_percent > 0 && <del>{money(p.price)}</del>}
        </div>
        <div className="store-product-bottom">
          <span className={closed ? 'store-muted' : 'store-stock-dot'}>
            {closed || `${p.available} disponibles`}
          </span>
          <button
            className="store-icon-button store-add-button"
            aria-label={`Añadir ${p.name} al carrito`}
            title={closed || 'Añadir al carrito'}
            disabled={Boolean(closed)}
            onClick={() => add(p)}
          >
            <Plus size={19} />
          </button>
        </div>
      </div>
    </article>
  );
}
function PostCard({ post: p }: { post: Post }) {
  return (
    <article className="store-post-card">
      <Link href={`/publicacion/${p.slug}`}>
        <ProductImage src={p.image} name={p.title} className="store-post-image" />
      </Link>
      <div className="store-post-card-content">
        <span className="store-eyebrow">
          {p.kind === 'news' ? 'Noticias' : p.kind === 'community' ? 'Comunidad' : 'Torneos'}
        </span>
        <h3>
          <Link href={`/publicacion/${p.slug}`}>{p.title}</Link>
        </h3>
        <p>
          {p.body.slice(0, 145)}
          {p.body.length > 145 ? '…' : ''}
        </p>
        <div className="store-post-meta">
          <CalendarDays size={15} />
          {date(p.event_at || p.created_at)}
        </div>
        <Link className="store-text-link" href={`/publicacion/${p.slug}`}>
          Leer más <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}

export default function StoreApp({ pathname: pathnameProp }: { pathname?: string } = {}) {
  const livePath = usePathname(),
    pathname = pathnameProp || livePath || '/',
    router = useRouter();
  const [settings, setSettings] = useState<Settings>(emptySettings),
    [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [cart, setCart] = useState<CartItem[]>([]),
    [cartReady, setCartReady] = useState(false),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState('');
  const refreshUser = useCallback(async () => {
    try {
      setUser(await api<User | null>('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setAuthReady(true);
    }
  }, []);
  useEffect(() => {
    api<Settings>('/settings')
      .then(setSettings)
      .catch(() => {});
    refreshUser();
    try {
      const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (Array.isArray(saved))
        setCart(
          saved
            .filter(
              (x: CartItem) =>
                x &&
                typeof x.product_id === 'string' &&
                Number.isInteger(x.quantity) &&
                x.quantity > 0,
            )
            .map((x: CartItem) => ({
              product_id: x.product_id,
              quantity: Math.min(100, x.quantity),
            })),
        );
    } catch {}
    setCartReady(true);
  }, [refreshUser]);
  useEffect(() => {
    if (cartReady) localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart, cartReady]);
  useEffect(() => {
    setMenu(false);
  }, [pathname]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  function add(p: Product, n = 1) {
    const existing = cart.find((i) => i.product_id === p.id)?.quantity || 0,
      limit = Math.min(
        100,
        p.available,
        p.kind === 'preorder' && p.max_per_customer ? p.max_per_customer : 100,
      );
    if (availability(p)) {
      setToast(availability(p));
      return;
    }
    if (existing + n > limit) {
      setToast(`Puedes añadir hasta ${limit} unidades de este artículo.`);
      return;
    }
    setCart((current) => {
      const found = current.find((i) => i.product_id === p.id);
      return found
        ? current.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + n } : i))
        : [...current, { product_id: p.id, quantity: n }];
    });
    setToast(`${p.name} se añadió al carrito.`);
  }
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  let content: ReactNode;
  if (pathname === '/') content = <Home settings={settings} add={add} />;
  else if (pathname === '/tienda' || pathname === '/preventas')
    content = (
      <Catalog key={pathname} kind={pathname === '/tienda' ? 'store' : 'preorder'} add={add} />
    );
  else if (pathname.startsWith('/producto/'))
    content = <ProductDetail slug={pathname.split('/')[2]} add={add} />;
  else if (['/noticias', '/comunidad', '/torneos'].includes(pathname))
    content = (
      <Posts
        key={pathname}
        kind={
          pathname === '/noticias' ? 'news' : pathname === '/comunidad' ? 'community' : 'tournament'
        }
      />
    );
  else if (pathname.startsWith('/publicacion/'))
    content = <PostDetail slug={pathname.split('/')[2]} />;
  else if (pathname === '/carrito')
    content = (
      <Cart
        cart={cart}
        setCart={setCart}
        settings={settings}
        user={user}
        ready={authReady && cartReady}
      />
    );
  else if (pathname.startsWith('/cuenta/pedidos/') || pathname.startsWith('/pedido/'))
    content = (
      <OrderDetail
        id={pathname.split('/').filter(Boolean).at(-1) || ''}
        user={user}
        ready={authReady}
        cart={cart}
        setCart={setCart}
      />
    );
  else if (pathname.startsWith('/cuenta'))
    content = (
      <Account pathname={pathname} user={user} ready={authReady} refreshUser={refreshUser} />
    );
  else
    content = (
      <Empty
        title="No encontramos esta página"
        body="Puedes volver al inicio o explorar los artículos disponibles."
      >
        <Link href="/" className="store-button">
          Volver al inicio
        </Link>
      </Empty>
    );
  return (
    <div className="store-app">
      <div className="store-topbar">
        <span>Cartas coleccionables · Copiapó, Chile</span>
        <span>
          <MapPin size={12} /> Tu comunidad, tu tienda
        </span>
      </div>
      <header className="store-header">
        <div className="store-header-inner">
          <Link href="/" className="store-brand" aria-label="SERGOD STORE, inicio">
            <span className="store-brand-mark">
              S<span>↗</span>
            </span>
            <span>
              SERGOD<span className="store-brand-store">STORE</span>
            </span>
          </Link>
          <nav className="store-nav" aria-label="Navegación principal">
            {sections.map((s) => (
              <Link key={s.href} href={s.href} className={pathname === s.href ? 'is-active' : ''}>
                {s.label}
              </Link>
            ))}
          </nav>
          <div className="store-header-actions">
            <Link
              href="/cuenta"
              className="store-icon-button store-account-link"
              aria-label="Mi cuenta"
            >
              <UserRound size={20} />
              <span>{user ? 'Mi cuenta' : 'Ingresar'}</span>
            </Link>
            <Link
              href="/carrito"
              className="store-icon-button store-cart-link"
              aria-label={`Carrito, ${count} artículos`}
            >
              <ShoppingBag size={21} />
              {count > 0 && <span className="store-cart-count">{count}</span>}
            </Link>
            <button
              className="store-icon-button store-menu-toggle"
              aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="store-mobile-nav" aria-label="Navegación móvil">
            {sections.map((s) => (
              <Link key={s.href} href={s.href}>
                {s.label}
                <ArrowRight size={16} />
              </Link>
            ))}
            {user?.role === 'admin' && (
              <Link href="/admin">
                Administrar tienda <ArrowRight size={16} />
              </Link>
            )}
          </nav>
        )}
      </header>
      <main className="store-main" id="contenido">
        {content}
      </main>
      <footer className="store-footer">
        <div className="store-footer-main">
          <div>
            <Link href="/" className="store-footer-brand">
              SERGOD STORE<span>Cartas & comunidad.</span>
            </Link>
            <p>
              Una tienda de cartas coleccionables
              <br />
              en Copiapó, Chile.
            </p>
            {settings.email && <a href={`mailto:${settings.email}`}>{settings.email}</a>}
          </div>
          <div>
            <h3>Explora</h3>
            {sections.map((s) => (
              <Link key={s.href} href={s.href}>
                {s.label}
              </Link>
            ))}
          </div>
          <div>
            <h3>Tu compra</h3>
            <Link href="/cuenta">Mi cuenta y pedidos</Link>
            <Link href="/carrito">Carrito de compras</Link>
            <p>
              Retiro en local y envío con
              <br />
              los transportistas habilitados.
            </p>
          </div>
          <div>
            <h3>Visítanos</h3>
            {settings.address ? (
              <p>{settings.address}</p>
            ) : (
              <p>
                Copiapó, Región de Atacama
                <br />
                Chile
              </p>
            )}
            {settings.hours && <p className="store-preline">{settings.hours}</p>}
            {settings.phone && <a href={`tel:${settings.phone}`}>{settings.phone}</a>}
          </div>
        </div>
        <div className="store-footer-bottom">
          <span>© {new Date().getFullYear()} SERGOD STORE</span>
          <span>Precios en pesos chilenos (CLP)</span>
          <Link href="/admin">
            Administración <ArrowRight size={13} />
          </Link>
        </div>
      </footer>
      {toast && (
        <div className="store-toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label="Cerrar aviso" onClick={() => setToast('')}>
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function Home({ settings, add }: { settings: Settings; add: (p: Product, n?: number) => void }) {
  const products = useRemote<Product[]>('/products?kind=store'),
    preorders = useRemote<Product[]>('/products?kind=preorder'),
    posts = useRemote<Post[]>('/posts');
  return (
    <>
      <section className="store-hero">
        <div className="store-hero-copy">
          <div className="store-eyebrow">
            <span className="store-square" /> SERGOD STORE · COPIAPÓ
          </div>
          <h1>
            Tu próxima partida
            <br />
            empieza aquí<span>.</span>
          </h1>
          <p>
            {settings.description ||
              'Un espacio para las cartas coleccionables y la comunidad. Encuentra artículos, conoce las preventas y mantente al día con la tienda.'}
          </p>
          <div className="store-button-row">
            <Link href="/tienda" className="store-button">
              Explorar la tienda <ArrowRight size={18} />
            </Link>
            <Link href="/comunidad" className="store-button store-button-secondary">
              Nuestra comunidad
            </Link>
          </div>
          <div className="store-hero-note">
            <MapPin size={15} /> Desde Copiapó, para tu colección.
          </div>
        </div>
        <div className="store-hero-directory">
          <div className="store-eyebrow">EXPLORA LA TIENDA</div>
          <Link href="/tienda">
            <ShoppingBag size={21} />
            <span>
              <strong>Tienda</strong>
              <small>Catálogo, precios y disponibilidad</small>
            </span>
            <ArrowRight size={18} />
          </Link>
          <Link href="/preventas">
            <Clock3 size={21} />
            <span>
              <strong>Preventas</strong>
              <small>Fechas, cupos y condiciones de reserva</small>
            </span>
            <ArrowRight size={18} />
          </Link>
          <Link href="/comunidad">
            <HeartHandshake size={21} />
            <span>
              <strong>Comunidad</strong>
              <small>Encuentros y publicaciones de la tienda</small>
            </span>
            <ArrowRight size={18} />
          </Link>
          <Link href="/noticias">
            <Newspaper size={21} />
            <span>
              <strong>Noticias</strong>
              <small>Anuncios para estar al día</small>
            </span>
            <ArrowRight size={18} />
          </Link>
          <Link href="/torneos">
            <Trophy size={21} />
            <span>
              <strong>Torneos</strong>
              <small>Formatos y próximas fechas publicadas</small>
            </span>
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      <div className="store-service-row">
        <div>
          <Store size={21} />
          <span>
            <strong>Retiro en local</strong>
            <small>Encuéntranos en Copiapó</small>
          </span>
        </div>
        <div>
          <Truck size={21} />
          <span>
            <strong>Envíos dentro de Chile</strong>
            <small>Opciones al finalizar tu compra</small>
          </span>
        </div>
        <div>
          <CreditCard size={21} />
          <span>
            <strong>Pago online con Flow</strong>
            <small>Revisa el total antes de pagar</small>
          </span>
        </div>
      </div>
      <section className="store-section">
        <div className="store-section-heading">
          <div>
            <div className="store-eyebrow">PARA TU COLECCIÓN</div>
            <h2>En la tienda</h2>
          </div>
          <Link href="/tienda" className="store-text-link">
            Ver catálogo <ArrowRight size={17} />
          </Link>
        </div>
        {products.loading ? (
          <Loading />
        ) : products.error ? (
          <RemoteError error={products.error} reload={products.reload} />
        ) : products.data?.length ? (
          <div className="store-product-grid">
            {products.data.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} add={add} />
            ))}
          </div>
        ) : (
          <Empty
            title="El catálogo se está preparando"
            body="Aquí encontrarás los artículos cuando la tienda los publique."
          />
        )}
      </section>
      <section className="store-preorder-banner">
        <div className="store-banner-icon">
          <Clock3 size={37} strokeWidth={1.25} />
        </div>
        <div>
          <div className="store-eyebrow">RESERVA TU PRÓXIMA COLECCIÓN</div>
          <h2>Adelántate con nuestras preventas.</h2>
          <p>
            {preorders.data?.length
              ? `${preorders.data.length} ${preorders.data.length === 1 ? 'artículo publicado' : 'artículos publicados'}. Consulta fechas, cupos y condiciones de entrega.`
              : 'Consulta aquí las próximas reservas que publique la tienda.'}
          </p>
        </div>
        <Link href="/preventas" className="store-button store-button-light">
          Ver preventas <ArrowRight size={18} />
        </Link>
      </section>
      <section className="store-section">
        <div className="store-section-heading">
          <div>
            <div className="store-eyebrow">MÁS QUE CARTAS</div>
            <h2>Lo que nos reúne</h2>
          </div>
        </div>
        <div className="store-community-links">
          <Link href="/comunidad">
            <HeartHandshake size={25} />
            <div>
              <h3>Comunidad</h3>
              <p>Novedades y encuentros de la tienda.</p>
            </div>
            <ArrowRight size={20} />
          </Link>
          <Link href="/noticias">
            <Newspaper size={25} />
            <div>
              <h3>Noticias</h3>
              <p>Todo lo que necesitas saber.</p>
            </div>
            <ArrowRight size={20} />
          </Link>
          <Link href="/torneos">
            <Trophy size={25} />
            <div>
              <h3>Torneos</h3>
              <p>Fechas, formatos y cómo participar.</p>
            </div>
            <ArrowRight size={20} />
          </Link>
        </div>
        {posts.error ? (
          <RemoteError error={posts.error} reload={posts.reload} />
        ) : posts.data && posts.data.length > 0 ? (
          <div className="store-post-grid store-home-posts">
            {posts.data.slice(0, 3).map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        ) : null}
      </section>
      {settings.address && (
        <section className="store-visit">
          <div>
            <span className="store-eyebrow">NOS VEMOS EN LA TIENDA</span>
            <h2>Tu punto de encuentro en Copiapó.</h2>
          </div>
          <div>
            <p>
              <MapPin size={18} />
              {settings.address}
            </p>
            {settings.hours && (
              <p>
                <Clock3 size={18} />
                <span className="store-preline">{settings.hours}</span>
              </p>
            )}
            {settings.pickup_instructions && <small>{settings.pickup_instructions}</small>}
          </div>
        </section>
      )}
    </>
  );
}

function Catalog({
  kind,
  add,
}: {
  kind: 'store' | 'preorder';
  add: (p: Product, n?: number) => void;
}) {
  const products = useRemote<Product[]>(`/products?kind=${kind}`),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [sort, setSort] = useState('recent'),
    [available, setAvailable] = useState(false);
  const categories = useMemo(
    () => [...new Set((products.data || []).map((p) => p.category).filter(Boolean))].sort(),
    [products.data],
  );
  const visible = useMemo(() => {
    const q = search.toLocaleLowerCase('es').trim();
    return (products.data || [])
      .filter(
        (p) =>
          (!q || `${p.name} ${p.description} ${p.sku}`.toLocaleLowerCase('es').includes(q)) &&
          (!category || p.category === category) &&
          (!available || !availability(p)),
      )
      .sort((a, b) =>
        sort === 'price-asc'
          ? price(a) - price(b)
          : sort === 'price-desc'
            ? price(b) - price(a)
            : sort === 'name'
              ? a.name.localeCompare(b.name)
              : b.created_at.localeCompare(a.created_at),
      );
  }, [products.data, search, category, sort, available]);
  return (
    <div className="store-page">
      <PageIntro
        eyebrow={kind === 'store' ? 'EXPLORA EL CATÁLOGO' : 'PRÓXIMOS LANZAMIENTOS'}
        title={kind === 'store' ? 'Tienda' : 'Preventas'}
        body={
          kind === 'store'
            ? 'Encuentra tu próximo artículo. Consulta el stock disponible y elige cómo recibirlo.'
            : 'Reserva con información clara: fechas, cupos disponibles y condiciones de entrega.'
        }
      />
      <div className="store-catalog-layout">
        <aside className="store-filters">
          <h2>Filtrar artículos</h2>
          <label className="store-label">
            Categoría
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="store-check">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            Solo disponibles
          </label>
          {(search || category || available) && (
            <button
              className="store-text-link store-reset"
              onClick={() => {
                setSearch('');
                setCategory('');
                setAvailable(false);
              }}
            >
              Limpiar filtros <X size={14} />
            </button>
          )}
          <div className="store-filter-note">
            <Package size={23} />
            <strong>
              {kind === 'preorder' ? 'Reserva con tranquilidad' : 'Stock de la tienda'}
            </strong>
            <p>
              {kind === 'preorder'
                ? 'Revisa las condiciones de cada preventa. Los cupos se confirman al aprobarse el pago.'
                : 'La disponibilidad se comparte con las ventas del local y se comprueba al comprar.'}
            </p>
          </div>
        </aside>
        <div className="store-catalog-results">
          <div className="store-catalog-toolbar">
            <label className="store-search">
              <Search size={18} />
              <input
                aria-label="Buscar artículos"
                placeholder="Buscar por nombre o SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Borrar búsqueda" onClick={() => setSearch('')}>
                  <X size={16} />
                </button>
              )}
            </label>
            <label className="store-sort">
              <span>Ordenar</span>
              <select
                aria-label="Ordenar artículos"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">Más recientes</option>
                <option value="price-asc">Menor precio</option>
                <option value="price-desc">Mayor precio</option>
                <option value="name">Nombre: A–Z</option>
              </select>
            </label>
          </div>
          <div className="store-results-count">
            {products.loading
              ? 'Consultando catálogo…'
              : `${visible.length} ${visible.length === 1 ? 'artículo' : 'artículos'}`}
          </div>
          {products.loading ? (
            <Loading />
          ) : products.error ? (
            <RemoteError error={products.error} reload={products.reload} />
          ) : visible.length ? (
            <div className="store-product-grid store-catalog-grid">
              {visible.map((p) => (
                <ProductCard key={p.id} product={p} add={add} />
              ))}
            </div>
          ) : (
            <Empty
              title={
                products.data?.length
                  ? 'No encontramos coincidencias'
                  : kind === 'store'
                    ? 'Aún no hay artículos publicados'
                    : 'Aún no hay preventas publicadas'
              }
              body={
                products.data?.length
                  ? 'Prueba otra búsqueda o cambia los filtros.'
                  : 'Los artículos aparecerán aquí cuando la tienda los publique.'
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ProductDetail({ slug, add }: { slug: string; add: (p: Product, n?: number) => void }) {
  const remote = useRemote<Product>(`/products/${encodeURIComponent(slug)}`),
    [selected, setSelected] = useState(0),
    [quantity, setQuantity] = useState(1);
  useEffect(() => {
    setSelected(0);
    setQuantity(1);
  }, [slug]);
  if (remote.loading) return <Loading />;
  if (remote.error)
    return (
      <div className="store-page">
        <RemoteError error={remote.error} reload={remote.reload} />
        <Link href="/tienda" className="store-text-link">
          <ArrowLeft size={16} />
          Volver a la tienda
        </Link>
      </div>
    );
  const p = remote.data;
  if (!p) return null;
  const closed = availability(p),
    maximum = Math.min(100, p.available, (p.kind === 'preorder' ? p.max_per_customer : 100) || 100);
  return (
    <div className="store-page">
      <nav className="store-breadcrumb" aria-label="Ruta">
        <Link href="/">Inicio</Link>
        <span>/</span>
        <Link href={p.kind === 'preorder' ? '/preventas' : '/tienda'}>
          {p.kind === 'preorder' ? 'Preventas' : 'Tienda'}
        </Link>
        <span>/</span>
        <span>{p.name}</span>
      </nav>
      <div className="store-detail-layout">
        <div className="store-detail-gallery">
          <ProductImage
            src={p.images[selected]}
            name={p.name}
            className="store-detail-main-image"
          />
          {p.images.length > 1 && (
            <div className="store-thumbnails">
              {p.images.map((src, i) => (
                <button
                  key={src + i}
                  className={i === selected ? 'is-selected' : ''}
                  onClick={() => setSelected(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                >
                  <ProductImage src={src} name={`${p.name}, imagen ${i + 1}`} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="store-detail-info">
          <span className="store-eyebrow">
            {p.category}
            {p.kind === 'preorder' ? ' · PREVENTA' : ''}
          </span>
          <h1>{p.name}</h1>
          <p className="store-sku">SKU: {p.sku}</p>
          <div className="store-detail-price">
            <strong>{money(price(p))}</strong>
            {p.discount_percent > 0 && (
              <>
                <del>{money(p.price)}</del>
                <span className="store-pill">−{p.discount_percent}%</span>
              </>
            )}
          </div>
          <p className="store-tax-note">Precio en pesos chilenos</p>
          <div className="store-description store-preline">{p.description}</div>
          <div className="store-detail-stock">
            {closed ? (
              <span className="store-pill">{closed}</span>
            ) : (
              <span className="store-stock-dot">{p.available} unidades disponibles</span>
            )}
          </div>
          {p.kind === 'preorder' && (
            <div className="store-preorder-info">
              <h2>
                <CalendarDays size={18} />
                Información de la preventa
              </h2>
              <dl>
                <div>
                  <dt>Apertura</dt>
                  <dd>{date(p.opens_at)}</dd>
                </div>
                <div>
                  <dt>Cierre</dt>
                  <dd>{date(p.closes_at)}</dd>
                </div>
                <div>
                  <dt>Máximo por cliente</dt>
                  <dd>
                    {p.max_per_customer || 'Sin límite adicional'}
                    {p.max_per_customer ? ' unidades' : ''}
                  </dd>
                </div>
              </dl>
              <strong>Condiciones de entrega</strong>
              <p className="store-preline">{p.delivery_terms}</p>
            </div>
          )}
          <div className="store-purchase-row">
            <div className="store-quantity">
              <button
                aria-label="Disminuir cantidad"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
              >
                <Minus size={16} />
              </button>
              <input
                aria-label="Cantidad"
                inputMode="numeric"
                type="number"
                min={1}
                max={maximum}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.max(1, Math.min(maximum || 1, Math.trunc(Number(e.target.value)) || 1)),
                  )
                }
              />
              <button
                aria-label="Aumentar cantidad"
                disabled={quantity >= maximum}
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              className="store-button"
              disabled={Boolean(closed)}
              onClick={() => add(p, quantity)}
            >
              <ShoppingBag size={18} />
              {p.kind === 'preorder' ? 'Añadir reserva al carrito' : 'Añadir al carrito'}
            </button>
          </div>
          <div className="store-detail-reassurance">
            <span>
              <Store size={17} />
              Retiro en local
            </span>
            <span>
              <Truck size={17} />
              Envío según disponibilidad
            </span>
          </div>
          <Link href={p.kind === 'preorder' ? '/preventas' : '/tienda'} className="store-text-link">
            <ArrowLeft size={16} />
            Seguir explorando
          </Link>
        </div>
      </div>
    </div>
  );
}

function Posts({ kind }: { kind: 'news' | 'community' | 'tournament' }) {
  const remote = useRemote<Post[]>(`/posts?kind=${kind}`),
    title = kind === 'news' ? 'Noticias' : kind === 'community' ? 'Comunidad' : 'Torneos';
  return (
    <div className="store-page">
      <PageIntro
        eyebrow="LA VIDA EN SERGOD STORE"
        title={title}
        body={
          kind === 'news'
            ? 'Novedades y anuncios publicados por la tienda.'
            : kind === 'community'
              ? 'Un lugar para encontrarnos alrededor de las cartas.'
              : 'Fechas, formatos e información para tu próxima partida.'
        }
      />
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <RemoteError error={remote.error} reload={remote.reload} />
      ) : remote.data?.length ? (
        <div className="store-post-grid">
          {remote.data.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      ) : (
        <Empty
          icon={
            kind === 'tournament' ? (
              <Trophy size={30} />
            ) : kind === 'community' ? (
              <HeartHandshake size={30} />
            ) : (
              <Newspaper size={30} />
            )
          }
          title="Pronto habrá novedades"
          body={`Las publicaciones de ${title.toLowerCase()} aparecerán aquí cuando la tienda las publique.`}
        />
      )}
    </div>
  );
}
function PostDetail({ slug }: { slug: string }) {
  const remote = useRemote<Post>(`/posts/${encodeURIComponent(slug)}`);
  if (remote.loading) return <Loading />;
  if (remote.error)
    return (
      <div className="store-page">
        <RemoteError error={remote.error} reload={remote.reload} />
      </div>
    );
  const p = remote.data;
  if (!p) return null;
  const section =
    p.kind === 'news' ? '/noticias' : p.kind === 'community' ? '/comunidad' : '/torneos';
  return (
    <article className="store-page store-article">
      <Link className="store-text-link" href={section}>
        <ArrowLeft size={16} />
        Volver a {section.slice(1)}
      </Link>
      <PageIntro
        eyebrow={p.kind === 'news' ? 'NOTICIAS' : p.kind === 'community' ? 'COMUNIDAD' : 'TORNEOS'}
        title={p.title}
      />
      <div className="store-article-meta">
        <span>
          <CalendarDays size={17} />
          {date(p.event_at || p.created_at)}
        </span>
        {p.location && (
          <span>
            <MapPin size={17} />
            {p.location}
          </span>
        )}
      </div>
      {p.image && <ProductImage src={p.image} name={p.title} className="store-article-image" />}
      <div className="store-article-body store-preline">{p.body}</div>
      {p.kind === 'tournament' && (
        <div className="store-article-note">
          <Trophy size={22} />
          <div>
            <strong>Ten tus datos a mano</strong>
            <p>
              Puedes guardar tu Konami ID y código KLU en tu cuenta para facilitar tu participación.
            </p>
            <Link href="/cuenta" className="store-text-link">
              Ir a mi cuenta <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}

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
function Cart({
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
    shipping = delivery.method === 'shipping' && carrier && !carrier.collect ? carrier.price : 0;
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
      <div className="store-page">
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
    <div className="store-page">
      <PageIntro
        eyebrow="TU PRÓXIMA PARTIDA"
        title={step === 'cart' ? 'Tu carrito' : 'Entrega y pago'}
        body={
          step === 'cart'
            ? 'Revisa tus artículos y cantidades antes de continuar.'
            : 'Elige cómo recibir tu pedido y revisa el total antes de ir a Flow.'
        }
      />
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
              <section className="store-delivery-form">
                <h2>¿Cómo quieres recibir tu pedido?</h2>
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
              </section>
            )}
            {step === 'cart' && (
              <Link href="/tienda" className="store-text-link store-continue-shopping">
                <ArrowLeft size={16} />
                Seguir comprando
              </Link>
            )}
          </div>
          <aside className="store-order-summary">
            <h2>Resumen de la compra</h2>
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
                <dt>
                  Total{carrier?.collect && delivery.method === 'shipping' ? ' a pagar online' : ''}
                </dt>
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
                type="button"
                className="store-button store-full"
                disabled={unavailable}
                onClick={() => setStep('checkout')}
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
            <p className="store-summary-note">
              Las unidades se reservan durante {settings.reservation_minutes} minutos mientras
              completas el pago.
            </p>
          </aside>
        </form>
      )}
    </div>
  );
}

function Account({
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
    <div className="store-page store-auth-page">
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
            <button onClick={() => change('login')} className={mode === 'login' ? 'is-active' : ''}>
              Iniciar sesión
            </button>
            <button
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
    <div className="store-page store-token-page">
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
    <div className="store-page">
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
          <button className={tab === 'orders' ? 'is-active' : ''} onClick={() => setTab('orders')}>
            <Package size={18} />
            Mis pedidos
          </button>
          <button
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
                        <small>{date(o.created_at)}</small>
                      </div>
                      <div>
                        <span className={`store-pill store-payment-${o.payment_status}`}>
                          {paymentLabels[o.payment_status] || o.payment_status}
                        </span>
                        <small>
                          {deliveryLabels[o.fulfillment_status] || o.fulfillment_status}
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
function OrderDetail({
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
    if (remote.data?.payment_status === 'pending' && !checked.current) {
      checked.current = true;
      refresh();
    }
  }, [remote.data]);
  if (!ready || remote.loading) return <Loading />;
  if (!user)
    return (
      <div className="store-page">
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
      <div className="store-page">
        <RemoteError error={remote.error} reload={remote.reload} />
      </div>
    );
  const o = remote.data;
  if (!o) return null;
  const delivery = o.delivery;
  return (
    <div className="store-page">
      <Link href="/cuenta" className="store-text-link">
        <ArrowLeft size={16} />
        Mis pedidos
      </Link>
      <PageIntro
        eyebrow="DETALLE DE LA COMPRA"
        title={`Pedido #${o.number}`}
        body={date(o.created_at)}
      />
      <div className="store-order-status">
        <div>
          <span className={`store-pill store-payment-${o.payment_status}`}>
            {paymentLabels[o.payment_status]}
          </span>
          <h2>
            {o.payment_status === 'approved'
              ? 'Tu pago está confirmado'
              : o.payment_status === 'pending'
                ? 'Estamos esperando la confirmación del pago'
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
                ? `Confirmaremos tu pedido cuando Flow verifique el pago.${o.expires_at ? ' Las unidades se reservan hasta ' + date(o.expires_at) + '.' : ''}`
                : o.payment_status === 'expired'
                  ? 'Las unidades reservadas fueron liberadas. Puedes volver a comprar según disponibilidad.'
                  : o.payment_status === 'rejected'
                    ? 'Puedes volver a la tienda y realizar una nueva compra.'
                    : 'La tienda revisará el resultado antes de confirmar el pedido.'}
          </p>
        </div>
        {o.payment_status === 'pending' && (
          <div className="store-order-status-actions">
            <button
              className="store-button store-button-secondary"
              disabled={busy}
              onClick={refresh}
            >
              {busy ? 'Consultando…' : 'Actualizar pago'}
            </button>
            {o.payment_url && (
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
                  Total pagado online{o.payment_status !== 'approved' ? ' (por confirmar)' : ''}
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
