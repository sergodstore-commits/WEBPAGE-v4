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
export const editorialWriteSchema = z
  .object({
    body: z.string().trim().min(1).max(100_000),
    excerpt: z.string().trim().min(1).max(500),
    metadata: z.record(z.string(), z.unknown()).default({}),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .max(160),
    title: z.string().trim().min(1).max(200),
    type: editorialTypeSchema,
  })
  .strict();
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
