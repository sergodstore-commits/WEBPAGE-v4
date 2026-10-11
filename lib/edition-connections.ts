import type { Product } from './types';

export type EditionReference = { code: string; name: string };
export type EditionProduct = Pick<
  Product,
  | 'id'
  | 'slug'
  | 'name'
  | 'price'
  | 'discount_percent'
  | 'images'
  | 'options'
  | 'kind'
  | 'available'
  | 'opens_at'
  | 'closes_at'
  | 'release_date'
>;
export type EditionProducts = { edition: EditionReference; products: EditionProduct[] };

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
const aliases: Record<string, string[]> = {
  betb: ['Beyond the Brave'],
  cori: ['Chaos Origins', 'Orígenes del Caos', 'Origenes del Caos'],
};

// Match curated catalog metadata, never words appearing in descriptions or titles.
// These same keys serve product → guide and guide → products.
export function editionCatalogKeys(edition: EditionReference) {
  const names = [
    ...new Set(
      [edition.name, ...(aliases[edition.code] || [])]
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return { names, groups: [...new Set(names.map((name) => `ygo-${slug(name)}`))] };
}
export function productEdition(
  product: Pick<Product, 'catalog_group' | 'catalog_name'>,
  editions: EditionReference[],
) {
  return editions.find((edition) => {
    const keys = editionCatalogKeys(edition);
    return (
      keys.groups.includes(product.catalog_group) ||
      keys.names.includes((product.catalog_name || '').trim().toLowerCase())
    );
  });
}
export const editionExplorerPath = (code: string) =>
  `/comunidad?vista=ediciones&edicion=${encodeURIComponent(code)}`;
export const editionArticlePath = (code: string) =>
  code === 'betb'
    ? '/noticias/beyond-the-brave'
    : `/noticias/ediciones/${encodeURIComponent(code)}`;
