import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { authorizedRequest } from '../identity/api.js';
import { CatalogEditors, CatalogResourceManager, RecordEditors } from './AdminEditors.js';

type Item = Record<string, unknown>;
type LoadState = 'error' | 'loading' | 'ready';
interface ModuleState {
  readonly items: readonly Item[];
  readonly message: string;
  readonly nextCursor: string | null;
  readonly state: LoadState;
}
interface ModuleDefinition {
  readonly anchor: string;
  readonly label: string;
  readonly path: string;
}

const modules = [
  { anchor: 'orders', label: 'Pedidos', path: '/api/v1/admin/orders?limit=25' },
  { anchor: 'payments', label: 'Pagos', path: '/api/v1/admin/payment-attempts?limit=25' },
  { anchor: 'fulfillments', label: 'Fulfillment', path: '/api/v1/admin/fulfillments?limit=25' },
  { anchor: 'catalog', label: 'Catálogo', path: '/api/v1/admin/catalog/products?limit=25' },
  { anchor: 'games', label: 'Juegos TCG', path: '/api/v1/admin/catalog/tcg-games?limit=25' },
  { anchor: 'categories', label: 'Categorías', path: '/api/v1/admin/catalog/categories?limit=25' },
  {
    anchor: 'collections',
    label: 'Colecciones',
    path: '/api/v1/admin/catalog/collections?limit=25',
  },
  { anchor: 'preorders', label: 'Preventas', path: '/api/v1/admin/preorders/campaigns?limit=25' },
  { anchor: 'promotions', label: 'Promociones', path: '/api/v1/admin/promotions?limit=25' },
  { anchor: 'coupons', label: 'Cupones', path: '/api/v1/admin/coupons?limit=25' },
  { anchor: 'loyalty', label: 'Loyalty', path: '/api/v1/admin/loyalty/configurations?limit=25' },
  {
    anchor: 'configurations',
    label: 'Configuración',
    path: '/api/v1/admin/system-configurations?limit=25',
  },
  { anchor: 'content', label: 'Contenido', path: '/api/v1/admin/content?limit=25' },
  { anchor: 'audit', label: 'Auditoría', path: '/api/v1/admin/audit-entries?limit=25' },
] as const satisfies readonly ModuleDefinition[];

const initialModules = Object.fromEntries(
  modules.map(({ anchor }) => [anchor, emptyModule()]),
) as Record<string, ModuleState>;

