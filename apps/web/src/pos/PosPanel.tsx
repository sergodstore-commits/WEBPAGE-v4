import { type FormEvent, useEffect, useState } from 'react';
import { OperationalDataView } from '../admin/OperationalDataView.js';
import { readableText, shortIdentifier } from '../admin/presentation.js';
import { accounts as readAccounts, type AccountView } from '../identity/api.js';
import { readCoverage } from '../service-coverage/api.js';
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
  preorderCampaigns,
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
  const [workspace, setWorkspace] = useState<'METHODS' | 'REPORTS' | 'SALE'>('SALE');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ readonly data: unknown; readonly title: string } | null>(
    null,
  );
  const [sale, setSale] = useState<ReturnType<JSON['parse']>>(null);
  const [accountOptions, setAccountOptions] = useState<readonly AccountView[]>([]);
  const [branches, setBranches] = useState<readonly Item[]>([]);
  const [campaigns, setCampaigns] = useState<readonly Item[]>([]);
  const [methodOptions, setMethodOptions] = useState<readonly Item[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Item | null>(null);
  const activeMethods = methodOptions.filter((method) => method.state === 'ACTIVE');
  const draftMethods = methodOptions.filter((method) => method.state === 'DRAFT');
  const reload = async (id: string) => setSale(await getSale(id));
  const reloadMethods = async () => setMethodOptions(itemsOf(await moneyMethods()));
  useEffect(() => {
    let active = true;
    void Promise.allSettled([readAccounts(), readCoverage(), moneyMethods()]).then(
      ([accountResult, coverageResult, methodResult]) => {
        if (!active) return;
        if (accountResult.status === 'fulfilled')
          setAccountOptions(
            accountResult.value.filter(
              (account) => account.role === 'CLIENTE' && account.status === 'ACTIVE',
            ),
          );
        if (coverageResult.status === 'fulfilled')
          setBranches(uniqueBranches(itemsOf(coverageResult.value.serviceInfo)));
        if (methodResult.status === 'fulfilled') setMethodOptions(itemsOf(methodResult.value));
        const unavailable = [
          accountResult.status === 'rejected' ? 'cuentas' : null,
          coverageResult.status === 'rejected' ? 'sucursales' : null,
          methodResult.status === 'rejected' ? 'medios externos' : null,
        ].filter((label): label is string => label !== null);
        if (unavailable.length > 0)
          setMessage(`No fue posible cargar: ${unavailable.join(', ')}. Reintenta al recargar.`);
        setOptionsLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  const show = async (query: 'HISTORY' | 'METHODS') => {
    try {
      const data = query === 'HISTORY' ? await sales() : await moneyMethods();
      setResult({
        data: isRecord(data) && Array.isArray(data.items) ? data.items : data,
        title: query === 'HISTORY' ? 'Historial reciente' : 'Medios configurados',
      });
      setMessage('Consulta actualizada.');
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
        setSelectedProduct(product);
        setCampaigns(
          product.sale_type === 'PREORDER'
            ? itemsOf(await preorderCampaigns(String(product.product_id)))
            : [],
        );
        setMessage(`${product.sku} · ${product.name} · $${product.price_amount_clp}`);
      }
      if (kind === 'LINE' && sale) {
        await addLine(sale.item.pos_sale_id, {
          productId: String(selectedProduct?.product_id ?? ''),
          quantity: Number(form.get('quantity')),
          ...(String(form.get('campaignId')).trim()
            ? { preorderCampaignId: String(form.get('campaignId')) }
            : {}),
        });
        await reload(sale.item.pos_sale_id);
        setSelectedProduct(null);
        setCampaigns([]);
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
        await reloadMethods();
        setMessage(`Medio creado correctamente (${shortIdentifier(created.id)}).`);
      }
      if (kind === 'METHOD_EDIT') {
        await editMoneyMethod(String(form.get('methodId')), {
          name: String(form.get('name')),
          description: String(form.get('description')).trim() || null,
          publicInstructions: String(form.get('instructions')).trim() || null,
        });
        await reloadMethods();
        setMessage('Medio en borrador editado.');
      }
      if (kind === 'METHOD_DELETE') {
        await deleteMoneyMethod(String(form.get('methodId')));
        await reloadMethods();
        setMessage('Medio en borrador sin uso eliminado.');
      }
      if (kind === 'METHOD_STATE') {
        await transitionMoneyMethod(
          String(form.get('methodId')),
          String(form.get('nextState')),
          String(form.get('reason')),
        );
        await reloadMethods();
        setMessage('Estado del medio actualizado.');
      }
      if (kind === 'DAILY') {
        setResult({
          data: await daily(String(form.get('branchId')), String(form.get('date'))),
          title: 'Resumen diario',
        });
        setMessage('Resumen diario actualizado.');
      }
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
    <section className="admin-standalone-panel pos-workstation">
      <header className="pos-workstation-heading">
        <div>
          <p className="eyebrow">Caja presencial</p>
          <h2>Venta presencial</h2>
          <p>Registra dinero recibido por medios externos. Nunca solicita datos de tarjeta.</p>
        </div>
        <div className="pos-live-state" aria-label="Estado de la caja">
          <span>{sale ? 'Venta abierta' : 'Sin venta abierta'}</span>
          <strong>{sale ? shortIdentifier(String(sale.item.pos_sale_id)) : '—'}</strong>
        </div>
      </header>
      <div aria-label="Secciones del Pseudo-POS" className="pos-mode-switch" role="tablist">
        {[
          ['SALE', 'Caja'],
          ['REPORTS', 'Historial y cierre'],
          ['METHODS', 'Medios de pago'],
        ].map(([value, label]) => (
          <button
            aria-selected={workspace === value}
            className={workspace === value ? '' : 'secondary'}
            key={value}
            onClick={() => setWorkspace(value as 'METHODS' | 'REPORTS' | 'SALE')}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {workspace === 'SALE' && sale && (
        <section aria-label="Resumen de venta en curso" className="pos-sale-summary">
          <div>
            <span>Estado</span>
            <strong>{readableText(String(sale.item.state ?? 'BORRADOR'))}</strong>
          </div>
          <div>
            <span>Productos</span>
            <strong>{saleLines(sale).length}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatClp(sale.item.total_amount_clp)}</strong>
          </div>
        </section>
      )}
      <div className="pos-grid">
        <form
          className="pos-card"
          data-step="1"
          hidden={workspace !== 'SALE'}
          onSubmit={(event) => void action(event, 'CREATE')}
        >
          <h2>Nueva venta</h2>
          <label>
            Sucursal
            <BranchSelect branches={branches} loading={optionsLoading} name="branchId" />
          </label>
          <label>
            Tipo
            <select name="saleType">
              <option value="REGULAR">Venta regular</option>
              <option value="PREORDER">Preventa</option>
            </select>
          </label>
          <button disabled={branches.length === 0}>Crear borrador</button>
        </form>
        <form
          className="pos-card"
          data-step="2"
          hidden={workspace !== 'SALE'}
          onSubmit={(event) => void action(event, 'SKU')}
        >
          <h2>Buscar por SKU</h2>
          <label>
            SKU
            <input name="sku" required />
          </label>
          <button>Buscar</button>
        </form>
        {sale && (
          <form
            className="pos-card"
            data-step="3"
            hidden={workspace !== 'SALE'}
            onSubmit={(event) => void action(event, 'LINE')}
          >
            <h2>Agregar línea</h2>
            <div className="selected-operation-item">
              <span>Producto</span>
              <strong>
                {selectedProduct ? productOption(selectedProduct) : 'Busca primero por SKU'}
              </strong>
            </div>
            <label>
              Cantidad
              <input name="quantity" min="1" type="number" required />
            </label>
            <label>
              Campaña de preventa
              <select
                disabled={selectedProduct?.sale_type !== 'PREORDER'}
                name="campaignId"
                required={selectedProduct?.sale_type === 'PREORDER'}
              >
                <option value="">
                  {selectedProduct?.sale_type === 'PREORDER'
                    ? campaigns.length > 0
                      ? 'Selecciona una campaña abierta'
                      : 'No hay campañas abiertas'
                    : 'No aplica a venta regular'}
                </option>
                {campaigns.map((campaign) => (
                  <option
                    key={String(campaign.preorderCampaignId)}
                    value={String(campaign.preorderCampaignId)}
                  >
                    {campaignOption(campaign)}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={
                selectedProduct === null ||
                (selectedProduct.sale_type === 'PREORDER' && campaigns.length === 0)
              }
            >
              Agregar
            </button>
          </form>
        )}
        {sale && (
          <form
            className="pos-card pos-card-wide"
            data-step="4"
            hidden={workspace !== 'SALE'}
            onSubmit={(event) => void action(event, 'BUYER')}
          >
            <h2>Comprador y entrega</h2>
            <label>
              Cuenta vinculada
              <select disabled={optionsLoading} name="accountId">
                <option value="">
                  {optionsLoading ? 'Cargando cuentas…' : 'Venta como invitado'}
                </option>
                {accountOptions.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.currentEmail}
                  </option>
                ))}
              </select>
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
                <option value="PICKUP">Retiro en sucursal</option>
                <option value="SHIPPING">Despacho a agencia</option>
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
        {sale && saleLines(sale).length > 0 && (
          <form
            className="pos-card"
            hidden={workspace !== 'SALE'}
            onSubmit={(event) => void action(event, 'LINE_UPDATE')}
          >
            <h2>Modificar línea</h2>
            <label>
              Línea
              <LineSelect lines={saleLines(sale)} name="lineId" />
            </label>
            <label>
              Cantidad
              <input name="quantity" min="1" type="number" required />
            </label>
            <button>Modificar línea</button>
          </form>
        )}
        {sale && saleLines(sale).length > 0 && (
          <form
            className="pos-card"
            hidden={workspace !== 'SALE'}
            onSubmit={(event) => void action(event, 'LINE_REMOVE')}
          >
            <h2>Eliminar línea</h2>
            <label>
              Línea
              <LineSelect lines={saleLines(sale)} name="lineId" />
            </label>
            <button>Eliminar línea</button>
          </form>
        )}
        {sale && (
          <form
            className="pos-card"
            data-step="5"
            hidden={workspace !== 'SALE'}
            onSubmit={(event) => void action(event, 'BENEFITS')}
          >
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
          <form
            className="pos-card pos-complete-card"
            data-step="6"
            hidden={workspace !== 'SALE'}
            onSubmit={(event) => void action(event, 'COMPLETE')}
          >
            <h2>Preparar y completar</h2>
            <label>
              Medio externo
              <MethodSelect
                allowEmpty={Number(sale.item.total_amount_clp ?? 0) === 0}
                loading={optionsLoading}
                methods={activeMethods}
                name="methodId"
              />
            </label>
            <label>
              Referencia
              <input name="reference" />
            </label>
            <label>
              Nota
              <input name="note" />
            </label>
            <button
              disabled={Number(sale.item.total_amount_clp ?? 0) > 0 && activeMethods.length === 0}
            >
              Completar venta
            </button>
          </form>
        )}
        <form
          className="pos-card"
          hidden={workspace !== 'METHODS'}
          onSubmit={(event) => void action(event, 'METHOD')}
        >
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
        <form
          className="pos-card"
          hidden={workspace !== 'METHODS'}
          onSubmit={(event) => void action(event, 'METHOD_STATE')}
        >
          <h2>Estado del medio</h2>
          <label>
            Medio
            <MethodSelect loading={optionsLoading} methods={methodOptions} name="methodId" />
          </label>
          <label>
            Estado
            <select name="nextState">
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
              <option value="RETIRED">Retirado</option>
            </select>
          </label>
          <label>
            Motivo
            <input name="reason" required />
          </label>
          <button disabled={methodOptions.length === 0}>Cambiar estado</button>
        </form>
        <form
          className="pos-card"
          hidden={workspace !== 'METHODS'}
          onSubmit={(event) => void action(event, 'METHOD_EDIT')}
        >
          <h2>Editar medio en borrador</h2>
          <label>
            Medio
            <MethodSelect loading={optionsLoading} methods={draftMethods} name="methodId" />
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
          <button disabled={draftMethods.length === 0}>Editar medio</button>
        </form>
        <form
          className="pos-card pos-danger-card"
          hidden={workspace !== 'METHODS'}
          onSubmit={(event) => void action(event, 'METHOD_DELETE')}
        >
          <h2>Eliminar medio en borrador sin uso</h2>
          <label>
            Medio
            <MethodSelect loading={optionsLoading} methods={draftMethods} name="methodId" />
          </label>
          <button disabled={draftMethods.length === 0}>Eliminar medio</button>
        </form>
        <form
          className="pos-card"
          hidden={workspace !== 'REPORTS'}
          onSubmit={(event) => void action(event, 'DAILY')}
        >
          <h2>Total diario</h2>
          <label>
            Sucursal
            <BranchSelect branches={branches} loading={optionsLoading} name="branchId" />
          </label>
          <label>
            Fecha
            <input name="date" type="date" required />
          </label>
          <button disabled={branches.length === 0}>Consultar</button>
        </form>
        {sale && (
          <form
            className="pos-card"
            hidden={workspace !== 'SALE'}
            onSubmit={(event) => void action(event, 'RETURN_DRAFT')}
          >
            <h2>Volver a borrador</h2>
            <label>
              Motivo
              <input name="reason" required />
            </label>
            <button>Volver a borrador</button>
          </form>
        )}
        {sale && (
          <form
            className="pos-card pos-danger-card"
            hidden={workspace !== 'SALE'}
            onSubmit={(event) => void action(event, 'DISCARD')}
          >
            <h2>Descartar venta</h2>
            <label>
              Motivo
              <input name="reason" required />
            </label>
            <button>Descartar</button>
          </form>
        )}
      </div>
      <div className="actions" hidden={workspace === 'SALE'}>
        <button className="secondary" onClick={() => void show('HISTORY')}>
          Historial reciente
        </button>
        <button className="secondary" onClick={() => void show('METHODS')}>
          Medios configurados
        </button>
      </div>
      {workspace === 'SALE' && sale && (
        <details className="pos-technical-detail">
          <summary>Ver detalle completo de la venta</summary>
          <OperationalDataView data={sale} title="Venta en curso" />
        </details>
      )}
      {workspace !== 'SALE' && result && (
        <OperationalDataView data={result.data} title={result.title} />
      )}
      <p className="status" role="status">
        {message}
      </p>
    </section>
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatClp(value: unknown): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('es-CL', { currency: 'CLP', style: 'currency' }).format(amount)
    : '$0';
}

type Item = Readonly<Record<string, unknown>>;

function itemsOf(value: unknown): readonly Item[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.items)) return value.items.filter(isRecord);
  return [];
}

function uniqueBranches(items: readonly Item[]): readonly Item[] {
  return items.filter(
    (item, index) =>
      typeof item.branch_id === 'string' &&
      items.findIndex((candidate) => candidate.branch_id === item.branch_id) === index,
  );
}

function BranchSelect({
  branches,
  loading,
  name,
}: {
  readonly branches: readonly Item[];
  readonly loading: boolean;
  readonly name: string;
}) {
  return (
    <select disabled={branches.length === 0} name={name} required>
      <option value="">
        {loading
          ? 'Cargando sucursal…'
          : branches.length === 0
            ? 'No hay sucursal configurada'
            : 'Selecciona una sucursal'}
      </option>
      {branches.map((branch) => (
        <option key={String(branch.branch_id)} value={String(branch.branch_id)}>
          {String(branch.public_address ?? `Sucursal ${shortIdentifier(String(branch.branch_id))}`)}
        </option>
      ))}
    </select>
  );
}

function LineSelect({ lines, name }: { readonly lines: readonly Item[]; readonly name: string }) {
  return (
    <select name={name} required>
      <option value="">Selecciona un producto</option>
      {lines.map((line) => (
        <option key={String(line.pos_sale_line_id)} value={String(line.pos_sale_line_id)}>
          {lineLabel(line)}
        </option>
      ))}
    </select>
  );
}

function MethodSelect({
  allowEmpty = false,
  loading,
  methods,
  name,
}: {
  readonly allowEmpty?: boolean;
  readonly loading: boolean;
  readonly methods: readonly Item[];
  readonly name: string;
}) {
  return (
    <select disabled={!allowEmpty && methods.length === 0} name={name} required={!allowEmpty}>
      <option value="">
        {loading
          ? 'Cargando medios…'
          : methods.length === 0
            ? 'No hay medios disponibles'
            : allowEmpty
              ? 'No requerido'
              : 'Selecciona'}
      </option>
      {methods.map((method) => (
        <option
          key={String(method.external_money_method_id)}
          value={String(method.external_money_method_id)}
        >
          {readableText(
            String(method.display_name ?? method.code_normalized ?? 'Medio sin nombre'),
          )}
        </option>
      ))}
    </select>
  );
}

function productOption(product: Item): string {
  return `${String(product.sku)} · ${readableText(String(product.name))}`;
}

function lineLabel(line: Item): string {
  const name = readableText(String(line.product_name_snapshot ?? 'Producto'));
  const sku = String(line.sku_snapshot ?? '').trim();
  return `${sku ? `${sku} · ` : ''}${name} · ${String(line.quantity)} unidad(es)`;
}

function campaignOption(campaign: Item): string {
  const arrival = readableText(String(campaign.estimatedArrivalText ?? 'Llegada por confirmar'));
  const available =
    Number(campaign.capacity ?? 0) -
    Number(campaign.committed ?? 0) -
    Number(campaign.temporarilyReserved ?? 0);
  return `${arrival} · ${Math.max(0, available)} cupos`;
}

function saleLines(value: unknown): readonly Item[] {
  return isRecord(value) && Array.isArray(value.lines) ? value.lines.filter(isRecord) : [];
}
