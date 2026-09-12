import { describe, expect, it } from 'vitest';

import { siteAppearanceLayoutSchema, siteAppearancePageIds } from './site-appearance.js';

const emptyLayout = Object.fromEntries(
  siteAppearancePageIds.map((pageId) => [pageId, { layers: [] }]),
);

describe('site appearance contract', () => {
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
});