export function AdminHub() {
  const [data, setData] = useState<Record<string, ModuleState>>(initialModules);
  const [actionMessage, setActionMessage] = useState('');

  const load = useCallback(async (definition: ModuleDefinition, cursor?: string | null) => {
    const append = cursor !== undefined && cursor !== null;
    setData((current) => ({
      ...current,
      [definition.anchor]: {
        ...(current[definition.anchor] ?? emptyModule()),
        message: 'Cargando…',
        state: 'loading',
      },
    }));
    try {
      const path = cursor
        ? `${definition.path}&cursor=${encodeURIComponent(cursor)}`
        : definition.path;
      const page = await authorizedRequest<{ items: Item[]; nextCursor: string | null }>(path);
      setData((value) => ({
        ...value,
        [definition.anchor]: {
          items: append ? [...(value[definition.anchor]?.items ?? []), ...page.items] : page.items,
          message: page.items.length === 0 && !append ? 'Sin registros.' : '',
          nextCursor: page.nextCursor,
          state: 'ready',
        },
      }));
    } catch (error) {
      setData((value) => ({
        ...value,
        [definition.anchor]: {
          ...(value[definition.anchor] ?? emptyModule()),
          message: messageOf(error),
          state: 'error',
        },
      }));
    }
  }, []);

  useEffect(() => {
    for (const definition of modules) void load(definition);
  }, [load]);

  const mutate = async (path: string, body: unknown, method = 'POST', reload?: string) => {
    setActionMessage('Guardando operación…');
    try {
      await authorizedRequest(path, {
        body: JSON.stringify(body),
        headers: { 'idempotency-key': crypto.randomUUID() },
        method,
      });
      setActionMessage('Operación guardada correctamente.');
      const definition = modules.find(({ anchor }) => anchor === reload);
      if (definition) await load(definition);
    } catch (error) {
      setActionMessage(messageOf(error));
    }
  };

  return (
    <main className="page-frame admin-shell">
      <header className="section-heading cut-panel">
        <div>
          <p className="eyebrow">Operación Admin</p>
          <h1>Centro de control</h1>
          <p>Herramientas conectadas a datos y acciones reales del servidor.</p>
        </div>
        <nav aria-label="Herramientas administrativas" className="admin-navigation">
          <a aria-current="page" href="/admin">
            Operación
          </a>
          <a href="/admin/accounts">Cuentas</a>
          <a href="/admin/pos">Pseudo-POS</a>
          <a href="/admin/service-coverage">Atención y cobertura</a>
        </nav>
      </header>
      <nav aria-label="Módulos operativos" className="admin-module-nav cut-panel">
        {modules.map((module) => (
          <a href={`#${module.anchor}`} key={module.anchor}>
            {module.label}
          </a>
        ))}
        <a href="#inventory">Inventario</a>
      </nav>
      <p className="status" role="status">
        {actionMessage}
      </p>
      <section className="metric-grid">
        {modules.slice(0, 6).map((module) => (
          <div className="metric" key={module.anchor}>
            <span>{module.label} en página</span>
            <strong>
              {data[module.anchor]?.state === 'ready' ? data[module.anchor]?.items.length : '—'}
            </strong>
          </div>
        ))}
      </section>

      {modules.map((module) => (
        <AdminModule
          definition={module}
          key={module.anchor}
          module={data[module.anchor] ?? emptyModule()}
          onAction={mutate}
          onLoadMore={() => void load(module, data[module.anchor]?.nextCursor)}
        />
      ))}
      <InventoryPanel onAction={mutate} products={data.catalog?.items ?? []} />
      <CatalogComposer
        categories={data.categories?.items ?? []}
        collections={data.collections?.items ?? []}
        games={data.games?.items ?? []}
        onAction={mutate}
      />
      <CatalogEditors
        categories={data.categories?.items ?? []}
        collections={data.collections?.items ?? []}
        games={data.games?.items ?? []}
        onAction={mutate}
        products={data.catalog?.items ?? []}
      />
      <CatalogResourceManager
        categories={data.categories?.items ?? []}
        collections={data.collections?.items ?? []}
        games={data.games?.items ?? []}
        products={data.catalog?.items ?? []}
      />
      <PreorderComposer onAction={mutate} products={data.catalog?.items ?? []} />
      <PromotionComposer onAction={mutate} promotions={data.promotions?.items ?? []} />
      <LoyaltyOperations onAction={mutate} />
      <ConfigurationComposer onAction={mutate} />
      <EditorialComposer onAction={mutate} />
      <RecordEditors
        configurations={data.configurations?.items ?? []}
        content={data.content?.items ?? []}
        loyalty={data.loyalty?.items ?? []}
        onAction={mutate}
        preorders={data.preorders?.items ?? []}
        products={data.catalog?.items ?? []}
        promotions={data.promotions?.items ?? []}
      />
    </main>
  );
}

