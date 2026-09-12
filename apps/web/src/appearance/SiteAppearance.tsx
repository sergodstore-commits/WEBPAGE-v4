import type { SiteAppearanceLayer } from '@sergod/contracts';

import { appearanceAssets, layerStyle } from './appearance-model.js';

export function AppearanceLayers({ layers }: { readonly layers: readonly SiteAppearanceLayer[] }) {
  if (layers.length === 0) return null;
  return (
    <div aria-hidden="true" className="appearance-layers">
      {layers.map((layer) => (
        <span
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
