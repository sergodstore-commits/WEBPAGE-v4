import type { ReactNode } from 'react';

import type { SiteAppearanceLayer, SiteAppearancePageId } from '@sergod/contracts';

import { appearanceAssets, layerStyle } from './appearance-model.js';
import { useSiteAppearance } from './useSiteAppearance.js';

export function AppearanceLayers({ layers }: { readonly layers: readonly SiteAppearanceLayer[] }) {
  if (layers.length === 0) return null;
  return (
    <div className="appearance-layers">
      {layers.map((layer) => (
        <span
          aria-hidden={layer.kind === 'ASSET' ? true : undefined}
          className={`appearance-layer appearance-layer-${layer.kind.toLowerCase()}${layer.hiddenOnMobile ? ' is-hidden-mobile' : ''}`}
          key={layer.id}
          style={layerStyle(layer)}
        >
          {layer.kind === 'ASSET' && layer.assetId ? (
            <img alt="" src={appearanceAssets[layer.assetId]} />
          ) : (
            layer.content
          )}
        </span>
      ))}
    </div>
  );
}

export function AppearanceRegion({
  children,
  page,
}: {
  readonly children: ReactNode;
  readonly page: SiteAppearancePageId;
}) {
  const layout = useSiteAppearance();
  return (
    <div className="appearance-region">
      <AppearanceLayers layers={layout[page].layers} />
      <div className="appearance-region-content">{children}</div>
    </div>
  );
}
