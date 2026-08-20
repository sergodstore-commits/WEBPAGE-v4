import { useEffect, useState } from 'react';

import { authorizedRequest, ownAccount, type AccountView } from '../identity/api.js';

interface Order {
  readonly orderId: string;
  readonly publicNumber: string;
  readonly state: string;
  readonly totalAmountClp: number;
  readonly deliveryMode: string;
}

export function AccountHub() {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [message, setMessage] = useState('Cargando tu resumen…');
  useEffect(() => {
    void Promise.all([
      ownAccount(),
      authorizedRequest<{ items: Order[] }>('/api/v1/orders?limit=25'),
    ])
      .then(([profile, history]) => {
        setAccount(profile);
        setOrders(history.items);
        setMessage(history.items.length === 0 ? 'Aún no tienes pedidos.' : '');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  }, []);
  return (
    <main className="page-frame account-layout">
      <aside className="account-nav cut-panel" aria-label="Secciones de cuenta">
        <p className="eyebrow">Mi cuenta</p>
        <h1>Resumen</h1>
        <nav>
          <a href="#orders">Pedidos</a>
          <a href="#preorders">Preventas</a>
          <a href="#loyalty">Puntos</a>
          <a href="#profile">Perfil</a>
          <a href="#delivery">Preferencias</a>
          <a href="#security">Seguridad</a>
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
        </section>
        <section className="cut-panel" id="preorders">
          <h2>Preventas</h2>
          <p>Consulta aquí compromisos y actualizaciones de campañas.</p>
        </section>
        <section className="cut-panel" id="loyalty">
          <h2>Puntos</h2>
          <p>El saldo y los canjes se calculan siempre en servidor.</p>
        </section>
        <section className="cut-panel" id="security">
          <h2>Seguridad</h2>
          <p>Administra correo, contraseña y sesiones desde Identidad y seguridad.</p>
        </section>
      </section>
    </main>
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible cargar la cuenta.';
}
