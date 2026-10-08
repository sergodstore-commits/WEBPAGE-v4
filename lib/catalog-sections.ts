import type { Product } from './types';

export const catalogSections = [
  { id: 'yugioh', label: 'Yu-Gi-Oh!' },
  { id: 'myl-first-block', label: 'MyL Primer Bloque' },
  { id: 'myl-first-era', label: 'MyL Primera Era' },
  { id: 'zero-mulligan', label: 'Accesorios Zero Mulligan' },
] as const;
export type CatalogSection = '' | (typeof catalogSections)[number]['id'];
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function readCatalogSection(value: string | null): CatalogSection {
  return catalogSections.some((s) => s.id === value) ? (value as CatalogSection) : '';
}
export function matchesCatalogSection(product: Product, section: CatalogSection) {
  if (!section) return true;
  const category = normalize(product.category || '');
  const brand = normalize(product.brand || '');
  if (section === 'zero-mulligan') return /\bzero\s+mulligan\b/.test(brand);
  if (section === 'yugioh') return /yu[\s-]?gi[\s-]?oh/.test(category);
  const identity = normalize(
    `${product.category} ${product.brand} ${product.catalog_name || ''} ${product.name}`,
  );
  if (!/\bmitos\s+y\s+leyendas\b|\bmyl\b/.test(identity)) return false;
  const format = normalize(
    [product.category, product.name, product.catalog_name || '', ...(product.tags || [])].join(' '),
  );
  return section === 'myl-first-era'
    ? /\bprimera\s+era\b/.test(format)
    : /\bprimer\s+bloque\b/.test(format);
}
