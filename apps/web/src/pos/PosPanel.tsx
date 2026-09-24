import { type FormEvent, useEffect, useRef, useState } from 'react';
import { authorizedRequest } from '../identity/api.js';
import { readCoverage } from '../service-coverage/api.js';
import { firstStoreFromCoverage } from '../service-coverage/store.js';
import { operationalValue } from '../admin/presentation.js';
import {
  addLine,
  completeSale,
  createSale,
  discardSale,
  getSale,
  moneyMethods,
  prepareSale,
  removeLine,
  sales,
  updateLine,
} from './api.js';

type Item = Record<string, unknown>;
type Ticket = { item: Item; lines: Item[] };
type Product = {
  productId: string;
  name: string;
  sku: string;
  priceAmountClp: number;
  saleType: string;
  publicationStatus: string;
};
const money = (value: unknown) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(Number(value ?? 0));
const savedTicketKey = 'sergod-pos-active-ticket';

export function PosPanel() {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [methods, setMethods] = useState<Item[]>([]);
  const [branchId, setBranchId] = useState('');
  const [query, setQuery] = useState('');
  const [stock, setStock] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('Cargando caja…');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Item[]>([]);
  const locked = useRef(false);
  const editable = ticket?.item.state === 'DRAFT';
  const finished = ticket && ['COMPLETED', 'DISCARDED'].includes(String(ticket.item.state));
  const loadTicket = async (id: string) => {
    const next = (await getSale(id)) as Ticket;
    setTicket(next);
    if (['COMPLETED', 'DISCARDED'].includes(String(next.item.state)))
      sessionStorage.removeItem(savedTicketKey);
    else sessionStorage.setItem(savedTicketKey, id);
    const ids = [...new Set(next.lines.map((line) => String(line.product_id)))];
    const entries = await Promise.all(
      ids.map(async (productId) => {
        const result = await authorizedRequest<{ item: { available: number } }>(
          `/api/v1/admin/inventory/products/${productId}`,
        );
        return [productId, result.item.available] as const;
      }),
    );
    setStock((current) => ({ ...current, ...Object.fromEntries(entries) }));
  };
  const run = async (operation: () => Promise<void>, success: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('Guardando…');
    try {
      await operation();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se completó la operación.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [coverage, methodResult] = await Promise.all([readCoverage(), moneyMethods()]);
        const all: Product[] = [];
        let cursor: string | null = null;
        do {
          const page: { items: Product[]; nextCursor: string | null } = await authorizedRequest(
            '/api/v1/admin/catalog/products?limit=100' +
              (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''),
          );
          all.push(...page.items);
          cursor = page.nextCursor;
        } while (cursor);
        if (!alive) return;
        setBranchId(firstStoreFromCoverage(coverage)?.branchId ?? '');
        setProducts(
          all.filter(
            (item) => item.saleType === 'REGULAR' && item.publicationStatus === 'PUBLISHED',
          ),
        );
        setMethods((methodResult.items as Item[]).filter((item) => item.state === 'ACTIVE'));
        const saved = sessionStorage.getItem(savedTicketKey);
        if (saved) await loadTicket(saved);
        setMessage(
          'Caja lista. El pago se recibe fuera de esta página; aquí registras la venta y el stock.',
        );
      } catch (error) {
        if (alive) setMessage(error instanceof Error ? error.message : 'No se pudo abrir la caja.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const start = () =>
    run(async () => {
      const created = await createSale({ branchId, saleType: 'REGULAR' });
      await loadTicket(created.id);
    }, 'Ticket abierto. Busca un producto para agregarlo.');
  const add = (product: Product) =>
    run(async () => {
      if (!ticket || !editable) throw new Error('Abre un ticket antes de agregar productos.');
      const id = String(ticket.item.pos_sale_id);
      const existing = ticket.lines.find((line) => line.product_id === product.productId);
      if (existing)
        await updateLine(id, String(existing.pos_sale_line_id), Number(existing.quantity) + 1);
      else await addLine(id, { productId: product.productId, quantity: 1 });
      await loadTicket(id);
    }, 'Producto agregado al ticket.');
  const quantity = (line: Item, value: number) =>
    run(async () => {
      if (!ticket || !Number.isInteger(value) || value < 1)
        throw new Error('La cantidad debe ser un número entero mayor que cero.');
      await updateLine(String(ticket.item.pos_sale_id), String(line.pos_sale_line_id), value);
      await loadTicket(String(ticket.item.pos_sale_id));
    }, 'Cantidad actualizada.');
  const remove = (line: Item) =>
    run(async () => {
      if (!ticket) return;
      await removeLine(String(ticket.item.pos_sale_id), String(line.pos_sale_line_id));
      await loadTicket(String(ticket.item.pos_sale_id));
    }, 'Producto quitado del ticket.');
  const finish = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      if (!ticket) return;
      const id = String(ticket.item.pos_sale_id);
      const latest = (await getSale(id)) as Ticket;
      if (latest.item.state === 'COMPLETED') {
        await loadTicket(id);
        return;
      }
      if (latest.item.state === 'DRAFT') await prepareSale(id);
      const prepared = (await getSale(id)) as Ticket;
      setTicket(prepared); // A retry must not prepare the same ticket again.
      const total = Number(prepared.item.total_amount_clp);
      await completeSale(
        id,
        total === 0
          ? {}
          : {
              amountClp: total,
              externalMoneyMethodId: String(form.get('methodId')),
              ...(String(form.get('reference') ?? '').trim()
                ? { reference: String(form.get('reference')) }
                : {}),
              ...(String(form.get('note') ?? '').trim() ? { note: String(form.get('note')) } : {}),
            },
      );
      await loadTicket(id);
    }, 'Venta registrada y stock descontado. El ticket quedó guardado en el servidor.');
  };
  const matching = products.filter((item) =>
    `${item.sku} ${item.name}`
      .toLocaleLowerCase('es-CL')
      .includes(query.trim().toLocaleLowerCase('es-CL')),
  );
  return (
    <section className="admin-standalone-panel pos-workstation pos-simple">
      <header className="pos-workstation-heading">
        <div>
          <p className="eyebrow">Venta presencial</p>
          <h2>POS · Ticket de venta</h2>
          <p>
            Busca, agrega productos y registra la salida de inventario. No se realizan cobros
            online.
          </p>
        </div>
        {(!ticket || finished) && (
          <button disabled={busy || !branchId} onClick={() => void start()} type="button">
            Nueva venta
          </button>
        )}
      </header>
      <p className="status" role="status" aria-live="polite">
        {message}
      </p>
      {ticket && (
        <p>
          Estado: <strong>{operationalValue(String(ticket.item.state))}</strong> ·{' '}
          {ticket.lines.length} productos
        </p>
      )}
      {editable && (
        <section className="pos-lookup" aria-label="Buscar producto para el ticket">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const exact =
                matching.find((item) => item.sku.toLowerCase() === query.trim().toLowerCase()) ??
                (matching.length === 1 ? matching[0] : undefined);
              if (exact) void add(exact);
            }}
          >
            <label>
              Código, SKU o nombre
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Escribe o escanea el código y presiona Enter"
              />
            </label>
            <button disabled={busy || matching.length !== 1}>Agregar producto</button>
          </form>
          <div className="pos-search-results">
            {matching.slice(0, 12).map((product) => (
              <button
                disabled={busy}
                key={product.productId}
                onClick={() => void add(product)}
                type="button"
              >
                <strong>{product.name}</strong>
                <span>
                  {product.sku} · {money(product.priceAmountClp)}
                </span>
              </button>
            ))}
          </div>
          {matching.length === 0 && (
            <p>No hay coincidencias. El producto debe ser de venta regular y estar publicado.</p>
          )}
        </section>
      )}
      {ticket && (
        <>
          <div className="table-scroll pos-ticket-table">
            <table>
              <thead>
                <tr>
                  <th>Código / SKU</th>
                  <th>Producto</th>
                  <th>Precio</th>
                  <th>Cantidad</th>
                  <th>Subtotal</th>
                  <th>Stock disponible</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {ticket.lines.map((line) => (
                  <tr key={String(line.pos_sale_line_id)}>
                    <td>{String(line.sku_snapshot ?? '')}</td>
                    <td>{String(line.product_name_snapshot ?? '')}</td>
                    <td>{money(line.unit_price_amount_clp)}</td>
                    <td>
                      <input
                        key={String(line.quantity)}
                        aria-label={`Cantidad de ${String(line.product_name_snapshot)}`}
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={Number(line.quantity)}
                        disabled={busy || !editable}
                        onBlur={(event) => {
                          const next = Number(event.target.value);
                          if (next !== Number(line.quantity)) void quantity(line, next);
                        }}
                      />
                    </td>
                    <td>
                      {money(
                        line.final_line_total_amount_clp ??
                          line.line_subtotal_amount_clp ??
                          Number(line.unit_price_amount_clp) * Number(line.quantity),
                      )}
                    </td>
                    <td>{stock[String(line.product_id)] ?? '—'}</td>
                    <td>
                      <button
                        disabled={busy || !editable}
                        type="button"
                        onClick={() => void remove(line)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ticket.lines.length === 0 && <p>Ticket vacío. Agrega un producto para comenzar.</p>}
          </div>
          <section className="pos-checkout">
            <div>
              <p>Subtotal: {money(ticket.item.subtotal_amount_clp)}</p>
              <p>Descuento: {money(ticket.item.automatic_discount_amount_clp)}</p>
              <h2>Total {money(ticket.item.total_amount_clp)}</h2>
            </div>
            {!finished && (
              <form onSubmit={finish}>
                <label>
                  Pago recibido fuera de la página
                  <select
                    name="methodId"
                    required={Number(ticket.item.total_amount_clp) > 0}
                    defaultValue={String(methods[0]?.external_money_method_id ?? '')}
                    disabled={busy}
                  >
                    {methods.length === 0 && (
                      <option value="">No hay un medio presencial activo</option>
                    )}
                    {methods.map((method) => (
                      <option
                        key={String(method.external_money_method_id)}
                        value={String(method.external_money_method_id)}
                      >
                        {String(method.display_name)}
                      </option>
                    ))}
                  </select>
                </label>
                <details>
                  <summary>Referencia o nota (opcional)</summary>
                  <label>
                    Referencia
                    <input name="reference" />
                  </label>
                  <label>
                    Nota
                    <input name="note" />
                  </label>
                </details>
                <button
                  disabled={
                    busy ||
                    ticket.lines.length === 0 ||
                    (Number(ticket.item.total_amount_clp) > 0 && methods.length === 0)
                  }
                >
                  Registrar venta y descontar stock
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await discardSale(
                        String(ticket.item.pos_sale_id),
                        'Ticket descartado desde caja',
                      );
                      await loadTicket(String(ticket.item.pos_sale_id));
                    }, 'Ticket descartado; no se registró una venta.')
                  }
                >
                  Descartar ticket
                </button>
              </form>
            )}
          </section>
        </>
      )}
      <details>
        <summary>Ventas recientes</summary>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await sales();
              setHistory(result.items);
            }, 'Historial actualizado.')
          }
        >
          Actualizar historial
        </button>
        <ul>
          {history.map((item) => (
            <li key={String(item.pos_sale_id)}>
              <button
                type="button"
                disabled={busy || Boolean(ticket && !finished)}
                onClick={() =>
                  void run(() => loadTicket(String(item.pos_sale_id)), 'Ticket recuperado.')
                }
              >
                {String(item.public_number ?? item.pos_sale_id)} ·{' '}
                {operationalValue(String(item.state))} · {money(item.total_amount_clp)}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
