import type { CSSProperties } from 'react';

import { siteAppearanceAssetIds } from '@sergod/contracts';
import type {
  SiteAppearanceAssetId,
  SiteAppearanceElement,
  SiteAppearanceElementId,
  SiteAppearanceLayout,
  SiteAppearanceLayer,
  SiteAppearancePageId,
} from '@sergod/contracts';

const legacyAppearanceAssets: Readonly<Partial<Record<SiteAppearanceAssetId, string>>> = {
  'burst-red': '/assets/sergod/ui/sheet_01/fx_01.webp',
  'brush-cyan': '/assets/sergod/ui/sheet_01/textures_08.webp',
  'brush-red': '/assets/sergod/ui/sheet_01/textures_02.webp',
  'brush-white': '/assets/sergod/ui/sheet_01/textures_06.webp',
  'fragments-red': '/assets/sergod/ui/sheet_01/bottom_fx_06.webp',
  'halftone-red': '/assets/sergod/ui/sheet_03/pattern_03.webp',
};

export const appearanceAssetIds = [...siteAppearanceAssetIds];
export const appearanceAssets: Readonly<Record<SiteAppearanceAssetId, string>> = Object.fromEntries(
  appearanceAssetIds.map((id) => [id, legacyAppearanceAssets[id] ?? generatedAssetPath(id)]),
) as Record<SiteAppearanceAssetId, string>;

const categoryLabels: Readonly<Record<string, string>> = {
  alert: 'Barras de alerta',
  banner: 'Banners',
  bottom: 'Efectos inferiores',
  divider: 'Divisores',
  dividers: 'Divisores',
  frame: 'Marcos',
  frames: 'Marcos',
  fx: 'Efectos',
  ornament: 'Adornos',
  pattern: 'Patrones',
  small: 'Marcos pequeños',
  texture: 'Texturas',
  textures: 'Texturas',
  ui: 'Insignias y flechas',
};

const legacyAssetLabels: Readonly<Partial<Record<SiteAppearanceAssetId, string>>> = {
  'burst-red': 'Impacto rojo',
  'brush-cyan': 'Pincelada cian',
  'brush-red': 'Pincelada roja',
  'brush-white': 'Pincelada blanca',
  'fragments-red': 'Fragmentos rojos',
  'halftone-red': 'Trama halftone',
};

export function appearanceAssetCategory(id: SiteAppearanceAssetId): string {
  if (!id.startsWith('sheet-')) return 'Destacados';
  return categoryLabels[id.split('-')[2] ?? ''] ?? 'Otros';
}

export function appearanceAssetLabel(id: SiteAppearanceAssetId): string {
  if (!id.startsWith('sheet-')) {
    return legacyAssetLabels[id] ?? id;
  }
  const parts = id.split('-');
  const number = parts.at(-1) ?? '';
  return `${appearanceAssetCategory(id)} ${number} · lámina ${parts[1]}`;
}

export const appearanceElementLabels: Readonly<Record<SiteAppearanceElementId, string>> = {
  'comics-heading-copy': 'Texto de portada de Cómics',
  'comics-heading-stats': 'Indicadores de Cómics',
  'community-heading-copy': 'Texto de portada de Comunidad',
  'home-eyebrow': 'Categorías de la portada',
  'home-lead': 'Descripción de la portada',
  'home-sections-heading': 'Cabecera Explora Sergod',
  'home-service': 'Tarjeta Compra con claridad',
  'home-title': 'Título principal',
  'news-heading-copy': 'Texto de portada de Noticias',
  'news-heading-stats': 'Indicadores de Noticias',
  'shop-heading-copy': 'Texto de portada de Tienda',
  'shop-heading-stats': 'Indicadores de Tienda',
  'tournaments-heading-copy': 'Texto de portada de Torneos',
  'tournaments-heading-stats': 'Indicadores de Torneos',
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

function generatedAssetPath(id: SiteAppearanceAssetId): string {
  const match = /^sheet-(\d{2})-(.+)$/u.exec(id);
  if (!match) throw new Error(`Unknown approved appearance asset: ${id}`);
  return `/assets/sergod/approved-ui/sheet_${match[1]}/${match[2]?.replaceAll('-', '_')}.png`;
}
