import { type FormEvent, useEffect, useState } from 'react';

import { authorizedRequest, ownAccount, type AccountView } from '../identity/api.js';

interface Order {
  readonly orderId: string;
  readonly publicNumber: string;
  readonly state: string;
  readonly totalAmountClp: number;
  readonly deliveryMode: string;
}

interface DeliveryPreferences {
  readonly agencyDestination: string | null;
  readonly carrier: 'CHILEXPRESS' | 'STARKEN' | null;
  readonly destinationCommune: string | null;
  readonly recipientName: string | null;
  readonly recipientPhone: string | null;
}

export function AccountHub() {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [preferences, setPreferences] = useState<DeliveryPreferences | null>(null);
  const [message, setMessage] = useState('Cargando tu resumen…');
  useEffect(() => {
    void Promise.all([
      ownAccount(),
      authorizedRequest<{ items: Order[] }>('/api/v1/orders?limit=25'),
      authorizedRequest<{ item: DeliveryPreferences | null }>(
        '/api/v1/account/delivery-preferences',
      ),
    ])
      .then(([profile, history, delivery]) => {
        setAccount(profile);
        setOrders(history.items);
        setPreferences(delivery.item);
        setMessage(history.items.length === 0 ? 'Aún no tienes pedidos.' : '');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  }, []);
  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
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
      setMessage('Preferencias guardadas.');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  return (
    <main className="page-frame account-layout">
      <aside className="account-nav cut-panel" aria-label="Secciones de cuenta">
        <p className="eyebrow">Mi cuenta</p>
        <h1>Resumen</h1>
        <nav>
          <a href="#orders">Pedidos</a>
          <a href="#profile">Perfil</a>
          <a href="#delivery">Preferencias</a>
          <a href="/account">Seguridad</a>
        </nav>
      </aside>
      <section className="account-content">
        <article className="metric-grid" id="profile">
          <div className="metric">
            <span>Cuenta</span>
            <strong>{account?.currentEmail ?? '—'}</strong>
          </div>
          <div className="metric">
            <span>Estado</span>
            <strong>{account?.status ?? '—'}</strong>
          </div>
          <div className="metric">
            <span>Pedidos</span>
            <strong>{orders.length}</strong>
          </div>
        </article>
        <section className="cut-panel" id="orders">
          <h2>Mis pedidos</h2>
          <p className="status" role="status">
            {message}
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Estado</th>
                  <th>Entrega</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.orderId}>
                    <td>{order.publicNumber}</td>
                    <td>{order.state}</td>
                    <td>{order.deliveryMode}</td>
                    <td>${order.totalAmountClp.toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="cut-panel" id="delivery">
          <h2>Preferencias de despacho</h2>
          <p>Despacho por pagar a agencia Chilexpress o Starken; el domicilio no es obligatorio.</p>
          <form
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
              <input defaultValue={preferences?.agencyDestination ?? ''} name="agencyDestination" />
            </label>
            <button type="submit">Guardar preferencias</button>
          </form>
        </section>
      </section>
    </main>
  );
}

function nullable(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized === '' ? null : normalized;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible cargar la cuenta.';
}
