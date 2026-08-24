import { useEffect, useState } from 'react';

import { ApiError, authorizedRequest, currentSession, publicRequest } from '../identity/api.js';

interface CartLine {
  readonly cartLineId: string;
  readonly estimatedLineTotalClp: number;
  readonly productName: string;
  readonly quantity: number;
  readonly saleType: 'PREORDER' | 'REGULAR';
  readonly sku: string;
  readonly unitPriceClp: number;
}

interface CartGroup {
  readonly cartGroupId: string;
  readonly groupType: 'CONFLICT' | 'PREORDER' | 'REGULAR';
  readonly lines: readonly CartLine[];
  readonly state: 'ACTIVE' | 'CONFLICT' | 'REMOVED';
}

interface CartView {
  readonly groups: readonly CartGroup[];
  readonly ownerKind: 'ACCOUNT' | 'ANONYMOUS';
  readonly state: 'ACTIVE' | 'EXPIRED' | 'MERGED';
}

export function CartPage() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [message, setMessage] = useState('Cargando carrito…');
  const [busyLineId, setBusyLineId] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await readCart();
      setCart(result.item);
      setMessage(result.item === null ? 'Tu carrito está vacío.' : '');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CART_SESSION_REQUIRED') {
        setCart(null);
        setMessage('Tu carrito está vacío. Agrega un producto desde la tienda.');
        return;
      }
      setMessage(messageOf(error));
    }
  };

  useEffect(() => {
    let active = true;
    void readCart()
      .then((result) => {
        if (!active) return;
        setCart(result.item);
        setMessage(result.item === null ? 'Tu carrito está vacío.' : '');
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.code === 'CART_SESSION_REQUIRED') {
          setCart(null);
          setMessage('Tu carrito está vacío. Agrega un producto desde la tienda.');
          return;
        }
        setMessage(messageOf(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const updateLine = async (line: CartLine, quantity: number) => {
    setBusyLineId(line.cartLineId);
    try {
      const headers = { 'idempotency-key': crypto.randomUUID() };
      await send(
        `/api/v1/cart/lines/${line.cartLineId}`,
        quantity === 0
          ? { headers, method: 'DELETE' }
          : { body: JSON.stringify({ quantity }), headers, method: 'PUT' },
      );
      await load();
      setMessage(quantity === 0 ? 'Producto eliminado.' : 'Cantidad actualizada.');
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusyLineId(null);
    }
  };

  const activeGroups = cart?.groups.filter((group) => group.state !== 'REMOVED') ?? [];
  const lineCount = activeGroups.reduce(
    (count, group) => count + group.lines.reduce((sum, line) => sum + line.quantity, 0),
    0,
  );

  return (
    <main className="page-frame cart-page visual-public">
      <header className="section-heading cart-heading cut-panel">
        <div>
          <p className="eyebrow">Tu compra</p>
          <h1>Carrito</h1>
          <p>
            {lineCount === 0
              ? 'Aquí aparecerán los productos que elijas.'
              : `${lineCount} ${lineCount === 1 ? 'producto' : 'productos'} en revisión.`}
          </p>
        </div>
        <div aria-label="Garantías del carrito" className="heading-stats">
          <span>Intención guardada</span>
          <span>Validación en checkout</span>
        </div>
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      {activeGroups.map((group) => {
        const groupTotal = group.lines.reduce((sum, line) => sum + line.estimatedLineTotalClp, 0);
        return (
          <section className="cart-group cut-panel" key={group.cartGroupId}>
            <div className="cart-group-heading">
              <div>
                <p className="card-kicker">
                  {group.groupType === 'PREORDER' ? 'Preventa' : 'Compra regular'}
                </p>
                <h2>{group.groupType === 'CONFLICT' ? 'Requiere revisión' : 'Productos'}</h2>
              </div>
              <div className="cart-group-total">
                <span>Subtotal estimado</span>
                <strong>${groupTotal.toLocaleString('es-CL')}</strong>
              </div>
            </div>
            <div className="cart-lines">
              {group.lines.map((line) => (
                <article className="cart-line" key={line.cartLineId}>
                  <div className="product-monogram" aria-hidden="true">
                    {line.productName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="cart-line-copy">
                    <p className="card-kicker">{line.sku}</p>
                    <h3>{line.productName}</h3>
                    <p>${line.unitPriceClp.toLocaleString('es-CL')} c/u</p>
                  </div>
                  <div className="quantity-control" aria-label={`Cantidad de ${line.productName}`}>
                    <button
                      aria-label={`Quitar una unidad de ${line.productName}`}
                      disabled={busyLineId === line.cartLineId}
                      onClick={() => void updateLine(line, Math.max(0, line.quantity - 1))}
                      type="button"
                    >
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      aria-label={`Agregar una unidad de ${line.productName}`}
                      disabled={busyLineId === line.cartLineId}
                      onClick={() => void updateLine(line, line.quantity + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <strong>${line.estimatedLineTotalClp.toLocaleString('es-CL')}</strong>
                  <button
                    className="remove-line"
                    disabled={busyLineId === line.cartLineId}
                    onClick={() => void updateLine(line, 0)}
                    type="button"
                  >
                    Eliminar
                  </button>
                </article>
              ))}
            </div>
            {group.groupType === 'CONFLICT' ? (
              <p className="status cart-conflict">Este grupo debe resolverse antes de continuar.</p>
            ) : currentSession() === null ? (
              <a className="button-link" href="/login">
                Ingresar para continuar
              </a>
            ) : (
              <a className="button-link" href={`/checkout?group=${group.cartGroupId}`}>
                Continuar al checkout
              </a>
            )}
          </section>
        );
      })}
      {activeGroups.length === 0 ? (
        <section className="empty-state cut-panel">
          <p className="eyebrow">Sin productos</p>
          <h2>Tu próxima jugada comienza en la tienda.</h2>
          <p>Explora el catálogo y agrega productos regulares o preventas a tu carrito.</p>
          <a className="button-link" href="/shop">
            Explorar catálogo
          </a>
        </section>
      ) : null}
    </main>
  );
}

function send<Value = void>(path: string, init: RequestInit = {}): Promise<Value> {
  return currentSession() === null
    ? publicRequest<Value>(path, init)
    : authorizedRequest<Value>(path, init);
}

function readCart() {
  return send<{ item: CartView | null }>('/api/v1/cart');
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible actualizar el carrito.';
}
