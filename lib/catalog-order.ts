import type { Product } from './types';
import { catalogPresentation } from './catalog-presentations';

type OrderedProduct = Pick<
  Product,
  | 'id'
  | 'name'
  | 'sku'
  | 'catalog_group'
  | 'catalog_name'
  | 'options'
  | 'category'
  | 'specifications'
  | 'release_date'
>;
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const compare = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

// Dates may arrive from PostgreSQL as ISO timestamps; ordering uses their calendar day only.
export function catalogReleaseDay(value?: string | Date | null): string {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)
    ? value.slice(0, 10)
    : '';
}
function presentationOrder(product: OrderedProduct) {
  const explicit = Object.entries(product.options || {})
    .filter(([key]) => /^(formato|presentacion|tipo de producto)$/.test(normalize(key)))
    .map(([, value]) => value)
    .join(' ');
  const text = normalize(`${explicit} ${product.name}`);
  if (
    /\b(?:bundle|combo)\b|\bpack\s+(?:(?:de|x)\s*)?\d+|\b(?:[2-9]|[1-9]\d+)\s*(?:displays?|cajas?|kits?|token boxes)\b/.test(
      text,
    )
  )
    return 4;
  return { singles: 0, packs: 1, decks: 2, 'token-box': 2, displays: 3, accessories: 5, other: 6 }[
    catalogPresentation(product)
  ];
}
function languageOrder(product: OrderedProduct) {
  const language = normalize(
    Object.entries(product.options || {}).find(([key]) => normalize(key) === 'idioma')?.[1] || '',
  );
  return /espanol|spanish/.test(language) ? 0 : /ingles|english/.test(language) ? 1 : 2;
}
export function compareCatalogLaunch(
  a: OrderedProduct,
  b: OrderedProduct,
  direction: 'asc' | 'desc' = 'desc',
) {
  const dateA = catalogReleaseDay(a.release_date),
    dateB = catalogReleaseDay(b.release_date);
  if (Boolean(dateA) !== Boolean(dateB)) return dateA ? -1 : 1;
  const date = compare(dateA, dateB);
  if (date) return direction === 'asc' ? date : -date;
  const groupA = a.catalog_group || a.catalog_name || a.name;
  const groupB = b.catalog_group || b.catalog_name || b.name;
  const group = compare(groupA, groupB);
  if (group) return group;
  return (
    presentationOrder(a) - presentationOrder(b) ||
    languageOrder(a) - languageOrder(b) ||
    compare(a.name, b.name) ||
    compare(a.sku, b.sku) ||
    compare(a.id, b.id)
  );
}
