import type { Product } from './types';

// Only editions with a verified external destination are listed here.
// This stores links, never card catalogs, images or market prices.
export const editionLinks: Record<string, { name: string; url: string; source: string }> = {
  'ygo-beyond-the-brave': {
    name: 'Beyond the Brave',
    url: 'https://www.yugiohmeta.com/articles/sets/tcg/betb',
    source: 'Yu-Gi-Oh! Meta',
  },
};

export function editionLink(product: Pick<Product, 'catalog_group'>) {
  return editionLinks[product.catalog_group] ?? null;
}
