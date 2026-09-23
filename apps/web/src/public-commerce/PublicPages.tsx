import { type FormEvent, useEffect, useMemo, useState } from 'react';

import { ApiError, authorizedRequest, currentSession, publicRequest } from '../identity/api.js';
import { EditorialDocumentView } from '../editorial/EditorialDocument.js';
import { documentFromMetadata } from '../editorial/editorial-document-model.js';
import { AppearanceElement } from '../appearance/SiteAppearance.js';
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
    readonly maxPerCustomer?: number | null;
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
type CommunityRoute = '/community' | '/community/visit' | '/news' | '/quests' | '/tournaments';
type HighlightStatus = 'error' | 'loading' | 'ready';

interface HighlightState<T> {
  readonly items: readonly T[];
  readonly status: HighlightStatus;
}

const loadingHighlights = { items: [], status: 'loading' } as const;

type SectionPreviewKind =
  'comics' | 'community' | 'news' | 'preorders' | 'quests' | 'shop' | 'tournaments';

const sectionPreviewCopy: Readonly<
  Record<
    SectionPreviewKind,
    readonly { readonly detail: string; readonly kicker: string; readonly title: string }[]
  >
> = {
  comics: [
    {
      detail: 'Portada, descripción y cantidad de capítulos.',
      kicker: 'Serie · Muestra visual',
      title: 'Crónicas Sergod',
    },
    {
      detail: 'Número, portada y acceso al lector.',
      kicker: 'Capítulo 01 · Muestra visual',
      title: 'La primera partida',
    },
    {
      detail: 'Páginas e imágenes en secuencia de lectura.',
      kicker: 'Lector · Muestra visual',
      title: 'Historia en imágenes',
    },
  ],
  community: [
    {
      detail: 'Imagen, resumen y acceso al detalle.',
      kicker: 'Actividad · Muestra visual',
      title: 'Tarde de comunidad',
    },
    {
      detail: 'Torneos y Quests conectados con su propia sección.',
      kicker: 'Agenda · Muestra visual',
      title: 'Próximos encuentros',
    },
    {
      detail: 'Dirección, horario, contacto y mapa de la única tienda.',
      kicker: 'Copiapó · Información real',
      title: 'Visita Sergod Store',
    },
  ],
  news: [
    {
      detail: 'Imagen principal, categoría y resumen editorial.',
      kicker: 'Destacada · Muestra visual',
      title: 'Novedades en Sergod Store',
    },
    {
      detail: 'Tarjetas ordenadas con portada y acceso al artículo.',
      kicker: 'Comunidad · Muestra visual',
      title: 'Lo que está pasando',
    },
    {
      detail: 'Texto e imágenes por bloques dentro de la publicación.',
      kicker: 'Artículo · Muestra visual',
      title: 'Información completa',
    },
  ],
  preorders: [
    {
      detail: 'Imagen, nombre y precio confirmado por el servidor.',
      kicker: 'Próximo lanzamiento · Muestra',
      title: 'Producto en preventa',
    },
    {
      detail: 'Ventana, fecha estimada y condiciones publicadas.',
      kicker: 'Llegada estimada · Muestra',
      title: 'Información de reserva',
    },
    {
      detail: 'Capacidad disponible sin exponer datos internos.',
      kicker: 'Cupos · Muestra visual',
      title: 'Disponibilidad confirmada',
    },
  ],
  quests: [
    {
      detail: 'Imagen editorial, resumen y acceso al detalle.',
      kicker: 'Quest activa · Muestra visual',
      title: 'Desafío de la comunidad',
    },
    {
      detail: 'Información oficial preparada por Sergod Store.',
      kicker: 'Información · Muestra visual',
      title: 'Objetivo y contexto',
    },
    {
      detail: 'Archivo de desafíos anteriores cuando exista contenido.',
      kicker: 'Archivo · Muestra visual',
      title: 'Quests anteriores',
    },
  ],
  shop: [
    {
      detail: 'Imagen principal, nombre, precio y disponibilidad.',
      kicker: 'Disponible · Muestra visual',
      title: 'Producto TCG de ejemplo',
    },
    {
      detail: 'Galería, descripción, idioma, edición, condición y SKU.',
      kicker: 'Detalle · Muestra visual',
      title: 'Galería del producto',
    },
    {
      detail: 'Búsqueda, filtros y ordenamiento sobre datos reales.',
      kicker: 'Catálogo · Muestra visual',
      title: 'Explora por juego',
    },
  ],
  tournaments: [
    {
      detail: 'Fecha, portada, resumen y acceso al detalle.',
      kicker: 'Próximo · Muestra visual',
      title: 'Encuentro Sergod',
    },
    {
      detail: 'Resultados, podio, fotografías y resumen.',
      kicker: 'Finalizado · Muestra visual',
      title: 'Resultados del torneo',
    },
    {
      detail: 'Reconocimientos publicados por la tienda.',
      kicker: 'Reconocimiento · Muestra visual',
      title: 'Hall of Fame',
    },
  ],
};

