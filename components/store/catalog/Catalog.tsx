'use client';
import { useState, useEffect, useMemo, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import { Package, Search, X, ArrowUpRight, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { money, price } from '@/lib/client';
import type { Product } from '@/lib/types';
import type { AddToCart } from '../shared';
import {
  useRemote,
  availability,
  productFamilies,
  familyName,
  representative,
  PageIntro,
  Loading,
  RemoteError,
  Empty,
} from '../shared';
import { ProductCard } from './ProductCard';
import { QuickProduct } from '../product/ProductDetail';
import styles from './Catalog.module.css';

type Filters = {
  search: string;
  category: string;
  brand: string;
  tag: string;
  minimumPrice: string;
  maximumPrice: string;
  sort: string;
  available: boolean;
};
const emptyFilters: Filters = {
  search: '',
  category: '',
  brand: '',
  tag: '',
  minimumPrice: '',
  maximumPrice: '',
  sort: 'recent',
  available: false,
};
const filterParams: Record<keyof Filters, string> = {
  search: 'busqueda',
  category: 'categoria',
  brand: 'marca',
  tag: 'caracteristica',
  minimumPrice: 'desde',
  maximumPrice: 'hasta',
  sort: 'orden',
  available: 'disponibles',
};
function readFilters(query: URLSearchParams): Filters {
  const sort = query.get('orden') || 'recent';
  const amount = (key: string) => {
    const value = query.get(key) || '';
    return /^\d+$/.test(value) ? value : '';
  };
  return {
    search: query.get('busqueda') || '',
    category: query.get('categoria') || '',
    brand: query.get('marca') || '',
    tag: query.get('caracteristica') || '',
    minimumPrice: amount('desde'),
    maximumPrice: amount('hasta'),
    sort: ['recent', 'price-asc', 'price-desc', 'name'].includes(sort) ? sort : 'recent',
    available: query.get('disponibles') === '1',
  };
}
function readPage(query: URLSearchParams) {
  const value = Number(query.get('pagina'));
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}
export function Catalog({ kind, add }: { kind: 'store' | 'preorder'; add: AddToCart }) {
  const query = useSearchParams();
  const modern = kind === 'store';
  const queryString = query.toString();
  const products = useRemote<Product[]>(`/products?kind=${kind}`),
    [filters, setFilters] = useState<Filters>(() =>
      modern
        ? readFilters(new URLSearchParams(queryString))
        : { ...emptyFilters, category: query.get('categoria') || '' },
    ),
    [page, setPage] = useState(() => (modern ? readPage(new URLSearchParams(queryString)) : 1)),
    [mobile, setMobile] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false),
    [quickProduct, setQuickProduct] = useState<Product | null>(null);
  const { search, category, brand, tag, minimumPrice, maximumPrice, sort, available } = filters;
  useEffect(() => {
    const params = new URLSearchParams(queryString);
    if (modern) {
      setFilters(readFilters(params));
      setPage(readPage(params));
    } else {
      setFilters((current) => ({ ...current, category: params.get('categoria') || '' }));
    }
  }, [queryString, modern]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  function updateFilters(update: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...update }));
    setPage(1);
    if (!modern) return;
    const params = new URLSearchParams(window.location.search);
    for (const key of Object.keys(update) as (keyof Filters)[]) {
      const value = update[key];
      if (value && !(key === 'sort' && value === 'recent')) {
        params.set(filterParams[key], value === true ? '1' : String(value));
      } else params.delete(filterParams[key]);
    }
    params.delete('pagina');
    const searchString = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${searchString ? `?${searchString}` : ''}`,
    );
  }
  function changePage(nextPage: number) {
    setPage(nextPage);
    if (!modern) return;
    const params = new URLSearchParams(window.location.search);
    if (nextPage > 1) params.set('pagina', String(nextPage));
    else params.delete('pagina');
    const searchString = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${searchString ? `?${searchString}` : ''}`,
    );
  }
  const setSearch = (value: string) => updateFilters({ search: value });
  const setCategory = (value: string) => updateFilters({ category: value });
  const setBrand = (value: string) => updateFilters({ brand: value });
  const setTag = (value: string) => updateFilters({ tag: value });
  const setMinimumPrice = (value: string) => updateFilters({ minimumPrice: value });
  const setMaximumPrice = (value: string) => updateFilters({ maximumPrice: value });
  const setSort = (value: string) => updateFilters({ sort: value });
  const setAvailable = (value: boolean) => updateFilters({ available: value });
  const clearFilters = () => updateFilters({ ...emptyFilters, sort });
  const categories = useMemo(
    () => [...new Set((products.data || []).map((p) => p.category).filter(Boolean))].sort(),
    [products.data],
  );
  const brands = useMemo(
    () => [...new Set((products.data || []).map((p) => p.brand).filter(Boolean))].sort(),
    [products.data],
  );
  const tags = useMemo(
    () => [...new Set((products.data || []).flatMap((p) => p.tags || []))].sort(),
    [products.data],
  );
  const featuredCategories = categories.filter((value) => /yu.?gi.?oh|mitos/i.test(value));
  const activeFilters = [
    search && { name: `Búsqueda: ${search}`, clear: () => setSearch('') },
    category && { name: category, clear: () => setCategory('') },
    brand && { name: brand, clear: () => setBrand('') },
    tag && { name: tag, clear: () => setTag('') },
    minimumPrice && {
      name: `Desde ${money(Number(minimumPrice))}`,
      clear: () => setMinimumPrice(''),
    },
    maximumPrice && {
      name: `Hasta ${money(Number(maximumPrice))}`,
      clear: () => setMaximumPrice(''),
    },
    available && { name: 'Solo disponibles', clear: () => setAvailable(false) },
  ].filter((item): item is { name: string; clear: () => void } => Boolean(item));
  const visible = useMemo(() => {
    const q = search.toLocaleLowerCase('es').trim();
    const matches = (products.data || []).filter(
      (p) =>
        (!q ||
          `${p.name} ${p.catalog_name || ''} ${p.description} ${p.sku} ${p.brand || ''} ${Object.values(p.options || {}).join(' ')} ${(p.tags || []).join(' ')}`
            .toLocaleLowerCase('es')
            .includes(q)) &&
        (!category || p.category === category) &&
        (!brand || p.brand === brand) &&
        (!tag || p.tags?.includes(tag)) &&
        (!minimumPrice || price(p) >= Number(minimumPrice)) &&
        (!maximumPrice || price(p) <= Number(maximumPrice)) &&
        (!available || !availability(p)),
    );
    return productFamilies(matches).sort((a, b) =>
      sort === 'price-asc'
        ? Math.min(...a.map(price)) - Math.min(...b.map(price))
        : sort === 'price-desc'
          ? Math.max(...b.map(price)) - Math.max(...a.map(price))
          : sort === 'name'
            ? familyName(a[0]).localeCompare(familyName(b[0]), 'es')
            : b[0].created_at.localeCompare(a[0].created_at),
    );
  }, [products.data, search, category, brand, tag, minimumPrice, maximumPrice, sort, available]);
  const pages = Math.max(1, Math.ceil(visible.length / 24));
  const currentPage = Math.min(page, pages);
  const pageProducts = visible.slice((currentPage - 1) * 24, currentPage * 24);
  const FilterControls = modern ? 'div' : Fragment;
  return (
    <div className={`store-page ${modern ? styles.catalog : ''}`}>
      {modern ? (
        <header className={styles.intro}>
          <div>
            <span className={styles.eyebrow}>ELIGE TU PRÓXIMA JUGADA</span>
            <h1>
              Tienda<span aria-hidden="true">.</span>
            </h1>
            <p>Cartas, accesorios y nuevos favoritos para tu colección.</p>
          </div>
          <div className={styles.introNote}>
            <Package size={22} aria-hidden="true" />
            <span>
              Desde Copiapó
              <br />
              <strong>Para tu próxima partida.</strong>
            </span>
          </div>
        </header>
      ) : (
        <PageIntro
          eyebrow="PRÓXIMOS LANZAMIENTOS"
          title="Preventas"
          body="Reserva con información clara: fechas, cupos disponibles y condiciones de entrega."
        />
      )}
      {modern && featuredCategories.length > 0 && (
        <nav className={styles.categories} aria-label="Categorías destacadas">
          <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>
            Todo el catálogo
          </button>
          {featuredCategories.map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {value}
              <ArrowUpRight size={16} aria-hidden="true" />
            </button>
          ))}
        </nav>
      )}
      <div className={`store-catalog-layout ${modern ? styles.layout : ''}`}>
        <aside className={`store-filters ${modern ? styles.filters : ''}`}>
          {modern && mobile ? (
            <button
              type="button"
              className={styles.filterToggle}
              aria-label={filtersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
              aria-expanded={filtersOpen}
              aria-controls="catalog-filter-controls"
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              {filtersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
              {activeFilters.length > 0 && (
                <span
                  className={styles.filterBadge}
                  aria-label={`${activeFilters.length} filtros activos`}
                >
                  {activeFilters.length}
                </span>
              )}
              <ChevronDown size={17} aria-hidden="true" />
            </button>
          ) : (
            <h2>Filtrar artículos</h2>
          )}
          {(!modern || !mobile || filtersOpen) && (
            <FilterControls
              {...(modern
                ? { id: 'catalog-filter-controls', className: styles.filterControls }
                : {})}
            >
              <label className="store-label">
                Categoría
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Todas las categorías</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {brands.length > 0 && (
                <label className="store-label">
                  Marca
                  <select value={brand} onChange={(e) => setBrand(e.target.value)}>
                    <option value="">Todas las marcas</option>
                    {brands.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              )}
              {tags.length > 0 && (
                <label className="store-label">
                  Características
                  <select value={tag} onChange={(e) => setTag(e.target.value)}>
                    <option value="">Todas las características</option>
                    {tags.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="store-price-filters">
                <label className="store-label">
                  Precio desde
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={minimumPrice}
                    onChange={(e) => setMinimumPrice(e.target.value)}
                    placeholder="$0"
                  />
                </label>
                <label className="store-label">
                  Precio hasta
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={maximumPrice}
                    onChange={(e) => setMaximumPrice(e.target.value)}
                    placeholder="Sin límite"
                  />
                </label>
              </div>
              <label className="store-check">
                <input
                  type="checkbox"
                  checked={available}
                  onChange={(e) => setAvailable(e.target.checked)}
                />
                Solo disponibles
              </label>
              {(search ||
                category ||
                brand ||
                tag ||
                minimumPrice ||
                maximumPrice ||
                available) && (
                <button className="store-text-link store-reset" onClick={clearFilters}>
                  Limpiar filtros <X size={14} />
                </button>
              )}
              <div className="store-filter-note">
                <Package size={23} />
                <strong>
                  {kind === 'preorder' ? 'Reserva con tranquilidad' : 'Stock de la tienda'}
                </strong>
                <p>
                  {kind === 'preorder'
                    ? 'Revisa las condiciones de cada preventa. Los cupos se confirman al aprobarse el pago.'
                    : 'La disponibilidad se comparte con las ventas del local y se comprueba al comprar.'}
                </p>
              </div>
            </FilterControls>
          )}
        </aside>
        <div className={`store-catalog-results ${modern ? styles.results : ''}`}>
          <div className="store-catalog-toolbar">
            <label className="store-search">
              <Search size={18} />
              <input
                aria-label="Buscar artículos"
                placeholder="Buscar por nombre o SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Borrar búsqueda" onClick={() => setSearch('')}>
                  <X size={16} />
                </button>
              )}
            </label>
            <label className="store-sort">
              <span>Ordenar</span>
              <select
                aria-label="Ordenar artículos"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">Más recientes</option>
                <option value="price-asc">Menor precio</option>
                <option value="price-desc">Mayor precio</option>
                <option value="name">Nombre: A–Z</option>
              </select>
            </label>
          </div>
          {modern && activeFilters.length > 0 && (
            <div className={styles.activeFilters} aria-label="Filtros activos">
              {activeFilters.map((filter) => (
                <button
                  key={filter.name}
                  type="button"
                  onClick={filter.clear}
                  aria-label={`Quitar filtro ${filter.name}`}
                >
                  {filter.name}
                  <X size={13} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          <div
            className="store-results-count"
            role={modern ? 'status' : undefined}
            aria-live={modern ? 'polite' : undefined}
          >
            {products.loading
              ? 'Consultando catálogo…'
              : `${visible.length} ${visible.length === 1 ? 'producto' : 'productos'}`}
          </div>
          {products.loading ? (
            <Loading />
          ) : products.error ? (
            <RemoteError error={products.error} reload={products.reload} />
          ) : visible.length ? (
            <div className="store-product-grid store-catalog-grid">
              {pageProducts.map((family) => (
                <ProductCard
                  key={family[0].id}
                  product={representative(family)}
                  variants={family}
                  add={add}
                  quickView={setQuickProduct}
                  catalogStyle={modern}
                />
              ))}
            </div>
          ) : (
            <Empty
              title={
                products.data?.length
                  ? 'No encontramos coincidencias'
                  : kind === 'store'
                    ? 'Aún no hay artículos publicados'
                    : 'Aún no hay preventas publicadas'
              }
              body={
                products.data?.length
                  ? 'Prueba otra búsqueda o cambia los filtros.'
                  : 'Los artículos aparecerán aquí cuando la tienda los publique.'
              }
            />
          )}
          {pages > 1 && (
            <nav className="store-pagination" aria-label="Páginas del catálogo">
              <button
                className="store-button store-button-secondary"
                disabled={currentPage === 1}
                onClick={() => changePage(currentPage - 1)}
              >
                Anterior
              </button>
              <span>
                Página {currentPage} de {pages}
              </span>
              <button
                className="store-button store-button-secondary"
                disabled={currentPage === pages}
                onClick={() => changePage(currentPage + 1)}
              >
                Siguiente
              </button>
            </nav>
          )}
        </div>
      </div>
      {quickProduct && (
        <QuickProduct
          key={quickProduct.id}
          product={quickProduct}
          add={add}
          close={() => setQuickProduct(null)}
        />
      )}
    </div>
  );
}
