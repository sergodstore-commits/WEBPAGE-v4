import {
  catalogListQuerySchema,
  collectionListQuerySchema,
  createCategorySchema,
  createCollectionSchema,
  createProductSchema,
  createTcgGameSchema,
  editCategorySchema,
  editCollectionSchema,
  editProductSchema,
  editTcgGameSchema,
  parentPublicationTransitionSchema,
  productListQuerySchema,
  productPublicationTransitionSchema,
} from '@sergod/contracts';
import { describe, expect, it } from 'vitest';

const id = '0198a8be-6677-7000-8000-000000000001';

describe('Catalog administrative HTTP contracts', () => {
  it('keeps 3C available while composing the approved 3D Storage flow', async () => {
    const source = await readFile('apps/api/src/main.ts', 'utf8');
    expect(source).toContain('CatalogEntityAdminService');
    expect(source).toContain('CatalogResourceAdminService');
    expect(source).toContain('SharpCatalogImageValidator');
    expect(source).toContain('SupabaseCatalogPrivateStorage');
    expect(source).toMatch(/catalogConfig === null\s*\? null/u);
  });

  it('exports closed input contracts for the four entity families', () => {
    expect(createTcgGameSchema.parse({ description: null, name: 'Juego', slug: 'juego' })).toEqual({
      description: null,
      name: 'Juego',
      slug: 'juego',
    });
    expect(createCategorySchema.parse({ description: null, name: 'Categoría' })).toBeDefined();
    expect(
      createCollectionSchema.parse({ description: null, gameId: id, name: 'Colección' }),
    ).toBeDefined();
    expect(
      createProductSchema.parse({
        categoryId: id,
        collectionId: null,
        condition: null,
        description: null,
        edition: null,
        gameId: id,
        language: null,
        name: 'Producto',
        priceAmountClp: 0,
        saleType: 'REGULAR',
        sku: 'SKU-1',
      }),
    ).toBeDefined();
    for (const schema of [
      editTcgGameSchema,
      editCategorySchema,
      editCollectionSchema,
      editProductSchema,
    ]) {
      expect(() => schema.parse({})).toThrow();
    }
  });

  it('accepts only the approved list filters and transitions', () => {
    expect(catalogListQuerySchema.parse({ limit: '100', publicationStatus: 'ARCHIVED' })).toEqual({
      limit: 100,
      publicationStatus: 'ARCHIVED',
    });
    expect(collectionListQuerySchema.parse({ gameId: id, limit: '1' })).toBeDefined();
    expect(productListQuerySchema.parse({ categoryId: id, gameId: id, limit: '10' })).toBeDefined();
    expect(() => productListQuerySchema.parse({ limit: '10', sku: 'SKU-1' })).toThrow();
    expect(parentPublicationTransitionSchema.parse({ nextStatus: 'UNPUBLISHED' })).toBeDefined();
    expect(productPublicationTransitionSchema.parse({ nextStatus: 'PUBLISHED' })).toBeDefined();
    expect(() =>
      productPublicationTransitionSchema.parse({
        descendantStrategy: 'UNPUBLISH',
        nextStatus: 'ARCHIVED',
      }),
    ).toThrow();
  });
});
import { readFile } from 'node:fs/promises';
