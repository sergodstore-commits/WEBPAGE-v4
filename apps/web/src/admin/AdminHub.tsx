import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, authorizedRequest } from '../identity/api.js';
import { readCoverage } from '../service-coverage/api.js';
import { StoreField } from '../service-coverage/StoreField.js';
import { firstStoreFromCoverage, type StoreSummary } from '../service-coverage/store.js';
import { CatalogEditors, CatalogResourceManager, RecordEditors } from './AdminEditors.js';
import { CarouselAdminPanel } from './CarouselAdminPanel.js';
import { AuditHistory } from './AuditHistory.js';
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
  | 'carousel'
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
  | '/admin/appearance'
  | '/admin/audit'
  | '/admin/catalog'
  | '/admin/carousel'
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
  { anchor: 'carousel', label: 'Carrusel de inicio', path: '/api/v1/admin/home-carousel' },
  { anchor: 'audit', label: 'Auditoría', path: '/api/v1/admin/audit-entries?limit=25' },
] as const satisfies readonly ModuleDefinition[];

const initialModules = Object.fromEntries(
  modules.map(({ anchor }) => [anchor, emptyModule()]),
) as Record<string, ModuleState>;
const dashboardSummaryModules = modules.filter(({ anchor }) =>
  ['orders', 'payments', 'fulfillments', 'catalog'].includes(anchor),
);

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
    description: 'Aplica un descuento porcentual a un producto del catálogo.',
    label: 'Descuentos por producto',
    route: '/admin/promotions',
    title: 'Descuentos por producto',
  },
  {
    area: 'content',
    description: 'Noticias, torneos y actividades de Comunidad.',
    label: 'Comunidad',
    route: '/admin/content',
    title: 'Comunidad',
  },
  {
    area: 'carousel',
    description: 'Administra las imágenes del carrusel de inicio y sus destinos.',
    label: 'Carrusel de inicio',
    route: '/admin/carousel',
    title: 'Carrusel de inicio',
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
    ],
  },
  {
    label: 'Contenido',
    links: [
      { label: 'Publicaciones', route: '/admin/content' },
      { label: 'Carrusel de inicio', route: '/admin/carousel' },
    ],
  },
  {
    label: 'Administración',
    links: [
      { label: 'Clientes y usuarios', route: '/admin/accounts' },
      { label: 'Datos de la tienda', route: '/admin/service-coverage' },
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
    group: 'Ventas',
    label: 'Abrir POS',
    route: '/admin/pos',
  },
  {
    description: 'Crear, editar o cargar imágenes.',
    group: 'Productos',
    label: 'Administrar productos',
    route: '/admin/catalog',
  },
  {
    description: 'Revisar pagos y preparar entregas.',
    group: 'Ventas',
    label: 'Revisar pedidos',
    route: '/admin/orders',
  },
  {
    description: 'Ingresar stock o corregir existencias.',
    group: 'Productos',
    label: 'Ajustar inventario',
    route: '/admin/inventory',
  },
  {
    description: 'Crear noticias, torneos o actividades de Comunidad.',
    group: 'Publicaciones',
    label: 'Administrar Comunidad',
    route: '/admin/content',
  },
  {
    description: 'Editar dirección, horario y cobertura.',
    group: 'Tienda',
    label: 'Configurar tienda',
    route: '/admin/service-coverage',
  },
] as const satisfies readonly {
  readonly description: string;
  readonly group: 'Productos' | 'Publicaciones' | 'Tienda' | 'Ventas';
  readonly label: string;
  readonly route: AdminRoute;
}[];

const managedTaskLabels = {
  carousel: { create: 'Agregar banner', edit: 'Editar banners', records: 'Banners activos' },
  configuration: { create: 'Nuevo ajuste', edit: 'Editar ajuste', records: 'Versiones' },
  content: { create: 'Nueva publicación', edit: 'Editar publicación', records: 'Estados' },
  preorders: { create: 'Nueva preventa', edit: 'Editar preventa', records: 'Campañas' },
  promotions: { create: 'Nueva promoción', edit: 'Editar promoción', records: 'Estados' },
} as const satisfies Readonly<
  Record<
    'carousel' | 'configuration' | 'content' | 'preorders' | 'promotions',
    Readonly<Record<AdminTask, string>>
  >
