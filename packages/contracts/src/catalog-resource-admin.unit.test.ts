import { describe, expect, it } from 'vitest';

import {
  catalogResourceListQuerySchema,
  catalogResourceReplacementFieldsSchema,
  catalogResourceUploadFieldsSchema,
  reorderCatalogResourcesSchema,
  retireCatalogResourceSchema,
  selectCatalogPrimaryResourceSchema,
} from './catalog-resource-admin.js';

const id = '0198a8be-6677-7000-8000-000000000001';

describe('Catalog resource administrative contracts', () => {
  it('enforces bounded pagination and closed JSON bodies', () => {
    expect(catalogResourceListQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(() => catalogResourceListQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() =>
      selectCatalogPrimaryResourceSchema.parse({ resourceId: id, sourceType: 'PRODUCT' }),
    ).toThrow();
    expect(() => retireCatalogResourceSchema.parse({ reason: '' })).toThrow();
  });

  it('requires a complete unique order and exact multipart metadata', () => {
    expect(reorderCatalogResourcesSchema.parse({ orderedResourceIds: [id] })).toEqual({
      orderedResourceIds: [id],
    });
    expect(() => reorderCatalogResourcesSchema.parse({ orderedResourceIds: [id, id] })).toThrow();
    expect(catalogResourceUploadFieldsSchema.parse({ altText: 'Imagen', position: '1' })).toEqual({
      altText: 'Imagen',
      position: 1,
    });
    expect(() =>
      catalogResourceReplacementFieldsSchema.parse({
        altText: 'Imagen',
        isPrimary: true,
        reason: 'Cambio',
      }),
    ).toThrow();
  });
});
