import { type FormEvent, useEffect, useState } from 'react';

import { ApiError, authorizedRequest, ownAccount, type AccountView } from '../identity/api.js';

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
interface LoyaltyAccount {
  readonly availablePoints: number;
  readonly balance: number;
  readonly debt: boolean;
  readonly reservedPoints: number;
}
interface LoyaltyAccountResponse {
  readonly item: LoyaltyAccount;
}
interface LoyaltyMovement {
  readonly balanceAfter: number;
  readonly movementId: string;
  readonly occurredAt: string;
  readonly pointsSigned: number;
  readonly reason: string | null;
  readonly type: string;
}
type LoadState = 'error' | 'loading' | 'ready';

export function AccountHub({ view = 'overview' }: { readonly view?: 'loyalty' | 'overview' }) {
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
  const [loyalty, setLoyalty] = useState<LoyaltyAccount | null>(null);
  const [movements, setMovements] = useState<readonly LoyaltyMovement[]>([]);
  const [movementsCursor, setMovementsCursor] = useState<string | null>(null);
  const [loyaltyState, setLoyaltyState] = useState<LoadState>('loading');
  const [loyaltyMessage, setLoyaltyMessage] = useState('Cargando tus puntos…');
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
    if (view === 'overview') {
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
    }
    void Promise.all([
      authorizedRequest<LoyaltyAccountResponse>('/api/v1/loyalty/account'),
      authorizedRequest<Page<LoyaltyMovement>>('/api/v1/loyalty/movements?limit=25'),
    ])
      .then(([summary, history]) => {
        setLoyalty(summary.item);
        setMovements(history.items);
        setMovementsCursor(history.nextCursor);
        setLoyaltyState('ready');
        setLoyaltyMessage(history.items.length === 0 ? 'Aún no tienes movimientos de puntos.' : '');
      })
      .catch((error: unknown) => {
        setLoyaltyState('error');
        setLoyaltyMessage(loyaltyErrorMessage(error));
      });
  }, [view]);

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
  const loadMoreMovements = async () => {
    if (movementsCursor === null) return;
    setLoyaltyState('loading');
    setLoyaltyMessage('Cargando más movimientos…');
    try {
      const page = await authorizedRequest<Page<LoyaltyMovement>>(
        `/api/v1/loyalty/movements?limit=25&cursor=${encodeURIComponent(movementsCursor)}`,
      );
      setMovements((current) => [...current, ...page.items]);
      setMovementsCursor(page.nextCursor);
      setLoyaltyState('ready');
      setLoyaltyMessage('');
    } catch (error) {
      setLoyaltyState('error');
      setLoyaltyMessage(messageOf(error, 'No fue posible cargar más movimientos.'));
    }
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
    <main
      className={`page-frame account-layout ${view === 'loyalty' ? 'loyalty-layout' : ''} visual-public`}
    >
      {view === 'overview' ? (
        <aside className="account-nav cut-panel" aria-label="Secciones de cuenta">
          <p className="eyebrow">Mi cuenta</p>
          <h1>Resumen</h1>
          <p className="account-nav-copy">Pedidos, beneficios y preferencias en un solo lugar.</p>
          <nav>
            <a href="#orders">Pedidos</a>
            <a href="#preorders">Preventas</a>
            <a href="/loyalty">Puntos</a>
            <a href="#profile">Datos personales</a>
            <a href="#delivery">Preferencias</a>
            <a href="/account">Seguridad</a>
          </nav>
        </aside>
      ) : (
        <header className="section-heading loyalty-heading cut-panel">
          <div>
            <p className="eyebrow">Programa de beneficios</p>
            <h1>Loyalty</h1>
            <p>Consulta tus puntos disponibles, reservas y movimientos en un solo lugar.</p>
          </div>
        </header>
      )}
      <section className="account-content">
        {view === 'overview' && (
          <>
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
              <p className="status" role={profileState === 'error' ? 'alert' : 'status'}>
                {profileMessage}
              </p>
              {account && (
                <div className="metric-grid account-metrics">
                  <Metric label="Correo" value={account.currentEmail} />
                  <Metric label="Teléfono" value={account.currentPhone ?? 'No registrado'} />
                  <Metric
                    label="Verificación"
                    value={
                      account.emailVerificationStatus === 'VERIFIED' ? 'Verificado' : 'Pendiente'
                    }
                  />
                  <Metric
                    label="Estado"
                    value={account.status === 'ACTIVE' ? 'Activa' : 'Desactivada'}
                  />
                </div>
              )}
            </section>
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
          </>
        )}
        <section className="account-panel cut-panel" id="loyalty">
          <p className="eyebrow">Fidelización</p>
          <h2>Mis puntos</h2>
          <p className="status" role={loyaltyState === 'error' ? 'alert' : 'status'}>
            {loyaltyMessage}
          </p>
          {loyalty && (
            <>
              <div className="metric-grid account-metrics">
                <Metric
                  label="Disponibles"
                  value={loyalty.availablePoints.toLocaleString('es-CL')}
                />
                <Metric label="Saldo" value={loyalty.balance.toLocaleString('es-CL')} />
                <Metric label="Reservados" value={loyalty.reservedPoints.toLocaleString('es-CL')} />
                <Metric label="Situación" value={loyalty.debt ? 'Saldo en deuda' : 'Al día'} />
              </div>
              {movements.length > 0 && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Movimiento</th>
                        <th>Puntos</th>
                        <th>Saldo</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((movement) => (
                        <tr key={movement.movementId}>
                          <td>{formatDate(movement.occurredAt)}</td>
                          <td>{movementLabel(movement.type)}</td>
                          <td
                            className={
                              movement.pointsSigned < 0 ? 'negative-value' : 'positive-value'
                            }
                          >
                            {formatSigned(movement.pointsSigned)}
                          </td>
                          <td>{movement.balanceAfter.toLocaleString('es-CL')}</td>
                          <td>{movement.reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {movementsCursor && (
                <button
                  disabled={loyaltyState === 'loading'}
                  onClick={() => void loadMoreMovements()}
                  type="button"
                >
                  Cargar más movimientos
                </button>
              )}
            </>
          )}
        </section>
        {view === 'overview' && (
          <section className="account-panel cut-panel" id="delivery">
            <p className="eyebrow">Despacho</p>
            <h2>Preferencias de entrega</h2>
            <p>
              Despacho por pagar a agencia Chilexpress o Starken; el domicilio no es obligatorio.
            </p>
            <p className="status" role={preferencesState === 'error' ? 'alert' : 'status'}>
              {preferencesMessage}
            </p>
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
        )}
      </section>
    </main>
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
      <p className="status" role={props.state === 'error' ? 'alert' : 'status'}>
        {props.message}
      </p>
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
function loyaltyErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.code === 'LOYALTY_ACCOUNT_NOT_FOUND'
    ? 'Aún no tienes una cuenta de puntos habilitada.'
    : messageOf(error, 'No fue posible cargar tus puntos.');
}
function formatClp(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CL')}`;
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value));
}
function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('es-CL')}`;
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
function movementLabel(value: string): string {
  return (
    (
      {
        ADMIN_CORRECTION: 'Ajuste',
        EARN: 'Acumulación',
        EARN_REVERSAL: 'Reverso de acumulación',
        REDEEM: 'Canje',
        REDEEM_RESTORE: 'Restitución de canje',
      } as Record<string, string>
    )[value] ?? value
  );
}
