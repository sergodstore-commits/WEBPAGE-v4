import { z } from 'zod';

const normalizedUuidSchema = z.uuid().transform((value) => value.toLowerCase());
const cursorSchema = z.string().min(1).max(2048);
const limitSchema = z.coerce.number().int().min(1).max(100);

export const catalogPublicSortSchema = z.enum(['NEWEST', 'NAME_ASC', 'PRICE_ASC', 'PRICE_DESC']);
export const catalogPublicAvailabilityStatusSchema = z.enum([
  'AVAILABLE',
  'LAST_UNITS',
  'OUT_OF_STOCK',
]);

export const catalogPublicResourceIdSchema = normalizedUuidSchema;

export const catalogPublicReferenceListQuerySchema = z
  .object({ cursor: cursorSchema.optional(), limit: limitSchema })
  .strict();

export const catalogPublicCollectionListQuerySchema = catalogPublicReferenceListQuerySchema
  .extend({ gameId: normalizedUuidSchema.optional() })
  .strict();

export const catalogPublicProductListQuerySchema = catalogPublicReferenceListQuerySchema
  .extend({
    availabilityStatus: catalogPublicAvailabilityStatusSchema.optional(),
    categoryId: normalizedUuidSchema.optional(),
    collectionId: normalizedUuidSchema.optional(),
    condition: normalizedConditionSchema().optional(),
    edition: normalizedEditionSchema().optional(),
    gameId: normalizedUuidSchema.optional(),
    language: normalizedLanguageSchema().optional(),
    maximumPriceClp: z.coerce.number().int().nonnegative().safe().optional(),
    minimumPriceClp: z.coerce.number().int().nonnegative().safe().optional(),
    q: z.string().trim().min(2).max(80).optional(),
    saleType: z.enum(['REGULAR', 'PREORDER']).optional(),
    sort: catalogPublicSortSchema.default('NEWEST'),
  })
  .strict()
  .refine(
    ({ maximumPriceClp, minimumPriceClp }) =>
      maximumPriceClp === undefined ||
      minimumPriceClp === undefined ||
      minimumPriceClp <= maximumPriceClp,
    { message: 'Minimum price must not exceed maximum price.' },
  );

export const catalogPublicFilterValuesQuerySchema = z
  .object({
    attribute: z.enum(['language', 'edition', 'condition']),
    cursor: cursorSchema.optional(),
    limit: limitSchema,
  })
  .strict();

export const catalogPublicPrimaryResourceSchema = z
  .object({
    altText: z.string().trim().min(1),
    heightPx: z.number().int().positive(),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
    resourceId: z.uuid(),
    widthPx: z.number().int().positive(),
  })
  .strict();

export const catalogPublicGameReferenceSchema = z
  .object({ gameId: z.uuid(), name: z.string().min(1), slug: z.string().min(1) })
  .strict();

export const catalogPublicCategoryReferenceSchema = z
  .object({ categoryId: z.uuid(), name: z.string().min(1) })
  .strict();

export const catalogPublicCollectionReferenceSchema = z
  .object({ collectionId: z.uuid(), name: z.string().min(1) })
  .strict();

export const catalogPublicGameItemSchema = catalogPublicGameReferenceSchema;
export const catalogPublicCategoryItemSchema = catalogPublicCategoryReferenceSchema;
export const catalogPublicCollectionItemSchema = z
  .object({
    collectionId: z.uuid(),
    game: catalogPublicGameReferenceSchema,
    name: z.string().min(1),
  })
  .strict();

export const catalogPublicProductCardSchema = z
  .object({
    availableForPurchase: z.boolean(),
    availabilityStatus: catalogPublicAvailabilityStatusSchema,
    game: catalogPublicGameReferenceSchema,
    name: z.string().min(1),
    priceAmountClp: z.number().int().nonnegative().safe(),
    preorderCampaignId: z.uuid().nullable(),
    primaryResource: catalogPublicPrimaryResourceSchema,
    productId: z.uuid(),
    saleType: z.enum(['REGULAR', 'PREORDER']),
  })
  .strict()
  .refine(
    ({ availabilityStatus, availableForPurchase }) =>
      availableForPurchase === (availabilityStatus !== 'OUT_OF_STOCK'),
    { message: 'Purchase availability must match the public availability status.' },
  );

