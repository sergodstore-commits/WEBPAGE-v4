import type { Product } from './types';
import type { PosMenuItem } from './pos-menu';

export const posBrowseCategories = [
  { id: 'all', label: 'Todos' },
  { id: 'tcg', label: 'Productos TCG' },
  { id: 'accessories', label: 'Accesorios' },
  { id: 'beverages', label: 'Bebidas' },
  { id: 'food', label: 'Comida' },
  { id: 'promos', label: 'Promos' },
] as const;
export type PosBrowseCategory = (typeof posBrowseCategories)[number]['id'];
export type PosDrinkSection = 'all' | 'soft' | 'zero' | 'beer';
export type PosAccessorySection = 'all' | 'sleeves' | 'deckboxes' | 'playmats' | 'dice' | 'other';
export const posAccessorySections: { id: PosAccessorySection; label: string }[] = [
  { id: 'all', label: 'Todos los accesorios' },
  { id: 'sleeves', label: 'Fundas y protectores' },
  { id: 'deckboxes', label: 'Deckboxes y carpetas' },
  { id: 'playmats', label: 'Playmats y estuches' },
  { id: 'dice', label: 'Dados' },
  { id: 'other', label: 'Otros accesorios' },
];
export const posBrowseText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function posAccessorySection(product: Product): Exclude<PosAccessorySection, 'all'> {
  const text = posBrowseText([product.catalog_name, product.name, product.category].join(' '));
  if (/dado|\bdice\b/.test(text)) return 'dice';
  if (/playmat|tapete|porta.playmat/.test(text)) return 'playmats';
  if (/deck.?box|carpeta|binder/.test(text)) return 'deckboxes';
  if (/funda|protector|sleeve|matte|shiny|vitrum/.test(text)) return 'sleeves';
  return 'other';
}
export function posMenuMatches(
  menu: PosMenuItem[],
  query: string,
  category: 'all' | 'beverages' | 'food' | 'promos',
  drinks: PosDrinkSection = 'all',
) {
  const text = posBrowseText(query);
  return menu.filter((item) => {
    if (category === 'promos') return false;
    if (category === 'food' && item.kind !== 'food') return false;
    if (category === 'beverages' && item.kind !== 'beverage') return false;
    if (category === 'beverages') {
      const zero = /\bzero\b|sin azucar/.test(posBrowseText(item.name));
      if (drinks === 'beer' && !item.alcoholic) return false;
      if (drinks === 'zero' && (item.alcoholic || !zero)) return false;
      if (drinks === 'soft' && (item.alcoholic || zero)) return false;
    }
    const keywords =
      item.kind === 'food'
        ? 'comida completo'
        : item.alcoholic
          ? 'bebida cerveza alcohol'
          : /\bzero\b/.test(posBrowseText(item.name))
            ? 'bebida bebida sin azucar zero'
            : 'bebida refresco gaseosa';
    return !text || posBrowseText(`${item.name} MENU-${item.code} ${keywords}`).includes(text);
  });
}
export function posPromoMatches(menu: PosMenuItem[], query: string) {
  const text = posBrowseText(query);
  const generic = 'promo completo + bebida promocion comida';
  return (
    !text ||
    generic.includes(text) ||
    menu.some(
      (item) =>
        item.kind === 'beverage' &&
        !item.alcoholic &&
        posBrowseText(`promo completo + ${item.name}`).includes(text),
    )
  );
}
