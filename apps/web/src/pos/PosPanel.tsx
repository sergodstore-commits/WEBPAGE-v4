import { type FormEvent, useState } from 'react';
import {
  addLine,
  completeSale,
  createMoneyMethod,
  createSale,
  daily,
  deleteMoneyMethod,
  discardSale,
  editMoneyMethod,
  findSku,
  getSale,
  moneyMethods,
  prepareSale,
  removeLine,
  returnSaleToDraft,
  sales,
  setBuyer,
  setCoupon,
  setLoyalty,
  transitionMoneyMethod,
  updateLine,
} from './api.js';

export function PosPanel() {
  const [message, setMessage] = useState('');
  const [sale, setSale] = useState<ReturnType<JSON['parse']>>(null);
  const reload = async (id: string) => setSale(await getSale(id));
  const show = async (query: 'HISTORY' | 'METHODS') => {
    try {
      setMessage(JSON.stringify(query === 'HISTORY' ? await sales() : await moneyMethods()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible completar la consulta.');
    }
  };
  const action = async (event: FormEvent<HTMLFormElement>, kind: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (kind === 'CREATE') {
        const created = await createSale({
          branchId: String(form.get('branchId')),
          saleType: String(form.get('saleType')),
        });
        await reload(created.id);
      }
      if (kind === 'SKU') {
        const product = (await findSku(String(form.get('sku')))).item;
        setMessage(`${product.sku} · ${product.name} · $${product.price_amount_clp}`);
      }
      if (kind === 'LINE' && sale) {
        await addLine(sale.item.pos_sale_id, {
          productId: String(form.get('productId')),
          quantity: Number(form.get('quantity')),
          ...(String(form.get('campaignId')).trim()
            ? { preorderCampaignId: String(form.get('campaignId')) }
            : {}),
        });
        await reload(sale.item.pos_sale_id);
      }
      if (kind === 'LINE_UPDATE' && sale) {
        await updateLine(
          sale.item.pos_sale_id,
          String(form.get('lineId')),
          Number(form.get('quantity')),
        );
        await reload(sale.item.pos_sale_id);
      }
      if (kind === 'LINE_REMOVE' && sale) {
        await removeLine(sale.item.pos_sale_id, String(form.get('lineId')));
        await reload(sale.item.pos_sale_id);
      }
      if (kind === 'BUYER' && sale) {
        const mode = String(form.get('deliveryMode'));
        const contactEmail = String(form.get('buyerEmail')).trim() || null;
        const contactPhone = String(form.get('buyerPhone')).trim() || null;
        const recipientName = String(form.get('buyerName')).trim();
        const delivery =
          sale.item.sale_type === 'REGULAR'
            ? null
            : mode === 'PICKUP'
              ? {
                  mode: 'PICKUP',
                  branchId: sale.item.branch_id,
                  recipientName,
                }
              : {
                  mode: 'SHIPPING',
                  recipientName,
                  shippingPaymentMode: 'FREIGHT_COLLECT',
                  destinationType: 'CARRIER_AGENCY',
                  carrier: String(form.get('carrier')),
                  destinationCommune: String(form.get('destinationCommune')),
                  agencyDestination: String(form.get('agencyDestination')),
                  shippingIncludedInOrderTotal: false,
                };
        await setBuyer(sale.item.pos_sale_id, {
          accountId: String(form.get('accountId')).trim() || null,
          buyerName: recipientName || null,
          buyerEmail: contactEmail,
          buyerPhone: contactPhone,
          delivery,
        });
        await reload(sale.item.pos_sale_id);
      }
      if (kind === 'BENEFITS' && sale) {
        await setCoupon(sale.item.pos_sale_id, String(form.get('coupon')).trim() || null);
        await setLoyalty(sale.item.pos_sale_id, Number(form.get('points')));
        await reload(sale.item.pos_sale_id);
      }
      if (kind === 'COMPLETE' && sale) {
        await prepareSale(sale.item.pos_sale_id);
        const prepared = await getSale(sale.item.pos_sale_id);
        const total = Number(prepared.item.total_amount_clp);
        if (total === 0) await completeSale(sale.item.pos_sale_id, {});
        else {
          await completeSale(sale.item.pos_sale_id, {
            amountClp: total,
            externalMoneyMethodId: String(form.get('methodId')),
            reference: String(form.get('reference')).trim() || undefined,
            note: String(form.get('note')).trim() || undefined,
          });
        }
        await reload(sale.item.pos_sale_id);
      }
      if (kind === 'METHOD') {
        const created = await createMoneyMethod({
          code: String(form.get('code')),
          name: String(form.get('name')),
          description: String(form.get('description')).trim() || null,
          publicInstructions: String(form.get('instructions')).trim() || null,
        });
        setMessage(`Medio creado: ${created.id}`);
      }
      if (kind === 'METHOD_EDIT') {
        await editMoneyMethod(String(form.get('methodId')), {
          name: String(form.get('name')),
          description: String(form.get('description')).trim() || null,
          publicInstructions: String(form.get('instructions')).trim() || null,
        });
        setMessage('Medio DRAFT editado.');
      }
      if (kind === 'METHOD_DELETE') {
        await deleteMoneyMethod(String(form.get('methodId')));
        setMessage('Medio DRAFT sin uso eliminado.');
      }
      if (kind === 'METHOD_STATE') {
        await transitionMoneyMethod(
          String(form.get('methodId')),
          String(form.get('nextState')),
          String(form.get('reason')),
        );
        setMessage('Estado del medio actualizado.');
      }
      if (kind === 'DAILY')
        setMessage(
          JSON.stringify(await daily(String(form.get('branchId')), String(form.get('date')))),
        );
      if (kind === 'RETURN_DRAFT' && sale) {
        await returnSaleToDraft(sale.item.pos_sale_id, String(form.get('reason')));
        await reload(sale.item.pos_sale_id);
      }
      if (kind === 'DISCARD' && sale) {
        await discardSale(sale.item.pos_sale_id, String(form.get('reason')));
        await reload(sale.item.pos_sale_id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible completar la operación.');
    }
  };
  return (
    <main className="wide-panel">
      <p className="eyebrow">Administración · Pseudo-POS</p>
      <h1>Venta presencial</h1>
      <p>
        Registra dinero recibido por medios externos. No procesa pagos ni solicita datos de tarjeta.
      </p>
      <div className="pos-grid">
        <form onSubmit={(event) => void action(event, 'CREATE')}>
          <h2>Nueva venta</h2>
          <label>
            Sucursal
            <input name="branchId" required />
          </label>
          <label>
            Tipo
            <select name="saleType">
              <option>REGULAR</option>
              <option>PREORDER</option>
            </select>
          </label>
          <button>Crear borrador</button>
        </form>
        <form onSubmit={(event) => void action(event, 'SKU')}>
          <h2>Buscar por SKU</h2>
          <label>
            SKU
            <input name="sku" required />
          </label>
          <button>Buscar</button>
        </form>
        {sale && (
          <form onSubmit={(event) => void action(event, 'LINE')}>
            <h2>Agregar línea</h2>
            <label>
              Producto
              <input name="productId" required />
            </label>
            <label>
              Cantidad
              <input name="quantity" min="1" type="number" required />
            </label>
            <label>
              Campaña de preventa
              <input name="campaignId" />
            </label>
            <button>Agregar</button>
          </form>
        )}
        {sale && (
          <form onSubmit={(event) => void action(event, 'BUYER')}>
            <h2>Comprador y entrega</h2>
            <label>
              Cuenta vinculada
              <input name="accountId" />
            </label>
            <label>
              Nombre
              <input name="buyerName" />
            </label>
            <label>
              Correo
              <input name="buyerEmail" type="email" />
            </label>
            <label>
              Teléfono
              <input name="buyerPhone" />
            </label>
            <label>
              Modalidad
              <select name="deliveryMode">
                <option>PICKUP</option>
                <option>SHIPPING</option>
              </select>
            </label>
            <label>
              Transportista
              <select name="carrier">
                <option>CHILEXPRESS</option>
                <option>STARKEN</option>
              </select>
            </label>
            <label>
              Comuna o ciudad de destino
              <input name="destinationCommune" />
            </label>
            <label>
              Agencia de destino
              <input name="agencyDestination" />
            </label>
            <p>NO INCLUIDO — ENVÍO POR PAGAR. No se autoriza despacho domiciliario.</p>
            <button>Guardar comprador</button>
          </form>
        )}
        {sale && (
          <form onSubmit={(event) => void action(event, 'LINE_UPDATE')}>
            <h2>Modificar línea</h2>
            <label>
              Línea
              <input name="lineId" required />
            </label>
            <label>
              Cantidad
              <input name="quantity" min="1" type="number" required />
            </label>
            <button>Modificar línea</button>
          </form>
        )}
        {sale && (
          <form onSubmit={(event) => void action(event, 'LINE_REMOVE')}>
            <h2>Eliminar línea</h2>
            <label>
              Línea
              <input name="lineId" required />
            </label>
            <button>Eliminar línea</button>
          </form>
        )}
        {sale && (
          <form onSubmit={(event) => void action(event, 'BENEFITS')}>
            <h2>Beneficios</h2>
            <label>
              Cupón
              <input name="coupon" />
            </label>
            <label>
              Puntos a canjear
              <input name="points" min="0" type="number" defaultValue="0" />
            </label>
            <button>Evaluar y guardar</button>
          </form>
        )}
        {sale && (
          <form onSubmit={(event) => void action(event, 'COMPLETE')}>
            <h2>Preparar y completar</h2>
            <label>
              Medio externo
              <input name="methodId" />
            </label>
            <label>
              Referencia
              <input name="reference" />
            </label>
            <label>
              Nota
              <input name="note" />
            </label>
            <button>Completar venta</button>
          </form>
        )}
        <form onSubmit={(event) => void action(event, 'METHOD')}>
          <h2>Nuevo medio externo</h2>
          <label>
            Código
            <input name="code" pattern="[A-Z][A-Z0-9_]{1,31}" required />
          </label>
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            Descripción
            <input name="description" />
          </label>
          <label>
            Instrucciones
            <input name="instructions" />
          </label>
          <button>Crear medio</button>
        </form>
        <form onSubmit={(event) => void action(event, 'METHOD_STATE')}>
          <h2>Estado del medio</h2>
          <label>
            Medio
            <input name="methodId" required />
          </label>
          <label>
            Estado
            <select name="nextState">
              <option>ACTIVE</option>
              <option>INACTIVE</option>
              <option>RETIRED</option>
            </select>
          </label>
          <label>
            Motivo
            <input name="reason" required />
          </label>
          <button>Cambiar estado</button>
        </form>
        <form onSubmit={(event) => void action(event, 'METHOD_EDIT')}>
          <h2>Editar medio DRAFT</h2>
          <label>
            Medio
            <input name="methodId" required />
          </label>
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            Descripción
            <input name="description" />
          </label>
          <label>
            Instrucciones
            <input name="instructions" />
          </label>
          <button>Editar medio</button>
        </form>
        <form onSubmit={(event) => void action(event, 'METHOD_DELETE')}>
          <h2>Eliminar medio DRAFT sin uso</h2>
          <label>
            Medio
            <input name="methodId" required />
          </label>
          <button>Eliminar medio</button>
        </form>
        <form onSubmit={(event) => void action(event, 'DAILY')}>
          <h2>Total diario</h2>
          <label>
            Sucursal
            <input name="branchId" required />
          </label>
          <label>
            Fecha
            <input name="date" type="date" required />
          </label>
          <button>Consultar</button>
        </form>
        {sale && (
          <form onSubmit={(event) => void action(event, 'RETURN_DRAFT')}>
            <h2>Volver a borrador</h2>
            <label>
              Motivo
              <input name="reason" required />
            </label>
            <button>Volver a DRAFT</button>
          </form>
        )}
        {sale && (
          <form onSubmit={(event) => void action(event, 'DISCARD')}>
            <h2>Descartar venta</h2>
            <label>
              Motivo
              <input name="reason" required />
            </label>
            <button>Descartar</button>
          </form>
        )}
      </div>
      <div className="actions">
        <button className="secondary" onClick={() => void show('HISTORY')}>
          Historial reciente
        </button>
        <button className="secondary" onClick={() => void show('METHODS')}>
          Medios configurados
        </button>
      </div>
      {sale && <pre>{JSON.stringify(sale, null, 2)}</pre>}
      <p className="status" role="status">
        {message}
      </p>
    </main>
  );
}