>;

const requiredModulesByArea: Readonly<Record<AdminArea, readonly string[]>> = {
  audit: ['audit'],
  catalog: ['catalog', 'games', 'categories', 'collections'],
  configuration: ['configurations'],
  content: ['content'],
  dashboard: [],
  inventory: ['catalog'],
  carousel: ['carousel'],
  loyalty: [],
  orders: ['orders', 'payments', 'fulfillments'],
  preorders: ['preorders', 'catalog', 'games', 'categories', 'collections'],
  promotions: ['promotions', 'catalog'],
};

const visibleModulesByArea: Readonly<Record<AdminArea, readonly string[]>> = {
  audit: ['audit'],
  catalog: ['catalog', 'games', 'categories', 'collections'],
  configuration: ['configurations'],
  content: ['content'],
  dashboard: [],
  inventory: [],
  carousel: ['carousel'],
  loyalty: [],
  orders: ['orders', 'payments', 'fulfillments'],
  preorders: ['preorders'],
  promotions: ['promotions'],
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
  const [preorderStep, setPreorderStep] = useState<'product' | 'images' | 'campaign'>('campaign');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [catalogWorkspace, setCatalogWorkspace] = useState<
    'create' | 'edit' | 'images' | 'publish'
  >('create');
  const [createdProduct, setCreatedProduct] = useState<Item | null>(null);
  const [managedTask, setManagedTask] = useState<AdminTask>('create');
  const [ordersModule, setOrdersModule] = useState('orders');
  const [activityOpen, setActivityOpen] = useState(false);
  const areaDefinition = adminAreas.find((definition) => definition.area === area) ?? adminAreas[0];
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
    if (area !== 'dashboard' || !activityOpen) return;
    for (const definition of dashboardSummaryModules) void load(definition);
  }, [activityOpen, area, load]);

  useEffect(() => {
    setCatalogWorkspace('create');
    setManagedTask('create');
    setOrdersModule('orders');
  }, [area]);

  useEffect(() => {
    if (!['preorders'].includes(area)) return;
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
      const result = await authorizedRequest<{ item?: Item }>(path, {
        body: JSON.stringify(body),
        headers: { 'idempotency-key': crypto.randomUUID() },
        method,
      });
      if (
        reload === 'catalog' &&
        result.item &&
        result.item.productId === createdProduct?.productId
      )
        setCreatedProduct(result.item);
      setActionMessage('Operación guardada correctamente.');
      const definition = modules.find(({ anchor }) => anchor === reload);
      if (definition) await load(definition);
      return true;
    } catch (error) {
      setActionMessage(messageOf(error));
      return false;
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
            {actionMessage && (
              <p className="status admin-action-feedback" role="status" aria-live="polite">
                {actionMessage}
              </p>
            )}
            {area === 'dashboard' && (
              <>
                <section aria-labelledby="admin-actions-title" className="admin-quick-actions">
                  <div className="admin-section-intro">
                    <p className="eyebrow">Panel de operación</p>
                    <h2 id="admin-actions-title">¿Qué necesitas hacer?</h2>
                    <p>
                      Elige una tarea. Cada acceso abre directamente la herramienta correspondiente.
                    </p>
                  </div>
                  <div className="admin-action-sections">
                    {(['Ventas', 'Productos', 'Publicaciones', 'Tienda'] as const).map((group) => (
                      <section aria-label={group} className="admin-action-section" key={group}>
                        <h3>{group}</h3>
                        <div className="admin-action-grid">
                          {dashboardActions
                            .filter((action) => action.group === group)
                            .map((action) => (
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
                    ))}
                  </div>
                </section>
                <details
                  className="admin-activity-summary"
                  onToggle={(event) => {
                    if (event.currentTarget.open) setActivityOpen(true);
                  }}
                >
                  <summary>Ver actividad reciente</summary>
                  <div
                    aria-label="Resumen operativo visible"
                    className="metric-grid admin-snapshot"
                  >
                    {dashboardSummaryModules.map((module) => (
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
            'carousel',
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
                <button
                  aria-current={catalogWorkspace === 'publish' ? 'page' : undefined}
                  onClick={() => setCatalogWorkspace('publish')}
                  type="button"
                >
                  Publicar y revisar
                </button>
              </nav>
              {catalogWorkspace === 'create' && (
                <CatalogComposer
                  categories={data.categories?.items ?? []}
                  collections={data.collections?.items ?? []}
                  games={data.games?.items ?? []}
                  onAction={mutate}
                  onCreated={(product) => {
                    setCreatedProduct(product);
                    setCatalogWorkspace('images');
                    const definition = modules.find(({ anchor }) => anchor === 'catalog');
                    if (definition) void load(definition);
                  }}
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
                  initialProductId={String(createdProduct?.productId ?? '')}
                  onContinue={() => setCatalogWorkspace('publish')}
                  products={[
                    ...(createdProduct &&
                    !(data.catalog?.items ?? []).some(
                      (item) => item.productId === createdProduct.productId,
                    )
                      ? [createdProduct]
                      : []),
                    ...(data.catalog?.items ?? []),
                  ]}
                />
              )}
              {catalogWorkspace === 'publish' && (
                <section aria-label="Publicación del catálogo" className="admin-task-workspace">
                  <div className="cut-panel admin-module">
                    <h2>Antes de mostrarlo en la tienda</h2>
                    <p>
                      Publica primero el juego, la categoría y, si corresponde, la colección.
                      Después publica el producto y registra su stock para que pueda comprarse. Cada
                      paso muestra el estado que devuelve el servidor.
                    </p>
                    {createdProduct && (
                      <p>
                        Producto recién creado:{' '}
                        <strong>
                          {String(
                            createdProduct.name ?? createdProduct.sku ?? createdProduct.productId,
                          )}
                        </strong>
                      </p>
                    )}
                    <button onClick={() => navigate('/admin/inventory')} type="button">
                      Ir a inventario
                    </button>
                  </div>
                  {visibleModules
                    .filter((module) =>
                      ['games', 'categories', 'collections', 'catalog'].includes(module.anchor),
                    )
                    .map((module) => {
                      const loaded = data[module.anchor] ?? emptyModule();
                      const recent =
                        module.anchor === 'catalog' &&
                        createdProduct &&
                        !loaded.items.some((item) => item.productId === createdProduct.productId)
                          ? { ...loaded, items: [createdProduct, ...loaded.items] }
                          : loaded;
                      return (
                        <AdminModule
                          definition={module}
                          key={module.anchor}
                          module={recent}
                          onAction={mutate}
                          onLoadMore={() => void load(module, data[module.anchor]?.nextCursor)}
                        />
                      );
                    })}
                </section>
              )}
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
                <>
                  <nav className="admin-task-tabs" aria-label="Preparar preventa">
                    <button type="button" onClick={() => setPreorderStep('product')}>
                      1. Producto de preventa
                    </button>
                    <button type="button" onClick={() => setPreorderStep('images')}>
                      2. Imágenes
                    </button>
                    <button type="button" onClick={() => setPreorderStep('campaign')}>
                      3. Campaña
                    </button>
                  </nav>
                  {preorderStep === 'product' && (
                    <CatalogComposer
                      defaultSaleType="PREORDER"
                      categories={data.categories?.items ?? []}
                      collections={data.collections?.items ?? []}
                      games={data.games?.items ?? []}
                      onAction={mutate}
                      onCreated={(product) => {
                        setCreatedProduct(product);
                        setPreorderStep('images');
                        const definition = modules.find((item) => item.anchor === 'catalog');
                        if (definition) void load(definition);
                      }}
                    />
                  )}
                  {preorderStep === 'images' && (
                    <CatalogResourceManager
                      categories={data.categories?.items ?? []}
                      collections={data.collections?.items ?? []}
                      games={data.games?.items ?? []}
                      initialProductId={
                        createdProduct?.saleType === 'PREORDER'
                          ? String(createdProduct.productId)
                          : ''
                      }
                      products={(data.catalog?.items ?? []).filter(
                        (item) =>
                          item.saleType === 'PREORDER' && item.publicationStatus !== 'ARCHIVED',
                      )}
                      onContinue={() => setPreorderStep('campaign')}
                    />
                  )}
                  {preorderStep === 'campaign' && (
                    <PreorderComposer
                      onAction={mutate}
                      products={data.catalog?.items ?? []}
                      store={store}
                    />
                  )}
                </>
              )}
              {managedTask === 'create' && managedArea === 'promotions' && (
                <PromotionComposer onAction={mutate} products={data.catalog?.items ?? []} />
              )}
              {managedArea === 'carousel' && <CarouselAdminPanel />}
              {managedTask === 'create' && managedArea === 'configuration' && (
                <ConfigurationComposer onAction={mutate} />
              )}
              {managedTask === 'create' && managedArea === 'content' && (
                <EditorialComposer onAction={mutate} />
              )}
              {managedTask === 'edit' && managedArea === 'promotions' && (
                <PromotionComposer
                  onAction={mutate}
                  products={data.catalog?.items ?? []}
                  promotions={data.promotions?.items ?? []}
                />
              )}
              {managedTask === 'edit' &&
                managedArea !== 'carousel' &&
                managedArea !== 'promotions' && (
                  <RecordEditors
                    area={managedArea}
                    configurations={data.configurations?.items ?? []}
                    content={data.content?.items ?? []}
                    loyalty={[]}
                    onAction={mutate}
                    preorders={data.preorders?.items ?? []}
                    products={data.catalog?.items ?? []}
                    promotions={data.promotions?.items ?? []}
                    store={store}
                  />
                )}
              {managedTask === 'records' &&
                managedArea !== 'carousel' &&
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
): area is 'configuration' | 'content' | 'carousel' | 'preorders' | 'promotions' {
  return ['configuration', 'content', 'carousel', 'preorders', 'promotions'].includes(area);
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
    <aside
      aria-label="Navegación administrativa"
      className={`admin-sidebar cut-panel${open ? ' is-open' : ''}`}
    >
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
  ) => Promise<unknown>;
  readonly onLoadMore: () => void;
}) {
  return (
    <section className="cut-panel admin-module admin-operational-panel" id={definition.anchor}>
      <div className="section-heading">
        <h2>{definition.label}</h2>
        <span className="status-chip">{module.items.length} visibles</span>
      </div>
      {module.message && (
        <p className="status" role={module.state === 'error' ? 'alert' : 'status'}>
          {module.message}
        </p>
      )}
      {definition.anchor === 'audit' && module.items.length > 0 && (
        <AuditHistory items={module.items} />
      )}
      {definition.anchor !== 'audit' && module.items.length > 0 && (
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
  ) => Promise<unknown>;
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

function catalogPublicationActions(state: string): readonly (readonly [string, string])[] {
  if (state === 'ARCHIVED') return [];
  return [
    ...(state !== 'PUBLISHED'
      ? [['Publicar', 'PUBLISHED'] as const]
      : [['Retirar', 'UNPUBLISHED'] as const]),
    ['Archivar', 'ARCHIVED'] as const,
  ];
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
  ) => Promise<unknown>;
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
        actions={catalogPublicationActions(String(item.publicationStatus ?? 'DRAFT'))}
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
        actions={catalogPublicationActions(String(item.publicationStatus ?? 'DRAFT'))}
        onSelect={(nextStatus) =>
          onAction(
            `/api/v1/admin/catalog/${segment}/${id}/publication-transitions`,
            {
              nextStatus,
              ...(item.publicationStatus === 'PUBLISHED' && nextStatus !== 'PUBLISHED'
                ? { descendantStrategy: 'REJECT' }
                : {}),
            },
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
        onSelect={(action) =>
          onAction(`/api/v1/admin/content/${id}/${action}`, undefined, 'POST', anchor)
        }
      />
    );
  if (anchor === 'preorders') return <PreorderAction id={id} item={item} onAction={onAction} />;
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
  ) => Promise<unknown>;
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
  ) => Promise<unknown>;
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
  item,
  onAction,
}: {
  readonly id: string;
  readonly item: Item;
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<unknown>;
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
  const publication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('nextStatus') === 'PUBLISHED' && item.operationalState === 'DRAFT') {
      const nextState =
        new Date(String(item.opensAt)).getTime() > Date.now() ? 'SCHEDULED' : 'OPEN';
      const saved = await onAction(
        `/api/v1/admin/preorders/campaigns/${id}/operational-transitions`,
        { nextState, reason: 'Preparar campaña para publicación' },
        'POST',
        'preorders',
      );
      if (saved === false) return;
    }
    return onAction(
      `/api/v1/admin/preorders/campaigns/${id}/publication-transitions`,
      { nextStatus: String(form.get('nextStatus')), reason: nullable(form.get('reason')) },
      'POST',
      'preorders',
    );
  };
  return (
    <div className="stacked-actions">
      <small>
        Al publicar un borrador se abre o programa automáticamente según su fecha. El producto debe
        estar publicado y tener imagen.
      </small>
      <form className="inline-action" onSubmit={(event) => void operational(event)}>
        <select aria-label="Estado operativo de preventa" name="nextState">
          <option disabled={item.operationalState !== 'DRAFT'} value="SCHEDULED">
            Programar
          </option>
          <option disabled={item.operationalState !== 'DRAFT'} value="OPEN">
            Abrir
          </option>
          <option
            disabled={!['OPEN', 'SCHEDULED'].includes(String(item.operationalState))}
            value="CLOSED"
          >
            Cerrar
          </option>
          <option disabled={item.operationalState === 'CANCELLED'} value="CANCELLED">
            Cancelar
          </option>
        </select>
        <input aria-label="Motivo operativo" name="reason" placeholder="Motivo" />
        <button>Aplicar</button>
      </form>
      <form className="inline-action" onSubmit={(event) => void publication(event)}>
        <select aria-label="Publicación de preventa" name="nextStatus">
          <option
            disabled={
              item.publicationStatus === 'PUBLISHED' ||
              ['CLOSED', 'CANCELLED'].includes(String(item.operationalState))
            }
            value="PUBLISHED"
          >
            Publicar
          </option>
          <option disabled={item.publicationStatus !== 'PUBLISHED'} value="UNPUBLISHED">
            Retirar
          </option>
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
  readonly onSelect: (value: string) => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const select = async (value: string) => {
    if (pending) return;
    setPending(true);
    try {
      await onSelect(value);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="table-actions" aria-busy={pending}>
      {actions.map(([label, value]) => (
        <button
          className="link"
          key={value}
          disabled={pending}
          onClick={() => void select(value)}
          type="button"
        >
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
  ) => Promise<unknown>;
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
  defaultSaleType = 'REGULAR',
  categories,
  collections,
  games,
  onAction,
  onCreated,
}: {
  readonly categories: readonly Item[];
  readonly collections: readonly Item[];
  readonly games: readonly Item[];
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<unknown>;
  readonly defaultSaleType?: 'PREORDER' | 'REGULAR';
  readonly onCreated: (product: Item) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedGameId, setSelectedGameId] = useState('');
  const pendingSubmission = useRef<{ fingerprint: string; key: string } | null>(null);
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
  const product = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    const payload = {
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
    };
    const fingerprint = JSON.stringify(payload);
    if (pendingSubmission.current?.fingerprint !== fingerprint)
      pendingSubmission.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError('');
    try {
      const response = await authorizedRequest<{ item: Item }>('/api/v1/admin/catalog/products', {
        body: fingerprint,
        headers: { 'idempotency-key': pendingSubmission.current.key },
        method: 'POST',
      });
      if (!response.item || typeof response.item.productId !== 'string')
        throw new Error(
          'El servidor no confirmó el producto creado. Revisa el catálogo antes de repetir.',
        );
      pendingSubmission.current = null;
      onCreated(response.item);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="cut-panel admin-module">
      <h2>Nuevo producto</h2>
      <p>
        1. Guarda los datos. 2. Subirás las fotos del mismo producto sin volver a buscarlo. 3.
        Revisa inventario y publicación.
      </p>
      <div className="catalog-product-form">
        <form onSubmit={(event) => void product(event)}>
          <h3>Datos del producto</h3>
          {(games.length === 0 || categories.length === 0) && (
            <p className="status" role="status">
              Para crear un producto necesitas al menos un juego y una categoría. Agrégalos en
              «Administrar juegos, categorías y colecciones».
            </p>
          )}
          {error && (
            <p className="status" role="alert">
              {error}
            </p>
          )}
          <EntitySelect items={games} label="Juego" name="gameId" onChange={setSelectedGameId} />
          <EntitySelect items={categories} label="Categoría" name="categoryId" />
          <EntitySelect
            allowEmpty
            items={collections.filter((item) => item.gameId === selectedGameId)}
            label="Colección"
            name="collectionId"
          />
          <label>
            Nombre
            <input name="name" required />
          </label>
          <div className="admin-field-with-help">
            <label>
              SKU
              <input aria-describedby="new-product-sku-help" name="sku" required />
            </label>
            <small id="new-product-sku-help">
              Código interno único; no es el código de barras.
            </small>
          </div>
          <div className="admin-field-with-help">
            <label>
              Precio CLP
              <input
                aria-describedby="new-product-price-help"
                min="0"
                name="price"
                required
                step="1"
                type="number"
              />
            </label>
            <small id="new-product-price-help">Pesos chilenos, sin puntos ni signo $.</small>
          </div>
          <label>
            Tipo
            <select name="saleType" defaultValue={defaultSaleType}>
              <option value="REGULAR">Regular</option>
              <option value="PREORDER">Preventa</option>
            </select>
          </label>
          <label>
            Idioma (código internacional)
            <input
              name="language"
              pattern="[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*"
              placeholder="Ej.: es-CL"
              title="Usa un código de idioma, por ejemplo es-CL."
            />
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
          <button disabled={saving || games.length === 0 || categories.length === 0}>
            {saving ? 'Guardando producto…' : 'Crear producto y continuar a imágenes'}
          </button>
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
  onChange,
}: {
  readonly allowEmpty?: boolean;
  readonly items: readonly Item[];
  readonly label: string;
  readonly name: string;
  readonly onChange?: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        required={!allowEmpty}
      >
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
  ) => Promise<unknown>;
  readonly store: StoreSummary | null;
}) {
  const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const capacity = Number(form.get('capacity'));
    const maxPerCustomer = nullableNumber(form.get('maxPerCustomer'));
    const opensAt = new Date(String(form.get('opensAt')));
    const closesAt = new Date(String(form.get('closesAt')));
    if (maxPerCustomer !== null && maxPerCustomer > capacity) {
      setError('El máximo por cliente no puede superar las unidades disponibles.');
      return;
    }
    if (!(opensAt.getTime() < closesAt.getTime())) {
      setError('El cierre debe ser posterior a la apertura.');
      return;
    }
    setError('');
    return onAction(
      '/api/v1/admin/preorders/campaigns',
      {
        branchId: String(form.get('branchId')),
        capacity,
        maxPerCustomer,
        closesAt: closesAt.toISOString(),
        estimatedArrivalText: String(form.get('arrival')),
        fulfillmentGroupKey: nullable(form.get('groupKey')),
        opensAt: opensAt.toISOString(),
        productId: String(form.get('productId')),
      },
      'POST',
      'preorders',
    );
  };
  return (
    <section className="cut-panel admin-module">
      <h2>Nueva campaña de preventa</h2>
      <p>
        Usa los pasos 1 y 2 para crear el producto y subir sus imágenes aquí mismo. Luego define la
        campaña. Para hacerla visible, publica el producto en Catálogo y abre y publica la campaña
        en «Campañas».
      </p>
      {error && (
        <p className="status" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <ProductSelect
          items={products.filter(
            (item) => item.saleType === 'PREORDER' && item.publicationStatus !== 'ARCHIVED',
          )}
        />
        <StoreField store={store} />
        <label>
          Unidades disponibles en total
          <input min="1" name="capacity" required type="number" />
        </label>
        <label>
          Máximo por cliente (opcional)
          <input min="1" name="maxPerCustomer" type="number" />
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

function PromotionComposer({
  onAction,
  products,
  promotions,
}: {
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<unknown>;
  readonly products: readonly Item[];
  readonly promotions?: readonly Item[];
}) {
  const [selectedId, setSelectedId] = useState('');
  const selected = promotions?.find((item) => item.promotionId === selectedId);
  const targets = selected?.targets as Item[] | undefined;
  const benefit = selected?.benefit as Item | undefined;
  const available = products.filter(
    (item) => item.publicationStatus === 'PUBLISHED' && item.saleType === 'REGULAR',
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const productId = String(form.get('productId'));
    const percent = Number(form.get('percentage'));
    const product = products.find((item) => item.productId === productId);
    const endsAt = new Date(String(form.get('endsAt')));
    if (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= Date.now()) return;
    await onAction(
      selected ? `/api/v1/admin/promotions/${selectedId}` : '/api/v1/admin/promotions',
      {
        activationMode: 'AUTOMATIC',
        benefit: { basisPoints: Math.round(percent * 100), type: 'PERCENTAGE_DISCOUNT' },
        branchId: null,
        channel: 'BOTH',
        endsAt: endsAt.toISOString(),
        globalLimit: null,
        minimumEligibleAmountClp: null,
        minimumEligibleQuantity: null,
        name: `${percent}% · ${String(product?.name ?? 'Producto')}`,
        perAccountLimit: null,
        priority: 0,
        schedules: [],
        scope: 'LINE',
        startsAt: selected?.startsAt ?? new Date().toISOString(),
        targets: [
          {
            categoryId: null,
            gameId: null,
            kind: 'PRODUCT',
            position: 1,
            productId,
            side: 'BENEFITED',
          },
        ],
      },
      selected ? 'PATCH' : 'POST',
      'promotions',
    );
  };
  return (
    <section className="cut-panel admin-module">
      <h2>{promotions ? 'Editar descuento' : 'Descuento por producto'}</h2>
      <p>
        Selecciona el producto y su descuento. Se aplicará automáticamente en tienda y POS al
        activarlo en «Estados». No necesitas cupones.
      </p>
      {promotions && (
        <label>
          Descuento
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            <option value="">Selecciona un descuento</option>
            {promotions
              .filter((item) => ['DRAFT', 'SUSPENDED'].includes(String(item.state)))
              .map((item) => (
                <option key={String(item.promotionId)} value={String(item.promotionId)}>
                  {String(item.name)}
                </option>
              ))}
          </select>
          <small>Suspende un descuento activo antes de editarlo.</small>
        </label>
      )}
      {(!promotions || selected) && (
        <form key={selectedId} onSubmit={(event) => void submit(event)}>
          <label>
            Producto del catálogo
            <select name="productId" required defaultValue={String(targets?.[0]?.productId ?? '')}>
              <option value="">Selecciona un producto publicado</option>
              {available.map((item) => (
                <option key={String(item.productId)} value={String(item.productId)}>
                  {String(item.name)} · ${Number(item.priceAmountClp).toLocaleString('es-CL')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Descuento (%)
            <input
              name="percentage"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              required
              defaultValue={benefit ? Number(benefit.basisPoints) / 100 : undefined}
            />
          </label>
          <label>
            Válido hasta
            <input
              name="endsAt"
              type="datetime-local"
              required
              defaultValue={selected?.endsAt ? localDateTime(String(selected.endsAt)) : undefined}
            />
            <small>Evita dejar un descuento vigente por accidente. Puedes suspenderlo antes.</small>
          </label>
          <button disabled={available.length === 0}>
            {selected ? 'Guardar descuento' : 'Crear descuento'}
          </button>
        </form>
      )}
    </section>
  );
}

function localDateTime(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function ConfigurationComposer({
  onAction,
}: {
  readonly onAction: (
    path: string,
    body: unknown,
    method?: string,
    reload?: string,
  ) => Promise<unknown>;
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
  ) => Promise<unknown>;
}) {
  const [type, setType] = useState('NEWS');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get('body'));
    const eventMetadata =
      type === 'TOURNAMENT'
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
    // Keep the author's draft intact, including when the server rejects the save.
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
          </select>
        </label>
        {type === 'TOURNAMENT' && (
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
function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.code === 'INVENTORY_CONFIGURATION_REQUIRED')
    return 'Antes de operar inventario, crea y activa “Umbral de últimas unidades” en Ajustes.';
  return error instanceof Error ? error.message : 'No fue posible completar la operación.';
}

function emptyModule(): ModuleState {
  return { items: [], message: 'Cargando…', nextCursor: null, state: 'loading' };
}
