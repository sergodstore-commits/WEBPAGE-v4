import { type FormEvent, useEffect, useState } from 'react';

import { ApiError, authorizedRequest, currentSession, publicRequest } from '../identity/api.js';
import { EditorialDocumentView } from '../editorial/EditorialDocument.js';
import { documentFromMetadata } from '../editorial/editorial-document-model.js';
import { firstStore, type StoreSummary } from '../service-coverage/store.js';

interface ProductCard {
  readonly availableForPurchase: boolean;
  readonly availabilityStatus: AvailabilityStatus;
  readonly game: GameReference;
  readonly name: string;
  readonly priceAmountClp: number;
  readonly preorderCampaignId: string | null;
  readonly primaryResource: PrimaryResource;
  readonly productId: string;
  readonly saleType: 'PREORDER' | 'REGULAR';
}

type AvailabilityStatus = 'AVAILABLE' | 'LAST_UNITS' | 'OUT_OF_STOCK';
type ProductSort = 'NAME_ASC' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC';

interface GameReference {
  readonly gameId: string;
  readonly name: string;
  readonly slug: string;
}

interface NamedReference {
  readonly categoryId?: string;
  readonly collectionId?: string;
  readonly game?: GameReference;
  readonly gameId?: string;
  readonly name: string;
}

interface PrimaryResource {
  readonly altText: string;
  readonly heightPx: number;
  readonly resourceId: string;
  readonly widthPx: number;
}

interface ProductDetail extends ProductCard {
  readonly category: { readonly categoryId: string; readonly name: string };
  readonly collection: { readonly collectionId: string; readonly name: string } | null;
  readonly condition: string | null;
  readonly description: string | null;
  readonly edition: string | null;
  readonly language: string | null;
  readonly preorder?: {
    readonly availableCapacity: number;
    readonly capacity: number;
    readonly closesAt: string;
    readonly estimatedArrivalText: string;
    readonly opensAt: string;
    readonly preorderCampaignId: string;
  } | null;
  readonly resources?: readonly PrimaryResource[];
  readonly sku: string;
}

interface CatalogFilters {
  readonly availabilityStatus: '' | AvailabilityStatus;
  readonly categoryId: string;
  readonly collectionId: string;
  readonly condition: string;
  readonly edition: string;
  readonly gameId: string;
  readonly language: string;
  readonly maximumPriceClp: string;
  readonly minimumPriceClp: string;
  readonly q: string;
  readonly saleType: '' | 'PREORDER' | 'REGULAR';
  readonly sort: ProductSort;
}

const initialFilters: CatalogFilters = {
  availabilityStatus: '',
  categoryId: '',
  collectionId: '',
  condition: '',
  edition: '',
  gameId: '',
  language: '',
  maximumPriceClp: '',
  minimumPriceClp: '',
  q: '',
  saleType: '',
  sort: 'NEWEST',
};

interface EditorialEntry {
  readonly body: string;
  readonly editorialEntryId: string;
  readonly excerpt: string;
  readonly metadata: Record<string, unknown>;
  readonly publishedAt?: string;
  readonly slug: string;
  readonly title: string;
  readonly type: string;
}

type TournamentSection = 'completed' | 'hall' | 'legacy' | 'quests' | 'upcoming';

interface TournamentContentState {
  readonly errors: readonly string[];
  readonly failedTypes: readonly string[];
  readonly hall: readonly EditorialEntry[];
  readonly loading: boolean;
  readonly quests: readonly EditorialEntry[];
  readonly tournaments: readonly EditorialEntry[];
}

type HomeRoute = '/community' | '/comics' | '/news' | '/shop' | '/tournaments';
type HighlightStatus = 'error' | 'loading' | 'ready';

interface HighlightState<T> {
  readonly items: readonly T[];
  readonly status: HighlightStatus;
}

const loadingHighlights = { items: [], status: 'loading' } as const;

