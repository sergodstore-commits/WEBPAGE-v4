import {
  cloneElement,
  createContext,
  useContext,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

import type {
  SiteAppearanceAssetId,
  SiteAppearanceElement,
  SiteAppearanceElementId,
  SiteAppearanceLayer,
  SiteAppearancePageId,
} from '@sergod/contracts';

import { appearanceAssets, elementStyle, layerStyle } from './appearance-model.js';
import { useSiteAppearance } from './useSiteAppearance.js';

const AppearanceElementsContext = createContext<readonly SiteAppearanceElement[]>([]);

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
    <AppearancePageElements page={page}>
      <div className="appearance-region">
        <AppearanceLayers layers={layout[page].layers} />
        <div className="appearance-region-content">{children}</div>
      </div>
    </AppearancePageElements>
  );
}

export function AppearancePageElements({
  children,
  page,
}: {
  readonly children: ReactNode;
  readonly page: SiteAppearancePageId;
}) {
  const layout = useSiteAppearance();
  return (
    <AppearanceElementsContext.Provider value={layout[page].elements ?? []}>
      {children}
    </AppearanceElementsContext.Provider>
  );
}

export function AppearanceElement({
  children,
  id,
}: {
  readonly children: ReactElement<{ className?: string; style?: CSSProperties }>;
  readonly id: SiteAppearanceElementId;
}) {
  const elements = useContext(AppearanceElementsContext);
  const element = elements.find((candidate) => candidate.id === id);
  if (!element) return children;
  return cloneElement(children, {
    className:
      `${children.props.className ?? ''} appearance-editable-element${element.hiddenOnMobile ? ' is-hidden-mobile' : ''}`.trim(),
    style: { ...children.props.style, ...elementStyle(element) },
  });
}

export function AppearanceLinkedAsset({
  fallbackAssetId,
  id,
}: {
  readonly fallbackAssetId: SiteAppearanceAssetId;
  readonly id: SiteAppearanceElementId;
}) {
  const elements = useContext(AppearanceElementsContext);
  const element = elements.find((candidate) => candidate.id === id);
  const assetId = element?.assetId ?? fallbackAssetId;
  return (
    <span aria-hidden="true" className="launcher-icon">
      <img alt="" src={appearanceAssets[assetId]} />
    </span>
  );
}
