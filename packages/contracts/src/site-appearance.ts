import { z } from 'zod';

export const siteAppearanceAssetIds = [
  'burst-red',
  'brush-cyan',
  'brush-red',
  'brush-white',
  'fragments-red',
  'halftone-red',
] as const;

export const siteAppearanceAssetIdSchema = z.enum(siteAppearanceAssetIds);
export type SiteAppearanceAssetId = z.infer<typeof siteAppearanceAssetIdSchema>;

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

export const siteAppearanceLayoutSchema = z
  .object({
    home: z.object({ layers: z.array(siteAppearanceLayerSchema).max(24) }).strict(),
    version: z.literal(1),
  })
  .strict()
  .superRefine((layout, context) => {
    const ids = layout.home.layers.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Appearance layer identifiers must be unique.' });
    }
  });

export type SiteAppearanceLayout = z.infer<typeof siteAppearanceLayoutSchema>;
export type SiteAppearanceLayer = z.infer<typeof siteAppearanceLayerSchema>;
