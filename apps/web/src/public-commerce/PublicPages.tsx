import { type FormEvent, useEffect, useState } from 'react';

import { ApiError, authorizedRequest, currentSession, publicRequest } from '../identity/api.js';

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
  readonly editorialEntryId: string;
  readonly excerpt: string;
  readonly slug: string;
  readonly title: string;
  readonly type: string;
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
  return (
    <main className="page-frame">
      <header className="section-heading cut-panel">
        <p className="eyebrow">Sergod editorial</p>
        <h1>{title}</h1>
        {type === 'TOURNAMENT' && (
          <p>Calendario, resultados y podios informativos; no administra rondas.</p>
        )}
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      <section className="editorial-grid">
        {items.map((item) => (
          <article className="editorial-card" key={item.editorialEntryId}>
            <p className="card-kicker">{item.type.replaceAll('_', ' ')}</p>
            <h2>{item.title}</h2>
            <p>{item.excerpt}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible cargar esta sección.';
}
