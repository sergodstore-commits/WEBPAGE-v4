import { z } from 'zod';

export const editorialTypeSchema = z.enum([
  'TOURNAMENT',
  'NEWS',
  'COMMUNITY',
  'COMIC_SERIES',
  'COMIC_CHAPTER',
  'QUEST',
  'HALL_OF_FAME',
]);
export const editorialStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const editorialImagePlacementSchema = z.enum(['LEFT', 'CENTER', 'RIGHT', 'FULL']);
export const editorialImageWidthSchema = z.enum(['SMALL', 'MEDIUM', 'LARGE']);
export const editorialEventStatusSchema = z.enum(['UPCOMING', 'COMPLETED']);
export const editorialEventMetadataSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    status: editorialEventStatusSchema,
  })
  .strict();
export const editorialTextBlockSchema = z
  .object({ id: z.uuid(), text: z.string().trim().min(1).max(10_000), type: z.literal('TEXT') })
  .strict();
export const editorialImageBlockSchema = z
  .object({
    altText: z.string().trim().min(1).max(500),
    id: z.uuid(),
    placement: editorialImagePlacementSchema,
    resourceId: z.uuid(),
    type: z.literal('IMAGE'),
    width: editorialImageWidthSchema,
  })
  .strict();
export const editorialDocumentSchema = z
  .object({
    blocks: z.array(z.union([editorialTextBlockSchema, editorialImageBlockSchema])).max(200),
    version: z.literal(1),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = document.blocks.map((block) => block.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({ code: 'custom', message: 'Editorial block identifiers must be unique.' });
    const textLength = document.blocks.reduce(
      (total, block) => total + (block.type === 'TEXT' ? block.text.length : 0),
      0,
    );
    if (textLength > 100_000)
      context.addIssue({ code: 'custom', message: 'Editorial document text is too long.' });
  });
export const editorialMetadataSchema = z
  .object({
    document: editorialDocumentSchema.optional(),
    event: editorialEventMetadataSchema.optional(),
  })
  .catchall(z.unknown());
export const editorialImageUploadFieldsSchema = z
  .object({
    altText: z.string().trim().min(1).max(500),
    placement: editorialImagePlacementSchema,
    width: editorialImageWidthSchema,
  })
  .strict();
export const editorialWriteSchema = z
  .object({
    body: z.string().trim().min(1).max(100_000),
    excerpt: z.string().trim().min(1).max(500),
    metadata: editorialMetadataSchema.default({}),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .max(160),
    title: z.string().trim().min(1).max(200),
    type: editorialTypeSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.metadata.event && entry.type !== 'TOURNAMENT' && entry.type !== 'QUEST') {
      context.addIssue({
        code: 'custom',
        message: 'Event metadata is only valid for tournaments and quests.',
        path: ['metadata', 'event'],
      });
    }
  });
export const editorialListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(24),
    status: editorialStatusSchema.optional(),
    type: editorialTypeSchema.optional(),
  })
  .strict();

export type EditorialType = z.infer<typeof editorialTypeSchema>;
export type EditorialStatus = z.infer<typeof editorialStatusSchema>;
export type EditorialWrite = z.infer<typeof editorialWriteSchema>;
export type EditorialDocument = z.infer<typeof editorialDocumentSchema>;
export type EditorialBlock = EditorialDocument['blocks'][number];
export type EditorialImagePlacement = z.infer<typeof editorialImagePlacementSchema>;
export type EditorialImageWidth = z.infer<typeof editorialImageWidthSchema>;
export type EditorialEventMetadata = z.infer<typeof editorialEventMetadataSchema>;