function AdminModule({
  definition,
  module,
  onAction,
  onLoadMore,
}: {
  readonly definition: ModuleDefinition;
  readonly module: ModuleState;
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
  readonly onLoadMore: () => void;
}) {
  return (
    <section className="cut-panel admin-module" id={definition.anchor}>
      <div className="section-heading">
        <h2>{definition.label}</h2>
        <span className="status-chip">{module.items.length} visibles</span>
      </div>
      <p className="status" role={module.state === 'error' ? 'alert' : 'status'}>
        {module.message}
      </p>
      {module.items.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Estado</th>
                <th>Detalle</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {module.items.map((item, index) => (
                <AdminRow
                  anchor={definition.anchor}
                  item={item}
                  key={identifier(item) ?? index}
                  onAction={onAction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {module.nextCursor && (
        <button disabled={module.state === 'loading'} onClick={onLoadMore} type="button">
          Cargar más
        </button>
      )}
    </section>
  );
}

function AdminRow({
  anchor,
  item,
  onAction,
}: {
  readonly anchor: string;
  readonly item: Item;
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const id = identifier(item);
  return (
    <tr>
      <td>{reference(item)}</td>
      <td>{status(item)}</td>
      <td>{detail(item)}</td>
      <td>{id && <RowAction anchor={anchor} id={id} item={item} onAction={onAction} />}</td>
    </tr>
  );
}

function RowAction({
  anchor,
  id,
  item,
  onAction,
}: {
  readonly anchor: string;
  readonly id: string;
  readonly item: Item;
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  if (anchor === 'payments')
    return (
      <button
        className="link"
        onClick={() =>
          void onAction(`/api/v1/admin/payment-attempts/${id}/reconcile`, {}, 'POST', anchor)
        }
        type="button"
      >
        Conciliar
      </button>
    );
  if (anchor === 'fulfillments') return <FulfillmentAction id={id} onAction={onAction} />;
  if (anchor === 'catalog')
    return (
      <StateButtons
        actions={[
          ['Publicar', 'PUBLISHED'],
          ['Retirar', 'UNPUBLISHED'],
          ['Archivar', 'ARCHIVED'],
        ]}
        onSelect={(nextStatus) =>
          onAction(
            `/api/v1/admin/catalog/products/${id}/publication-transitions`,
            { nextStatus },
            'POST',
            anchor,
          )
        }
      />
    );
  if (['games', 'categories', 'collections'].includes(anchor)) {
    const segment = anchor === 'games' ? 'tcg-games' : anchor;
    return (
      <StateButtons
        actions={[
          ['Publicar', 'PUBLISHED'],
          ['Retirar', 'UNPUBLISHED'],
          ['Archivar', 'ARCHIVED'],
        ]}
        onSelect={(nextStatus) =>
          onAction(
            `/api/v1/admin/catalog/${segment}/${id}/publication-transitions`,
            { descendantStrategy: 'REJECT', nextStatus },
            'POST',
            anchor,
          )
        }
      />
    );
  }
  if (anchor === 'promotions' || anchor === 'coupons')
    return (
      <StateButtons
        actions={[
          ['Activar', 'ACTIVE'],
          ['Suspender', 'SUSPENDED'],
          ['Cancelar', 'CANCELLED'],
        ]}
        onSelect={(nextState) =>
          onAction(`/api/v1/admin/${anchor}/${id}/state-transitions`, { nextState }, 'POST', anchor)
        }
      />
    );
  if (anchor === 'content')
    return (
      <StateButtons
        actions={[
          ['Publicar', 'publish'],
          ['Borrador', 'draft'],
          ['Archivar', 'archive'],
        ]}
        onSelect={(action) => onAction(`/api/v1/admin/content/${id}/${action}`, {}, 'POST', anchor)}
      />
    );
  if (anchor === 'preorders') return <PreorderAction id={id} onAction={onAction} />;
  if (anchor === 'loyalty' && item.state === 'DRAFT')
    return (
      <button
        className="link"
        onClick={() =>
          void onAction(
            `/api/v1/admin/loyalty/configurations/${id}/state-transitions`,
            { nextState: 'ACTIVE' },
            'POST',
            anchor,
          )
        }
        type="button"
      >
        Activar
      </button>
    );
  if (anchor === 'configurations' && item.state === 'DRAFT')
    return <ConfigurationAction id={id} onAction={onAction} />;
  return <span>—</span>;
}

function ConfigurationAction({
  id,
  onAction,
}: {
  readonly id: string;
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/system-configurations/${id}/state-transitions`,
      { nextState: 'ACTIVE', reason: String(form.get('reason')) },
      'POST',
      'configurations',
    );
  };
  return (
    <form className="inline-action" onSubmit={(event) => void submit(event)}>
      <input aria-label="Motivo de activación" name="reason" placeholder="Motivo" required />
      <button>Activar</button>
    </form>
  );
}

function FulfillmentAction({
  id,
  onAction,
}: {
  readonly id: string;
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const carrier = nullable(form.get('carrier'));
    const trackingCode = nullable(form.get('trackingCode'));
    return onAction(
      `/api/v1/admin/fulfillments/${id}/transitions`,
      {
        toStatus: String(form.get('toStatus')),
        ...(carrier === null ? {} : { carrier }),
        ...(trackingCode === null ? {} : { trackingCode }),
      },
      'POST',
      'fulfillments',
    );
  };
  return (
    <form className="inline-action" onSubmit={(event) => void submit(event)}>
      <label>
        <span className="visually-hidden">Nuevo estado</span>
        <select aria-label="Nuevo estado de fulfillment" name="toStatus">
          <option value="PREPARING">Preparando</option>
          <option value="READY_FOR_PICKUP">Listo para retiro</option>
          <option value="SHIPPED">Despachado</option>
          <option value="FULFILLED">Completado</option>
        </select>
      </label>
      <label>
        <span className="visually-hidden">Transportista</span>
        <select aria-label="Transportista" name="carrier">
          <option value="">No aplica</option>
          <option value="CHILEXPRESS">Chilexpress</option>
          <option value="STARKEN">Starken</option>
        </select>
      </label>
      <label>
        <span className="visually-hidden">Seguimiento</span>
        <input aria-label="Código de seguimiento" name="trackingCode" placeholder="Seguimiento" />
      </label>
      <button type="submit">Aplicar</button>
    </form>
  );
}

function PreorderAction({
  id,
  onAction,
}: {
  readonly id: string;
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const operational = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/preorders/campaigns/${id}/operational-transitions`,
      { nextState: String(form.get('nextState')), reason: nullable(form.get('reason')) },
      'POST',
      'preorders',
    );
  };
  const publication = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/preorders/campaigns/${id}/publication-transitions`,
      { nextStatus: String(form.get('nextStatus')), reason: nullable(form.get('reason')) },
      'POST',
      'preorders',
    );
  };
  return (
    <div className="stacked-actions">
      <form className="inline-action" onSubmit={(event) => void operational(event)}>
        <select aria-label="Estado operativo de preventa" name="nextState">
          <option value="SCHEDULED">Programar</option>
          <option value="OPEN">Abrir</option>
          <option value="CLOSED">Cerrar</option>
          <option value="CANCELLED">Cancelar</option>
        </select>
        <input aria-label="Motivo operativo" name="reason" placeholder="Motivo" />
        <button>Aplicar</button>
      </form>
      <form className="inline-action" onSubmit={(event) => void publication(event)}>
        <select aria-label="Publicación de preventa" name="nextStatus">
          <option value="PUBLISHED">Publicar</option>
          <option value="UNPUBLISHED">Retirar</option>
        </select>
        <input aria-label="Motivo de publicación" name="reason" placeholder="Motivo" />
        <button>Aplicar</button>
      </form>
    </div>
  );
}

function StateButtons({
  actions,
  onSelect,
}: {
  readonly actions: readonly (readonly [string, string])[];
  readonly onSelect: (value: string) => Promise<void>;
}) {
  return (
    <div className="table-actions">
      {actions.map(([label, value]) => (
        <button className="link" key={value} onClick={() => void onSelect(value)} type="button">
          {label}
        </button>
      ))}
    </div>
  );
}

function InventoryPanel({
  products,
  onAction,
}: {
  readonly products: readonly Item[];
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>, kind: 'ENTRY' | 'ADJUST' | 'THRESHOLD') => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const productId = String(form.get('productId'));
    if (kind === 'ENTRY')
      return onAction(`/api/v1/admin/inventory/products/${productId}/stock-entries`, {
        quantity: Number(form.get('quantity')),
        reason: nullable(form.get('reason')),
        reference: nullable(form.get('reference')),
      });
    if (kind === 'ADJUST')
      return onAction(`/api/v1/admin/inventory/products/${productId}/adjustments`, {
        direction: String(form.get('direction')),
        investigationReference: String(form.get('reference')),
        quantity: Number(form.get('quantity')),
        reason: String(form.get('reason')),
      });
    return onAction(
      `/api/v1/admin/inventory/products/${productId}/low-stock-threshold-override`,
      { lowStockThresholdOverride: nullableNumber(form.get('threshold')) },
      'PUT',
    );
  };
  return (
    <section className="cut-panel admin-module" id="inventory">
      <h2>Inventario</h2>
      <p>
        Entradas, ajustes auditados y umbral de últimas unidades sobre la autoridad compartida de
        stock.
      </p>
      <div className="admin-form-grid">
        <form onSubmit={(event) => void submit(event, 'ENTRY')}>
          <h3>Registrar entrada</h3>
          <ProductSelect items={products} />
          <label>
            Cantidad
            <input min="1" name="quantity" required type="number" />
          </label>
          <label>
            Motivo
            <input name="reason" />
          </label>
          <label>
            Referencia
            <input name="reference" />
          </label>
          <button>Registrar entrada</button>
        </form>
        <form onSubmit={(event) => void submit(event, 'ADJUST')}>
          <h3>Ajustar inventario</h3>
          <ProductSelect items={products} />
          <label>
            Dirección
            <select name="direction">
              <option value="POSITIVE">Aumentar</option>
              <option value="NEGATIVE">Disminuir</option>
            </select>
          </label>
          <label>
            Cantidad
            <input min="1" name="quantity" required type="number" />
          </label>
          <label>
            Motivo
            <input name="reason" required />
          </label>
          <label>
            Referencia de investigación
            <input name="reference" required />
          </label>
          <button>Aplicar ajuste</button>
        </form>
        <form onSubmit={(event) => void submit(event, 'THRESHOLD')}>
          <h3>Umbral de últimas unidades</h3>
          <ProductSelect items={products} />
          <label>
            Umbral
            <input min="0" name="threshold" type="number" />
          </label>
          <p>Vacío restaura la configuración general.</p>
          <button>Guardar umbral</button>
        </form>
      </div>
    </section>
  );
}

function ProductSelect({ items }: { readonly items: readonly Item[] }) {
  return (
    <label>
      Producto
      <select name="productId" required>
        <option value="">Selecciona un producto</option>
        {items.map((item) => (
          <option key={String(item.productId)} value={String(item.productId)}>
            {String(item.name ?? item.sku ?? item.productId)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CatalogComposer({
  categories,
  collections,
  games,
  onAction,
}: {
  readonly categories: readonly Item[];
  readonly collections: readonly Item[];
  readonly games: readonly Item[];
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const parent = (event: FormEvent<HTMLFormElement>, kind: 'categories' | 'tcg-games') => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/catalog/${kind}`,
      {
        description: nullable(form.get('description')),
        name: String(form.get('name')),
        ...(kind === 'tcg-games' ? { slug: String(form.get('slug')) } : {}),
      },
      'POST',
      kind === 'tcg-games' ? 'games' : 'categories',
    );
  };
  const collection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      '/api/v1/admin/catalog/collections',
      {
        description: nullable(form.get('description')),
        gameId: String(form.get('gameId')),
        name: String(form.get('name')),
      },
      'POST',
      'collections',
    );
  };
  const product = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      '/api/v1/admin/catalog/products',
      {
        categoryId: String(form.get('categoryId')),
        collectionId: nullable(form.get('collectionId')),
        condition: nullable(form.get('condition')),
        description: nullable(form.get('description')),
        edition: nullable(form.get('edition')),
        gameId: String(form.get('gameId')),
        language: nullable(form.get('language')),
        name: String(form.get('name')),
        priceAmountClp: Number(form.get('price')),
        saleType: String(form.get('saleType')),
        sku: String(form.get('sku')),
      },
      'POST',
      'catalog',
    );
  };
  return (
    <section className="cut-panel admin-module">
      <h2>Crear catálogo</h2>
      <div className="admin-form-grid">
        <form onSubmit={(event) => void parent(event, 'tcg-games')}>
          <h3>Juego TCG</h3>
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            Slug
            <input name="slug" pattern="[a-z0-9-]+" required />
          </label>
          <label>
            Descripción
            <input name="description" />
          </label>
          <button>Crear juego</button>
        </form>
        <form onSubmit={(event) => void parent(event, 'categories')}>
          <h3>Categoría</h3>
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            Descripción
            <input name="description" />
          </label>
          <button>Crear categoría</button>
        </form>
        <form onSubmit={(event) => void collection(event)}>
          <h3>Colección</h3>
          <EntitySelect items={games} label="Juego" name="gameId" />
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            Descripción
            <input name="description" />
          </label>
          <button>Crear colección</button>
        </form>
        <form onSubmit={(event) => void product(event)}>
          <h3>Producto</h3>
          <EntitySelect items={games} label="Juego" name="gameId" />
          <EntitySelect items={categories} label="Categoría" name="categoryId" />
          <EntitySelect allowEmpty items={collections} label="Colección" name="collectionId" />
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            SKU
            <input name="sku" required />
          </label>
          <label>
            Precio CLP
            <input min="0" name="price" required type="number" />
          </label>
          <label>
            Tipo
            <select name="saleType">
              <option value="REGULAR">Regular</option>
              <option value="PREORDER">Preventa</option>
            </select>
          </label>
          <label>
            Idioma
            <input name="language" />
          </label>
          <label>
            Edición
            <input name="edition" />
          </label>
          <label>
            Condición
            <input name="condition" />
          </label>
          <label>
            Descripción
            <textarea name="description" />
          </label>
          <button>Crear producto</button>
        </form>
      </div>
    </section>
  );
}