export function HomeHighlights({ navigate }: { readonly navigate: (route: HomeRoute) => void }) {
  const [regularProducts, setRegularProducts] =
    useState<HighlightState<ProductCard>>(loadingHighlights);
  const [preorders, setPreorders] = useState<HighlightState<ProductCard>>(loadingHighlights);
  const [news, setNews] = useState<HighlightState<EditorialEntry>>(loadingHighlights);
  const [tournaments, setTournaments] = useState<HighlightState<EditorialEntry>>(loadingHighlights);

  useEffect(() => {
    let active = true;
    const load = async <T,>(
      path: string,
      update: (state: HighlightState<T>) => void,
    ): Promise<void> => {
      try {
        const result = await publicRequest<{ items: T[] }>(path);
        if (active) update({ items: result.items, status: 'ready' });
      } catch {
        if (active) update({ items: [], status: 'error' });
      }
    };
    void Promise.all([
      load('/api/v1/catalog/products?limit=4&sort=NEWEST&saleType=REGULAR', setRegularProducts),
      load('/api/v1/catalog/products?limit=4&sort=NEWEST&saleType=PREORDER', setPreorders),
      load('/api/v1/content?limit=3&type=NEWS', setNews),
      load('/api/v1/content?limit=3&type=TOURNAMENT', setTournaments),
    ]);
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="home-highlights">
      <HomeProductSection
        actionLabel="Ver tienda"
        emptyMessage="Aún no hay productos regulares publicados."
        eyebrow="Tienda"
        navigate={() => navigate('/shop')}
        state={regularProducts}
        title="Productos destacados"
      />
      <HomeProductSection
        actionLabel="Ver preventas"
        emptyMessage="Aún no hay preventas publicadas."
        eyebrow="Próximos lanzamientos"
        navigate={() => navigate('/shop')}
        state={preorders}
        title="Preventas destacadas"
      />
      <HomeEditorialSection
        actionLabel="Ver torneos"
        emptyMessage="Aún no hay torneos publicados."
        eyebrow="Comunidad competitiva"
        navigate={() => navigate('/tournaments')}
        state={tournaments}
        title="Próximos torneos"
      />
      <HomeEditorialSection
        actionLabel="Ver noticias"
        emptyMessage="Aún no hay noticias publicadas."
        eyebrow="Editorial"
        navigate={() => navigate('/news')}
        state={news}
        title="Últimas noticias"
      />
      <section aria-labelledby="home-community-title" className="home-highlight-section">
        <header className="home-highlight-heading">
          <div>
            <p className="eyebrow">Más Sergod</p>
            <h2 id="home-community-title">Comunidad e historias</h2>
          </div>
        </header>
        <div className="home-strips home-access-grid">
          <article className="feature-strip">
            <span aria-hidden="true" className="feature-index">
              05
            </span>
            <p className="card-kicker">Comunidad</p>
            <h3>Actividades y novedades locales</h3>
            <button onClick={() => navigate('/community')} type="button">
              Ir a comunidad
            </button>
          </article>
          <article className="feature-strip">
            <span aria-hidden="true" className="feature-index">
              06
            </span>
            <p className="card-kicker">Historias</p>
            <h3>Cómics y contenido Sergod</h3>
            <button onClick={() => navigate('/comics')} type="button">
              Descubrir historias
            </button>
          </article>
        </div>
      </section>
    </div>
  );
}

function HomeProductSection({
  actionLabel,
  emptyMessage,
  eyebrow,
  navigate,
  state,
  title,
}: {
  readonly actionLabel: string;
  readonly emptyMessage: string;
  readonly eyebrow: string;
  readonly navigate: () => void;
  readonly state: HighlightState<ProductCard>;
  readonly title: string;
}) {
  const headingId = homeHeadingId(title);
  return (
    <section aria-labelledby={headingId} className="home-highlight-section">
      <HomeHighlightHeading
        actionLabel={actionLabel}
        eyebrow={eyebrow}
        headingId={headingId}
        navigate={navigate}
        title={title}
      />
      {state.status === 'ready' && state.items.length > 0 ? (
        <div className="home-highlight-grid">
          {state.items.map((product) => (
            <article className="commerce-card" key={product.productId}>
              <div className="product-media">
                <img
                  alt={product.primaryResource.altText}
                  height={product.primaryResource.heightPx}
                  loading="lazy"
                  src={`/api/v1/catalog/resources/${product.primaryResource.resourceId}/content`}
                  width={product.primaryResource.widthPx}
                />
                <span className="status-chip">{availabilityLabel(product.availabilityStatus)}</span>
              </div>
              <div className="product-card-body">
                <p className="card-kicker">{product.game.name}</p>
                <h3>{product.name}</h3>
                <p className="price">${product.priceAmountClp.toLocaleString('es-CL')}</p>
                <button onClick={navigate} type="button">
                  Ver en tienda
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <HomeHighlightStatus emptyMessage={emptyMessage} status={state.status} />
      )}
    </section>
  );
}

function HomeEditorialSection({
  actionLabel,
  emptyMessage,
  eyebrow,
  navigate,
  state,
  title,
}: {
  readonly actionLabel: string;
  readonly emptyMessage: string;
  readonly eyebrow: string;
  readonly navigate: () => void;
  readonly state: HighlightState<EditorialEntry>;
  readonly title: string;
}) {
  const headingId = homeHeadingId(title);
  return (
    <section aria-labelledby={headingId} className="home-highlight-section">
      <HomeHighlightHeading
        actionLabel={actionLabel}
        eyebrow={eyebrow}
        headingId={headingId}
        navigate={navigate}
        title={title}
      />
      {state.status === 'ready' && state.items.length > 0 ? (
        <div className="home-highlight-grid">
          {state.items.map((item, index) => (
            <article className="editorial-card" key={item.editorialEntryId}>
              <span aria-hidden="true" className="editorial-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="card-kicker">{item.type.replaceAll('_', ' ')}</p>
              <h3>{item.title}</h3>
              <p>{item.excerpt}</p>
              <button onClick={navigate} type="button">
                Abrir publicación
              </button>
            </article>
          ))}
        </div>
      ) : (
        <HomeHighlightStatus emptyMessage={emptyMessage} status={state.status} />
      )}
    </section>
  );
}

function HomeHighlightHeading({
  actionLabel,
  eyebrow,
  headingId,
  navigate,
  title,
}: {
  readonly actionLabel: string;
  readonly eyebrow: string;
  readonly headingId: string;
  readonly navigate: () => void;
  readonly title: string;
}) {
  return (
    <header className="home-highlight-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId}>{title}</h2>
      </div>
      <button className="secondary" onClick={navigate} type="button">
        {actionLabel}
      </button>
    </header>
  );
}

function homeHeadingId(title: string): string {
  return `home-${title
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')}`;
}

function HomeHighlightStatus({
  emptyMessage,
  status,
}: {
  readonly emptyMessage: string;
  readonly status: HighlightStatus;
}) {
  const message =
    status === 'loading'
      ? 'Cargando contenido publicado…'
      : status === 'error'
        ? 'No pudimos cargar esta sección. Puedes abrirla para volver a intentarlo.'
        : emptyMessage;
  return (
    <p aria-live="polite" className={`home-highlight-status is-${status}`}>
      {message}
    </p>
  );
}

export function StorePage() {
  const [items, setItems] = useState<readonly ProductCard[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>(initialFilters);
  const [games, setGames] = useState<readonly NamedReference[]>([]);
  const [categories, setCategories] = useState<readonly NamedReference[]>([]);
  const [collections, setCollections] = useState<readonly NamedReference[]>([]);
  const [languages, setLanguages] = useState<readonly string[]>([]);
  const [editions, setEditions] = useState<readonly string[]>([]);
  const [conditions, setConditions] = useState<readonly string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [message, setMessage] = useState('Cargando catálogo…');
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersVisible, setFiltersVisible] = useState(
    () =>
      typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 640px)').matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(max-width: 640px)');
    const followViewport = () => setFiltersVisible(!media.matches);
    media.addEventListener('change', followViewport);
    return () => media.removeEventListener('change', followViewport);
  }, []);
  const load = (nextFilters: CatalogFilters, cursor?: string) => {
    setLoading(true);
    setMessage(cursor === undefined ? 'Cargando catálogo…' : 'Cargando más productos…');
    const params = productParameters(nextFilters, cursor);
    void publicRequest<{ items: ProductCard[]; nextCursor: string | null }>(
      `/api/v1/catalog/products?${params}`,
    )
      .then((result) => {
        setItems((current) =>
          cursor === undefined ? result.items : [...current, ...result.items],
        );
        setNextCursor(result.nextCursor);
        setMessage(
          cursor === undefined && result.items.length === 0
            ? 'No encontramos productos con esos filtros.'
            : '',
        );
      })
      .catch((error: unknown) => setMessage(messageOf(error)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    void requestProductPage(initialFilters)
      .then((result) => {
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setMessage(result.items.length === 0 ? 'No encontramos productos con esos filtros.' : '');
      })
      .catch((error: unknown) => setMessage(messageOf(error)))
      .finally(() => setLoading(false));
    void loadFilterOptions()
      .then((options) => {
        setGames(options.games);
        setCategories(options.categories);
        setCollections(options.collections);
        setLanguages(options.languages);
        setEditions(options.editions);
        setConditions(options.conditions);
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  }, []);
  const search = (event: FormEvent) => {
    event.preventDefault();
    setDetail(null);
    load(filters);
  };
  const update = <Key extends keyof CatalogFilters>(key: Key, value: CatalogFilters[Key]) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'gameId' ? { collectionId: '' } : {}),
    }));
  };
  const removeFilter = (key: keyof CatalogFilters) => {
    const next = { ...filters, [key]: initialFilters[key] } as CatalogFilters;
    if (key === 'gameId') Object.assign(next, { collectionId: '' });
    setFilters(next);
    setDetail(null);
    load(next);
  };
  const showDetail = async (productId: string) => {
    setMessage('Cargando detalle del producto…');
    try {
      const result = await publicRequest<{ item: ProductDetail }>(
        `/api/v1/catalog/products/${productId}`,
      );
      setDetail(result.item);
      setMessage('');
    } catch (error) {
      setMessage(messageOf(error));
    }
  };
  const addToCart = async (product: ProductCard) => {
    setAddingProductId(product.productId);
    try {
      await addProductToCart(product.productId, product.preorderCampaignId);
      setMessage(`${product.name} fue agregado al carrito.`);
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setAddingProductId(null);
    }
  };
  return (
    <main className="page-frame store-page visual-public">
      <header className="section-heading catalog-heading cut-panel">
        <div>
          <p className="eyebrow">Tienda TCG</p>
          <h1>Catálogo</h1>
          <p>
            Productos regulares y preventas. Precio, stock y descuentos se confirman en servidor.
          </p>
        </div>
        <div aria-label="Garantías del catálogo" className="heading-stats">
          <span>Stock confirmado</span>
          <span>Precio de servidor</span>
        </div>
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      <div className="catalog-layout">
        <aside className="catalog-filters cut-panel" aria-label="Filtros del catálogo">
          <div className="catalog-filter-heading">
            <h2>Buscar y filtrar</h2>
            <button
              aria-controls="catalog-filter-form"
              aria-expanded={filtersVisible}
              className="catalog-filter-toggle secondary"
              onClick={() => setFiltersVisible((visible) => !visible)}
              type="button"
            >
              {filtersVisible ? 'Ocultar filtros' : 'Mostrar filtros'}
            </button>
          </div>
          {filtersVisible && (
            <form id="catalog-filter-form" onSubmit={search} role="search">
              <label>
                Buscar productos
                <input
                  minLength={2}
                  onChange={(event) => update('q', event.target.value)}
                  placeholder="Juego, producto o colección"
                  value={filters.q}
                />
              </label>
              <SelectFilter
                label="Juego"
                onChange={(value) => update('gameId', value)}
                options={games.map((item) => ({ label: item.name, value: item.gameId ?? '' }))}
                value={filters.gameId}
              />
              <SelectFilter
                label="Categoría"
                onChange={(value) => update('categoryId', value)}
                options={categories.map((item) => ({
                  label: item.name,
                  value: item.categoryId ?? '',
                }))}
                value={filters.categoryId}
              />
              <SelectFilter
                label="Colección"
                onChange={(value) => update('collectionId', value)}
                options={collections
                  .filter((item) => filters.gameId === '' || item.game?.gameId === filters.gameId)
                  .map((item) => ({ label: item.name, value: item.collectionId ?? '' }))}
                value={filters.collectionId}
              />
              <div className="filter-pair">
                <label>
                  Precio mínimo
                  <input
                    min="0"
                    onChange={(event) => update('minimumPriceClp', event.target.value)}
                    type="number"
                    value={filters.minimumPriceClp}
                  />
                </label>
                <label>
                  Precio máximo
                  <input
                    min="0"
                    onChange={(event) => update('maximumPriceClp', event.target.value)}
                    type="number"
                    value={filters.maximumPriceClp}
                  />
                </label>
              </div>
              <SelectFilter
                label="Idioma"
                onChange={(value) => update('language', value)}
                options={languages.map((value) => ({ label: value, value }))}
                value={filters.language}
              />
              <SelectFilter
                label="Edición"
                onChange={(value) => update('edition', value)}
                options={editions.map((value) => ({ label: value, value }))}
                value={filters.edition}
              />
              <SelectFilter
                label="Condición"
                onChange={(value) => update('condition', value)}
                options={conditions.map((value) => ({ label: value, value }))}
                value={filters.condition}
              />
              <SelectFilter
                label="Disponibilidad"
                onChange={(value) =>
                  update('availabilityStatus', value as CatalogFilters['availabilityStatus'])
                }
                options={[
                  { label: 'Disponible', value: 'AVAILABLE' },
                  { label: 'Últimas unidades', value: 'LAST_UNITS' },
                  { label: 'Agotado', value: 'OUT_OF_STOCK' },
                ]}
                value={filters.availabilityStatus}
              />
              <SelectFilter
                label="Tipo"
                onChange={(value) => update('saleType', value as CatalogFilters['saleType'])}
                options={[
                  { label: 'Producto regular', value: 'REGULAR' },
                  { label: 'Preventa', value: 'PREORDER' },
                ]}
                value={filters.saleType}
              />
              <SelectFilter
                label="Ordenar"
                onChange={(value) => update('sort', value as ProductSort)}
                options={[
                  { label: 'Más nuevos', value: 'NEWEST' },
                  { label: 'Nombre A–Z', value: 'NAME_ASC' },
                  { label: 'Precio menor a mayor', value: 'PRICE_ASC' },
                  { label: 'Precio mayor a menor', value: 'PRICE_DESC' },
                ]}
                value={filters.sort}
                withEmpty={false}
              />
              <button disabled={loading} type="submit">
                Aplicar filtros
              </button>
            </form>
          )}
        </aside>
        <div aria-busy={loading} className="catalog-results">
          <ActiveFilters
            displayValue={(key, value) =>
              filterDisplayValue(key, value, { categories, collections, games })
            }
            filters={filters}
            onRemove={removeFilter}
          />
          {detail && (
            <ProductDetailPanel
              detail={detail}
              key={detail.productId}
              onAdd={() => void addToCart(detail)}
              onClose={() => setDetail(null)}
              pending={addingProductId === detail.productId}
            />
          )}
          {!loading && items.length === 0 && (
            <section className="catalog-empty cut-panel" role="status">
              <p className="eyebrow">Catálogo sin resultados</p>
              <h2>No hay productos para mostrar</h2>
              <p>Revisa los filtros o intenta nuevamente cuando el catálogo esté disponible.</p>
            </section>
          )}
          <section className="card-grid" aria-label="Productos">
            {items.map((product) => (
              <ProductCardView
                key={product.productId}
                onAdd={() => void addToCart(product)}
                onDetail={() => void showDetail(product.productId)}
                pending={addingProductId === product.productId}
                product={product}
              />
            ))}
          </section>
          {nextCursor && (
            <button
              className="load-more"
              disabled={loading}
              onClick={() => load(filters, nextCursor)}
              type="button"
            >
              Cargar más productos
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function SelectFilter({
  label,
  onChange,
  options,
  value,
  withEmpty = true,
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { readonly label: string; readonly value: string }[];
  readonly value: string;
  readonly withEmpty?: boolean;
}) {
  return (
    <label>
      {label}
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {withEmpty && <option value="">Todos</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActiveFilters({
  displayValue,
  filters,
  onRemove,
}: {
  readonly displayValue: (key: keyof CatalogFilters, value: string) => string;
  readonly filters: CatalogFilters;
  readonly onRemove: (key: keyof CatalogFilters) => void;
}) {
  const active = (Object.entries(filters) as [keyof CatalogFilters, string][]).filter(
    ([key, value]) => value !== '' && !(key === 'sort' && value === 'NEWEST'),
  );
  if (active.length === 0) return null;
  return (
    <section aria-label="Filtros activos" className="active-filters">
      <strong>Filtros activos</strong>
      {active.map(([key, value]) => (
        <button key={key} onClick={() => onRemove(key)} type="button">
          {filterLabel(key, displayValue(key, value))} <span aria-hidden="true">×</span>
          <span className="visually-hidden"> Quitar filtro</span>
        </button>
      ))}
    </section>
  );
}

function ProductCardView({
  onAdd,
  onDetail,
  pending,
  product,
}: {
  readonly onAdd: () => void;
  readonly onDetail: () => void;
  readonly pending: boolean;
  readonly product: ProductCard;
}) {
  return (
    <article className="commerce-card">
      <div className="product-media">
        <img
          alt={product.primaryResource.altText}
          height={product.primaryResource.heightPx}
          loading="lazy"
          src={resourceUrl(product.primaryResource.resourceId)}
          width={product.primaryResource.widthPx}
        />
        <span className="status-chip">
          {product.saleType === 'PREORDER' ? 'Preventa' : 'Producto'}
        </span>
      </div>
      <div className="product-card-body">
        <p className="card-kicker">{product.game.name}</p>
        <h2>{product.name}</h2>
        <p className="price">${product.priceAmountClp.toLocaleString('es-CL')}</p>
        <p>{availabilityLabel(product.availabilityStatus)}</p>
        <div className="card-actions">
          <button className="secondary" onClick={onDetail} type="button">
            Ver detalle
          </button>
          <button disabled={!product.availableForPurchase || pending} onClick={onAdd} type="button">
            {pending ? 'Agregando…' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductDetailPanel({
  detail,
  onAdd,
  onClose,
  pending,
}: {
  readonly detail: ProductDetail;
  readonly onAdd: () => void;
  readonly onClose: () => void;
  readonly pending: boolean;
}) {
  const [selectedResource, setSelectedResource] = useState(detail.primaryResource);
  const resources = detail.resources ?? [detail.primaryResource];
  return (
    <section aria-labelledby="product-detail-title" className="product-detail cut-panel">
      <div className="product-gallery">
        <img
          alt={selectedResource.altText}
          height={selectedResource.heightPx}
          src={resourceUrl(selectedResource.resourceId)}
          width={selectedResource.widthPx}
        />
        {resources.length > 1 && (
          <div aria-label="Galería del producto" className="product-gallery-thumbnails">
            {resources.map((resource, index) => (
              <button
                aria-label={`Ver imagen ${index + 1}: ${resource.altText}`}
                aria-pressed={resource.resourceId === selectedResource.resourceId}
                className="product-gallery-thumbnail"
                key={resource.resourceId}
                onClick={() => setSelectedResource(resource)}
                type="button"
              >
                <img
                  alt=""
                  height={resource.heightPx}
                  loading="lazy"
                  src={resourceUrl(resource.resourceId)}
                  width={resource.widthPx}
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="eyebrow">Detalle de producto</p>
        <h2 id="product-detail-title">{detail.name}</h2>
        <p>{detail.description ?? 'Sin descripción adicional.'}</p>
        <dl className="facts">
          <dt>Juego</dt>
          <dd>{detail.game.name}</dd>
          <dt>Categoría</dt>
          <dd>{detail.category.name}</dd>
          <dt>Colección</dt>
          <dd>{detail.collection?.name ?? 'Sin colección'}</dd>
          <dt>Idioma</dt>
          <dd>{detail.language ?? 'No informado'}</dd>
          <dt>Edición</dt>
          <dd>{detail.edition ?? 'No informada'}</dd>
          <dt>Condición</dt>
          <dd>{detail.condition ?? 'No informada'}</dd>
          <dt>SKU</dt>
          <dd>{detail.sku}</dd>
          <dt>Disponibilidad</dt>
          <dd>{availabilityLabel(detail.availabilityStatus)}</dd>
        </dl>
        {detail.saleType === 'PREORDER' && (
          <section className="preorder-detail" aria-labelledby="preorder-detail-title">
            <p className="card-kicker">Condiciones de preventa</p>
            <h3 id="preorder-detail-title">Información de la campaña</h3>
            {detail.preorder == null ? (
              <p>No hay una campaña de preventa publicada actualmente.</p>
            ) : (
              <dl className="facts preorder-facts">
                <dt>Inicio</dt>
                <dd>{publicDateTime(detail.preorder.opensAt)}</dd>
                <dt>Cierre</dt>
                <dd>{publicDateTime(detail.preorder.closesAt)}</dd>
                <dt>Llegada estimada</dt>
                <dd>{detail.preorder.estimatedArrivalText}</dd>
                <dt>Cupos disponibles</dt>
                <dd>
                  {detail.preorder.availableCapacity} de {detail.preorder.capacity}
                </dd>
              </dl>
            )}
          </section>
        )}
        <p className="price">${detail.priceAmountClp.toLocaleString('es-CL')}</p>
        <div className="actions">
          <button className="secondary" onClick={onClose} type="button">
            Cerrar detalle
          </button>
          <button disabled={!detail.availableForPurchase || pending} onClick={onAdd} type="button">
            {pending ? 'Agregando…' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </section>
  );
}

async function loadFilterOptions() {
  const [gamePage, categoryPage, collectionPage, languagePage, editionPage, conditionPage] =
    await Promise.all([
      loadAllFilterItems<NamedReference>('/api/v1/catalog/tcg-games?limit=100'),
      loadAllFilterItems<NamedReference>('/api/v1/catalog/categories?limit=100'),
      loadAllFilterItems<NamedReference>('/api/v1/catalog/collections?limit=100'),
      loadAllFilterItems<string>(
        '/api/v1/catalog/product-filter-values?attribute=language&limit=100',
      ),
      loadAllFilterItems<string>(
        '/api/v1/catalog/product-filter-values?attribute=edition&limit=100',
      ),
      loadAllFilterItems<string>(
        '/api/v1/catalog/product-filter-values?attribute=condition&limit=100',
      ),
    ]);
  return {
    categories: categoryPage,
    collections: collectionPage,
    conditions: conditionPage,
    editions: editionPage,
    games: gamePage,
    languages: languagePage,
  };
}

async function loadAllFilterItems<Item>(basePath: string): Promise<readonly Item[]> {
  const items: Item[] = [];
  let cursor: string | null = null;
  do {
    const path: string =
      cursor === null ? basePath : `${basePath}&cursor=${encodeURIComponent(cursor)}`;
    const page: { items: Item[]; nextCursor: string | null } = await publicRequest(path);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return items;
}

function productParameters(filters: CatalogFilters, cursor?: string): URLSearchParams {
  const params = new URLSearchParams({ limit: '24', sort: filters.sort });
  for (const key of [
    'availabilityStatus',
    'categoryId',
    'collectionId',
    'condition',
    'edition',
    'gameId',
    'language',
    'maximumPriceClp',
    'minimumPriceClp',
    'q',
    'saleType',
  ] as const) {
    const value = filters[key].trim();
    if (value !== '') params.set(key, value);
  }
  if (cursor !== undefined) params.set('cursor', cursor);
  return params;
}

function requestProductPage(filters: CatalogFilters, cursor?: string) {
  return publicRequest<{ items: ProductCard[]; nextCursor: string | null }>(
    `/api/v1/catalog/products?${productParameters(filters, cursor)}`,
  );
}

function availabilityLabel(status: AvailabilityStatus): string {
  if (status === 'AVAILABLE') return 'Disponible';
  if (status === 'LAST_UNITS') return 'Últimas unidades';
  return 'Agotado';
}

function filterLabel(key: keyof CatalogFilters, value: string): string {
  const labels: Partial<Record<keyof CatalogFilters, string>> = {
    availabilityStatus: 'Disponibilidad',
    categoryId: 'Categoría',
    collectionId: 'Colección',
    condition: 'Condición',
    edition: 'Edición',
    gameId: 'Juego',
    language: 'Idioma',
    maximumPriceClp: 'Precio máximo',
    minimumPriceClp: 'Precio mínimo',
    q: 'Búsqueda',
    saleType: 'Tipo',
    sort: 'Orden',
  };
  return `${labels[key] ?? key}: ${value}`;
}

function filterDisplayValue(
  key: keyof CatalogFilters,
  value: string,
  references: {
    readonly categories: readonly NamedReference[];
    readonly collections: readonly NamedReference[];
    readonly games: readonly NamedReference[];
  },
): string {
  if (key === 'gameId') {
    return references.games.find((item) => item.gameId === value)?.name ?? value;
  }
  if (key === 'categoryId') {
    return references.categories.find((item) => item.categoryId === value)?.name ?? value;
  }
  if (key === 'collectionId') {
    return references.collections.find((item) => item.collectionId === value)?.name ?? value;
  }
  if (key === 'minimumPriceClp' || key === 'maximumPriceClp') {
    return `$${Number(value).toLocaleString('es-CL')}`;
  }
  const translated: Readonly<Record<string, string>> = {
    AVAILABLE: 'Disponible',
    LAST_UNITS: 'Últimas unidades',
    NAME_ASC: 'Nombre A–Z',
    OUT_OF_STOCK: 'Agotado',
    PREORDER: 'Preventa',
    PRICE_ASC: 'Precio menor a mayor',
    PRICE_DESC: 'Precio mayor a menor',
    REGULAR: 'Producto regular',
  };
  return translated[value] ?? value;
}

function resourceUrl(resourceId: string): string {
  return `/api/v1/catalog/resources/${resourceId}/content`;
}

function publicDateTime(value: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  }).format(new Date(value));
}

async function addProductToCart(
  productId: string,
  preorderCampaignId: string | null,
): Promise<void> {
  const send = currentSession() === null ? publicRequest : authorizedRequest;
  const add = () =>
    send('/api/v1/cart/lines', {
      body: JSON.stringify({ preorderCampaignId, productId, quantity: 1 }),
      headers: { 'idempotency-key': crypto.randomUUID() },
      method: 'POST',
    });
  try {
    await add();
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'CART_SESSION_REQUIRED') throw error;
    await send('/api/v1/cart', {
      body: '{}',
      headers: { 'idempotency-key': crypto.randomUUID() },
      method: 'POST',
    });
    await add();
  }
}

export function TournamentPage() {
  const [content, setContent] = useState<TournamentContentState>({
    errors: [],
    failedTypes: [],
    hall: [],
    loading: true,
    quests: [],
    tournaments: [],
  });
  const [selected, setSelected] = useState<EditorialEntry | null>(null);

  useEffect(() => {
    let active = true;
    const types = ['TOURNAMENT', 'QUEST', 'HALL_OF_FAME'] as const;
    void Promise.allSettled(
      types.map((type) =>
        publicRequest<{ items: EditorialEntry[] }>(
          `/api/v1/content?limit=24&type=${encodeURIComponent(type)}`,
        ),
      ),
    ).then((results) => {
      if (!active) return;
      const items = (index: number): EditorialEntry[] => {
        const result = results[index];
        return result?.status === 'fulfilled' ? result.value.items : [];
      };
      const errors = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [`No fue posible cargar ${tournamentTypeLabel(types[index] ?? 'TOURNAMENT')}.`]
          : [],
      );
      setContent({
        errors,
        failedTypes: results.flatMap((result, index) =>
          result.status === 'rejected' ? [types[index] ?? 'TOURNAMENT'] : [],
        ),
        hall: items(2),
        loading: false,
        quests: items(1),
        tournaments: items(0),
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const upcoming = sortByEventDate(
    content.tournaments.filter((item) => eventFromEditorial(item)?.status === 'UPCOMING'),
    'ascending',
  );
  const completed = sortByEventDate(
    content.tournaments.filter((item) => eventFromEditorial(item)?.status === 'COMPLETED'),
    'descending',
  );
  const legacy = content.tournaments.filter((item) => eventFromEditorial(item) === null);

  if (selected !== null) {
    const event = eventFromEditorial(selected);
    return (
      <main className="page-frame editorial-page visual-public">
        <article className="editorial-reader cut-panel">
          <button className="button-secondary" onClick={() => setSelected(null)} type="button">
            Volver a torneos y eventos
          </button>
          <p className="card-kicker">{tournamentTypeLabel(selected.type)}</p>
          <h1>{selected.title}</h1>
          {event && <p className="tournament-date">{publicDateTime(event.startsAt)}</p>}
          <p className="editorial-reader-excerpt">{selected.excerpt}</p>
          <EditorialDocumentView
            document={documentFromMetadata(
              selected.metadata,
              selected.body,
              selected.editorialEntryId,
            )}
          />
        </article>
      </main>
    );
  }

  return (
    <main className="page-frame editorial-page tournament-page visual-public">
      <header className="section-heading editorial-heading cut-panel">
        <div>
          <p className="eyebrow">Juego organizado Sergod</p>
          <h1>Torneos y comunidad</h1>
          <p>
            Próximos encuentros, resultados, podios, Quests y reconocimientos publicados por la
            tienda. Esta sección es informativa y no administra rondas ni emparejamientos.
          </p>
        </div>
        <div aria-label="Características de la sección" className="heading-stats">
          <span>Información oficial</span>
          <span>Resultados y fotos</span>
        </div>
      </header>
      <p aria-live="polite" className="status">
        {content.loading ? 'Cargando torneos y eventos…' : content.errors.join(' ')}
      </p>
      {!content.loading && (
        <div className="tournament-sections">
          {!content.failedTypes.includes('TOURNAMENT') && (
            <>
              <TournamentEditorialSection
                empty="Aún no hay próximos torneos publicados."
                items={upcoming}
                onSelect={setSelected}
                section="upcoming"
                title="Próximos torneos"
              />
              <TournamentEditorialSection
                empty="Aún no hay torneos realizados publicados."
                items={completed}
                onSelect={setSelected}
                section="completed"
                title="Torneos realizados"
              />
              {legacy.length > 0 && (
                <TournamentEditorialSection
                  empty=""
                  items={legacy}
                  onSelect={setSelected}
                  section="legacy"
                  title="Información de torneos"
                />
              )}
            </>
          )}
          {!content.failedTypes.includes('QUEST') && (
            <TournamentEditorialSection
              empty="Aún no hay Eventos o Quests publicados."
              items={content.quests}
              onSelect={setSelected}
              section="quests"
              title="Eventos y Quests"
            />
          )}
          {!content.failedTypes.includes('HALL_OF_FAME') && (
            <TournamentEditorialSection
              empty="Aún no hay reconocimientos publicados."
              items={content.hall}
              onSelect={setSelected}
              section="hall"
              title="Hall of Fame"
            />
          )}
        </div>
      )}
    </main>
  );
}

function TournamentEditorialSection({
  empty,
  items,
  onSelect,
  section,
  title,
}: {
  readonly empty: string;
  readonly items: readonly EditorialEntry[];
  readonly onSelect: (item: EditorialEntry) => void;
  readonly section: TournamentSection;
  readonly title: string;
}) {
  return (
    <section aria-labelledby={`tournament-${section}`} className="tournament-section cut-panel">
      <div className="tournament-section-heading">
        <p className="eyebrow">Archivo oficial</p>
        <h2 id={`tournament-${section}`}>{title}</h2>
      </div>
      {items.length > 0 ? (
        <div className="editorial-grid">
          {items.map((item, index) => {
            const event = eventFromEditorial(item);
            return (
              <article className="editorial-card" key={item.editorialEntryId}>
                <span aria-hidden="true" className="editorial-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="card-kicker">{tournamentTypeLabel(item.type)}</p>
                <h3>{item.title}</h3>
                {event && <p className="tournament-date">{publicDateTime(event.startsAt)}</p>}
                <p>{item.excerpt}</p>
                <button onClick={() => onSelect(item)} type="button">
                  Ver detalle
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="tournament-section-empty">{empty}</p>
      )}
    </section>
  );
}

function eventFromEditorial(
  item: EditorialEntry,
): { readonly startsAt: string; readonly status: 'COMPLETED' | 'UPCOMING' } | null {
  const event = item.metadata.event;
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return null;
  const startsAt = 'startsAt' in event ? event.startsAt : null;
  const status = 'status' in event ? event.status : null;
  if (
    typeof startsAt !== 'string' ||
    Number.isNaN(new Date(startsAt).getTime()) ||
    (status !== 'UPCOMING' && status !== 'COMPLETED')
  )
    return null;
  return { startsAt, status };
}

function tournamentTypeLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    HALL_OF_FAME: 'Hall of Fame',
    QUEST: 'Quest',
    TOURNAMENT: 'Torneo',
  };
  return labels[type] ?? 'Publicación';
}

function sortByEventDate(
  items: readonly EditorialEntry[],
  direction: 'ascending' | 'descending',
): EditorialEntry[] {
  return [...items].sort((left, right) => {
    const leftTime = new Date(eventFromEditorial(left)?.startsAt ?? 0).getTime();
    const rightTime = new Date(eventFromEditorial(right)?.startsAt ?? 0).getTime();
    return direction === 'ascending' ? leftTime - rightTime : rightTime - leftTime;
  });
}

export function NewsPage() {
  const [items, setItems] = useState<readonly EditorialEntry[]>([]);
  const [category, setCategory] = useState('Todas');
  const [selected, setSelected] = useState<EditorialEntry | null>(null);
  const [message, setMessage] = useState('Cargando noticias…');

  useEffect(() => {
    let active = true;
    void publicRequest<{ items: EditorialEntry[] }>('/api/v1/content?limit=24&type=NEWS')
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setMessage(result.items.length === 0 ? 'Todavía no hay noticias publicadas.' : '');
      })
      .catch((error: unknown) => {
        if (active) setMessage(messageOf(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = [...new Set(items.map(newsCategory))].sort((left, right) =>
    left.localeCompare(right, 'es'),
  );
  const visible =
    category === 'Todas' ? items : items.filter((item) => newsCategory(item) === category);
  const featured = visible[0];

  if (selected !== null) {
    return (
      <main className="page-frame editorial-page visual-public">
        <article className="editorial-reader cut-panel">
          <button className="button-secondary" onClick={() => setSelected(null)} type="button">
            Volver a noticias
          </button>
          <p className="card-kicker">{newsCategory(selected)}</p>
          <h1>{selected.title}</h1>
          {validEditorialDate(selected.publishedAt) && (
            <p className="news-date">Publicada el {publicDateTime(selected.publishedAt ?? '')}</p>
          )}
          <p className="editorial-reader-excerpt">{selected.excerpt}</p>
          <EditorialDocumentView
            document={documentFromMetadata(
              selected.metadata,
              selected.body,
              selected.editorialEntryId,
            )}
          />
        </article>
      </main>
    );
  }

  return (
    <main className="page-frame editorial-page news-page visual-public">
      <header className="section-heading editorial-heading cut-panel">
        <div>
          <p className="eyebrow">Actualidad Sergod</p>
          <h1>Noticias</h1>
          <p>
            Novedades oficiales de la tienda y de la comunidad, organizadas para encontrarlas
            fácilmente.
          </p>
        </div>
        <div aria-label="Características de la sección" className="heading-stats">
          <span>Portada editorial</span>
          <span>Artículos completos</span>
        </div>
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      {items.length > 0 && (
        <>
          <nav aria-label="Categorías de noticias" className="news-categories">
            {['Todas', ...categories].map((option) => (
              <button
                aria-pressed={category === option}
                key={option}
                onClick={() => setCategory(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </nav>
          {featured ? (
            <>
              <NewsFeaturedCard item={featured} onSelect={setSelected} />
              {visible.length > 1 && (
                <section aria-label="Más noticias" className="editorial-grid news-grid">
                  {visible.slice(1).map((item) => (
                    <NewsCard item={item} key={item.editorialEntryId} onSelect={setSelected} />
                  ))}
                </section>
              )}
            </>
          ) : (
            <section className="editorial-empty cut-panel" role="status">
              <h2>No hay noticias en esta categoría</h2>
              <p>Selecciona otra categoría para revisar las publicaciones disponibles.</p>
            </section>
          )}
        </>
      )}
      {items.length === 0 && message !== 'Cargando noticias…' && (
        <section className="editorial-empty cut-panel" role="status">
          <p className="eyebrow">Portada editorial</p>
          <h2>Aún no hay noticias para mostrar</h2>
          <p>Las publicaciones oficiales aparecerán aquí cuando la tienda las publique.</p>
        </section>
      )}
    </main>
  );
}

export function CommunityPage({ navigate }: { readonly navigate: (route: HomeRoute) => void }) {
  const [items, setItems] = useState<readonly EditorialEntry[]>([]);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [selected, setSelected] = useState<EditorialEntry | null>(null);
  const [message, setMessage] = useState('Cargando comunidad e información local…');

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      publicRequest<{ items: EditorialEntry[] }>('/api/v1/content?limit=24&type=COMMUNITY'),
      publicRequest<{ item: unknown }>('/api/v1/service-coverage/store'),
    ]).then(([editorialResult, storeResult]) => {
      if (!active) return;
      const editorialItems =
        editorialResult.status === 'fulfilled' ? editorialResult.value.items : [];
      if (editorialResult.status === 'fulfilled') setItems(editorialItems);
      if (storeResult.status === 'fulfilled') setStore(firstStore(storeResult.value.item));
      const failures = [
        editorialResult.status === 'rejected' ? 'las actividades de comunidad' : '',
        storeResult.status === 'rejected' ? 'la información local' : '',
      ].filter(Boolean);
      setMessage(
        failures.length > 0
          ? `No fue posible cargar ${failures.join(' ni ')}.`
          : editorialItems.length === 0
            ? 'Todavía no hay actividades publicadas.'
            : '',
      );
    });
    return () => {
      active = false;
    };
  }, []);

  if (selected !== null) {
    return (
      <main className="page-frame editorial-page visual-public">
        <article className="editorial-reader cut-panel">
          <button className="button-secondary" onClick={() => setSelected(null)} type="button">
            Volver a comunidad
          </button>
          <p className="card-kicker">Comunidad Sergod</p>
          <h1>{selected.title}</h1>
          <p className="editorial-reader-excerpt">{selected.excerpt}</p>
          <EditorialDocumentView
            document={documentFromMetadata(
              selected.metadata,
              selected.body,
              selected.editorialEntryId,
            )}
          />
        </article>
      </main>
    );
  }

  return (
    <main className="page-frame editorial-page community-page visual-public">
      <header className="section-heading editorial-heading cut-panel">
        <div>
          <p className="eyebrow">La comunidad Sergod</p>
          <h1>Juega, comparte y participa</h1>
          <p>
            Actividades, juegos y encuentros publicados por Sergod Store, junto con la información
            real para visitarnos o contactarnos.
          </p>
        </div>
        <div aria-label="Accesos de comunidad" className="heading-stats">
          <button onClick={() => navigate('/tournaments')} type="button">
            Torneos y Quests
          </button>
          <button onClick={() => navigate('/comics')} type="button">
            Cómics e historias
          </button>
        </div>
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      <section aria-labelledby="community-activities" className="community-activities cut-panel">
        <div className="tournament-section-heading">
          <p className="eyebrow">Juegos y actividades</p>
          <h2 id="community-activities">Lo que está pasando en Sergod</h2>
        </div>
        {items.length > 0 ? (
          <div className="editorial-grid">
            {items.map((item) => (
              <CommunityCard item={item} key={item.editorialEntryId} onSelect={setSelected} />
            ))}
          </div>
        ) : (
          <p className="tournament-section-empty">
            Las actividades aparecerán aquí cuando sean publicadas por la tienda.
          </p>
        )}
      </section>
      <CommunityStoreCard store={store} />
    </main>
  );
}

function CommunityCard({
  item,
  onSelect,
}: {
  readonly item: EditorialEntry;
  readonly onSelect: (item: EditorialEntry) => void;
}) {
  const cover = firstEditorialImage(item);
  return (
    <article className="editorial-card news-card">
      {cover && (
        <img alt={cover.altText} className="news-card-cover" src={resourceUrl(cover.resourceId)} />
      )}
      <p className="card-kicker">Comunidad</p>
      <h3>{item.title}</h3>
      <p>{item.excerpt}</p>
      <button onClick={() => onSelect(item)} type="button">
        Ver actividad
      </button>
    </article>
  );
}

function CommunityStoreCard({ store }: { readonly store: StoreSummary | null }) {
  const email = store?.publicContacts?.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u)?.[0];
  const phone = store?.publicContacts?.match(/\+\d[\d\s-]{7,}/u)?.[0];
  const whatsappDigits = phone?.replace(/\D/gu, '');
  return (
    <section aria-labelledby="community-store" className="community-store cut-panel">
      <div>
        <p className="eyebrow">Información local</p>
        <h2 id="community-store">{store?.name ?? 'Sergod Store'}</h2>
        {store ? (
          <dl className="community-store-details">
            {store.publicAddress && (
              <>
                <dt>Dirección</dt>
                <dd>{store.publicAddress}</dd>
              </>
            )}
            {store.openingHours && (
              <>
                <dt>Horario</dt>
                <dd>{store.openingHours}</dd>
              </>
            )}
            {store.publicContacts && (
              <>
                <dt>Contacto</dt>
                <dd>{store.publicContacts}</dd>
              </>
            )}
            {store.directions && (
              <>
                <dt>Cómo llegar</dt>
                <dd>{store.directions}</dd>
              </>
            )}
          </dl>
        ) : (
          <p>La información local no está disponible en este momento.</p>
        )}
      </div>
      {(whatsappDigits || email || store?.mapUrl) && (
        <div aria-label="Enlaces de contacto" className="community-contact-actions">
          {whatsappDigits && (
            <a href={`https://wa.me/${whatsappDigits}`} rel="noreferrer" target="_blank">
              WhatsApp
            </a>
          )}
          {email && <a href={`mailto:${email}`}>Correo</a>}
          {store?.mapUrl && (
            <a href={store.mapUrl} rel="noreferrer" target="_blank">
              Ver mapa
            </a>
          )}
        </div>
      )}
    </section>
  );
}

export function ComicsPage() {
  const [series, setSeries] = useState<readonly EditorialEntry[]>([]);
  const [chapters, setChapters] = useState<readonly EditorialEntry[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<EditorialEntry | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<EditorialEntry | null>(null);
  const [message, setMessage] = useState('Cargando cómics e historias…');

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      publicRequest<{ items: EditorialEntry[] }>('/api/v1/content?limit=100&type=COMIC_SERIES'),
      publicRequest<{ items: EditorialEntry[] }>('/api/v1/content?limit=100&type=COMIC_CHAPTER'),
    ]).then(([seriesResult, chapterResult]) => {
      if (!active) return;
      const seriesItems = seriesResult.status === 'fulfilled' ? seriesResult.value.items : [];
      const chapterItems = chapterResult.status === 'fulfilled' ? chapterResult.value.items : [];
      setSeries(seriesItems);
      setChapters(chapterItems);
      const failures = [
        seriesResult.status === 'rejected' ? 'las series' : '',
        chapterResult.status === 'rejected' ? 'los capítulos' : '',
      ].filter(Boolean);
      setMessage(
        failures.length > 0
          ? `No fue posible cargar ${failures.join(' ni ')}.`
          : seriesItems.length === 0 && chapterItems.length === 0
            ? 'Todavía no hay cómics publicados.'
            : '',
      );
    });
    return () => {
      active = false;
    };
  }, []);

  if (selectedChapter !== null) {
    const comic = comicFromEditorial(selectedChapter);
    return (
      <main className="page-frame editorial-page comic-reader-page visual-public">
        <article className="editorial-reader cut-panel">
          <button
            className="button-secondary"
            onClick={() => setSelectedChapter(null)}
            type="button"
          >
            Volver a capítulos
          </button>
          <p className="card-kicker">{comic ? `Capítulo ${comic.chapterNumber}` : 'Capítulo'}</p>
          <h1>{selectedChapter.title}</h1>
          <p className="editorial-reader-excerpt">{selectedChapter.excerpt}</p>
          <EditorialDocumentView
            document={documentFromMetadata(
              selectedChapter.metadata,
              selectedChapter.body,
              selectedChapter.editorialEntryId,
            )}
          />
        </article>
      </main>
    );
  }

  if (selectedSeries !== null) {
    const seriesChapters = chapters
      .filter((chapter) => comicFromEditorial(chapter)?.seriesSlug === selectedSeries.slug)
      .sort(
        (left, right) =>
          (comicFromEditorial(left)?.chapterNumber ?? 0) -
          (comicFromEditorial(right)?.chapterNumber ?? 0),
      );
    return (
      <main className="page-frame editorial-page comics-page visual-public">
        <button
          className="button-secondary comics-back"
          onClick={() => setSelectedSeries(null)}
          type="button"
        >
          Volver a series
        </button>
        <section className="comic-series-detail cut-panel">
          <p className="eyebrow">Serie</p>
          <h1>{selectedSeries.title}</h1>
          <p className="editorial-reader-excerpt">{selectedSeries.excerpt}</p>
          <EditorialDocumentView
            document={documentFromMetadata(
              selectedSeries.metadata,
              selectedSeries.body,
              selectedSeries.editorialEntryId,
            )}
          />
        </section>
        <section aria-labelledby="comic-chapters" className="comic-chapters cut-panel">
          <div className="tournament-section-heading">
            <p className="eyebrow">Lectura</p>
            <h2 id="comic-chapters">Capítulos</h2>
          </div>
          {seriesChapters.length > 0 ? (
            <div className="editorial-grid">
              {seriesChapters.map((chapter) => (
                <ComicChapterCard
                  chapter={chapter}
                  key={chapter.editorialEntryId}
                  onSelect={setSelectedChapter}
                />
              ))}
            </div>
          ) : (
            <p className="tournament-section-empty">
              Esta serie aún no tiene capítulos publicados.
            </p>
          )}
        </section>
      </main>
    );
  }

  const knownSeries = new Set(series.map((item) => item.slug));
  const unlinkedChapters = chapters.filter((chapter) => {
    const comic = comicFromEditorial(chapter);
    return comic === null || !knownSeries.has(comic.seriesSlug);
  });

  return (
    <main className="page-frame editorial-page comics-page visual-public">
      <header className="section-heading editorial-heading cut-panel">
        <div>
          <p className="eyebrow">Historias Sergod</p>
          <h1>Cómics e historias</h1>
          <p>Explora las series publicadas por la tienda y lee sus capítulos completos en orden.</p>
        </div>
        <div aria-label="Características de la sección" className="heading-stats">
          <span>Series y capítulos</span>
          <span>Lector con imágenes</span>
        </div>
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      {series.length > 0 ? (
        <section aria-labelledby="comic-series" className="comic-series-list">
          <h2 className="visually-hidden" id="comic-series">
            Series publicadas
          </h2>
          <div className="editorial-grid comic-series-grid">
            {series.map((item) => (
              <ComicSeriesCard
                chapterCount={
                  chapters.filter(
                    (chapter) => comicFromEditorial(chapter)?.seriesSlug === item.slug,
                  ).length
                }
                item={item}
                key={item.editorialEntryId}
                onSelect={setSelectedSeries}
              />
            ))}
          </div>
        </section>
      ) : message !== 'Cargando cómics e historias…' ? (
        <section className="editorial-empty cut-panel" role="status">
          <p className="eyebrow">Portada de cómics</p>
          <h2>Aún no hay series para mostrar</h2>
          <p>Las series aparecerán aquí cuando la tienda las publique.</p>
        </section>
      ) : null}
      {unlinkedChapters.length > 0 && (
        <section aria-labelledby="unlinked-chapters" className="comic-chapters cut-panel">
          <div className="tournament-section-heading">
            <p className="eyebrow">Archivo anterior</p>
            <h2 id="unlinked-chapters">Capítulos por organizar</h2>
          </div>
          <p>Estos capítulos siguen disponibles mientras se asignan a su serie correcta.</p>
          <div className="editorial-grid">
            {unlinkedChapters.map((chapter) => (
              <ComicChapterCard
                chapter={chapter}
                key={chapter.editorialEntryId}
                onSelect={setSelectedChapter}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function ComicSeriesCard({
  chapterCount,
  item,
  onSelect,
}: {
  readonly chapterCount: number;
  readonly item: EditorialEntry;
  readonly onSelect: (item: EditorialEntry) => void;
}) {
  const cover = firstEditorialImage(item);
  return (
    <article className="comic-series-card cut-panel">
      {cover ? (
        <img alt={cover.altText} src={resourceUrl(cover.resourceId)} />
      ) : (
        <div aria-hidden="true" className="comic-cover-placeholder">
          SERGOD
        </div>
      )}
      <div>
        <p className="card-kicker">
          Serie · {chapterCount} {chapterCount === 1 ? 'capítulo' : 'capítulos'}
        </p>
        <h2>{item.title}</h2>
        <p>{item.excerpt}</p>
        <button onClick={() => onSelect(item)} type="button">
          Ver serie
        </button>
      </div>
    </article>
  );
}

function ComicChapterCard({
  chapter,
  onSelect,
}: {
  readonly chapter: EditorialEntry;
  readonly onSelect: (item: EditorialEntry) => void;
}) {
  const cover = firstEditorialImage(chapter);
  const comic = comicFromEditorial(chapter);
  return (
    <article className="editorial-card news-card">
      {cover && (
        <img alt={cover.altText} className="news-card-cover" src={resourceUrl(cover.resourceId)} />
      )}
      <p className="card-kicker">{comic ? `Capítulo ${comic.chapterNumber}` : 'Capítulo'}</p>
      <h3>{chapter.title}</h3>
      <p>{chapter.excerpt}</p>
      <button onClick={() => onSelect(chapter)} type="button">
        Leer capítulo
      </button>
    </article>
  );
}

function comicFromEditorial(
  item: EditorialEntry,
): { readonly chapterNumber: number; readonly seriesSlug: string } | null {
  const comic = item.metadata.comic;
  if (typeof comic !== 'object' || comic === null || Array.isArray(comic)) return null;
  const chapterNumber = 'chapterNumber' in comic ? comic.chapterNumber : null;
  const seriesSlug = 'seriesSlug' in comic ? comic.seriesSlug : null;
  if (
    typeof chapterNumber !== 'number' ||
    !Number.isInteger(chapterNumber) ||
    chapterNumber < 1 ||
    typeof seriesSlug !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(seriesSlug)
  )
    return null;
  return { chapterNumber, seriesSlug };
}

function NewsFeaturedCard({
  item,
  onSelect,
}: {
  readonly item: EditorialEntry;
  readonly onSelect: (item: EditorialEntry) => void;
}) {
  const cover = firstEditorialImage(item);
  return (
    <article className={`news-feature cut-panel${cover ? ' has-cover' : ''}`}>
      {cover && <img alt={cover.altText} src={resourceUrl(cover.resourceId)} />}
      <div>
        <p className="card-kicker">Portada · {newsCategory(item)}</p>
        <h2>{item.title}</h2>
        <p>{item.excerpt}</p>
        <button onClick={() => onSelect(item)} type="button">
          Leer artículo
        </button>
      </div>
    </article>
  );
}

function NewsCard({
  item,
  onSelect,
}: {
  readonly item: EditorialEntry;
  readonly onSelect: (item: EditorialEntry) => void;
}) {
  const cover = firstEditorialImage(item);
  return (
    <article className="editorial-card news-card">
      {cover && (
        <img alt={cover.altText} className="news-card-cover" src={resourceUrl(cover.resourceId)} />
      )}
      <p className="card-kicker">{newsCategory(item)}</p>
      <h2>{item.title}</h2>
      <p>{item.excerpt}</p>
      <button onClick={() => onSelect(item)} type="button">
        Leer artículo
      </button>
    </article>
  );
}

function newsCategory(item: EditorialEntry): string {
  const category = item.metadata.category;
  return typeof category === 'string' && category.trim() ? category.trim() : 'General';
}

function firstEditorialImage(item: EditorialEntry) {
  return documentFromMetadata(item.metadata, item.body, item.editorialEntryId).blocks.find(
    (block) => block.type === 'IMAGE',
  );
}

function validEditorialDate(value: string | undefined): boolean {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

export function EditorialPage({ type, title }: { readonly type: string; readonly title: string }) {
  const [items, setItems] = useState<readonly EditorialEntry[]>([]);
  const [selected, setSelected] = useState<EditorialEntry | null>(null);
  const [message, setMessage] = useState('Cargando contenido…');
  useEffect(() => {
    void publicRequest<{ items: EditorialEntry[] }>(
      `/api/v1/content?limit=24&type=${encodeURIComponent(type)}`,
    )
      .then((result) => {
        setItems(result.items);
        setMessage(result.items.length === 0 ? 'Todavía no hay publicaciones.' : '');
      })
      .catch((error: unknown) => setMessage(messageOf(error)));
  }, [type]);
  const visibleSelected = selected?.type === type ? selected : null;
  const sectionDescription =
    type === 'TOURNAMENT'
      ? 'Calendario, resultados y podios informativos; no administra rondas.'
      : 'Publicaciones de Sergod Store para mantenerte al día con la comunidad TCG.';
  return (
    <main className="page-frame editorial-page visual-public">
      <header className="section-heading editorial-heading cut-panel">
        <div>
          <p className="eyebrow">Sergod editorial</p>
          <h1>{title}</h1>
          <p>{sectionDescription}</p>
        </div>
        <div aria-label="Características de la sección" className="heading-stats">
          <span>Contenido oficial</span>
          <span>Lectura pública</span>
        </div>
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      {visibleSelected !== null && (
        <article className="editorial-reader cut-panel">
          <button className="button-secondary" onClick={() => setSelected(null)} type="button">
            Volver a publicaciones
          </button>
          <p className="card-kicker">{visibleSelected.type.replaceAll('_', ' ')}</p>
          <h2>{visibleSelected.title}</h2>
          <p className="editorial-reader-excerpt">{visibleSelected.excerpt}</p>
          <EditorialDocumentView
            document={documentFromMetadata(
              visibleSelected.metadata,
              visibleSelected.body,
              visibleSelected.editorialEntryId,
            )}
          />
        </article>
      )}
      {items.length > 0 ? (
        <section aria-label={`Publicaciones de ${title}`} className="editorial-grid">
          {items.map((item, index) => (
            <article className="editorial-card" key={item.editorialEntryId}>
              <span aria-hidden="true" className="editorial-index">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="card-kicker">{item.type.replaceAll('_', ' ')}</p>
              <h2>{item.title}</h2>
              <p>{item.excerpt}</p>
              <button onClick={() => setSelected(item)} type="button">
                Leer publicación
              </button>
            </article>
          ))}
        </section>
      ) : message !== 'Cargando contenido…' ? (
        <section className="editorial-empty cut-panel" role="status">
          <p className="eyebrow">Archivo editorial</p>
          <h2>Aún no hay publicaciones para mostrar</h2>
          <p>Vuelve pronto para revisar las novedades oficiales de Sergod Store.</p>
        </section>
      ) : null}
    </main>
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible cargar esta sección.';
}
