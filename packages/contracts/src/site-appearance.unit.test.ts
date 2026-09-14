import { describe, expect, it } from 'vitest';

import {
  siteAppearanceAssetIds,
  siteAppearanceLayoutSchema,
  siteAppearancePageIds,
} from './site-appearance.js';

const emptyLayout = Object.fromEntries(
  siteAppearancePageIds.map((pageId) => [pageId, { layers: [] }]),
);

describe('site appearance contract', () => {
  it('keeps legacy aliases and every approved visual resource in a closed catalog', () => {
    expect(siteAppearanceAssetIds).toHaveLength(120);
    expect(new Set(siteAppearanceAssetIds).size).toBe(120);
    expect(siteAppearanceAssetIds).toContain('burst-red');
    expect(siteAppearanceAssetIds).toContain('sheet-03-banner-03');
    expect(siteAppearanceAssetIds).toContain('home-launcher-shop');
    expect(siteAppearanceAssetIds).toContain('home-launcher-quests');
  });

  it('accepts one independently editable layer collection per public section', () => {
    expect(siteAppearanceLayoutSchema.safeParse({ ...emptyLayout, version: 1 }).success).toBe(true);
  });

  it('rejects duplicate identifiers within the same section', () => {
    const layer = {
      content: 'Texto',
      hiddenOnMobile: false,
      id: 'repeated-layer',
      kind: 'TEXT',
      width: 20,
      x: 10,
      y: 10,
      zIndex: 2,
    } as const;
    const result = siteAppearanceLayoutSchema.safeParse({
      ...emptyLayout,
      home: { layers: [layer, layer] },
      version: 1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts bounded positioning for existing visual elements', () => {
    const result = siteAppearanceLayoutSchema.safeParse({
      ...emptyLayout,
      home: {
        elements: [
          {
            hiddenOnMobile: false,
            id: 'home-title',
            offsetX: 12,
            offsetY: -8,
            width: 90,
            zIndex: 8,
          },
        ],
        layers: [],
      },
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an approved image for a protected linked element', () => {
    const result = siteAppearanceLayoutSchema.safeParse({
      ...emptyLayout,
      home: {
        elements: [
          {
            assetId: 'sheet-02-ornament-02',
            hiddenOnMobile: false,
            id: 'home-link-tournaments',
            offsetX: 0,
            offsetY: 0,
            width: 100,
            zIndex: 5,
          },
        ],
        layers: [],
      },
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unbounded positioning for existing visual elements', () => {
    const result = siteAppearanceLayoutSchema.safeParse({
      ...emptyLayout,
      home: {
        elements: [
          {
            hiddenOnMobile: false,
            id: 'home-title',
            offsetX: 75,
            offsetY: 0,
            width: 90,
            zIndex: 8,
          },
        ],
        layers: [],
      },
      version: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects moving an element into a different public section', () => {
    const result = siteAppearanceLayoutSchema.safeParse({
      ...emptyLayout,
      news: {
        elements: [
          {
            hiddenOnMobile: false,
            id: 'home-title',
            offsetX: 0,
            offsetY: 0,
            width: 100,
            zIndex: 5,
          },
        ],
        layers: [],
      },
      version: 1,
    });
    expect(result.success).toBe(false);
  });
});
