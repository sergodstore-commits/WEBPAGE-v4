import { type FormEvent, useEffect, useState } from 'react';

import {
  accountTournamentIdentifiersSchema,
  type AccountTournamentIdentifiers,
} from '@sergod/contracts';

import { authorizedRequest, ownAccount, type AccountView } from '../identity/api.js';

interface OrderLine {
  readonly condition: string | null;
  readonly edition: string | null;
  readonly language: string | null;
  readonly lineSubtotalClp: number;
  readonly productName: string;
  readonly quantity: number;
  readonly sku: string;
}
interface Order {
  readonly createdAt: string;
  readonly deliveryMode: 'FREIGHT_COLLECT' | 'PICKUP';
  readonly lines: readonly OrderLine[];
  readonly orderId: string;
  readonly publicNumber: string;
  readonly state: string;
  readonly totalAmountClp: number;
}
interface Page<Item> {
  readonly items: readonly Item[];
  readonly nextCursor: string | null;
}
interface DeliveryPreferences {
  readonly agencyDestination: string | null;
  readonly carrier: 'CHILEXPRESS' | 'STARKEN' | null;
  readonly destinationCommune: string | null;
  readonly recipientName: string | null;
  readonly recipientPhone: string | null;
}
type LoadState = 'error' | 'loading' | 'ready';

