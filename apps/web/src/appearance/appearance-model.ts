import type { CSSProperties } from 'react';

import type {
  SiteAppearanceAssetId,
  SiteAppearanceLayout,
  SiteAppearanceLayer,
} from '@sergod/contracts';

export const appearanceAssets = {
  'burst-red': '/assets/sergod/ui/sheet_01/fx_01.webp',
  'brush-cyan': '/assets/sergod/ui/sheet_01/textures_08.webp',
  'brush-red': '/assets/sergod/ui/sheet_01/textures_02.webp',
  'brush-white': '/assets/sergod/ui/sheet_01/textures_06.webp',
  'fragments-red': '/assets/sergod/ui/sheet_01/bottom_fx_06.webp',
  'halftone-red': '/assets/sergod/ui/sheet_03/pattern_03.webp',
} as const;

export const appearanceAssetIds = Object.keys(appearanceAssets) as SiteAppearanceAssetId[];

export const defaultAppearanceLayout: SiteAppearanceLayout = {
  home: { layers: [] },
  version: 1,
};

export function layerStyle(layer: SiteAppearanceLayer): CSSProperties {
  return {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    zIndex: layer.zIndex,
  };
}
