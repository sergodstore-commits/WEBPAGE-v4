import { describe, expect, it } from 'vitest';

import { UuidCatalogStorageKeyGenerator } from './catalog-storage-key-generator.js';

const uuid = '0198a8be-6677-7000-8000-000000000003';

describe('Catalog storage key generator', () => {
  const generator = new UuidCatalogStorageKeyGenerator({ generate: () => uuid });

  it('places new private objects inside their logical owner folder', () => {
    expect(generator.generate(`products/${uuid}`)).toBe(`products/${uuid}/${uuid}`);
    expect(generator.generate('news/0198a8be-6677-7000-8000-000000000004')).toBe(
      `news/0198a8be-6677-7000-8000-000000000004/${uuid}`,
    );
  });

  it('rejects traversal, separators and display names in storage folders', () => {
    for (const folder of ['../products', 'products\\unsafe', '/products', 'Productos Nuevos']) {
      expect(() => generator.generate(folder)).toThrowError(
        expect.objectContaining({ code: 'CATALOG_STORAGE_FOLDER_INVALID' }),
      );
    }
  });
});