export function AccountHub() {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [profileState, setProfileState] = useState<LoadState>('loading');
  const [profileMessage, setProfileMessage] = useState('Cargando tus datos…');
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [ordersCursor, setOrdersCursor] = useState<string | null>(null);
  const [ordersState, setOrdersState] = useState<LoadState>('loading');
  const [ordersMessage, setOrdersMessage] = useState('Cargando pedidos…');
  const [preorders, setPreorders] = useState<readonly Order[]>([]);
  const [preordersCursor, setPreordersCursor] = useState<string | null>(null);
  const [preordersState, setPreordersState] = useState<LoadState>('loading');
  const [preordersMessage, setPreordersMessage] = useState('Cargando preventas…');
  const [preferences, setPreferences] = useState<DeliveryPreferences | null>(null);
  const [preferencesState, setPreferencesState] = useState<LoadState>('loading');
  const [preferencesMessage, setPreferencesMessage] = useState('Cargando preferencias…');

  const applyOrders = (page: Page<Order>) => {
    setOrders((current) => [...current, ...page.items]);
    setOrdersCursor(page.nextCursor);
    setOrdersState('ready');
    setOrdersMessage(page.items.length === 0 ? 'Aún no tienes pedidos.' : '');
  };
  const failOrders = (error: unknown) => {
    setOrdersState('error');
    setOrdersMessage(messageOf(error, 'No fue posible cargar tus pedidos.'));
  };
  const applyPreorders = (page: Page<Order>) => {
    setPreorders((current) => [...current, ...page.items]);
    setPreordersCursor(page.nextCursor);
    setPreordersState('ready');
    setPreordersMessage(page.items.length === 0 ? 'Aún no tienes preventas.' : '');
  };
  const failPreorders = (error: unknown) => {
    setPreordersState('error');
    setPreordersMessage(messageOf(error, 'No fue posible cargar tus preventas.'));
  };

  useEffect(() => {
    void ownAccount()
      .then((profile) => {
        setAccount(profile);
        setProfileState('ready');
        setProfileMessage('');
      })
      .catch((error: unknown) => {
        setProfileState('error');
        setProfileMessage(messageOf(error, 'No fue posible cargar tus datos.'));
      });
    void loadOrders('REGULAR').then(applyOrders).catch(failOrders);
    void loadOrders('PREORDER').then(applyPreorders).catch(failPreorders);
    void authorizedRequest<{ item: DeliveryPreferences | null }>(
      '/api/v1/account/delivery-preferences',
    )
      .then((delivery) => {
        setPreferences(delivery.item);
        setPreferencesState('ready');
        setPreferencesMessage('');
      })
      .catch((error: unknown) => {
        setPreferencesState('error');
        setPreferencesMessage(messageOf(error, 'No fue posible cargar tus preferencias.'));
      });
  }, []);

  const loadMoreOrders = async (type: 'PREORDER' | 'REGULAR', cursor: string) => {
    if (type === 'REGULAR') {
      setOrdersState('loading');
      setOrdersMessage('Cargando más pedidos…');
      await loadOrders(type, cursor).then(applyOrders).catch(failOrders);
      return;
    }
    setPreordersState('loading');
    setPreordersMessage('Cargando más preventas…');
    await loadOrders(type, cursor).then(applyPreorders).catch(failPreorders);
  };
  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPreferencesMessage('Guardando preferencias…');
    try {
      const result = await authorizedRequest<{ item: DeliveryPreferences }>(
        '/api/v1/account/delivery-preferences',
        {
          body: JSON.stringify({
            agencyDestination: nullable(data.get('agencyDestination')),
            carrier: nullable(data.get('carrier')),
            destinationCommune: nullable(data.get('destinationCommune')),
            recipientName: nullable(data.get('recipientName')),
            recipientPhone: nullable(data.get('recipientPhone')),
          }),
          method: 'PUT',
        },
      );
      setPreferences(result.item);
      setPreferencesState('ready');
      setPreferencesMessage('Preferencias guardadas.');
    } catch (error) {
      setPreferencesState('error');
      setPreferencesMessage(messageOf(error, 'No fue posible guardar tus preferencias.'));
    }
  };

  return (
    <main className="page-frame account-layout visual-public">
      <aside className="account-nav cut-panel" aria-label="Secciones de cuenta">
        <p className="eyebrow">Mi cuenta</p>
        <h1>Resumen</h1>
        <p className="account-nav-copy">
          Pedidos, datos personales y preferencias en un solo lugar.
        </p>
        <nav>
          <a href="#profile">Datos personales</a>
          <a href="#tournament-identifiers">Código KLU y Konami ID</a>
          <a href="#orders">Pedidos</a>
          <a href="#preorders">Preventas</a>
          <a href="#delivery">Preferencias</a>
          <a href="/account">Seguridad</a>
        </nav>
      </aside>
      <section className="account-content">
        <section className="account-panel cut-panel" id="profile">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Datos personales</p>
              <h2>Tu perfil</h2>
            </div>
            <a className="button-link" href="/account">
              Editar perfil y seguridad
            </a>
          </div>
          {profileMessage && (
            <p className="status" role={profileState === 'error' ? 'alert' : 'status'}>
              {profileMessage}
            </p>
          )}
          {account && (
            <div className="metric-grid account-metrics">
              <Metric label="Correo" value={account.currentEmail} />
              <Metric label="Teléfono" value={account.currentPhone ?? 'No registrado'} />
              <Metric
                label="Verificación"
                value={account.emailVerificationStatus === 'VERIFIED' ? 'Verificado' : 'Pendiente'}
              />
              <Metric
                label="Estado"
                value={account.status === 'ACTIVE' ? 'Activa' : 'Desactivada'}
              />
            </div>
          )}
        </section>
        <TournamentIdentifiersForm />
        <OrderHistory
          cursor={ordersCursor}
          id="orders"
          items={orders}
          message={ordersMessage}
          onLoadMore={() => ordersCursor && void loadMoreOrders('REGULAR', ordersCursor)}
          state={ordersState}
          title="Mis pedidos"
        />
        <OrderHistory
          cursor={preordersCursor}
          id="preorders"
          items={preorders}
          message={preordersMessage}
          onLoadMore={() => preordersCursor && void loadMoreOrders('PREORDER', preordersCursor)}
          state={preordersState}
          title="Mis preventas"
        />
        <section className="account-panel cut-panel" id="delivery">
          <p className="eyebrow">Despacho</p>
          <h2>Preferencias de entrega</h2>
          <p>Despacho por pagar a agencia Chilexpress o Starken; el domicilio no es obligatorio.</p>
          {preferencesMessage && (
            <p className="status" role={preferencesState === 'error' ? 'alert' : 'status'}>
              {preferencesMessage}
            </p>
          )}
          {preferencesState === 'ready' && (
            <form
              className="account-delivery-form"
              key={preferences === null ? 'empty' : JSON.stringify(preferences)}
              onSubmit={(event) => void savePreferences(event)}
            >
              <label>
                Destinatario
                <input defaultValue={preferences?.recipientName ?? ''} name="recipientName" />
              </label>
              <label>
                Teléfono de contacto
                <input
                  defaultValue={preferences?.recipientPhone ?? ''}
                  name="recipientPhone"
                  placeholder="+569…"
                />
              </label>
              <label>
                Transportista
                <select defaultValue={preferences?.carrier ?? ''} name="carrier">
                  <option value="">Sin preferencia</option>
                  <option value="CHILEXPRESS">Chilexpress</option>
                  <option value="STARKEN">Starken</option>
                </select>
              </label>
              <label>
                Comuna de destino
                <input
                  defaultValue={preferences?.destinationCommune ?? ''}
                  name="destinationCommune"
                />
              </label>
              <label>
                Agencia de destino
                <input
                  defaultValue={preferences?.agencyDestination ?? ''}
                  name="agencyDestination"
                />
              </label>
              <button type="submit">Guardar preferencias</button>
            </form>
          )}
        </section>
      </section>
    </main>
  );
}