function EntitySelect({
  allowEmpty = false,
  items,
  label,
  name,
}: {
  readonly allowEmpty?: boolean;
  readonly items: readonly Item[];
  readonly label: string;
  readonly name: string;
}) {
  return (
    <label>
      {label}
      <select name={name} required={!allowEmpty}>
        <option value="">{allowEmpty ? 'Sin asignar' : 'Selecciona'}</option>
        {items.map((item) => {
          const id = identifier(item) ?? '';
          return (
            <option key={id} value={id}>
              {String(item.name ?? id)}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function PreorderComposer({
  products,
  onAction,
}: {
  readonly products: readonly Item[];
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      '/api/v1/admin/preorders/campaigns',
      {
        branchId: String(form.get('branchId')),
        capacity: Number(form.get('capacity')),
        closesAt: new Date(String(form.get('closesAt'))).toISOString(),
        estimatedArrivalText: String(form.get('arrival')),
        fulfillmentGroupKey: nullable(form.get('groupKey')),
        opensAt: new Date(String(form.get('opensAt'))).toISOString(),
        productId: String(form.get('productId')),
      },
      'POST',
      'preorders',
    );
  };
  return (
    <section className="cut-panel admin-module">
      <h2>Nueva campaña de preventa</h2>
      <form onSubmit={(event) => void submit(event)}>
        <ProductSelect items={products} />
        <label>
          Sucursal
          <input name="branchId" required />
        </label>
        <label>
          Cupos
          <input min="1" name="capacity" required type="number" />
        </label>
        <label>
          Apertura
          <input name="opensAt" required type="datetime-local" />
        </label>
        <label>
          Cierre
          <input name="closesAt" required type="datetime-local" />
        </label>
        <label>
          Llegada estimada
          <input name="arrival" required />
        </label>
        <label>
          Grupo de fulfillment
          <input name="groupKey" />
        </label>
        <button>Crear campaña</button>
      </form>
    </section>
  );
}

function LoyaltyOperations({
  onAction,
}: {
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const correction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      `/api/v1/admin/loyalty/accounts/${String(form.get('accountId'))}/corrections`,
      { pointsSigned: Number(form.get('points')), reason: String(form.get('reason')) },
      'POST',
      'loyalty',
    );
  };
  const configuration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      '/api/v1/admin/loyalty/configurations',
      {
        branchId: String(form.get('branchId')),
        earnClpPerPoint: Number(form.get('earn')),
        maximumRedeemBasisPoints: nullableNumber(form.get('maximum')),
        minimumRedeemPoints: Number(form.get('minimum')),
        redeemClpPerPoint: Number(form.get('redeem')),
      },
      'POST',
      'loyalty',
    );
  };
  return (
    <section className="cut-panel admin-module">
      <h2>Administrar loyalty</h2>
      <div className="admin-form-grid">
        <form onSubmit={(event) => void configuration(event)}>
          <h3>Nueva configuración</h3>
          <label>
            Sucursal
            <input name="branchId" required />
          </label>
          <label>
            CLP para acumular un punto
            <input min="1" name="earn" required type="number" />
          </label>
          <label>
            CLP por punto canjeado
            <input min="1" name="redeem" required type="number" />
          </label>
          <label>
            Mínimo de puntos para canjear
            <input min="0" name="minimum" required type="number" />
          </label>
          <label>
            Máximo canjeable (puntos base)
            <input max="10000" min="1" name="maximum" type="number" />
          </label>
          <button>Crear configuración</button>
        </form>
        <form onSubmit={(event) => void correction(event)}>
          <h3>Corrección controlada de puntos</h3>
          <label>
            Cuenta cliente
            <input name="accountId" required />
          </label>
          <label>
            Puntos con signo
            <input name="points" required type="number" />
          </label>
          <label>
            Motivo
            <input name="reason" required />
          </label>
          <button>Aplicar corrección</button>
        </form>
      </div>
    </section>
  );
}

function PromotionComposer({
  onAction,
  promotions,
}: {
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
  readonly promotions: readonly Item[];
}) {
  const promotion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      '/api/v1/admin/promotions',
      {
        activationMode: String(form.get('activationMode')),
        benefit: { basisPoints: Number(form.get('basisPoints')), type: 'PERCENTAGE_DISCOUNT' },
        branchId: nullable(form.get('branchId')),
        channel: String(form.get('channel')),
        endsAt: new Date(String(form.get('endsAt'))).toISOString(),
        globalLimit: nullableNumber(form.get('globalLimit')),
        minimumEligibleAmountClp: nullableNumber(form.get('minimumAmount')),
        minimumEligibleQuantity: nullableNumber(form.get('minimumQuantity')),
        name: String(form.get('name')),
        perAccountLimit: nullableNumber(form.get('perAccountLimit')),
        priority: Number(form.get('priority')),
        schedules: [],
        scope: String(form.get('scope')),
        startsAt: new Date(String(form.get('startsAt'))).toISOString(),
        targets: [
          {
            categoryId: null,
            gameId: null,
            kind: 'ALL_PRODUCTS',
            position: 1,
            productId: null,
            side: 'BENEFITED',
          },
        ],
      },
      'POST',
      'promotions',
    );
  };
  const coupon = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    return onAction(
      '/api/v1/admin/coupons',
      {
        code: String(form.get('code')),
        endsAt: nullableDate(form.get('endsAt')),
        globalLimit: nullableNumber(form.get('globalLimit')),
        perAccountLimit: nullableNumber(form.get('perAccountLimit')),
        promotionId: String(form.get('promotionId')),
        startsAt: nullableDate(form.get('startsAt')),
      },
      'POST',
      'coupons',
    );
  };
  return (
    <section className="cut-panel admin-module">
      <h2>Crear promociones y cupones</h2>
      <div className="admin-form-grid">
        <form onSubmit={(event) => void promotion(event)}>
          <h3>Promoción porcentual general</h3>
          <label>
            Nombre
            <input name="name" required />
          </label>
          <label>
            Descuento en puntos base
            <input max="10000" min="1" name="basisPoints" required type="number" />
          </label>
          <label>
            Inicio
            <input name="startsAt" required type="datetime-local" />
          </label>
          <label>
            Fin
            <input name="endsAt" required type="datetime-local" />
          </label>
          <label>
            Canal
            <select name="channel">
              <option value="BOTH">Tienda y POS</option>
              <option value="ECOMMERCE">Tienda online</option>
              <option value="POS">POS</option>
            </select>
          </label>
          <label>
            Alcance
            <select name="scope">
              <option value="ORDER">Pedido</option>
              <option value="LINE">Línea</option>
            </select>
          </label>
          <label>
            Activación
            <select name="activationMode">
              <option value="AUTOMATIC">Automática</option>
              <option value="COUPON_REQUIRED">Requiere cupón</option>
            </select>
          </label>
          <label>
            Sucursal opcional
            <input name="branchId" />
          </label>
          <label>
            Prioridad
            <input defaultValue="0" name="priority" required type="number" />
          </label>
          <label>
            Monto mínimo CLP
            <input min="1" name="minimumAmount" type="number" />
          </label>
          <label>
            Cantidad mínima
            <input min="1" name="minimumQuantity" type="number" />
          </label>
          <label>
            Límite global
            <input min="1" name="globalLimit" type="number" />
          </label>
          <label>
            Límite por cuenta
            <input min="1" name="perAccountLimit" type="number" />
          </label>
          <button>Crear promoción</button>
        </form>
        <form onSubmit={(event) => void coupon(event)}>
          <h3>Cupón</h3>
          <EntitySelect items={promotions} label="Promoción" name="promotionId" />
          <label>
            Código
            <input name="code" required />
          </label>
          <label>
            Inicio opcional
            <input name="startsAt" type="datetime-local" />
          </label>
          <label>
            Fin opcional
            <input name="endsAt" type="datetime-local" />
          </label>
          <label>
            Límite global
            <input min="1" name="globalLimit" type="number" />
          </label>
          <label>
            Límite por cuenta
            <input min="1" name="perAccountLimit" type="number" />
          </label>
          <button>Crear cupón</button>
        </form>
      </div>
    </section>
  );
}

