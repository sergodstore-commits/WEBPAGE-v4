import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

import { authorizedRequest } from '../identity/api.js';
import { readCoverage } from '../service-coverage/api.js';
import { StoreField } from '../service-coverage/StoreField.js';
import { firstStoreFromCoverage, type StoreSummary } from '../service-coverage/store.js';
import { CatalogEditors, CatalogResourceManager, RecordEditors } from './AdminEditors.js';
import {
  itemDetail,
  itemIdentifier,
  itemReference,
  itemStatus,
  shortIdentifier,
} from './presentation.js';

type Item = Record<string, unknown>;
type LoadState = 'error' | 'loading' | 'ready';
type AdminTask = 'create' | 'edit' | 'records';
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

export type AdminArea =
  | 'audit'
  | 'catalog'
  | 'configuration'
  | 'content'
  | 'dashboard'
  | 'inventory'
  | 'loyalty'
  | 'orders'
  | 'preorders'
  | 'promotions';

export type AdminRoute =
  | '/admin'
  | '/admin/accounts'
  | '/admin/audit'
  | '/admin/catalog'
  | '/admin/configuration'
  | '/admin/content'
  | '/admin/inventory'
  | '/admin/loyalty'
  | '/admin/orders'
  | '/admin/pos'
  | '/admin/preorders'
  | '/admin/promotions'
  | '/admin/service-coverage';

interface AdminAreaDefinition {
  readonly area: AdminArea;
  readonly description: string;
  readonly label: string;
  readonly route: AdminRoute;
  readonly title: string;
}

