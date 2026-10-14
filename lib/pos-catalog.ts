import type { Product } from './types';
import { catalogPresentation } from './catalog-presentations';
import { compareCatalogLaunch } from './catalog-order';

export const posCatalogSections = [
  { id: 'all', label: 'Todos' },
  { id: 'accessories', label: 'Accesorios' },
  { id: 'packs', label: 'Sobres' },
  { id: 'token-box', label: 'Token Box' },
  { id: 'kits', label: 'Toolkits y kits' },
  { id: 'displays', label: 'Displays y cajas' },
  { id: 'decks', label: 'Mazos' },
  { id: 'singles', label: 'Singles y promos' },
  { id: 'other', label: 'Otros' },
] as const;
export type PosCatalogSection = (typeof posCatalogSections)[number]['id'];
export type PosCatalogFamily = {
  id: string;
  name: string;
  section: Exclude<PosCatalogSection, 'all'>;
  variants: Product[];
};
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function posCatalogSection(product: Product): Exclude<PosCatalogSection, 'all'> {
  const presentation = catalogPresentation(product);
  if (presentation === 'accessories') return 'accessories';
  const formats = Object.entries(product.options || {})
    .filter(([key]) => /^(formato|presentacion|tipo de producto)$/.test(normalize(key)))
    .map(([, value]) => value);
  if (
    /\btool[\s-]?kits?\b|\bkits?\b/.test(
      normalize([...formats, product.name, product.category].join(' ')),
    )
  )
    return 'kits';
  return presentation;
}
export function posCatalogFamilies(products: Product[]): PosCatalogFamily[] {
  const families = new Map<string, PosCatalogFamily>();
  for (const product of products
    .filter((p) => p.kind === 'store' && p.status === 'published')
    .sort(compareCatalogLaunch)) {
    const section = posCatalogSection(product);
    // Only accessories share a card. Sealed formats/languages remain individual SKUs.
    // Explicit family metadata avoids merging unrelated colors/products by a name guess.
    const family =
      section === 'accessories'
        ? product.catalog_group ||
          (product.catalog_name
            ? `${product.brand}:${product.category}:${product.catalog_name}`
            : '')
        : '';
    const id = family ? `accessory:${normalize(family)}` : `product:${product.id}`;
    const old = families.get(id);
    if (old) old.variants.push(product);
    else
      families.set(id, {
        id,
        name: family ? product.catalog_name || product.name : product.name,
        section,
        variants: [product],
      });
  }
  return [...families.values()];
}
export function posCatalogSearch(
  families: PosCatalogFamily[],
  query: string,
  section: PosCatalogSection = 'all',
) {
  const text = normalize(query.trim());
  return families
    .filter((family) => section === 'all' || family.section === section)
    .flatMap((family) => {
      const variants = family.variants.filter(
        (p) =>
          !text ||
          normalize(
            [
              p.name,
              p.sku,
              p.catalog_name,
              p.brand,
              p.category,
              ...Object.values(p.options || {}),
            ].join(' '),
          ).includes(text),
      );
      return variants.length ? [{ ...family, variants }] : [];
    });
}
export function posVariantLabel(product: Product) {
  const options = Object.entries(product.options || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
  return options ? `${options} · ${product.sku}` : `${product.name} · ${product.sku}`;
}