function ConfigurationComposer({
  onAction,
}: {
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get('value'));
    const value = /^-?\d+$/u.test(raw) ? Number(raw) : raw;
    return onAction(
      '/api/v1/admin/system-configurations',
      {
        configurationKey: String(form.get('configurationKey')),
        reason: String(form.get('reason')),
        value,
      },
      'POST',
      'configurations',
    );
  };
  return (
    <section className="cut-panel admin-module">
      <h2>Nueva versión de configuración</h2>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Clave
          <select name="configurationKey">
            <option value="ANONYMOUS_CART_INACTIVITY_MINUTES">
              Inactividad del carrito anónimo
            </option>
            <option value="PICKUP_BRANCH_ID">Sucursal de retiro</option>
            <option value="DEFAULT_LOW_STOCK_THRESHOLD">Umbral de últimas unidades</option>
            <option value="PAYMENT_RESERVATION_DURATION_MINUTES">
              Duración de reserva de pago
            </option>
            <option value="RESOURCE_PUBLIC_IMAGE_MAX_BYTES">Peso máximo de imagen pública</option>
            <option value="RESOURCE_IMAGE_MAX_WIDTH_PX">Ancho máximo de imagen</option>
            <option value="RESOURCE_IMAGE_MAX_HEIGHT_PX">Alto máximo de imagen</option>
            <option value="RESOURCE_IMAGE_MAX_MEGAPIXELS">Megapíxeles máximos</option>
          </select>
        </label>
        <label>
          Valor
          <input name="value" required />
        </label>
        <label>
          Motivo
          <input name="reason" required />
        </label>
        <button>Crear versión borrador</button>
      </form>
    </section>
  );
}

