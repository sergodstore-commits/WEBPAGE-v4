import type { Product } from './types';

export const catalogPresentations = [
  { id: 'packs', label: 'Sobres' },
  { id: 'displays', label: 'Displays y cajas' },
  { id: 'token-box', label: 'Token Box' },
  { id: 'decks', label: 'Mazos y kits' },
  { id: 'singles', label: 'Singles y promos' },
  { id: 'accessories', label: 'Accesorios' },
  { id: 'other', label: 'Otros productos' },
] as const;
export type CatalogPresentation = '' | (typeof catalogPresentations)[number]['id'];
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function readCatalogPresentation(value: string | null): CatalogPresentation {
  return catalogPresentations.some((item) => item.id === value)
    ? (value as CatalogPresentation)
    : '';
}
function classify(value: string): Exclude<CatalogPresentation, ''> | undefined {
  const text = normalize(value);
  if (/token\s*box/.test(text)) return 'token-box';
  if (/accesorio|protector|fundas?|dados?|tapete|playmat|deck[\s-]?box|carpeta|binder/.test(text))
    return 'accessories';
  if (/\bsingle\b|\bsingles\b|\bpromo\b|\bpromos\b|carta suelta/.test(text)) return 'singles';
  if (/display|booster box|\bcaja\b|\bcajas\b/.test(text)) return 'displays';
  if (/\bmazo\b|\bdeck\b|\bkit\b|toolkit|estructura/.test(text)) return 'decks';
  if (/\bsobre\b|\bsobres\b|booster pack|blister/.test(text)) return 'packs';
}
export function catalogPresentation(
  product: Pick<Product, 'name' | 'category' | 'options' | 'specifications'>,
): Exclude<CatalogPresentation, ''> {
  // Explicit presentation wins over names such as “Display + promo”. Never infer
  // a format from the description, which often lists other products or contents.
  const explicit = [
    ...Object.entries(product.options || {})
      .filter(([key]) => /^(formato|presentacion|tipo de producto)$/.test(normalize(key)))
      .map(([, value]) => value),
    ...(product.specifications || [])
      .filter(({ label }) => /^(formato|presentacion|tipo de producto)$/.test(normalize(label)))
      .map(({ value }) => value),
  ];
  for (const value of explicit) {
    const match = classify(value);
    if (match) return match;
  }
  return classify(product.name) || classify(product.category) || 'other';
}
