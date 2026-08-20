import { z } from 'zod';

export const catalogPublicationStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'UNPUBLISHED',
  'ARCHIVED',
]);

const requiredText = z.string().trim().min(1);
const nullableText = z.string().nullable();

export const createTcgGameSchema = z
  .object({ description: nullableText, name: requiredText, slug: requiredText })
  .strict();
export const editTcgGameSchema = nonEmptyPatch(
  z.object({ description: nullableText.optional(), name: requiredText.optional() }).strict(),
);

export const createCategorySchema = z
  .object({ description: nullableText, name: requiredText })
  .strict();
export const editCategorySchema = nonEmptyPatch(
  z.object({ description: nullableText.optional(), name: requiredText.optional() }).strict(),
);

export const createCollectionSchema = z
  .object({ description: nullableText, gameId: z.uuid(), name: requiredText })
  .strict();
export const editCollectionSchema = nonEmptyPatch(
  z
    .object({
      description: nullableText.optional(),
      gameId: z.uuid().optional(),
      name: requiredText.optional(),
    })
    .strict(),
);

export const createProductSchema = z
  .object({
    categoryId: z.uuid(),
    collectionId: z.uuid().nullable(),
    condition: nullableText,
    description: nullableText,
    edition: nullableText,
    gameId: z.uuid(),
    language: nullableText,
    name: requiredText,
    priceAmountClp: z.number().int().nonnegative().safe(),
    saleType: z.enum(['REGULAR', 'PREORDER']),
    sku: requiredText,
  })
  .strict();
export const editProductSchema = nonEmptyPatch(createProductSchema.partial().strict());

export const parentPublicationTransitionSchema = z
  .object({
    descendantStrategy: z.enum(['REJECT', 'UNPUBLISH']).optional(),
    nextStatus: z.enum(['PUBLISHED', 'UNPUBLISHED', 'ARCHIVED']),
  })
  .strict();
export const productPublicationTransitionSchema = z
  .object({ nextStatus: z.enum(['PUBLISHED', 'UNPUBLISHED', 'ARCHIVED']) })
  .strict();

export const catalogListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
    publicationStatus: catalogPublicationStatusSchema.optional(),
  })
  .strict();
export const collectionListQuerySchema = catalogListQuerySchema
  .extend({ gameId: z.uuid().optional() })
  .strict();
export const productListQuerySchema = catalogListQuerySchema
  .extend({
    categoryId: z.uuid().optional(),
    collectionId: z.uuid().optional(),
    gameId: z.uuid().optional(),
  })
  .strict();

export type CreateTcgGame = z.infer<typeof createTcgGameSchema>;
export type EditTcgGame = z.infer<typeof editTcgGameSchema>;
export type CreateCategory = z.infer<typeof createCategorySchema>;
export type EditCategory = z.infer<typeof editCategorySchema>;
export type CreateCollection = z.infer<typeof createCollectionSchema>;
export type EditCollection = z.infer<typeof editCollectionSchema>;
export type CreateProduct = z.infer<typeof createProductSchema>;
export type EditProduct = z.infer<typeof editProductSchema>;
export type ParentPublicationTransition = z.infer<typeof parentPublicationTransitionSchema>;
export type ProductPublicationTransition = z.infer<typeof productPublicationTransitionSchema>;

function nonEmptyPatch<Schema extends z.ZodObject>(schema: Schema): Schema {
  return schema.refine((value) => Object.keys(value).length > 0) as unknown as Schema;
}