function EditorialComposer({
  onAction,
}: {
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
}) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onAction(
      '/api/v1/admin/content',
      {
        body: String(form.get('body')),
        excerpt: String(form.get('excerpt')),
        metadata: {},
        slug: String(form.get('slug')),
        title: String(form.get('title')),
        type: String(form.get('type')),
      },
      'POST',
      'content',
    );
    event.currentTarget.reset();
  };
  return (
    <section className="cut-panel admin-module">
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
        <button>Guardar borrador</button>
      </form>
    </section>
  );
}

function identifier(item: Item): string | null {
  for (const key of [
    'paymentAttemptId',
    'fulfillmentId',
    'orderId',
    'tcgGameId',
    'categoryId',
    'collectionId',
    'productId',
    'preorderCampaignId',
    'promotionId',
    'couponId',
    'loyaltyConfigurationId',
    'systemConfigurationVersionId',
    'editorialEntryId',
    'auditEntryId',
  ]) {
    if (typeof item[key] === 'string') return item[key];
  }
  return null;
}
function reference(item: Item): string {
  for (const key of [
    'publicNumber',
    'orderPublicNumber',
    'name',
    'title',
    'code',
    'configurationKey',
    'action',
    'sku',
  ]) {
    if (typeof item[key] === 'string') return item[key];
  }
  return identifier(item) ?? '—';
}
function status(item: Item): string {
  for (const key of ['status', 'state', 'publicationStatus', 'operationalState', 'result']) {
    if (typeof item[key] === 'string') return item[key];
  }
  return '—';
}
function detail(item: Item): string {
  for (const key of [
    'provider',
    'type',
    'resourceType',
    'saleType',
    'estimatedArrivalText',
    'reason',
  ]) {
    if (typeof item[key] === 'string') return item[key];
  }
  return '—';
}
function nullable(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}
function nullableNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text === '' ? null : Number(text);
}
function nullableDate(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text === '' ? null : new Date(text).toISOString();
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.';
}

function emptyModule(): ModuleState {
  return { items: [], message: 'Cargando…', nextCursor: null, state: 'loading' };
}
