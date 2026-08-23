import { describe, expect, it } from 'vitest';

import {
  catalogPublicFilterValuesQuerySchema,
  catalogPublicProductCardSchema,
  catalogPublicProductListQuerySchema,
  catalogPublicResourceIdSchema,
} from './catalog-public.js';

const id = '0198a8be-6677-7000-8000-000000000001';

describe('Public catalog contracts', () => {
  it('accepts the closed filters and applies NEWEST by default', () => {
    expect(
      catalogPublicProductListQuerySchema.parse({
        availabilityStatus: 'LAST_UNITS',
        categoryId: id,
        condition: 'NEAR MINT',
        edition: 'FIRST EDITION',
        language: 'es-CL',
        limit: '20',
        maximumPriceClp: '10000',
        minimumPriceClp: '1000',
        q: 'Pokémon base',
        saleType: 'REGULAR',
      }),
    ).toMatchObject({
      availabilityStatus: 'LAST_UNITS',
      limit: 20,
      maximumPriceClp: 10000,
      minimumPriceClp: 1000,
      sort: 'NEWEST',
    });
    expect(() =>
      catalogPublicProductListQuerySchema.parse({
        limit: 20,
        maximumPriceClp: 999,
        minimumPriceClp: 1000,
      }),
    ).toThrow();
  });

  it('rejects unknown filters, invalid q and non-normalized attributes', () => {
    expect(() => catalogPublicProductListQuerySchema.parse({ limit: '10', rating: '5' })).toThrow();
    expect(() => catalogPublicProductListQuerySchema.parse({ limit: '10', q: 'x' })).toThrow();
    expect(() =>
      catalogPublicProductListQuerySchema.parse({ condition: 'Near Mint', limit: '10' }),
    ).toThrow();
    expect(() =>
      catalogPublicProductListQuerySchema.parse({ language: 'ES-cl', limit: '10' }),
    ).toThrow();
  });

  it('keeps filter attributes and product cards closed', () => {
    expect(
      catalogPublicFilterValuesQuerySchema.parse({ attribute: 'edition', limit: '100' }),
    ).toEqual({ attribute: 'edition', limit: 100 });
    expect(() =>
      catalogPublicFilterValuesQuerySchema.parse({ attribute: 'rarity', limit: '10' }),
    ).toThrow();
    expect(() =>
      catalogPublicProductCardSchema.parse({
        game: { gameId: id, name: 'Juego', slug: 'juego' },
        name: 'Producto',
        priceAmountClp: 1000,
        primaryResource: {
          altText: 'Imagen',
          heightPx: 320,
          mimeType: 'image/png',
          resourceId: id,
          secureStorageKey: 'private/key',
          widthPx: 320,
        },
        productId: id,
        saleType: 'REGULAR',
      }),
    ).toThrow();
  });

  it('keeps the purchase boolean consistent with the public availability state', () => {
    const card = {
      availabilityStatus: 'LAST_UNITS' as const,
      availableForPurchase: true,
      game: { gameId: id, name: 'Juego', slug: 'juego' },
      name: 'Producto',
      priceAmountClp: 1000,
      preorderCampaignId: null,
      primaryResource: {
        altText: 'Imagen',
        heightPx: 320,
        mimeType: 'image/png' as const,
        resourceId: id,
        widthPx: 320,
      },
      productId: id,
      saleType: 'REGULAR' as const,
    };
    expect(catalogPublicProductCardSchema.parse(card)).toEqual(card);
    expect(() =>
      catalogPublicProductCardSchema.parse({
        ...card,
        availabilityStatus: 'OUT_OF_STOCK',
      }),
    ).toThrow();
  });

  it('normalizes only valid public resource UUIDs', () => {
    expect(catalogPublicResourceIdSchema.parse(id.toUpperCase())).toBe(id);
    expect(() => catalogPublicResourceIdSchema.parse('not-a-resource-id')).toThrow();
  });
});