function TournamentIdentifiersForm() {
  const [identifiers, setIdentifiers] = useState<AccountTournamentIdentifiers | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('Cargando identificadores…');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void authorizedRequest<{ item: AccountTournamentIdentifiers }>(
      '/api/v1/account/tournament-identifiers',
    )
      .then(({ item }) => {
        if (!active) return;
        setIdentifiers(item);
        setState('ready');
        setMessage('');
      })
      .catch(() => {
        if (!active) return;
        setState('error');
        setMessage('No fue posible cargar tus identificadores. Recarga la página para reintentar.');
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || identifiers === null) return;
    const data = new FormData(event.currentTarget);
    const parsed = accountTournamentIdentifiersSchema.safeParse({
      konamiId: nullable(data.get('konamiId')),
      kluCode: nullable(data.get('kluCode')),
    });
    if (!parsed.success) {
      setState('error');
      setMessage(
        'Usa hasta 64 letras, números, puntos, guiones o guiones bajos por identificador.',
      );
      return;
    }
    setSaving(true);
    setMessage('Guardando identificadores…');
    try {
      const { item } = await authorizedRequest<{ item: AccountTournamentIdentifiers }>(
        '/api/v1/account/tournament-identifiers',
        { body: JSON.stringify(parsed.data), method: 'PUT' },
      );
      setIdentifiers(item);
      setState('ready');
      setMessage('Identificadores guardados.');
    } catch {
      setState('error');
      setMessage('No fue posible guardar tus identificadores. Puedes volver a intentarlo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="account-panel cut-panel" id="tournament-identifiers">
      <p className="eyebrow">Torneos presenciales</p>
      <h2>Código KLU y Konami ID</h2>
      <p id="tournament-identifiers-help">
        Konami ID y código KLU son opcionales y se usan para torneos presenciales. No son necesarios
        para comprar. Puedes borrarlos cuando quieras.
      </p>
      {message && (
        <p className="status" role={state === 'error' ? 'alert' : 'status'}>
          {message}
        </p>
      )}
      {state === 'error' && identifiers === null && (
        <button
          onClick={() => {
            setState('loading');
            setMessage('Cargando identificadores…');
            setRetry((current) => current + 1);
          }}
          type="button"
        >
          Reintentar carga
        </button>
      )}
      <form
        className="account-delivery-form"
        onSubmit={(event) => void save(event)}
        key={identifiers === null ? 'pending' : JSON.stringify(identifiers)}
      >
        <label>
          Konami ID (opcional)
          <input
            name="konamiId"
            defaultValue={identifiers?.konamiId ?? ''}
            maxLength={64}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="tournament-identifiers-help"
            disabled={saving || identifiers === null}
          />
        </label>
        <label>
          Código KLU (opcional)
          <input
            name="kluCode"
            defaultValue={identifiers?.kluCode ?? ''}
            maxLength={64}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="tournament-identifiers-help"
            disabled={saving || identifiers === null}
          />
        </label>
        <button type="submit" disabled={saving || identifiers === null}>
          Guardar identificadores
        </button>
      </form>
    </section>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function OrderHistory(props: {
  readonly cursor: string | null;
  readonly id: string;
  readonly items: readonly Order[];
  readonly message: string;
  readonly onLoadMore: () => void;
  readonly state: LoadState;
  readonly title: string;
}) {
  return (
    <section className="account-panel cut-panel" id={props.id}>
      <div className="account-panel-heading">
        <div>
          <p className="card-kicker">Historial de compra</p>
          <h2>{props.title}</h2>
        </div>
        <span className="status-chip">{props.items.length} visibles</span>
      </div>
      {props.message && (
        <p className="status" role={props.state === 'error' ? 'alert' : 'status'}>
          {props.message}
        </p>
      )}
      <div className="order-history">
        {props.items.map((order) => (
          <article className="order-summary" key={order.orderId}>
            <div className="order-heading">
              <div>
                <span>Pedido</span>
                <strong>{order.publicNumber}</strong>
              </div>
              <div>
                <span>Fecha</span>
                <strong>{formatDate(order.createdAt)}</strong>
              </div>
              <div>
                <span>Estado</span>
                <strong>{orderStateLabel(order.state)}</strong>
              </div>
              <div>
                <span>Entrega</span>
                <strong>
                  {order.deliveryMode === 'PICKUP' ? 'Retiro en tienda' : 'Despacho por pagar'}
                </strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{formatClp(order.totalAmountClp)}</strong>
              </div>
            </div>
            <details>
              <summary>Ver productos ({order.lines.length})</summary>
              <ul className="order-lines">
                {order.lines.map((line) => (
                  <li key={`${order.orderId}-${line.sku}`}>
                    <div>
                      <strong>{line.productName}</strong>
                      <small>
                        {[line.sku, line.language, line.edition, line.condition]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </div>
                    <span>
                      {line.quantity} × {formatClp(line.lineSubtotalClp / line.quantity)}
                    </span>
                    <strong>{formatClp(line.lineSubtotalClp)}</strong>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))}
      </div>
      {props.cursor && (
        <button disabled={props.state === 'loading'} onClick={props.onLoadMore} type="button">
          Cargar más
        </button>
      )}
    </section>
  );
}
function loadOrders(type: 'PREORDER' | 'REGULAR', cursor?: string): Promise<Page<Order>> {
  const suffix = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
  return authorizedRequest<Page<Order>>(`/api/v1/orders?limit=25&orderType=${type}${suffix}`);
}
function nullable(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized === '' ? null : normalized;
}
function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : fallback;
}
function formatClp(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value));
}
function orderStateLabel(value: string): string {
  return (
    (
      {
        CANCELLED: 'Cancelado',
        FULFILLED: 'Completado',
        PAID: 'Pagado',
        PENDING_PAYMENT: 'Pendiente de pago',
        PREPARING: 'En preparación',
        READY_FOR_PICKUP: 'Listo para retiro',
        SHIPPED: 'Despachado',
      } as Record<string, string>
    )[value] ?? value
  );
}
