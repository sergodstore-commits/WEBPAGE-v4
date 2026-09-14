import { z } from 'zod';

import { siteAppearanceAssetIds } from './site-appearance-assets.js';

export { siteAppearanceAssetIds } from './site-appearance-assets.js';

export const siteAppearanceAssetIdSchema = z.enum(siteAppearanceAssetIds);
export type SiteAppearanceAssetId = z.infer<typeof siteAppearanceAssetIdSchema>;

export const siteAppearancePageIds = [
  'home',
  'shop',
  'tournaments',
  'news',
  'community',
  'comics',
] as const;
export const siteAppearancePageIdSchema = z.enum(siteAppearancePageIds);
export type SiteAppearancePageId = z.infer<typeof siteAppearancePageIdSchema>;

export const siteAppearanceElementIds = [
  'home-eyebrow',
  'home-title',
  'home-lead',
  'home-service',
  'home-sections-heading',
  'home-link-shop',
  'home-link-tournaments',
  'home-link-news',
  'home-link-community',
  'home-link-comics',
  'home-link-preorders',
  'home-link-loyalty',
  'home-link-quests',
  'shop-heading-copy',
  'shop-heading-stats',
  'tournaments-heading-copy',
  'tournaments-heading-stats',
  'news-heading-copy',
  'news-heading-stats',
  'community-heading-copy',
  'comics-heading-copy',
  'comics-heading-stats',
] as const;
export const siteAppearanceElementIdSchema = z.enum(siteAppearanceElementIds);
export type SiteAppearanceElementId = z.infer<typeof siteAppearanceElementIdSchema>;

export const siteAppearanceElementSchema = z
  .object({
    assetId: siteAppearanceAssetIdSchema.optional(),
    hiddenOnMobile: z.boolean(),
    id: siteAppearanceElementIdSchema,
    offsetX: z.number().min(-50).max(50),
    offsetY: z.number().min(-50).max(50),
    width: z.number().min(40).max(120),
    zIndex: z.number().int().min(0).max(30),
  })
  .strict();

export const siteAppearanceLayerSchema = z
  .object({
    assetId: siteAppearanceAssetIdSchema.optional(),
    content: z.string().trim().min(1).max(160).optional(),
    hiddenOnMobile: z.boolean(),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/u),
    kind: z.enum(['ASSET', 'TEXT']),
    width: z.number().min(5).max(100),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    zIndex: z.number().int().min(0).max(30),
  })
  .strict()
  .superRefine((layer, context) => {
    if (layer.kind === 'ASSET' && layer.assetId === undefined) {
      context.addIssue({ code: 'custom', message: 'Asset layers require an approved asset.' });
    }
    if (layer.kind === 'TEXT' && layer.content === undefined) {
      context.addIssue({ code: 'custom', message: 'Text layers require content.' });
    }
    if (layer.x + layer.width > 110) {
      context.addIssue({ code: 'custom', message: 'Layer exceeds the editable canvas.' });
    }
  });

const siteAppearancePageSchema = z
  .object({
    elements: z.array(siteAppearanceElementSchema).max(16).optional(),
    layers: z.array(siteAppearanceLayerSchema).max(24),
  })
  .strict();

export const siteAppearanceLayoutSchema = z
  .object({
    comics: siteAppearancePageSchema,
    community: siteAppearancePageSchema,
    home: siteAppearancePageSchema,
    news: siteAppearancePageSchema,
    shop: siteAppearancePageSchema,
    tournaments: siteAppearancePageSchema,
    version: z.literal(1),
  })
  .strict()
  .superRefine((layout, context) => {
    for (const pageId of siteAppearancePageIds) {
      const ids = layout[pageId].layers.map(({ id }) => id);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: 'custom',
          message: `Appearance layer identifiers must be unique within ${pageId}.`,
        });
      }
      const elementIds = (layout[pageId].elements ?? []).map(({ id }) => id);
      if (new Set(elementIds).size !== elementIds.length) {
        context.addIssue({
          code: 'custom',
          message: `Appearance element identifiers must be unique within ${pageId}.`,
        });
      }
      if (elementIds.some((id) => !id.startsWith(`${pageId}-`))) {
        context.addIssue({
          code: 'custom',
          message: `Appearance elements must belong to ${pageId}.`,
        });
      }
    }
  });

export type SiteAppearanceLayout = z.infer<typeof siteAppearanceLayoutSchema>;
export type SiteAppearanceElement = z.infer<typeof siteAppearanceElementSchema>;
export type SiteAppearanceLayer = z.infer<typeof siteAppearanceLayerSchema>;
