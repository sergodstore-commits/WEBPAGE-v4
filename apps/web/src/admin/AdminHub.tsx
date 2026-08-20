import { type FormEvent, useEffect, useState } from 'react';

import { authorizedRequest } from '../identity/api.js';

interface OperationalItem {
  readonly paymentAttemptId?: string;
  readonly fulfillmentId?: string;
  readonly orderId?: string;
  readonly orderPublicNumber?: string;
  readonly publicNumber?: string;
  readonly provider?: string;
  readonly state?: string;
  readonly status?: string;
}

export function AdminHub() {
  const [orders, setOrders] = useState<readonly OperationalItem[]>([]);
  const [payments, setPayments] = useState<readonly OperationalItem[]>([]);
  const [fulfillments, setFulfillments] = useState<readonly OperationalItem[]>([]);
  const [message, setMessage] = useState('Cargando operación…');
  const reload = () => {
    void Promise.all([
      authorizedRequest<{ items: OperationalItem[] }>('/api/v1/admin/orders?limit=10'),
      authorizedRequest<{ items: OperationalItem[] }>('/api/v1/admin/payment-attempts?limit=10'),
      authorizedRequest<{ items: OperationalItem[] }>('/api/v1/admin/fulfillments?limit=10'),
    ])
      .then(([orderPage, paymentPage, fulfillmentPage]) => {
        setOrders(orderPage.items);
        setPayments(paymentPage.items);
        setFulfillments(fulfillmentPage.items);
        setMessage('');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  };
  useEffect(reload, []);
  return (
    <main className="page-frame admin-shell">
      <header className="section-heading cut-panel">
        <p className="eyebrow">Operación Admin</p>
        <h1>Centro de control</h1>
        <p>Datos reales del servidor; sin métricas decorativas.</p>
      </header>
      <p className="status" role="status">
        {message}
      </p>
      <section className="metric-grid">
        <div className="metric">
          <span>Pedidos recientes</span>
          <strong>{orders.length}</strong>
        </div>
        <div className="metric">
          <span>Intentos de pago</span>
          <strong>{payments.length}</strong>
        </div>
        <div className="metric">
          <span>Fulfillments</span>
          <strong>{fulfillments.length}</strong>
        </div>
      </section>
      <OperationalTable items={orders} title="Pedidos" />
      <OperationalTable items={payments} title="Pagos" />
      <OperationalTable items={fulfillments} title="Fulfillment" />
      <EditorialComposer onSaved={reload} />
    </main>
  );
}

function OperationalTable({
  items,
  title,
}: {
  readonly items: readonly OperationalItem[];
  readonly title: string;
}) {
  return (
    <section className="cut-panel">
      <h2>{title}</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Estado</th>
              <th>Proveedor</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.paymentAttemptId ?? item.fulfillmentId ?? item.orderId ?? index}>
                <td>{item.orderPublicNumber ?? item.publicNumber ?? item.orderId ?? '—'}</td>
                <td>{item.status ?? item.state ?? '—'}</td>
                <td>{item.provider ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditorialComposer({ onSaved }: { readonly onSaved: () => void }) {
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await authorizedRequest('/api/v1/admin/content', {
        body: JSON.stringify({
          body: String(data.get('body')),
          excerpt: String(data.get('excerpt')),
          metadata: {},
          slug: String(data.get('slug')),
          title: String(data.get('title')),
          type: String(data.get('type')),
        }),
        method: 'POST',
      });
      setMessage(
        'Borrador editorial guardado. Publícalo mediante la acción Admin correspondiente.',
      );
      event.currentTarget.reset();
      onSaved();
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  return (
    <section className="cut-panel">
      <h2>Nuevo contenido editorial</h2>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Tipo
          <select name="type">
            <option value="NEWS">Noticia</option>
            <option value="TOURNAMENT">Torneo informativo</option>
            <option value="COMMUNITY">Comunidad</option>
            <option value="COMIC_SERIES">Serie de cómic</option>
            <option value="COMIC_CHAPTER">Capítulo</option>
            <option value="QUEST">Quest</option>
            <option value="HALL_OF_FAME">Hall of Fame</option>
          </select>
        </label>
        <label>
          Título
          <input name="title" required />
        </label>
        <label>
          Slug
          <input name="slug" pattern="[a-z0-9-]+" required />
        </label>
        <label>
          Resumen
          <textarea name="excerpt" required />
        </label>
        <label>
          Contenido
          <textarea name="body" required rows={7} />
        </label>
        <button type="submit">Guardar borrador</button>
      </form>
      <p className="status" role="status">
        {message}
      </p>
    </section>
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.';
}
