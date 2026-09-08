import { type FormEvent, useEffect, useState } from 'react';

import { ApiError, authorizedRequest, currentSession, publicRequest } from '../identity/api.js';
import { EditorialDocumentView } from '../editorial/EditorialDocument.js';
import { documentFromMetadata } from '../editorial/editorial-document-model.js';

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
  readonly slug: string;
  readonly title: string;
  readonly type: string;
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
          <form onSubmit={search} role="search">
            <h2>Buscar y filtrar</h2>
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
  return (
    <section aria-labelledby="product-detail-title" className="product-detail cut-panel">
      <img
        alt={detail.primaryResource.altText}
        height={detail.primaryResource.heightPx}
        src={resourceUrl(detail.primaryResource.resourceId)}
        width={detail.primaryResource.widthPx}
      />
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