export const catalogPublicProductDetailSchema = catalogPublicProductCardSchema
  .safeExtend({
    category: catalogPublicCategoryReferenceSchema,
    collection: catalogPublicCollectionReferenceSchema.nullable(),
    condition: z.string().nullable(),
    description: z.string().nullable(),
    edition: z.string().nullable(),
    language: z.string().nullable(),
    preorder: z
      .object({
        availableCapacity: z.number().int().nonnegative(),
        capacity: z.number().int().positive(),
        closesAt: z.iso.datetime({ offset: true }),
        estimatedArrivalText: z.string().trim().min(1).max(500),
        opensAt: z.iso.datetime({ offset: true }),
        preorderCampaignId: normalizedUuidSchema,
      })
      .strict()
      .nullable(),
    resources: z.array(catalogPublicPrimaryResourceSchema).min(1),
    sku: z.string().min(1),
  })
  .strict()
  .superRefine((product, context) => {
    if (product.saleType === 'REGULAR' && product.preorder !== null) {
      context.addIssue({
        code: 'custom',
        message: 'A regular product cannot expose preorder detail.',
        path: ['preorder'],
      });
    }
    if (
      !product.resources.some(({ resourceId }) => resourceId === product.primaryResource.resourceId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Product gallery must contain its primary resource.',
        path: ['resources'],
      });
    }
  });

export const catalogPublicGameListResponseSchema = publicPage(catalogPublicGameItemSchema);
export const catalogPublicCategoryListResponseSchema = publicPage(catalogPublicCategoryItemSchema);
export const catalogPublicCollectionListResponseSchema = publicPage(
  catalogPublicCollectionItemSchema,
);
export const catalogPublicProductListResponseSchema = publicPage(catalogPublicProductCardSchema);
export const catalogPublicFilterValuesResponseSchema = publicPage(z.string().min(1));
export const catalogPublicProductDetailResponseSchema = z
  .object({ item: catalogPublicProductDetailSchema })
  .strict();

export const catalogPublicErrorCodeSchema = z.enum([
  'ROUTE_NOT_FOUND',
  'CATALOG_ENTITY_NOT_FOUND',
  'CATALOG_RESOURCE_NOT_FOUND',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export type CatalogPublicSort = z.infer<typeof catalogPublicSortSchema>;
export type CatalogPublicAvailabilityStatus = z.infer<typeof catalogPublicAvailabilityStatusSchema>;
export type CatalogPublicProductListQuery = z.infer<typeof catalogPublicProductListQuerySchema>;
export type CatalogPublicFilterAttribute = z.infer<
  typeof catalogPublicFilterValuesQuerySchema
>['attribute'];
export type CatalogPublicPrimaryResource = z.infer<typeof catalogPublicPrimaryResourceSchema>;
export type CatalogPublicGameReference = z.infer<typeof catalogPublicGameReferenceSchema>;
export type CatalogPublicCategoryReference = z.infer<typeof catalogPublicCategoryReferenceSchema>;
export type CatalogPublicCollectionReference = z.infer<
  typeof catalogPublicCollectionReferenceSchema
>;
export type CatalogPublicGameItem = z.infer<typeof catalogPublicGameItemSchema>;
export type CatalogPublicCategoryItem = z.infer<typeof catalogPublicCategoryItemSchema>;
export type CatalogPublicCollectionItem = z.infer<typeof catalogPublicCollectionItemSchema>;
export type CatalogPublicProductCard = z.infer<typeof catalogPublicProductCardSchema>;
export type CatalogPublicProductDetail = z.infer<typeof catalogPublicProductDetailSchema>;

function normalizedEditionSchema(): z.ZodString {
  return normalizedDescriptorSchema(80);
}

function normalizedConditionSchema(): z.ZodString {
  return normalizedDescriptorSchema(40);
}

function normalizedDescriptorSchema(maximumLength: number): z.ZodString {
  return z
    .string()
    .min(1)
    .max(maximumLength)
    .refine(
      (value) =>
        value === value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleUpperCase('und') &&
        /^[-\p{L}\p{N} .'/()&+]+$/u.test(value),
      { message: 'Catalog attribute must use its persisted normalized value.' },
    );
}

function normalizedLanguageSchema(): z.ZodString {
  return z
    .string()
    .min(2)
    .max(35)
    .refine(
      (value) => {
        try {
          return Intl.getCanonicalLocales(value)[0] === value;
        } catch {
          return false;
        }
      },
      { message: 'Catalog language must be a canonical BCP 47 tag.' },
    );
}

function publicPage<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();
}