const modules = [
  { anchor: 'orders', label: 'Pedidos', path: '/api/v1/admin/orders?limit=25' },
  { anchor: 'payments', label: 'Pagos', path: '/api/v1/admin/payment-attempts?limit=25' },
  { anchor: 'fulfillments', label: 'Entregas', path: '/api/v1/admin/fulfillments?limit=25' },
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
  {
    anchor: 'loyalty',
    label: 'Configuración de puntos',
    path: '/api/v1/admin/loyalty/configurations?limit=25',
  },
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

const adminAreas = [
  {
    area: 'dashboard',
    description: 'Accesos directos y actividad reciente para trabajar sin buscar entre pantallas.',
    label: 'Resumen',
    route: '/admin',
    title: 'Panel de operación',
  },
  {
    area: 'orders',
    description: 'Revisa pedidos, confirma pagos y actualiza retiros o despachos.',
    label: 'Pedidos y pagos',
    route: '/admin/orders',
    title: 'Pedidos y entregas',
  },
  {
    area: 'catalog',
    description: 'Productos, juegos, categorías, colecciones e imágenes comerciales.',
    label: 'Catálogo',
    route: '/admin/catalog',
    title: 'Gestión de catálogo',
  },
  {
    area: 'inventory',
    description: 'Ingresa productos, corrige diferencias y configura avisos de pocas unidades.',
    label: 'Inventario',
    route: '/admin/inventory',
    title: 'Control de inventario',
  },
  {
    area: 'preorders',
    description: 'Crea campañas, define sus cupos y controla cuándo se publican.',
    label: 'Preventas',
    route: '/admin/preorders',
    title: 'Gestión de preventas',
  },
  {
    area: 'promotions',
    description: 'Crea descuentos y cupones, define su vigencia y controla su estado.',
    label: 'Promociones y cupones',
    route: '/admin/promotions',
    title: 'Promociones y cupones',
  },
  {
    area: 'loyalty',
    description: 'Configura cómo se acumulan y canjean puntos o corrige un saldo justificado.',
    label: 'Puntos',
    route: '/admin/loyalty',
    title: 'Programa de puntos',
  },
  {
    area: 'content',
    description: 'Noticias, torneos, comunidad y cómics administrados por la tienda.',
    label: 'Contenido editorial',
    route: '/admin/content',
    title: 'Contenido editorial',
  },
  {
    area: 'configuration',
    description: 'Ajustes operativos avanzados con historial y motivo obligatorio.',
    label: 'Configuración',
    route: '/admin/configuration',
    title: 'Configuración del sistema',
  },
  {
    area: 'audit',
    description: 'Consulta qué cambios administrativos se realizaron y cuándo ocurrieron.',
    label: 'Auditoría',
    route: '/admin/audit',
    title: 'Actividad administrativa',
  },
] as const satisfies readonly AdminAreaDefinition[];

const adminNavigationGroups = [
  {
    label: 'Ventas del día',
    links: [
      { label: 'Resumen', route: '/admin' },
      { label: 'Pedidos', route: '/admin/orders' },
      { label: 'POS', route: '/admin/pos' },
    ],
  },
  {
    label: 'Productos y stock',
    links: [
      { label: 'Productos', route: '/admin/catalog' },
      { label: 'Inventario', route: '/admin/inventory' },
      { label: 'Preventas', route: '/admin/preorders' },
      { label: 'Promociones', route: '/admin/promotions' },
      { label: 'Puntos', route: '/admin/loyalty' },
    ],
  },
  {
    label: 'Contenido',
    links: [{ label: 'Publicaciones', route: '/admin/content' }],
  },
  {
    label: 'Administración',
    links: [
      { label: 'Clientes y usuarios', route: '/admin/accounts' },
      { label: 'Datos de la tienda', route: '/admin/service-coverage' },
      { label: 'Ajustes', route: '/admin/configuration' },
      { label: 'Actividad', route: '/admin/audit' },
    ],
  },
] as const satisfies readonly {
  readonly label: string;
  readonly links: readonly { readonly label: string; readonly route: AdminRoute }[];
}[];

const dashboardActions = [
  {
    description: 'Registrar una venta presencial.',
    label: 'Abrir POS',
    route: '/admin/pos',
  },
  {
    description: 'Crear, editar o cargar imágenes.',
    label: 'Administrar productos',
    route: '/admin/catalog',
  },
  {
    description: 'Revisar pagos y preparar entregas.',
    label: 'Revisar pedidos',
    route: '/admin/orders',
  },
  {
    description: 'Ingresar stock o corregir existencias.',
    label: 'Ajustar inventario',
    route: '/admin/inventory',
  },
  {
    description: 'Crear noticias, torneos, comunidad o cómics.',
    label: 'Publicar contenido',
    route: '/admin/content',
  },
  {
    description: 'Editar dirección, horario y cobertura.',
    label: 'Configurar tienda',
    route: '/admin/service-coverage',
  },
] as const satisfies readonly {
  readonly description: string;
  readonly label: string;
  readonly route: AdminRoute;
}[];

const managedTaskLabels = {
  configuration: { create: 'Nuevo ajuste', edit: 'Editar ajuste', records: 'Versiones' },
  content: { create: 'Nueva publicación', edit: 'Editar publicación', records: 'Estados' },
  loyalty: { create: 'Puntos y configuración', edit: 'Editar configuración', records: 'Estados' },
  preorders: { create: 'Nueva preventa', edit: 'Editar preventa', records: 'Campañas' },
  promotions: { create: 'Nueva promoción', edit: 'Editar promoción', records: 'Estados' },
} as const satisfies Readonly<
  Record<
    'configuration' | 'content' | 'loyalty' | 'preorders' | 'promotions',
    Readonly<Record<AdminTask, string>>
  >
>;

const requiredModulesByArea: Readonly<Record<AdminArea, readonly string[]>> = {
  audit: ['audit'],
  catalog: ['catalog', 'games', 'categories', 'collections'],
  configuration: ['configurations'],
  content: ['content'],
  dashboard: ['orders', 'payments', 'fulfillments', 'catalog', 'games', 'categories'],
  inventory: ['catalog'],
  loyalty: ['loyalty'],
  orders: ['orders', 'payments', 'fulfillments'],
  preorders: ['preorders', 'catalog'],
  promotions: ['promotions', 'coupons'],
};

const visibleModulesByArea: Readonly<Record<AdminArea, readonly string[]>> = {
  audit: ['audit'],
  catalog: ['catalog', 'games', 'categories', 'collections'],
  configuration: ['configurations'],
  content: ['content'],
  dashboard: [],
  inventory: [],
  loyalty: ['loyalty'],
  orders: ['orders', 'payments', 'fulfillments'],
  preorders: ['preorders'],
  promotions: ['promotions', 'coupons'],
};

export function AdminHub({
  area,
  navigate,
}: {
  readonly area: AdminArea;
  readonly navigate: (route: AdminRoute) => void;
}) {
  const [data, setData] = useState<Record<string, ModuleState>>(initialModules);
  const [actionMessage, setActionMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [catalogWorkspace, setCatalogWorkspace] = useState<'create' | 'edit' | 'images'>('create');
  const [managedTask, setManagedTask] = useState<AdminTask>('create');
  const [ordersModule, setOrdersModule] = useState('orders');
  const areaDefinition = adminAreas.find((definition) => definition.area === area) ?? adminAreas[0];
  const requiredModules = modules.filter(({ anchor }) =>
    requiredModulesByArea[area].includes(anchor),
  );
  const visibleModules = modules.filter(({ anchor }) =>
    visibleModulesByArea[area].includes(anchor),
  );
  const managedArea = isManagedTaskArea(area) ? area : null;

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
    for (const anchor of requiredModulesByArea[area]) {
      const definition = modules.find((module) => module.anchor === anchor);
      if (definition) void load(definition);
    }
  }, [area, load]);

  useEffect(() => {
    setCatalogWorkspace('create');
    setManagedTask('create');
    setOrdersModule('orders');
  }, [area]);

  useEffect(() => {
    if (!['loyalty', 'preorders'].includes(area)) return;
    let active = true;
    void readCoverage()
      .then((result) => {
        if (active) setStore(firstStoreFromCoverage(result));
      })
      .catch(() => {
        if (active) setStore(null);
      });
    return () => {
      active = false;
    };
  }, [area]);

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
    <main className="page-frame admin-shell visual-public">
      <header className="section-heading admin-heading cut-panel">
        <div>
          <p className="eyebrow">Panel administrativo</p>
          <h1>{areaDefinition.title}</h1>
          <p>{areaDefinition.description}</p>
        </div>
      </header>
      <button
        aria-controls="admin-sidebar-links"
        aria-expanded={sidebarOpen}
        className="admin-sidebar-toggle"
        onClick={() => setSidebarOpen((current) => !current)}
        type="button"
      >
        Menú de administración
      </button>
      <div className="admin-workspace">
        <AdminSidebar
          currentRoute={areaDefinition.route}
          navigate={navigate}
          onNavigate={() => setSidebarOpen(false)}
          open={sidebarOpen}
        />
        <div className="admin-content">
          <section id={`${area}-workspace`}>
            <p className="status" role="status">
              {actionMessage}
            </p>
            {area === 'dashboard' && (
              <>
                <section aria-labelledby="admin-actions-title" className="admin-quick-actions">
                  <div className="admin-section-intro">
                    <p className="eyebrow">Trabajo frecuente</p>
                    <h2 id="admin-actions-title">¿Qué necesitas hacer?</h2>
                  </div>
                  <div className="admin-action-grid">
                    {dashboardActions.map((action) => (
                      <a
                        href={action.route}
                        key={action.route}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(action.route);
                        }}
                      >
                        <strong>{action.label}</strong>
                        <span>{action.description}</span>
                      </a>
                    ))}
                  </div>
                </section>
                <details className="admin-activity-summary">
                  <summary>Ver actividad reciente</summary>
                  <div
                    aria-label="Resumen operativo visible"
                    className="metric-grid admin-snapshot"
                  >
                    {requiredModules.map((module) => (
                      <div className="metric" key={module.anchor}>
                        <span>{module.label} recientes</span>
                        <strong>
                          {data[module.anchor]?.state === 'ready'
                            ? data[module.anchor]?.items.length
                            : '—'}
                        </strong>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}
          </section>

          {area === 'orders' && (
            <section aria-label="Gestión de pedidos" className="admin-task-workspace">
              <nav aria-label="Secciones de pedidos" className="admin-task-tabs">
                {visibleModules.map((module) => (
                  <button
                    aria-current={ordersModule === module.anchor ? 'page' : undefined}
                    key={module.anchor}
                    onClick={() => setOrdersModule(module.anchor)}
                    type="button"
                  >
                    {module.label}
                    {data[module.anchor]?.state === 'error' ? ' · Error' : ''}
                  </button>
                ))}
              </nav>
              {visibleModules
                .filter((module) => module.anchor === ordersModule)
                .map((module) => (
                  <AdminModule
                    definition={module}
                    key={module.anchor}
                    module={data[module.anchor] ?? emptyModule()}
                    onAction={mutate}
                    onLoadMore={() => void load(module, data[module.anchor]?.nextCursor)}
                  />
                ))}
            </section>
          )}
          {![
            'catalog',
            'configuration',
            'content',
            'loyalty',
            'orders',
            'preorders',
            'promotions',
          ].includes(area) &&
            visibleModules.map((module) => (
              <AdminModule
                definition={module}
                key={module.anchor}
                module={data[module.anchor] ?? emptyModule()}
                onAction={mutate}
                onLoadMore={() => void load(module, data[module.anchor]?.nextCursor)}
              />
            ))}
          {area === 'inventory' && (
            <InventoryPanel onAction={mutate} products={data.catalog?.items ?? []} />
          )}
          {area === 'catalog' && (
            <section className="catalog-admin-workspace" aria-label="Herramientas del catálogo">
              <nav aria-label="Secciones del catálogo" className="catalog-admin-tabs">
                <button
                  aria-current={catalogWorkspace === 'create' ? 'page' : undefined}
                  onClick={() => setCatalogWorkspace('create')}
                  type="button"
                >
                  Nuevo producto
                </button>
                <button
                  aria-current={catalogWorkspace === 'edit' ? 'page' : undefined}
                  onClick={() => setCatalogWorkspace('edit')}
                  type="button"
                >
                  Editar producto
                </button>
                <button
                  aria-current={catalogWorkspace === 'images' ? 'page' : undefined}
                  onClick={() => setCatalogWorkspace('images')}
                  type="button"
                >
                  Imágenes
                </button>
              </nav>
              {catalogWorkspace === 'create' && (
                <CatalogComposer
                  categories={data.categories?.items ?? []}
                  collections={data.collections?.items ?? []}
                  games={data.games?.items ?? []}
                  onAction={mutate}
                />
              )}
              {catalogWorkspace === 'edit' && (
                <CatalogEditors
                  categories={data.categories?.items ?? []}
                  collections={data.collections?.items ?? []}
                  games={data.games?.items ?? []}
                  onAction={mutate}
                  products={data.catalog?.items ?? []}
                />
              )}
              {catalogWorkspace === 'images' && (
                <CatalogResourceManager
                  categories={data.categories?.items ?? []}
                  collections={data.collections?.items ?? []}
                  games={data.games?.items ?? []}
                  products={data.catalog?.items ?? []}
                />
              )}
              <details className="catalog-publication-tools">
                <summary>Publicar y revisar registros del catálogo</summary>
                <p>
                  Aquí puedes revisar estados y publicar, retirar o archivar productos y sus
                  clasificaciones.
                </p>
                {visibleModules.map((module) => (
                  <AdminModule
                    definition={module}
                    key={module.anchor}
                    module={data[module.anchor] ?? emptyModule()}
                    onAction={mutate}
                    onLoadMore={() => void load(module, data[module.anchor]?.nextCursor)}
                  />
                ))}
              </details>
            </section>
          )}
          {managedArea && (
            <section
              aria-label={`Herramientas de ${areaDefinition.label}`}
              className="admin-task-workspace"
            >
              <nav aria-label={`Tareas de ${areaDefinition.label}`} className="admin-task-tabs">
                {(Object.keys(managedTaskLabels[managedArea]) as AdminTask[]).map((task) => (
                  <button
                    aria-current={managedTask === task ? 'page' : undefined}
                    key={task}
                    onClick={() => setManagedTask(task)}
                    type="button"
                  >
                    {managedTaskLabels[managedArea][task]}
                  </button>
                ))}
              </nav>
              {managedTask === 'create' && managedArea === 'preorders' && (
                <PreorderComposer
                  onAction={mutate}
                  products={data.catalog?.items ?? []}
                  store={store}
                />
              )}
              {managedTask === 'create' && managedArea === 'promotions' && (
                <PromotionComposer onAction={mutate} promotions={data.promotions?.items ?? []} />
              )}
              {managedTask === 'create' && managedArea === 'loyalty' && (
                <LoyaltyOperations onAction={mutate} store={store} />
              )}
              {managedTask === 'create' && managedArea === 'configuration' && (
                <ConfigurationComposer onAction={mutate} />
              )}
              {managedTask === 'create' && managedArea === 'content' && (
                <EditorialComposer onAction={mutate} />
              )}
              {managedTask === 'edit' && (
                <RecordEditors
                  area={managedArea}
                  configurations={data.configurations?.items ?? []}
                  content={data.content?.items ?? []}
                  loyalty={data.loyalty?.items ?? []}
                  onAction={mutate}
                  preorders={data.preorders?.items ?? []}
                  products={data.catalog?.items ?? []}
                  promotions={data.promotions?.items ?? []}
                  store={store}
                />
              )}
              {managedTask === 'records' &&
                visibleModules.map((module) => (
                  <AdminModule
                    definition={module}
                    key={module.anchor}
                    module={data[module.anchor] ?? emptyModule()}
                    onAction={mutate}
                    onLoadMore={() => void load(module, data[module.anchor]?.nextCursor)}
                  />
                ))}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

function isManagedTaskArea(
  area: AdminArea,
): area is 'configuration' | 'content' | 'loyalty' | 'preorders' | 'promotions' {
  return ['configuration', 'content', 'loyalty', 'preorders', 'promotions'].includes(area);
}

export function AdminStandaloneLayout({
  children,
  currentRoute,
  description,
  navigate,
  title,
}: {
  readonly children: ReactNode;
  readonly currentRoute: AdminRoute;
  readonly description: string;
  readonly navigate: (route: AdminRoute) => void;
  readonly title: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <main className="page-frame admin-shell visual-public">
      <header className="section-heading admin-heading cut-panel">
        <div>
          <p className="eyebrow">Panel administrativo</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      <button
        aria-controls="admin-sidebar-links"
        aria-expanded={sidebarOpen}
        className="admin-sidebar-toggle"
        onClick={() => setSidebarOpen((current) => !current)}
        type="button"
      >
        Menú de administración
      </button>
      <div className="admin-workspace">
        <AdminSidebar
          currentRoute={currentRoute}
          navigate={navigate}
          onNavigate={() => setSidebarOpen(false)}
          open={sidebarOpen}
        />
        <div className="admin-content">{children}</div>
      </div>
    </main>
  );
}

function AdminSidebar({
  currentRoute,
  navigate,
  onNavigate,
  open,
}: {
  readonly currentRoute: AdminRoute;
  readonly navigate: (route: AdminRoute) => void;
  readonly onNavigate: () => void;
  readonly open: boolean;
}) {
  const link = (route: AdminRoute, label: string) => (
    <a
      aria-current={currentRoute === route ? 'page' : undefined}
      href={route}
      key={route}
      onClick={(event) => {
        event.preventDefault();
        navigate(route);
        onNavigate();
      }}
    >
      {label}
    </a>
  );
  return (
    <aside aria-label="Navegación administrativa" className="admin-sidebar cut-panel">
      <div className="admin-sidebar-heading">
        <p className="eyebrow">Sergod Store</p>
        <strong>Menú de administración</strong>
      </div>
      <div className={`admin-sidebar-links${open ? ' is-open' : ''}`} id="admin-sidebar-links">
        <nav aria-label="Herramientas administrativas" className="admin-area-navigation">
          {adminNavigationGroups.map((group) => (
            <section className="admin-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.links.map((definition) => link(definition.route, definition.label))}
            </section>
          ))}
        </nav>
      </div>
    </aside>
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
    <section className="cut-panel admin-module admin-operational-panel" id={definition.anchor}>
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
                  key={itemIdentifier(item) ?? index}
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
  const id = itemIdentifier(item);
  const primaryReference = itemReference(item);
  return (
    <tr>
      <td>
        <span className="admin-reference">{primaryReference}</span>
        {id && primaryReference !== shortIdentifier(id) && (
          <small className="admin-technical-reference" title={id}>
            Código interno {shortIdentifier(id)}
          </small>
        )}
      </td>
      <td>{itemStatus(item)}</td>
      <td>{itemDetail(item)}</td>
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
        <select aria-label="Nuevo estado de entrega" name="toStatus">
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
  const [task, setTask] = useState<'entry' | 'adjust' | 'threshold'>('entry');
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
        Selecciona una tarea. Todos los cambios afectan el mismo stock usado por la tienda y el POS.
      </p>
      <nav aria-label="Tareas de inventario" className="admin-task-tabs">
        <button
          aria-current={task === 'entry' ? 'page' : undefined}
          onClick={() => setTask('entry')}
          type="button"
        >
          Ingresar stock
        </button>
        <button
          aria-current={task === 'adjust' ? 'page' : undefined}
          onClick={() => setTask('adjust')}
          type="button"
        >
          Corregir stock
        </button>
        <button
          aria-current={task === 'threshold' ? 'page' : undefined}
          onClick={() => setTask('threshold')}
          type="button"
        >
          Aviso de pocas unidades
        </button>
      </nav>
      <div className="admin-form-grid">
        <form hidden={task !== 'entry'} onSubmit={(event) => void submit(event, 'ENTRY')}>
          <h3>Ingresar productos al inventario</h3>
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
        <form hidden={task !== 'adjust'} onSubmit={(event) => void submit(event, 'ADJUST')}>
          <h3>Corregir una diferencia de inventario</h3>
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
            Referencia o comprobante
            <input name="reference" required />
          </label>
          <button>Aplicar ajuste</button>
        </form>
        <form hidden={task !== 'threshold'} onSubmit={(event) => void submit(event, 'THRESHOLD')}>
          <h3>Aviso de pocas unidades</h3>
          <ProductSelect items={products} />
          <label>
            Avisar cuando queden
            <input min="0" name="threshold" type="number" />
          </label>
          <p>Déjalo vacío para usar el valor general de la tienda.</p>
          <button>Guardar aviso</button>
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
      <h2>Nuevo producto</h2>
      <p>Completa los datos comerciales. Después podrás cargar y ordenar sus imágenes.</p>
      <div className="catalog-product-form">
        <form onSubmit={(event) => void product(event)}>
          <h3>Datos del producto</h3>
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
          <label className="catalog-wide-field">
            Descripción
            <textarea name="description" />
          </label>
          <button>Crear producto</button>
        </form>
      </div>
      <details className="catalog-reference-tools">
        <summary>Administrar juegos, categorías y colecciones</summary>
        <p>Usa estas opciones solo cuando necesites crear una nueva clasificación.</p>
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
        </div>
      </details>
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
          const id = itemIdentifier(item) ?? '';
          return (
            <option key={id} value={id}>
              {itemReference(item)}
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
  store,
}: {
  readonly products: readonly Item[];
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
  readonly store: StoreSummary | null;
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
        <StoreField store={store} />
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
          Grupo de entrega opcional
          <input name="groupKey" />
        </label>
        <button disabled={store === null}>Crear campaña</button>
      </form>
    </section>
  );
}

function LoyaltyOperations({
  onAction,
  store,
}: {
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<void>;
  readonly store: StoreSummary | null;
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
      <h2>Programa de puntos</h2>
      <div className="admin-form-grid">
        <form onSubmit={(event) => void configuration(event)}>
          <h3>Nueva configuración</h3>
          <StoreField store={store} />
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
          <button disabled={store === null}>Crear configuración</button>
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
            <option value="PICKUP_BRANCH_ID">Tienda de retiro</option>
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
  const [type, setType] = useState('NEWS');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get('body'));
    const eventMetadata =
      type === 'TOURNAMENT' || type === 'QUEST'
        ? {
            event: {
              startsAt: new Date(String(form.get('eventStartsAt'))).toISOString(),
              status: String(form.get('eventStatus')),
            },
          }
        : {};
    const categoryMetadata =
      type === 'NEWS' ? { category: String(form.get('newsCategory')).trim() } : {};
    await onAction(
      '/api/v1/admin/content',
      {
        body,
        excerpt: String(form.get('excerpt')),
        metadata: {
          ...categoryMetadata,
          ...eventMetadata,
          document: {
            blocks: [{ id: crypto.randomUUID(), text: body, type: 'TEXT' }],
            version: 1,
          },
        },
        slug: String(form.get('slug')),
        title: String(form.get('title')),
        type,
      },
      'POST',
      'content',
    );
    formElement.reset();
    setType('NEWS');
  };
  return (
    <section className="cut-panel admin-module">
      <h2>Nuevo contenido editorial</h2>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Tipo
          <select name="type" onChange={(event) => setType(event.target.value)} value={type}>
            <option value="NEWS">Noticia</option>
            <option value="TOURNAMENT">Torneo informativo</option>
            <option value="COMMUNITY">Comunidad</option>
            <option value="COMIC_SERIES">Serie de cómic</option>
            <option value="COMIC_CHAPTER">Capítulo</option>
            <option value="QUEST">Quest</option>
            <option value="HALL_OF_FAME">Hall of Fame</option>
          </select>
        </label>
        {(type === 'TOURNAMENT' || type === 'QUEST') && (
          <>
            <label>
              Estado del evento
              <select defaultValue="UPCOMING" name="eventStatus">
                <option value="UPCOMING">Próximo</option>
                <option value="COMPLETED">Realizado</option>
              </select>
            </label>
            <label>
              Fecha y hora
              <input name="eventStartsAt" required type="datetime-local" />
            </label>
          </>
        )}
        {type === 'NEWS' && (
          <label>
            Categoría de noticia
            <input defaultValue="General" name="newsCategory" required />
          </label>
        )}
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
