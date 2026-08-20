import { z } from 'zod';

export const catalogResourceOwnerSegmentSchema = z.enum([
  'tcg-games',
  'categories',
  'collections',
  'products',
]);

export const catalogResourceRouteParametersSchema = z
  .object({
    entityId: z.uuid(),
    resourceId: z.uuid().optional(),
  })
  .strict();

export const catalogResourceListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
  })
  .strict();

export const reorderCatalogResourcesSchema = z
  .object({ orderedResourceIds: z.array(z.uuid()).refine(uniqueValues) })
  .strict();

export const selectCatalogPrimaryResourceSchema = z.object({ resourceId: z.uuid() }).strict();

export const retireCatalogResourceSchema = z.object({ reason: z.string().trim().min(1) }).strict();

export const catalogResourceUploadFieldsSchema = z
  .object({ altText: z.string().trim().min(1), position: z.coerce.number().int().positive() })
  .strict();

export const catalogResourceReplacementFieldsSchema = z
  .object({ altText: z.string().trim().min(1), reason: z.string().trim().min(1) })
  .strict();

export const catalogResourceStateSchema = z.enum(['QUARANTINED', 'ACTIVE', 'REPLACED', 'REMOVED']);

export const catalogResourceAdminItemSchema = z
  .object({
    altText: z.string(),
    byteSize: z.number().int().positive(),
    heightPx: z.number().int().positive(),
    isPrimary: z.boolean(),
    mimeTypeReal: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
    originalFilenameSafe: z.string(),
    position: z.number().int().positive(),
    replacedResourceId: z.uuid().nullable(),
    resourceId: z.uuid(),
    retiredAt: z.iso.datetime().nullable(),
    retiredBy: z.uuid().nullable(),
    sha256Hex: z.string().regex(/^[0-9a-f]{64}$/u),
    state: catalogResourceStateSchema,
    uploadedAt: z.iso.datetime(),
    uploadedBy: z.uuid(),
    validatedAt: z.iso.datetime(),
    widthPx: z.number().int().positive(),
  })
  .strict();

export const catalogResourceAdminListResponseSchema = z
  .object({ items: z.array(catalogResourceAdminItemSchema), nextCursor: z.string().nullable() })
  .strict();

export const catalogResourceAdminMutationResponseSchema = z
  .object({ item: catalogResourceAdminItemSchema, replayed: z.boolean() })
  .strict();

export const catalogResourceAdminReorderResponseSchema = z
  .object({ items: z.array(catalogResourceAdminItemSchema), replayed: z.boolean() })
  .strict();

export const catalogResourceAdminPublicErrorCodeSchema = z.enum([
  'INVALID_MULTIPART',
  'INVALID_JSON',
  'AUTHENTICATION_REQUIRED',
  'ACCESS_DENIED',
  'ROUTE_NOT_FOUND',
  'CATALOG_ENTITY_NOT_FOUND',
  'CATALOG_RESOURCE_NOT_FOUND',
  'CATALOG_UNIQUE_CONFLICT',
  'CATALOG_IDEMPOTENCY_CONFLICT',
  'STATE_CONFLICT',
  'PRECONDITION_FAILED',
  'REQUEST_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'PRECONDITION_REQUIRED',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export type CatalogResourceListQuery = z.infer<typeof catalogResourceListQuerySchema>;
export type ReorderCatalogResources = z.infer<typeof reorderCatalogResourcesSchema>;
export type RetireCatalogResource = z.infer<typeof retireCatalogResourceSchema>;
export type SelectCatalogPrimaryResource = z.infer<typeof selectCatalogPrimaryResourceSchema>;
export type CatalogResourceAdminItem = z.infer<typeof catalogResourceAdminItemSchema>;
export type CatalogResourceAdminPublicErrorCode = z.infer<
  typeof catalogResourceAdminPublicErrorCodeSchema
>;

function uniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
