import type { CSSProperties } from 'react';

import type {
  SiteAppearanceAssetId,
  SiteAppearanceElement,
  SiteAppearanceElementId,
  SiteAppearanceLayout,
  SiteAppearanceLayer,
  SiteAppearancePageId,
} from '@sergod/contracts';

export const appearanceAssetIds: readonly SiteAppearanceAssetId[] = [];
export const appearanceAssets = {} as Readonly<Record<SiteAppearanceAssetId, string>>;

export function appearanceAssetCategory(id: SiteAppearanceAssetId): string {
  return id ? 'Sin biblioteca inicial' : 'Sin biblioteca inicial';
}

export function appearanceAssetLabel(id: SiteAppearanceAssetId): string {
  return id;
}

export const appearanceElementLabels: Readonly<Record<SiteAppearanceElementId, string>> = {
  'comics-heading-copy': 'Texto de portada de Cómics',
  'comics-heading-stats': 'Indicadores de Cómics',
  'community-heading-copy': 'Texto de portada de Comunidad',
  'home-eyebrow': 'Texto auxiliar de portada',
  'home-lead': 'Descripción de la portada',
  'home-link-comics': 'Acceso vinculado · Cómics',
  'home-link-community': 'Acceso vinculado · Comunidad',
  'home-link-loyalty': 'Acceso vinculado · Puntos Sergod',
  'home-link-news': 'Acceso vinculado · Noticias',
  'home-link-preorders': 'Acceso vinculado · Preventas',
  'home-link-quests': 'Acceso vinculado · Quests',
  'home-link-shop': 'Acceso vinculado · Tienda',
  'home-link-tournaments': 'Acceso vinculado · Torneos',
  'home-sections-heading': 'Encabezado de navegación',
  'home-service': 'Bloque informativo de portada',
  'home-title': 'Título principal',
  'news-heading-copy': 'Texto de portada de Noticias',
  'news-heading-stats': 'Indicadores de Noticias',
  'shop-heading-copy': 'Texto de portada de Tienda',
  'shop-heading-stats': 'Indicadores de Tienda',
  'tournaments-heading-copy': 'Texto de portada de Torneos',
  'tournaments-heading-stats': 'Indicadores de Torneos',
};

export const linkedAppearanceElements: Readonly<
  Partial<Record<SiteAppearanceElementId, { readonly label: string; readonly route: string }>>
> = {
  'home-link-comics': { label: 'Cómics', route: '/comics' },
  'home-link-community': { label: 'Comunidad', route: '/community' },
  'home-link-loyalty': { label: 'Puntos Sergod', route: '/loyalty' },
  'home-link-news': { label: 'Noticias', route: '/news' },
  'home-link-preorders': { label: 'Preventas', route: '/preorders' },
  'home-link-quests': { label: 'Quests', route: '/quests' },
  'home-link-shop': { label: 'Tienda', route: '/shop' },
  'home-link-tournaments': { label: 'Torneos', route: '/tournaments' },
};

export const defaultAppearanceElements: Readonly<
  Record<SiteAppearancePageId, readonly SiteAppearanceElement[]>
> = {
  comics: defaults('comics-heading-copy', 'comics-heading-stats'),
  community: defaults('community-heading-copy'),
  home: defaults(
    'home-eyebrow',
    'home-title',
    'home-lead',
    'home-service',
    'home-sections-heading',
  ),
  news: defaults('news-heading-copy', 'news-heading-stats'),
  shop: defaults('shop-heading-copy', 'shop-heading-stats'),
  tournaments: defaults('tournaments-heading-copy', 'tournaments-heading-stats'),
};

export const defaultAppearanceLayout: SiteAppearanceLayout = {
  comics: { elements: [...defaultAppearanceElements.comics], layers: [] },
  community: { elements: [...defaultAppearanceElements.community], layers: [] },
  home: { elements: [...defaultAppearanceElements.home], layers: [] },
  news: { elements: [...defaultAppearanceElements.news], layers: [] },
  shop: { elements: [...defaultAppearanceElements.shop], layers: [] },
  tournaments: { elements: [...defaultAppearanceElements.tournaments], layers: [] },
  version: 1,
};

export function hydrateAppearanceLayout(layout: SiteAppearanceLayout): SiteAppearanceLayout {
  return {
    ...layout,
    comics: hydratePage(layout, 'comics'),
    community: hydratePage(layout, 'community'),
    home: hydratePage(layout, 'home'),
    news: hydratePage(layout, 'news'),
    shop: hydratePage(layout, 'shop'),
    tournaments: hydratePage(layout, 'tournaments'),
  };
}

export function layerStyle(layer: SiteAppearanceLayer): CSSProperties {
  return {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    zIndex: layer.zIndex,
  };
}

export function elementStyle(element: SiteAppearanceElement): CSSProperties {
  return {
    position: 'relative',
    transform: `translate(${element.offsetX}%, ${element.offsetY}%)`,
    width: `${element.width}%`,
    zIndex: element.zIndex,
  };
}

function hydratePage(layout: SiteAppearanceLayout, page: SiteAppearancePageId) {
  const received = layout[page].elements ?? [];
  const byId = new Map(received.map((element) => [element.id, element]));
  return {
    ...layout[page],
    elements: defaultAppearanceElements[page].map((element) => byId.get(element.id) ?? element),
  };
}

function defaults(...ids: readonly SiteAppearanceElementId[]): readonly SiteAppearanceElement[] {
  return ids.map((id) => ({
    hiddenOnMobile: false,
    id,
    offsetX: 0,
    offsetY: 0,
    width: 100,
    zIndex: 5,
  }));
}
