import { type FormEvent, useEffect, useState } from 'react';

import { currentSession } from '../identity/api.js';
import { readPublicStore } from '../service-coverage/api.js';
import { StoreField } from '../service-coverage/StoreField.js';
import { firstStore, type StoreSummary } from '../service-coverage/store.js';
import {
  clearCheckoutCoupon,
  clearCheckoutPoints,
  clearDeliveryIntent,
  createCheckoutOrder,
  createPaymentAttempt,
  readCheckoutSummary,
  replaceDeliveryIntent,
  revalidateCheckout,
  selectCheckoutCoupon,
  selectCheckoutPoints,
} from './api.js';

export function CheckoutPanel() {
  const initialGroupId = new URLSearchParams(window.location.search).get('group')?.trim() ?? '';
  const groupId = initialGroupId;
  const isAuthenticated = currentSession() !== null;
  const [summary, setSummary] = useState<ReturnType<JSON['parse']> | null>(null);
  const [order, setOrder] = useState<ReturnType<JSON['parse']> | null>(null);
  const [message, setMessage] = useState('');
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<'PICKUP' | 'SHIPPING'>('PICKUP');
  const refresh = async (id = groupId) => setSummary((await readCheckoutSummary(id)).item);
  useEffect(() => {
    if (!isAuthenticated || initialGroupId === '') return;
    let active = true;
    void readCheckoutSummary(initialGroupId)
      .then((result) => {
        if (!active) return;
        setSummary(result.item);
        setMessage('Revisa la entrega y el total antes de confirmar.');
      })
      .catch((error: unknown) =>
        active
          ? setMessage(
              error instanceof Error ? error.message : 'No fue posible cargar el checkout.',
            )
          : undefined,
      );
    return () => {
      active = false;
    };
  }, [initialGroupId, isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated || initialGroupId === '') return;
    let active = true;
    void readPublicStore()
      .then((result) => {
        if (!active) return;
        setStore(firstStore(result.item));
      })
      .catch(() => {
        if (active) setStore(null);
      });
    return () => {
      active = false;
    };
  }, [initialGroupId, isAuthenticated]);
  const run = async (event: FormEvent<HTMLFormElement>, action: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (action === 'DELIVERY') {
        const mode = String(form.get('mode'));
        if (mode === 'PICKUP' && store === null)
          throw new Error('La información de retiro en tienda no está disponible.');
        await replaceDeliveryIntent(
          groupId,
          mode === 'PICKUP'
            ? { branchId: store?.branchId, mode: 'PICKUP' }
            : {
                agencyDestination: String(form.get('agencyDestination')),
                carrier: String(form.get('carrier')),
                destinationCommune: String(form.get('destinationCommune')),
                destinationType: 'CARRIER_AGENCY',
                mode: 'SHIPPING',
                recipientName: String(form.get('recipientName')),
                shippingIncludedInOrderTotal: false,
                shippingPaymentMode: 'FREIGHT_COLLECT',
              },
        );
      }
      if (action === 'COUPON') await selectCheckoutCoupon(groupId, String(form.get('coupon')));
      if (action === 'POINTS') await selectCheckoutPoints(groupId, Number(form.get('points')));
      await refresh();
      setMessage('Checkout provisional actualizado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el checkout.');
    }
  };
  const runWithoutForm = async (
    action: 'CLEAR_COUPON' | 'CLEAR_DELIVERY' | 'CLEAR_POINTS' | 'REVALIDATE',
  ) => {
    try {
      if (action === 'REVALIDATE') await revalidateCheckout(groupId);
      if (action === 'CLEAR_DELIVERY') await clearDeliveryIntent(groupId);
      if (action === 'CLEAR_COUPON') await clearCheckoutCoupon(groupId);
      if (action === 'CLEAR_POINTS') await clearCheckoutPoints(groupId);
      await refresh();
      setMessage('Checkout provisional actualizado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el checkout.');
    }
  };
  const confirmOrder = async () => {
    try {
      const result = await createCheckoutOrder(groupId);
      setOrder(result.item);
      setMessage(
        result.item.requiresExternalPayment
          ? `Pedido ${String(result.item.publicNumber)} creado. Elige cómo pagar.`
          : `Pedido ${String(result.item.publicNumber)} confirmado sin pago externo.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible confirmar el pedido.');
    }
  };
  const beginPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (order === null) return;
    const data = new FormData(event.currentTarget);
    try {
      const result = await createPaymentAttempt(String(order.orderId), {
        payerEmail: String(data.get('payerEmail')),
        provider: 'FLOW',
      });
      const redirectUrl = String(result.item.redirectUrl ?? '');
      if (redirectUrl === '') {
        setMessage('El proveedor no entregó una dirección de pago. Intenta nuevamente.');
        return;
      }
      window.location.assign(redirectUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible iniciar el pago.');
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="page-frame checkout-page visual-public">
        <section className="checkout-access cut-panel">
          <p className="eyebrow">Checkout protegido</p>
          <h1>Ingresa para continuar tu compra</h1>
          <p>La creación de pedidos está disponible únicamente para clientes autenticados.</p>
          <div className="actions">
            <a className="button-link" href="/login">
              Ingresar
            </a>
            <a className="button-link secondary-link" href="/cart">
              Volver al carrito
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-frame checkout-page visual-public">
      <header className="section-heading checkout-heading cut-panel">
        <div>
          <p className="eyebrow">Compra · Checkout</p>
          <h1>Revisión, entrega y beneficios</h1>
          <p>Confirma cada dato antes de crear el pedido. El flete por pagar no se cobra aquí.</p>
        </div>
        <div aria-label="Condiciones del checkout" className="heading-stats">
          <span>Total confirmado por servidor</span>
          <span>Pago externo verificado</span>
        </div>
      </header>
      {initialGroupId === '' ? (
        <section className="checkout-access compact cut-panel">
          <p className="eyebrow">Falta seleccionar la compra</p>
          <h2>Continúa desde un grupo válido del carrito</h2>
          <p>El checkout no solicita identificadores internos escritos manualmente.</p>
          <a className="button-link" href="/cart">
            Revisar carrito
          </a>
        </section>
      ) : null}
      {summary && (
        <>
          <section className="checkout-summary cut-panel">
            <div className="checkout-summary-heading">
              <div>
                <p className="card-kicker">Resumen del pedido</p>
                <h2>Total recalculado</h2>
              </div>
              <span className="status-chip">Servidor</span>
            </div>
            <p className="checkout-total">
              <span>Total Sergod Store</span>
              <strong>${Number(summary.totalAmountClp).toLocaleString('es-CL')} CLP</strong>
            </p>
            {summary.shippingPaymentMode === 'FREIGHT_COLLECT' && (
              <p className="freight-notice">
                <strong>Envío por pagar — no incluido en este total</strong>
                <span>El flete se paga directamente al transportista.</span>
              </p>
            )}
          </section>
          <div className="checkout-options">
            <form
              className="checkout-option delivery-option"
              onSubmit={(event) => void run(event, 'DELIVERY')}
            >
              <div className="option-heading">
                <span aria-hidden="true">01</span>
                <div>
                  <p className="card-kicker">Modalidad</p>
                  <h2>Entrega</h2>
                </div>
              </div>
              <label>
                Modalidad
                <select
                  name="mode"
                  onChange={(event) =>
                    setDeliveryMode(event.currentTarget.value as 'PICKUP' | 'SHIPPING')
                  }
                  value={deliveryMode}
                >
                  <option value="PICKUP">Retiro en tienda</option>
                  <option value="SHIPPING">Despacho por pagar a agencia</option>
                </select>
              </label>
              {deliveryMode === 'PICKUP' ? (
                <StoreField store={store} />
              ) : (
                <div className="delivery-fields">
                  <p className="freight-notice compact">
                    <strong>Despacho exclusivamente a agencia</strong>
                    <span>No se solicita ni admite domicilio.</span>
                  </p>
                  <label>
                    Destinatario
                    <input name="recipientName" />
                  </label>
                  <label>
                    Transportista
                    <select name="carrier">
                      <option value="CHILEXPRESS">Chilexpress</option>
                      <option value="STARKEN">Starken</option>
                    </select>
                  </label>
                  <label>
                    Comuna o ciudad
                    <input name="destinationCommune" />
                  </label>
                  <label>
                    Agencia de destino
                    <input name="agencyDestination" />
                  </label>
                </div>
              )}
              <button disabled={deliveryMode === 'PICKUP' && store === null}>
                Guardar entrega
              </button>
            </form>
            <form className="checkout-option" onSubmit={(event) => void run(event, 'COUPON')}>
              <div className="option-heading">
                <span aria-hidden="true">02</span>
                <div>
                  <p className="card-kicker">Beneficio</p>
                  <h2>Cupón</h2>
                </div>
              </div>
              <label>
                Código
                <input name="coupon" required />
              </label>
              <button>Evaluar cupón</button>
            </form>
            <form className="checkout-option" onSubmit={(event) => void run(event, 'POINTS')}>
              <div className="option-heading">
                <span aria-hidden="true">03</span>
                <div>
                  <p className="card-kicker">Loyalty</p>
                  <h2>Puntos</h2>
                </div>
              </div>
              <label>
                Puntos a canjear
                <input name="points" min="1" type="number" required />
              </label>
              <button>Evaluar puntos</button>
            </form>
          </div>
          <div aria-label="Acciones del checkout" className="actions checkout-actions">
            <button onClick={() => void runWithoutForm('REVALIDATE')} type="button">
              Revalidar
            </button>
            <button
              className="secondary"
              onClick={() => void runWithoutForm('CLEAR_DELIVERY')}
              type="button"
            >
              Quitar entrega
            </button>
            <button
              className="secondary"
              onClick={() => void runWithoutForm('CLEAR_COUPON')}
              type="button"
            >
              Quitar cupón
            </button>
            <button
              className="secondary"
              onClick={() => void runWithoutForm('CLEAR_POINTS')}
              type="button"
            >
              Quitar puntos
            </button>
          </div>
          {order === null ? (
            <button
              className="confirm-order"
              disabled={!summary.canCreateOrder}
              onClick={() => void confirmOrder()}
              type="button"
            >
              Confirmar pedido
            </button>
          ) : null}
          {order?.requiresExternalPayment ? (
            <form
              className="payment-choice cut-panel"
              onSubmit={(event) => void beginPayment(event)}
            >
              <div>
                <p className="eyebrow">Pago online</p>
                <h2>Pago seguro con Flow</h2>
                <p>El regreso desde el proveedor no confirma el pago por sí solo.</p>
              </div>
              <label>
                Correo del pagador
                <input name="payerEmail" required type="email" />
              </label>
              <button type="submit">Ir al pago seguro</button>
            </form>
          ) : null}
        </>
      )}
      <p className="status" role="status">
        {message}
      </p>
    </main>
  );
}
