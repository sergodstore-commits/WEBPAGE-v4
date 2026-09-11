import { type FormEvent, useEffect, useState } from 'react';
import { OperationalDataView } from '../admin/OperationalDataView.js';
import { readableText, shortIdentifier } from '../admin/presentation.js';
import { accounts as readAccounts, type AccountView } from '../identity/api.js';
import { readCoverage } from '../service-coverage/api.js';
import { StoreField } from '../service-coverage/StoreField.js';
import { firstStoreFromCoverage, type StoreSummary } from '../service-coverage/store.js';
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
  posCatalog,
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
  type PosCatalogProduct,
} from './api.js';

export function PosPanel() {
  const [workspace, setWorkspace] = useState<'METHODS' | 'REPORTS' | 'SALE'>('SALE');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<{ readonly data: unknown; readonly title: string } | null>(
    null,
  );
  const [sale, setSale] = useState<ReturnType<JSON['parse']>>(null);
  const [accountOptions, setAccountOptions] = useState<readonly AccountView[]>([]);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [campaigns, setCampaigns] = useState<readonly Item[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<readonly PosCatalogProduct[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogGame, setCatalogGame] = useState('ALL');
  const [methodOptions, setMethodOptions] = useState<readonly Item[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Item | null>(null);
  const activeMethods = methodOptions.filter((method) => method.state === 'ACTIVE');
  const draftMethods = methodOptions.filter((method) => method.state === 'DRAFT');
  const reload = async (id: string) => setSale(await getSale(id));
  const reloadMethods = async () => setMethodOptions(itemsOf(await moneyMethods()));
  useEffect(() => {
    let active = true;
    void Promise.allSettled([readAccounts(), readCoverage(), moneyMethods(), posCatalog()]).then(
      ([accountResult, coverageResult, methodResult, catalogResult]) => {
        if (!active) return;
        if (accountResult.status === 'fulfilled')
          setAccountOptions(
            accountResult.value.filter(
              (account) => account.role === 'CLIENTE' && account.status === 'ACTIVE',
            ),
          );
        if (coverageResult.status === 'fulfilled')
          setStore(firstStoreFromCoverage(coverageResult.value));
        if (methodResult.status === 'fulfilled') setMethodOptions(itemsOf(methodResult.value));
        if (catalogResult.status === 'fulfilled') setCatalogProducts(catalogResult.value.items);
        const unavailable = [
          accountResult.status === 'rejected' ? 'cuentas' : null,
          coverageResult.status === 'rejected' ? 'tienda' : null,
          methodResult.status === 'rejected' ? 'medios externos' : null,
          catalogResult.status === 'rejected' ? 'catálogo del POS' : null,
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
  const chooseProduct = async (product: PosCatalogProduct) => {
    const normalized: Item = {
      name: product.name,
      price_amount_clp: product.priceAmountClp,
      product_id: product.productId,
      sale_type: product.saleType,
    };
    setSelectedProduct(normalized);
    try {
      setCampaigns(
        product.saleType === 'PREORDER' ? itemsOf(await preorderCampaigns(product.productId)) : [],
      );
      setMessage(`${product.name} · ${formatClp(product.priceAmountClp)}`);
    } catch (error) {
      setCampaigns([]);
      setMessage(error instanceof Error ? error.message : 'No fue posible preparar este producto.');
    }
  };
  const changeLineQuantity = async (line: Item, delta: number) => {
    if (!sale) return;
    const nextQuantity = Number(line.quantity ?? 0) + delta;
    try {
      if (nextQuantity <= 0) await removeLine(sale.item.pos_sale_id, String(line.pos_sale_line_id));
      else await updateLine(sale.item.pos_sale_id, String(line.pos_sale_line_id), nextQuantity);
      await reload(sale.item.pos_sale_id);
      setMessage(nextQuantity <= 0 ? 'Producto retirado de la venta.' : 'Cantidad actualizada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar la cantidad.');
    }
  };
  const removeSaleLine = async (line: Item) => {
    if (!sale) return;
    try {
      await removeLine(sale.item.pos_sale_id, String(line.pos_sale_line_id));
      await reload(sale.item.pos_sale_id);
      setMessage('Producto retirado de la venta.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No fue posible retirar el producto.');
    }
  };
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
  const catalogGames = Array.from(
    new Map(catalogProducts.map((product) => [product.game.gameId, product.game])).values(),
  );
  const normalizedCatalogQuery = catalogQuery.trim().toLocaleLowerCase('es-CL');
  const visibleCatalogProducts = catalogProducts.filter(
    (product) =>
      (catalogGame === 'ALL' || product.game.gameId === catalogGame) &&
      (normalizedCatalogQuery === '' ||
        `${product.name} ${product.game.name}`
          .toLocaleLowerCase('es-CL')
          .includes(normalizedCatalogQuery)),
  );
  return (
    <section className="admin-standalone-panel pos-workstation">
      <header className="pos-workstation-heading">
        <div>
          <p className="eyebrow">Caja presencial</p>
          <h2>POS</h2>
          <p>
            Registra la venta presencial y descuenta sus unidades del mismo stock que usa la tienda
            online. El pago se realiza fuera de esta página.
          </p>
        </div>
        <div className="pos-live-state" aria-label="Estado de la caja">
          <span>{sale ? 'Venta abierta' : 'Sin venta abierta'}</span>
          <strong>{sale ? shortIdentifier(String(sale.item.pos_sale_id)) : '—'}</strong>
        </div>
      </header>
      <div aria-label="Secciones del POS" className="pos-mode-switch" role="tablist">
        {[
          ['SALE', 'Caja'],
          ['REPORTS', 'Historial y cierre'],
          ['METHODS', 'Medios recibidos'],
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
      {workspace === 'SALE' && !sale && (
        <form
          className="pos-card pos-start-card"
          onSubmit={(event) => void action(event, 'CREATE')}
        >
          <div>
            <p className="eyebrow">Abrir caja</p>
            <h2>Nueva venta</h2>
            <p>Selecciona el tipo de operación para comenzar a agregar productos.</p>
          </div>
          <div className="pos-start-fields">
            <StoreField loading={optionsLoading} store={store} />
            <label>
              Tipo de venta
              <select name="saleType">
                <option value="REGULAR">Venta regular</option>
                <option value="PREORDER">Preventa</option>
              </select>
            </label>
            <button disabled={store === null}>Abrir venta</button>
          </div>
        </form>
      )}
      {workspace === 'SALE' && sale && (
        <div className="pos-register-layout">
          <section aria-label="Catálogo del POS" className="pos-product-pane">
            <header className="pos-pane-heading">
              <div>
                <p className="eyebrow">Catálogo</p>
                <h2>Productos</h2>
              </div>
              <span>{visibleCatalogProducts.length} disponibles</span>
            </header>
            <label className="pos-catalog-search">
              <span className="visually-hidden">Buscar productos</span>
              <input
                onChange={(event) => setCatalogQuery(event.currentTarget.value)}
                placeholder="Buscar por nombre o juego…"
                type="search"
                value={catalogQuery}
              />
            </label>
            <div
              aria-label="Filtrar catálogo por juego"
              className="pos-category-strip"
              role="tablist"
            >
              <button
                aria-selected={catalogGame === 'ALL'}
                onClick={() => setCatalogGame('ALL')}
                role="tab"
                type="button"
              >
                Todos
              </button>
              {catalogGames.map((game) => (
                <button
                  aria-selected={catalogGame === game.gameId}
                  key={game.gameId}
                  onClick={() => setCatalogGame(game.gameId)}
                  role="tab"
                  type="button"
                >
                  {game.name}
                </button>
              ))}
            </div>
            <div className="pos-product-grid">
              {visibleCatalogProducts.map((product) => {
                const incompatible = product.saleType !== sale.item.sale_type;
                return (
                  <button
                    aria-pressed={selectedProduct?.product_id === product.productId}
                    className="pos-product-tile"
                    disabled={!product.availableForPurchase || incompatible}
                    key={product.productId}
                    onClick={() => void chooseProduct(product)}
                    type="button"
                  >
                    <span className="pos-product-image">
                      <img
                        alt={product.primaryResource.altText}
                        height={product.primaryResource.heightPx}
                        loading="lazy"
                        src={resourceUrl(product.primaryResource.resourceId)}
                        width={product.primaryResource.widthPx}
                      />
                      <small>{product.saleType === 'PREORDER' ? 'Preventa' : 'Disponible'}</small>
                    </span>
                    <strong>{product.name}</strong>
                    <span>{product.game.name}</span>
                    <b>{formatClp(product.priceAmountClp)}</b>
                  </button>
                );
              })}
              {visibleCatalogProducts.length === 0 && (
                <div className="pos-empty-catalog">
                  <strong>No hay productos para mostrar</strong>
                  <span>Prueba otra búsqueda o revisa el catálogo publicado.</span>
                </div>
              )}
            </div>
            <form className="pos-sku-search" onSubmit={(event) => void action(event, 'SKU')}>
              <label>
                Buscar directamente por SKU
                <input name="sku" placeholder="Ej. PKM-001" required />
              </label>
              <button className="secondary">Buscar SKU</button>
            </form>
            <form className="pos-selected-product" onSubmit={(event) => void action(event, 'LINE')}>
              <div className="selected-operation-item">
                <span>Producto seleccionado</span>
                <strong>
                  {selectedProduct ? productOption(selectedProduct) : 'Selecciona un producto'}
                </strong>
              </div>
              <label>
                Cantidad
                <input defaultValue="1" name="quantity" min="1" type="number" required />
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
                Agregar a la venta
              </button>
            </form>
          </section>
          <aside aria-label="Venta actual" className="pos-ticket-pane">
            <header className="pos-ticket-heading">
              <div>
                <p className="eyebrow">Venta actual</p>
                <h2>Detalle</h2>
              </div>
              <span>{saleLines(sale).length} productos</span>
            </header>
            <div className="pos-ticket-lines">
              {saleLines(sale).map((line) => (
                <article className="pos-ticket-line" key={String(line.pos_sale_line_id)}>
                  <div>
                    <strong>
                      {readableText(String(line.product_name_snapshot ?? 'Producto'))}
                    </strong>
                    <span>{String(line.sku_snapshot ?? '')}</span>
                  </div>
                  <div
                    className="pos-quantity-control"
                    aria-label={`Cantidad de ${String(line.product_name_snapshot ?? 'producto')}`}
                  >
                    <button
                      aria-label="Disminuir cantidad"
                      onClick={() => void changeLineQuantity(line, -1)}
                      type="button"
                    >
                      −
                    </button>
                    <strong>{String(line.quantity ?? 0)}</strong>
                    <button
                      aria-label="Aumentar cantidad"
                      onClick={() => void changeLineQuantity(line, 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <b>{lineTotal(line)}</b>
                  <button
                    aria-label={`Quitar ${String(line.product_name_snapshot ?? 'producto')}`}
                    className="pos-remove-line"
                    onClick={() => void removeSaleLine(line)}
                    type="button"
                  >
                    ×
                  </button>
                </article>
              ))}
              {saleLines(sale).length === 0 && (
                <div className="pos-empty-ticket">
                  <strong>La venta está vacía</strong>
                  <span>Selecciona un producto del catálogo para comenzar.</span>
                </div>
              )}
            </div>
            <details className="pos-ticket-settings">
              <summary>Cliente y entrega</summary>
              <form onSubmit={(event) => void action(event, 'BUYER')}>
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
                    <option value="PICKUP">Retiro en tienda</option>
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
                <button>Guardar cliente</button>
              </form>
            </details>
            <details className="pos-ticket-settings">
              <summary>Descuentos y puntos</summary>
              <form onSubmit={(event) => void action(event, 'BENEFITS')}>
                <h2>Beneficios</h2>
                <label>
                  Cupón
                  <input name="coupon" />
                </label>
                <label>
                  Puntos a canjear
                  <input defaultValue="0" min="0" name="points" type="number" />
                </label>
                <button>Aplicar beneficios</button>
              </form>
            </details>
            <section aria-label="Totales de la venta" className="pos-ticket-totals">
              <p>
                <span>Subtotal</span>
                <strong>{formatClp(sale.item.subtotal_amount_clp)}</strong>
              </p>
              <p>
                <span>Descuentos</span>
                <strong>
                  −
                  {formatClp(
                    Number(sale.item.automatic_discount_amount_clp ?? 0) +
                      Number(sale.item.loyalty_redeemed_amount_clp ?? 0),
                  )}
                </strong>
              </p>
              <p className="pos-grand-total">
                <span>Total</span>
                <strong>{formatClp(sale.item.total_amount_clp)}</strong>
              </p>
            </section>
            <form className="pos-payment-form" onSubmit={(event) => void action(event, 'COMPLETE')}>
              <label>
                Medio recibido fuera de la página
                <MethodSelect
                  allowEmpty={Number(sale.item.total_amount_clp ?? 0) === 0}
                  loading={optionsLoading}
                  methods={activeMethods}
                  name="methodId"
                />
                <small>Solo se guarda como referencia; el POS no procesa el pago.</small>
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
                className="pos-pay-button"
                disabled={
                  saleLines(sale).length === 0 ||
                  (Number(sale.item.total_amount_clp ?? 0) > 0 && activeMethods.length === 0)
                }
              >
                <span>Registrar venta y descontar stock</span>
                <strong>{formatClp(sale.item.total_amount_clp)}</strong>
              </button>
            </form>
          </aside>
        </div>
      )}
      <div className="pos-grid pos-secondary-grid">
        <form
          className="pos-card"
          hidden={workspace !== 'METHODS'}
          onSubmit={(event) => void action(event, 'METHOD')}
        >
          <h2>Nueva forma de pago recibido</h2>
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
          <StoreField loading={optionsLoading} store={store} />
          <label>
            Fecha
            <input name="date" type="date" required />
          </label>
          <button disabled={store === null}>Consultar</button>
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
  const sku = String(product.sku ?? '').trim();
  return `${sku ? `${sku} · ` : ''}${readableText(String(product.name))}`;
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

function lineTotal(line: Item): string {
  const total =
    line.final_line_total_amount_clp ??
    line.line_subtotal_amount_clp ??
    Number(line.unit_price_amount_clp ?? 0) * Number(line.quantity ?? 0);
  return formatClp(total);
}

function resourceUrl(resourceId: string): string {
  return `/api/v1/catalog/resources/${resourceId}/content`;
}
