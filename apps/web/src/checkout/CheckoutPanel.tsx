import { type FormEvent, useState } from 'react';

import {
  clearCheckoutCoupon,
  clearCheckoutPoints,
  clearDeliveryIntent,
  readCheckoutSummary,
  replaceDeliveryIntent,
  revalidateCheckout,
  selectCheckoutCoupon,
  selectCheckoutPoints,
} from './api.js';

export function CheckoutPanel() {
  const [groupId, setGroupId] = useState('');
  const [summary, setSummary] = useState<ReturnType<JSON['parse']> | null>(null);
  const [message, setMessage] = useState('');
  const refresh = async (id = groupId) => setSummary((await readCheckoutSummary(id)).item);
  const load = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = String(new FormData(event.currentTarget).get('groupId')).trim();
    try {
      setGroupId(id);
      await refresh(id);
      setMessage('Resumen recalculado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar el checkout.');
    }
  };
  const run = async (event: FormEvent<HTMLFormElement>, action: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (action === 'DELIVERY') {
        const mode = String(form.get('mode'));
        await replaceDeliveryIntent(
          groupId,
          mode === 'PICKUP'
            ? { branchId: String(form.get('branchId')), mode: 'PICKUP' }
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

  return (
    <main className="wide-panel">
      <p className="eyebrow">Compra · Checkout</p>
      <h1>Revisión, entrega y beneficios</h1>
      <form className="inline-form" onSubmit={(event) => void load(event)}>
        <label>
          Grupo del carrito
          <input name="groupId" required />
        </label>
        <button>Cargar resumen</button>
      </form>
      {summary && (
        <>
          <section className="technical-card">
            <h2>Resumen recalculado</h2>
            <p>Total comercial: ${String(summary.totalAmountClp)} CLP</p>
            {summary.shippingPaymentMode === 'FREIGHT_COLLECT' && (
              <p>
                <strong>NO INCLUIDO — ENVÍO POR PAGAR</strong>
              </p>
            )}
          </section>
          <div className="pos-grid">
            <form onSubmit={(event) => void run(event, 'DELIVERY')}>
              <h2>Entrega</h2>
              <label>
                Modalidad
                <select name="mode">
                  <option>PICKUP</option>
                  <option>SHIPPING</option>
                </select>
              </label>
              <label>
                Sucursal de retiro
                <input name="branchId" />
              </label>
              <label>
                Destinatario
                <input name="recipientName" />
              </label>
              <label>
                Transportista
                <select name="carrier">
                  <option>CHILEXPRESS</option>
                  <option>STARKEN</option>
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
              <p>SHIPPING es exclusivamente hacia agencia; no se admite domicilio.</p>
              <button>Guardar entrega</button>
            </form>
            <form onSubmit={(event) => void run(event, 'COUPON')}>
              <h2>Cupón</h2>
              <label>
                Código
                <input name="coupon" required />
              </label>
              <button>Evaluar cupón</button>
            </form>
            <form onSubmit={(event) => void run(event, 'POINTS')}>
              <h2>Puntos</h2>
              <label>
                Puntos a canjear
                <input name="points" min="1" type="number" required />
              </label>
              <button>Evaluar puntos</button>
            </form>
          </div>
          <div className="actions">
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
          <pre>{JSON.stringify(summary, null, 2)}</pre>
        </>
      )}
      <p className="status" role="status">
        {message}
      </p>
    </main>
  );
}