function SectionPreview({ kind }: { readonly kind: SectionPreviewKind }) {
  return (
    <section
      aria-label="Ejemplo de la estructura de esta sección"
      className="section-preview"
      data-section={kind}
    >
      <div className="section-preview-heading">
        <span>Vista de ejemplo</span>
        <strong>El contenido real aparecerá aquí al publicarlo desde Admin</strong>
      </div>
      <div className="section-preview-grid">
        {sectionPreviewCopy[kind].map((item, index) => (
          <article className="section-preview-card" key={item.title}>
            <div aria-hidden="true" className="section-preview-art">
              <span>{String(index + 1).padStart(2, '0')}</span>
            </div>
            <span className="section-preview-kicker">{item.kicker}</span>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

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

export function StorePage({ view = 'catalog' }: { readonly view?: 'catalog' | 'preorders' }) {
  const defaultFilters = useMemo<CatalogFilters>(
    () =>
      view === 'preorders'
        ? { ...initialFilters, saleType: 'PREORDER' }
        : { ...initialFilters, saleType: 'REGULAR' },
    [view],
  );
  const [items, setItems] = useState<readonly ProductCard[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>(defaultFilters);
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
  const [cartRevision, setCartRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtersVisible, setFiltersVisible] = useState(false);
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
    void requestProductPage(defaultFilters)
      .then((result) => {
        setItems(result.items);
        setNextCursor(result.nextCursor);
        setMessage(result.items.length === 0 ? 'No encontramos productos con esos filtros.' : '');
      })
      .catch((error: unknown) => setMessage(messageOf(error)))
      .finally(() => setLoading(false));
    if (view === 'preorders') return;
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
  }, [defaultFilters, view]);
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
    const next = { ...filters, [key]: defaultFilters[key] } as CatalogFilters;
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
      setCartRevision((revision) => revision + 1);
      setMessage(`${product.name} fue agregado al carrito.`);
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setAddingProductId(null);
    }
  };
  if (view === 'preorders') {
    const featured = items[0];
    return (
      <main className="page-frame store-page preorders-store-page visual-public preorder-reference-page">
        <header className="section-heading catalog-heading preorder-reference-heading">
          <h1>Preventas</h1>
        </header>
        {message && (
          <p aria-live="polite" className="status preorder-reference-status">
            {message}
          </p>
        )}
        <div aria-busy={loading} className="preorder-reference-content">
          <PreorderReferenceCard
            featured
            onDetail={featured ? () => void showDetail(featured.productId) : undefined}
            product={featured}
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
          <section aria-label="Preventas" className="preorder-reference-grid">
            {items.slice(1).map((product) => (
              <PreorderReferenceCard
                key={product.productId}
                onDetail={() => void showDetail(product.productId)}
                product={product}
              />
            ))}
            {!loading &&
              items.length === 0 &&
              Array.from({ length: 4 }, (_, index) => (
                <PreorderReferenceCard key={`sample-${index}`} />
              ))}
          </section>
          {nextCursor && (
            <button
              className="load-more"
              disabled={loading}
              onClick={() => load(filters, nextCursor)}
              type="button"
            >
              Cargar más preventas
            </button>
          )}
        </div>
      </main>
    );
  }
  return (
    <main className={`page-frame store-page ${view}-store-page visual-public`}>
      <header className="section-heading catalog-heading cut-panel">
        <AppearanceElement id="shop-heading-copy">
          <div>
            <p className="eyebrow">Tienda TCG</p>
            <h1>Tienda</h1>
            <p className="catalog-heading-description">
              Productos regulares disponibles con precio y stock confirmados por el servidor.
            </p>
          </div>
        </AppearanceElement>
        <AppearanceElement id="shop-heading-stats">
          <div aria-label="Garantías del catálogo" className="heading-stats">
            <span>Stock confirmado</span>
            <span>Precio de servidor</span>
          </div>
        </AppearanceElement>
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      <div className="catalog-layout">
        <aside className="catalog-filters cut-panel" aria-label="Filtros del catálogo">
          <div className="catalog-filter-heading">
            <h2>Buscar productos</h2>
            <button
              aria-controls="catalog-filter-form"
              aria-expanded={filtersVisible}
              className="catalog-filter-toggle secondary"
              onClick={() => setFiltersVisible((visible) => !visible)}
              type="button"
            >
              {filtersVisible ? 'Ocultar filtros' : 'Más filtros'}
            </button>
          </div>
          <form id="catalog-filter-form" onSubmit={search} role="search">
            <label className="catalog-search-field">
              Buscar productos
              <input
                minLength={2}
                onChange={(event) => update('q', event.target.value)}
                placeholder="Juego, producto o colección"
                value={filters.q}
              />
            </label>
            {filtersVisible && (
              <div className="catalog-advanced-filters">
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
              </div>
            )}
            <button aria-label="Buscar" disabled={loading} type="submit">
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="2.5" />
                <path d="m15 15 6 6" stroke="currentColor" strokeWidth="2.5" />
              </svg>
              <span className="visually-hidden">Buscar</span>
            </button>
          </form>
          <div aria-label="Categorías" className="catalog-category-bar">
            <span>Categorías</span>
            <button
              aria-pressed={filters.categoryId === ''}
              onClick={() => {
                const next = { ...filters, categoryId: '' };
                setFilters(next);
                load(next);
              }}
              type="button"
            >
              Todas
            </button>
            {categories.map((category) => (
              <button
                aria-pressed={filters.categoryId === category.categoryId}
                key={category.categoryId}
                onClick={() => {
                  const next = { ...filters, categoryId: category.categoryId ?? '' };
                  setFilters(next);
                  load(next);
                }}
                type="button"
              >
                {category.name}
              </button>
            ))}
          </div>
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
            <section
              aria-label="Vista de ejemplo del catálogo"
              className="catalog-reference-preview"
            >
              <p>Vista de ejemplo · los productos reales aparecerán al publicarlos desde Admin</p>
              <div className="card-grid catalog-reference-preview__grid">
                {Array.from({ length: 8 }, (_, index) => (
                  <article
                    aria-label={`Tarjeta de muestra ${index + 1}`}
                    className="catalog-reference-card"
                    key={index}
                  >
                    <div aria-hidden="true" className="catalog-reference-card__media">
                      <svg fill="none" viewBox="0 0 96 72">
                        <rect
                          height="62"
                          rx="3"
                          stroke="currentColor"
                          strokeWidth="5"
                          width="88"
                          x="4"
                          y="5"
                        />
                        <circle cx="27" cy="25" fill="currentColor" r="7" />
                        <path d="m12 58 21-20 15 13 15-21 21 28" fill="currentColor" />
                      </svg>
                    </div>
                    <div className="catalog-reference-card__body">
                      <span>Nombre del producto</span>
                      <span className="catalog-reference-card__sample-tag">Ejemplo</span>
                      <span aria-hidden="true" className="catalog-reference-card__lines" />
                      <div className="catalog-reference-card__bottom">
                        <strong>$ --.--</strong>
                        <button disabled type="button">
                          Agregar
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {!loading && items.length === 0 && (
            <section className="catalog-empty cut-panel" role="status">
              <p className="eyebrow">Catálogo sin resultados</p>
              <h2>No hay productos para mostrar</h2>
              <p>Revisa los filtros o intenta nuevamente cuando el catálogo esté disponible.</p>
              <a className="button-link secondary-link" href="/">
                Volver al lanzador
              </a>
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
        <CatalogCartRail revision={cartRevision} />
      </div>
    </main>
  );
}

function PreorderReferenceCard({
  featured = false,
  onDetail,
  product,
}: {
  readonly featured?: boolean;
  readonly onDetail?: (() => void) | undefined;
  readonly product?: ProductCard | undefined;
}) {
  return (
    <article
      aria-label={
        product ? undefined : featured ? 'Preventa destacada de muestra' : 'Preventa de muestra'
      }
      className={`preorder-reference-card${featured ? ' is-featured' : ''}${product ? '' : ' is-sample'}`}
    >
      {featured && <span className="preorder-reference-card__featured">Destacada</span>}
      <div className="preorder-reference-card__media">
        {product ? (
          <img
            alt={product.primaryResource.altText}
            height={product.primaryResource.heightPx}
            loading="lazy"
            src={resourceUrl(product.primaryResource.resourceId)}
            width={product.primaryResource.widthPx}
          />
        ) : (
          <svg aria-hidden="true" fill="none" viewBox="0 0 96 72">
            <rect height="62" rx="3" stroke="currentColor" strokeWidth="5" width="88" x="4" y="5" />
            <circle cx="27" cy="25" fill="currentColor" r="7" />
            <path d="m12 58 21-20 15 13 15-21 21 28" fill="currentColor" />
          </svg>
        )}
      </div>
      <div className="preorder-reference-card__info">
        {product ? (
          <h2>{product.name}</h2>
        ) : (
          <p className="preorder-reference-card__sample-label">Vista de ejemplo</p>
        )}
        <div className="preorder-reference-card__facts">
          <p>
            <span>Disponible</span>
            <strong>{product ? availabilityLabel(product.availabilityStatus) : '—'}</strong>
          </p>
          <p>
            <span>Fecha</span>
            <strong>{product ? 'Ver detalle' : '—'}</strong>
          </p>
        </div>
        <button disabled={!onDetail} onClick={onDetail} type="button">
          Ver preventa <span aria-hidden="true">❯</span>
        </button>
      </div>
    </article>
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
    ([key, value]) => key !== 'saleType' && value !== '' && !(key === 'sort' && value === 'NEWEST'),
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

interface CatalogCartSnapshot {
  readonly groups: readonly {
    readonly state: 'ACTIVE' | 'CONFLICT' | 'REMOVED';
    readonly lines: readonly {
      readonly cartLineId: string;
      readonly estimatedLineTotalClp: number;
      readonly productName: string;
      readonly quantity: number;
    }[];
  }[];
}

function CatalogCartRail({ revision }: { readonly revision: number }) {
  const [cart, setCart] = useState<CatalogCartSnapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  useEffect(() => {
    let active = true;
    const request = currentSession() === null ? publicRequest : authorizedRequest;
    void request<{ item: CatalogCartSnapshot | null }>('/api/v1/cart')
      .then((result) => {
        if (!active) return;
        setCart(result.item);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.code === 'CART_SESSION_REQUIRED') {
          setCart(null);
          setState('ready');
          return;
        }
        setState('unavailable');
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const lines =
    cart?.groups.filter((group) => group.state !== 'REMOVED').flatMap((group) => group.lines) ?? [];
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.estimatedLineTotalClp, 0);
  return (
    <aside aria-label="Resumen del carrito" className="catalog-cart-rail">
      <h2>
        <svg
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M2 3h3l2.3 12h12.4L22 6H6" />
          <circle cx="9" cy="20" r="1" fill="currentColor" />
          <circle cx="19" cy="20" r="1" fill="currentColor" />
        </svg>
        Carrito
      </h2>
      {state === 'loading' ? (
        <p className="catalog-cart-rail__notice">Cargando carrito…</p>
      ) : state === 'unavailable' ? (
        <div className="catalog-cart-rail__empty">
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 96 96"
          >
            <path d="M8 14h13l11 51h49l9-39H26" />
            <circle cx="40" cy="79" r="4" fill="currentColor" />
            <circle cx="74" cy="79" r="4" fill="currentColor" />
          </svg>
          <p>Carrito no disponible</p>
          <small>Ábrelo para volver a intentar la consulta.</small>
        </div>
      ) : lines.length === 0 ? (
        <div className="catalog-cart-rail__empty">
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 96 96"
          >
            <path d="M8 14h13l11 51h49l9-39H26" />
            <circle cx="40" cy="79" r="4" fill="currentColor" />
            <circle cx="74" cy="79" r="4" fill="currentColor" />
          </svg>
          <p>Tu carrito está vacío</p>
        </div>
      ) : (
        <>
          <ul className="catalog-cart-rail__lines">
            {lines.map((line) => (
              <li key={line.cartLineId}>
                <span>
                  {line.quantity} × {line.productName}
                </span>
                <strong>${line.estimatedLineTotalClp.toLocaleString('es-CL')}</strong>
              </li>
            ))}
          </ul>
          <p className="catalog-cart-rail__total">
            {count} {count === 1 ? 'producto' : 'productos'}{' '}
            <strong>${subtotal.toLocaleString('es-CL')}</strong>
          </p>
        </>
      )}
      <a className="catalog-cart-rail__link" href="/cart">
        Ver carrito
      </a>
    </aside>
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
                {detail.preorder.maxPerCustomer != null && (
                  <>
                    <dt>Máximo por cliente</dt>
                    <dd>
                      {detail.preorder.maxPerCustomer} unidades por cuenta durante toda la campaña,
                      entre todos sus pedidos.
                    </dd>
                  </>
                )}
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

export function TournamentPage({
  view = 'tournaments',
}: {
  readonly view?: 'quests' | 'tournaments';
}) {
  const [content, setContent] = useState<TournamentContentState>({
    errors: [],
    failedTypes: [],
    hall: [],
    loading: true,
    quests: [],
    tournaments: [],
  });
  const [selected, setSelected] = useState<EditorialEntry | null>(null);
  const [tournamentFilter, setTournamentFilter] = useState<'all' | 'upcoming' | 'completed'>('all');

  useEffect(() => {
    let active = true;
    const types =
      view === 'quests' ? (['QUEST'] as const) : (['TOURNAMENT', 'HALL_OF_FAME'] as const);
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
        hall: view === 'tournaments' ? items(1) : [],
        loading: false,
        quests: view === 'quests' ? items(0) : [],
        tournaments: view === 'tournaments' ? items(0) : [],
      });
    });
    return () => {
      active = false;
    };
  }, [view]);

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
            {view === 'quests' ? 'Volver a Quests' : 'Volver a torneos'}
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

  if (view === 'tournaments') {
    const featured = upcoming[0];
    const cards =
      tournamentFilter === 'upcoming'
        ? upcoming
        : tournamentFilter === 'completed'
          ? completed
          : [...upcoming, ...completed, ...legacy];
    return (
      <main className="page-frame tournament-page tournament-reference-page visual-public">
        <header className="tournament-reference-heading">
          <h1>Torneos</h1>
        </header>
        <p aria-live="polite" className="status tournament-reference-status">
          {content.loading ? 'Cargando torneos…' : content.errors.join(' ')}
        </p>
        <section
          aria-labelledby="tournament-feature-heading"
          className="tournament-reference-feature"
        >
          <h2 id="tournament-feature-heading">Próximo torneo</h2>
          <div className="tournament-reference-feature-content">
            <div className="tournament-reference-feature-art">
              {featured && firstEditorialImage(featured) ? (
                <img
                  alt={firstEditorialImage(featured)?.altText ?? ''}
                  src={resourceUrl(firstEditorialImage(featured)?.resourceId ?? '')}
                />
              ) : (
                <span aria-hidden="true" className="tournament-reference-image-placeholder" />
              )}
            </div>
            <dl className="tournament-reference-facts">
              <TournamentFact
                label="Fecha"
                value={
                  featured
                    ? publicDateTime(eventFromEditorial(featured)?.startsAt ?? '')
                    : 'No informada'
                }
              />
              <TournamentFact label="Ubicación" value="No informada" />
              <TournamentFact label="Cupos" value="No informados" />
              <TournamentFact
                label="Estado"
                value={featured ? 'Próximo' : 'Sin torneo publicado'}
              />
            </dl>
            {featured ? (
              <button
                className="tournament-reference-detail"
                onClick={() => setSelected(featured)}
                type="button"
              >
                Ver detalle <span aria-hidden="true">›</span>
              </button>
            ) : (
              <p className="tournament-reference-no-feature">
                {content.loading ? 'Cargando…' : 'Aún no hay próximos torneos publicados.'}
              </p>
            )}
          </div>
        </section>
        <nav aria-label="Filtrar torneos" className="tournament-reference-filters">
          <button
            aria-pressed={tournamentFilter === 'all'}
            onClick={() => setTournamentFilter('all')}
            type="button"
          >
            Todos
          </button>
          <button
            aria-pressed={tournamentFilter === 'upcoming'}
            onClick={() => setTournamentFilter('upcoming')}
            type="button"
          >
            <span aria-hidden="true" /> Próximos
          </button>
          <button
            disabled
            title="El estado en curso aún no existe en las publicaciones"
            type="button"
          >
            <span aria-hidden="true" /> En curso
          </button>
          <button
            aria-pressed={tournamentFilter === 'completed'}
            onClick={() => setTournamentFilter('completed')}
            type="button"
          >
            <span aria-hidden="true" /> Finalizados
          </button>
        </nav>
        <section aria-label="Listado de torneos" className="tournament-reference-grid">
          {cards.map((item, index) => {
            const cover = firstEditorialImage(item);
            const event = eventFromEditorial(item);
            return (
              <article className="tournament-reference-card" key={item.editorialEntryId}>
                <div className="tournament-reference-card-art">
                  {cover ? (
                    <img alt="" src={resourceUrl(cover.resourceId)} />
                  ) : (
                    <span aria-hidden="true" className="tournament-reference-image-placeholder" />
                  )}
                </div>
                <h3>{item.title}</h3>
                <dl>
                  <div>
                    <dt>Fecha</dt>
                    <dd>{event ? publicDateTime(event.startsAt) : 'No informada'}</dd>
                  </div>
                  <div>
                    <dt>Ubicación</dt>
                    <dd>No informada</dd>
                  </div>
                  <div>
                    <dt>Cupos</dt>
                    <dd>No informados</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>
                      {event?.status === 'COMPLETED'
                        ? 'Finalizado'
                        : event?.status === 'UPCOMING'
                          ? 'Próximo'
                          : 'Informativo'}
                    </dd>
                  </div>
                </dl>
                <button onClick={() => setSelected(item)} type="button">
                  Ver detalle
                </button>
                <span aria-hidden="true" className="editorial-index">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </article>
            );
          })}
          {!content.loading && cards.length === 0 && (
            <p className="tournament-reference-empty" role="status">
              {tournamentFilter === 'completed'
                ? 'Aún no hay torneos finalizados publicados.'
                : tournamentFilter === 'upcoming'
                  ? 'Aún no hay próximos torneos publicados.'
                  : 'Aún no hay torneos publicados.'}
            </p>
          )}
        </section>
        {content.hall.length > 0 && (
          <TournamentEditorialSection
            empty=""
            items={content.hall}
            onSelect={setSelected}
            section="hall"
            title="Hall of Fame"
          />
        )}
      </main>
    );
  }

  return (
    <main className={`page-frame editorial-page tournament-page ${view}-page visual-public`}>
      <header className="section-heading editorial-heading cut-panel">
        <AppearanceElement id="tournaments-heading-copy">
          <div>
            <p className="eyebrow">
              {view === 'quests' ? 'Desafíos Sergod' : 'Juego organizado Sergod'}
            </p>
            <h1>{view === 'quests' ? 'Quests' : 'Torneos'}</h1>
            <p>
              {view === 'quests'
                ? 'Eventos, misiones y desafíos publicados por Sergod Store.'
                : 'Próximos encuentros, resultados, podios y reconocimientos publicados por la tienda. Esta sección es informativa y no administra rondas ni emparejamientos.'}
            </p>
          </div>
        </AppearanceElement>
        <AppearanceElement id="tournaments-heading-stats">
          <div aria-label="Características de la sección" className="heading-stats">
            <span>{view === 'quests' ? 'Desafíos oficiales' : 'Información oficial'}</span>
            <span>{view === 'quests' ? 'Eventos y misiones' : 'Resultados y fotos'}</span>
          </div>
        </AppearanceElement>
      </header>
      <p aria-live="polite" className="status">
        {content.loading ? 'Cargando torneos y eventos…' : content.errors.join(' ')}
      </p>
      {!content.loading &&
        content.errors.length > 0 &&
        content.tournaments.length === 0 &&
        content.quests.length === 0 &&
        content.hall.length === 0 && <SectionPreview kind={view} />}
      {!content.loading && (
        <div className="tournament-sections">
          {view === 'quests' && !content.failedTypes.includes('QUEST') && (
            <TournamentEditorialSection
              empty="Todavía no hay desafíos publicados."
              eyebrow="Tablero de desafíos"
              items={content.quests}
              onSelect={setSelected}
              section="quests"
              title="Eventos y Quests"
            />
          )}
        </div>
      )}
    </main>
  );
}

function TournamentFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="tournament-reference-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TournamentEditorialSection({
  empty,
  eyebrow = 'Archivo oficial',
  items,
  onSelect,
  section,
  title,
}: {
  readonly empty: string;
  readonly eyebrow?: string;
  readonly items: readonly EditorialEntry[];
  readonly onSelect: (item: EditorialEntry) => void;
  readonly section: TournamentSection;
  readonly title: string;
}) {
  return (
    <section aria-labelledby={`tournament-${section}`} className="tournament-section cut-panel">
      <div className="tournament-section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`tournament-${section}`}>{title}</h2>
      </div>
      {items.length > 0 ? (
        <div className="editorial-grid">
          {items.map((item, index) => {
            const event = eventFromEditorial(item);
            const cover = firstEditorialImage(item);
            return (
              <article className="editorial-card tournament-card" key={item.editorialEntryId}>
                {cover && (
                  <img
                    alt={cover.altText}
                    className="tournament-card-cover"
                    src={resourceUrl(cover.resourceId)}
                  />
                )}
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
        <>
          <p className="tournament-section-empty">{empty}</p>
          {(section === 'upcoming' || section === 'quests') && (
            <SectionPreview kind={section === 'quests' ? 'quests' : 'tournaments'} />
          )}
        </>
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

export function NewsPage({
  includeCommunity = false,
}: { readonly includeCommunity?: boolean } = {}) {
  const [items, setItems] = useState<readonly EditorialEntry[]>([]);
  const [category, setCategory] = useState('Todas');
  const [selected, setSelected] = useState<EditorialEntry | null>(null);
  const [message, setMessage] = useState('Cargando noticias…');

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      publicRequest<{ items: EditorialEntry[] }>('/api/v1/content?limit=24&type=NEWS'),
      includeCommunity
        ? publicRequest<{ items: EditorialEntry[] }>('/api/v1/content?limit=24&type=COMMUNITY')
        : Promise.resolve({ items: [] as EditorialEntry[] }),
    ]).then(([newsResult, communityResult]) => {
      if (!active) return;
      const news = newsResult.status === 'fulfilled' ? newsResult.value.items : [];
      const community = communityResult.status === 'fulfilled' ? communityResult.value.items : [];
      const combined = [...news, ...community];
      setItems(combined);
      setMessage(
        newsResult.status === 'rejected' &&
          (!includeCommunity || communityResult.status === 'rejected')
          ? 'No fue posible cargar las noticias.'
          : combined.length === 0
            ? 'Todavía no hay noticias publicadas.'
            : '',
      );
    });
    return () => {
      active = false;
    };
  }, [includeCommunity]);

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
        <AppearanceElement id="news-heading-copy">
          <div>
            <p className="eyebrow">Actualidad Sergod</p>
            <h1>Noticias</h1>
            <p>
              Novedades oficiales de la tienda y de la comunidad, organizadas para encontrarlas
              fácilmente.
            </p>
          </div>
        </AppearanceElement>
        <AppearanceElement id="news-heading-stats">
          <div aria-label="Características de la sección" className="heading-stats">
            <span>Portada editorial</span>
            <span>Artículos completos</span>
          </div>
        </AppearanceElement>
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
          <SectionPreview kind="news" />
        </section>
      )}
    </main>
  );
}

export function CommunityHub({
  navigate,
  route,
}: {
  readonly navigate: (route: CommunityRoute) => void;
  readonly route: CommunityRoute;
}) {
  if (route === '/news') return <NewsPage includeCommunity />;
  if (route === '/tournaments') return <TournamentPage />;
  if (route === '/quests') return <TournamentPage view="quests" />;
  if (route === '/community/visit') return <CommunityPage />;

  return <CommunityLanding navigate={navigate} />;
}

function CommunityLanding({ navigate }: { readonly navigate: (route: CommunityRoute) => void }) {
  const [items, setItems] = useState<readonly EditorialEntry[]>([]);
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [selected, setSelected] = useState<EditorialEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentError, setContentError] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      publicRequest<{ items: EditorialEntry[] }>('/api/v1/content?limit=24&type=NEWS'),
      publicRequest<{ items: EditorialEntry[] }>('/api/v1/content?limit=24&type=COMMUNITY'),
      publicRequest<{ item: unknown }>('/api/v1/service-coverage/store'),
    ]).then(([newsResult, communityResult, storeResult]) => {
      if (!active) return;
      const news = newsResult.status === 'fulfilled' ? newsResult.value.items : [];
      const community = communityResult.status === 'fulfilled' ? communityResult.value.items : [];
      setItems(
        [...news, ...community].sort(
          (left, right) =>
            new Date(right.publishedAt ?? 0).getTime() - new Date(left.publishedAt ?? 0).getTime(),
        ),
      );
      setStore(storeResult.status === 'fulfilled' ? firstStore(storeResult.value.item) : null);
      setContentError(newsResult.status === 'rejected' && communityResult.status === 'rejected');
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  if (selected) {
    return (
      <main className="page-frame editorial-page visual-public">
        <article className="editorial-reader cut-panel">
          <button className="button-secondary" onClick={() => setSelected(null)} type="button">
            Volver a actividades
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

  const featured = items[0];
  const cover = featured ? firstEditorialImage(featured) : undefined;

  return (
    <main className="community-hub community-reference-page visual-public">
      <header className="community-hub-header">
        <div className="community-hub-title">
          <h1>Comunidad</h1>
        </div>
        <nav aria-label="Secciones de Comunidad" className="community-hub-tabs">
          <button aria-current="page" onClick={() => navigate('/news')} type="button">
            <span aria-hidden="true">✦</span> Noticias
          </button>
          <button onClick={() => navigate('/tournaments')} type="button">
            <span aria-hidden="true">◆</span> Torneos
          </button>
          <button onClick={() => navigate('/quests')} type="button">
            <span aria-hidden="true">▣</span> Quests
          </button>
          <button onClick={() => navigate('/community/visit')} type="button">
            <span aria-hidden="true">◆</span> Visítanos
          </button>
        </nav>
      </header>
      <div className="community-reference-grid">
        <section
          aria-labelledby="community-feature-heading"
          className="community-reference-panel community-reference-panel--cyan"
        >
          <h2 id="community-feature-heading">
            ★ <span>Actividad destacada</span>
          </h2>
          <div className="community-reference-feature-media">
            {cover ? (
              <img alt={cover.altText} src={resourceUrl(cover.resourceId)} />
            ) : (
              <span aria-hidden="true" className="community-reference-placeholder" />
            )}
          </div>
          {featured ? (
            <div className="community-reference-feature-copy">
              <h3>{featured.title}</h3>
              <p>{featured.excerpt}</p>
              <button onClick={() => setSelected(featured)} type="button">
                Ver detalle <span aria-hidden="true">›</span>
              </button>
            </div>
          ) : (
            <div className="community-reference-feature-copy">
              <h3>{loading ? 'Cargando actividades…' : 'Aún no hay actividades publicadas'}</h3>
              <p>
                {contentError
                  ? 'No fue posible cargar las publicaciones.'
                  : 'Cuando publiquemos una actividad, aparecerá aquí.'}
              </p>
            </div>
          )}
        </section>
        <section
          aria-labelledby="community-list-heading"
          className="community-reference-panel community-reference-panel--red"
        >
          <h2 id="community-list-heading">
            ▣ <span>Más actividades</span>
          </h2>
          <div className="community-reference-list">
            {items.slice(1, 4).map((item) => {
              const image = firstEditorialImage(item);
              return (
                <button
                  className="community-reference-list-item"
                  key={item.editorialEntryId}
                  onClick={() => setSelected(item)}
                  type="button"
                >
                  <span className="community-reference-list-thumb">
                    {image && <img alt="" src={resourceUrl(image.resourceId)} />}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {validEditorialDate(item.publishedAt)
                        ? publicDateTime(item.publishedAt ?? '')
                        : newsCategory(item)}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              );
            })}
            {items.length < 2 && (
              <p className="community-reference-list-empty">
                {loading ? 'Cargando publicaciones…' : 'No hay más actividades publicadas.'}
              </p>
            )}
          </div>
          <button
            className="community-reference-all"
            onClick={() => navigate('/news')}
            type="button"
          >
            Ver todas las actividades <span aria-hidden="true">›</span>
          </button>
        </section>
        <section
          aria-labelledby="community-visit-heading"
          className="community-reference-panel community-reference-panel--cyan"
        >
          <h2 id="community-visit-heading">
            ◆ <span>Visítanos en tienda</span>
          </h2>
          <div aria-hidden="true" className="community-reference-store-media">
            ⌖
          </div>
          <h3>{store?.name ?? 'Sergod Store'}</h3>
          <p>Información de nuestra tienda física.</p>
          <dl>
            <div>
              <dt>Dirección</dt>
              <dd>{store?.publicAddress ?? 'No disponible'}</dd>
            </div>
            <div>
              <dt>Horario</dt>
              <dd>{store?.openingHours ?? 'No disponible'}</dd>
            </div>
          </dl>
          <button onClick={() => navigate('/community/visit')} type="button">
            Ver información <span aria-hidden="true">›</span>
          </button>
        </section>
      </div>
    </main>
  );
}

export function CommunityPage() {
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [message, setMessage] = useState('Cargando información de la tienda…');

  useEffect(() => {
    let active = true;
    void publicRequest<{ item: unknown }>('/api/v1/service-coverage/store')
      .then((result) => {
        if (!active) return;
        setStore(firstStore(result.item));
        setMessage('');
      })
      .catch((error: unknown) => {
        if (active) setMessage(messageOf(error));
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="page-frame editorial-page community-page visual-public">
      <header className="section-heading editorial-heading cut-panel">
        <AppearanceElement id="community-heading-copy">
          <div>
            <p className="eyebrow">Nuestra tienda en Copiapó</p>
            <h1>Visítanos</h1>
            <p>
              Consulta la dirección, el horario y los medios de contacto oficiales de Sergod Store.
            </p>
          </div>
        </AppearanceElement>
        <div aria-label="Características de la sección" className="heading-stats">
          <span>Una sola sucursal</span>
          <span>Información oficial</span>
        </div>
      </header>
      <p aria-live="polite" className="status">
        {message}
      </p>
      <CommunityStoreCard store={store} />
    </main>
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
        <AppearanceElement id="comics-heading-copy">
          <div>
            <p className="eyebrow">Historias Sergod</p>
            <h1>Cómics e historias</h1>
            <p>
              Explora las series publicadas por la tienda y lee sus capítulos completos en orden.
            </p>
          </div>
        </AppearanceElement>
        <AppearanceElement id="comics-heading-stats">
          <div aria-label="Características de la sección" className="heading-stats">
            <span>Series y capítulos</span>
            <span>Lector con imágenes</span>
          </div>
        </AppearanceElement>
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
          <SectionPreview kind="comics" />
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
