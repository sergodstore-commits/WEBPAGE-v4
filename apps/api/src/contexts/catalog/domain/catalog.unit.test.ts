import { describe, expect, it } from 'vitest';

import {
  assertPublicationTransition,
  assertResourceTransition,
  normalizeProductInput,
  normalizeSafeFilename,
} from './catalog.js';

const validProduct = {
  categoryId: '0198a8be-6677-7000-8000-000000000002',
  collectionId: null,
  condition: ' near   mint ',
  description: ' Product description ',
  edition: ' first edition ',
  gameId: '0198a8be-6677-7000-8000-000000000001',
  language: 'es-cl',
  name: 'Producto',
  priceAmountClp: 12_990,
  saleType: 'REGULAR',
  sku: ' sku-1 ',
};

describe('Catalog domain', () => {
  it('normalizes only the three closed product attributes', () => {
    expect(normalizeProductInput(validProduct)).toMatchObject({
      condition: 'NEAR MINT',
      edition: 'FIRST EDITION',
      language: 'es-CL',
      sku: 'sku-1',
    });
  });

  it('rejects a fourth arbitrary product attribute', () => {
    expect(() => normalizeProductInput({ ...validProduct, rarity: 'MYTHIC' })).toThrowError(
      expect.objectContaining({ code: 'CATALOG_PRODUCT_INVALID' }),
    );
  });

  it('rejects negative prices', () => {
    expect(() => normalizeProductInput({ ...validProduct, priceAmountClp: -1 })).toThrowError(
      expect.objectContaining({ code: 'CATALOG_PRODUCT_INVALID' }),
    );
  });

  it('enforces terminal catalog and resource states', () => {
    expect(() => assertPublicationTransition('ARCHIVED', 'PUBLISHED')).toThrowError(
      expect.objectContaining({ code: 'CATALOG_STATE_TRANSITION_INVALID' }),
    );
    expect(() => assertResourceTransition('REMOVED', 'ACTIVE')).toThrowError(
      expect.objectContaining({ code: 'CATALOG_RESOURCE_STATE_TRANSITION_INVALID' }),
    );
  });

  it('rejects filenames containing a path', () => {
    expect(() => normalizeSafeFilename('../image.png')).toThrowError(
      expect.objectContaining({ code: 'CATALOG_RESOURCE_FILENAME_INVALID' }),
    );
  });
});
