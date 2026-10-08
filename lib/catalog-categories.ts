import type { Product } from './types';
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function catalogCategory(product: Pick<Product, 'category'>): string {
  const value = normalize(product.category || '');
  if (/yu[\s-]?gi[\s-]?oh/.test(value)) return 'Yu-Gi-Oh!';
  if (/mitos\s+y\s+leyendas|\bmyl\b/.test(value)) return 'Mitos y Leyendas';
  if (/accesorio|protector|funda|dado|tapete|playmat|deck.?box/.test(value)) return 'Accesorios';
  return 'Otros';
}
export function matchesCatalogCategory(product: Pick<Product, 'category'>, selected: string) {
  // Existing shared URLs containing a precise legacy category still work.
  return !selected || product.category === selected || catalogCategory(product) === selected;
}
