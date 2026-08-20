import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { CatalogPublicResourceService } from '../../src/contexts/catalog/application/catalog-public-resource-service.js';
import type { CatalogPublicResourceQueryPort } from '../../src/contexts/catalog/application/catalog-public-ports.js';
import type { CatalogPrivateStoragePort } from '../../src/contexts/catalog/application/ports.js';
import { catalogImageLimits, CatalogError } from '../../src/contexts/catalog/domain/catalog.js';

const resourceId = '0198a8be-6677-7000-8000-000000000001';
const secureStorageKey = '0198a8be-6677-7000-8000-000000000099';
const bytes = new Uint8Array([1, 2, 3, 4]);
const sha256Hex = createHash('sha256').update(bytes).digest('hex');

function subject(
  recordOverrides: Partial<{
    byteSize: number;
    mimeTypeReal: 'image/png';
    resourceId: string;
    secureStorageKey: string;
    sha256Hex: string;
  }> = {},
) {
  const repository = {
    findPublicResource: vi.fn().mockResolvedValue({
      byteSize: bytes.byteLength,
      mimeTypeReal: 'image/png' as const,
      resourceId,
      secureStorageKey,
      sha256Hex,
      ...recordOverrides,
    }),
  };
  const storage = {
    downloadPrivateObject: vi.fn().mockResolvedValue(bytes),
    privateObjectExists: vi.fn(),
    uploadPrivateObject: vi.fn(),
  };
  return {
    repository,
    service: new CatalogPublicResourceService(
      repository as unknown as CatalogPublicResourceQueryPort,
      storage as unknown as CatalogPrivateStoragePort,
    ),
    storage,
  };
}

describe('Public catalog resource application service', () => {
  it('prepares opaque public metadata and validates size and SHA-256 before returning bytes', async () => {
    const test = subject();
    const delivery = await test.service.prepare(resourceId);
    expect(delivery).toMatchObject({
      byteSize: bytes.byteLength,
      mimeType: 'image/png',
      resourceId,
    });
    expect(delivery.etag).toMatch(/^"[A-Za-z0-9_-]+"$/u);
    expect(delivery.etag).not.toContain(sha256Hex);
    expect(JSON.stringify(delivery)).not.toMatch(/secureStorageKey|sha256Hex|catalog-assets/u);
    await expect(delivery.loadValidatedBytes()).resolves.toEqual(bytes);
    expect(test.storage.downloadPrivateObject).toHaveBeenCalledWith(secureStorageKey);
  });

  it('uses the same public not-found result without invoking Storage', async () => {
    const test = subject();
    test.repository.findPublicResource.mockResolvedValueOnce(null);
    await expect(test.service.prepare(resourceId)).rejects.toMatchObject({
      category: 'NOT_FOUND',
      code: 'CATALOG_RESOURCE_NOT_FOUND',
    });
    expect(test.storage.downloadPrivateObject).not.toHaveBeenCalled();
  });

  it('rejects invalid, oversized or inconsistent persisted metadata before Storage', async () => {
    for (const record of [
      { byteSize: 0 },
      { byteSize: catalogImageLimits.maximumByteSize + 1 },
      { sha256Hex: 'not-a-hash' },
    ]) {
      const test = subject(record);
      await expect(test.service.prepare(resourceId)).rejects.toMatchObject({
        category: 'INFRASTRUCTURE',
        code: 'CATALOG_PUBLIC_RESOURCE_METADATA_INVALID',
      });
      expect(test.storage.downloadPrivateObject).not.toHaveBeenCalled();
    }
  });

  it('rejects downloaded size mismatches, including content over 10 MiB', async () => {
    const wrongSize = subject();
    wrongSize.storage.downloadPrivateObject.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    const first = await wrongSize.service.prepare(resourceId);
    await expect(first.loadValidatedBytes()).rejects.toMatchObject({
      code: 'CATALOG_PUBLIC_RESOURCE_SIZE_MISMATCH',
    });

    const oversized = subject({ byteSize: catalogImageLimits.maximumByteSize });
    oversized.storage.downloadPrivateObject.mockResolvedValueOnce(
      new Uint8Array(catalogImageLimits.maximumByteSize + 1),
    );
    const second = await oversized.service.prepare(resourceId);
    await expect(second.loadValidatedBytes()).rejects.toMatchObject({
      code: 'CATALOG_PUBLIC_RESOURCE_SIZE_MISMATCH',
    });
  });

  it('rejects a downloaded SHA-256 mismatch and preserves provider failures', async () => {
    const mismatch = subject();
    mismatch.storage.downloadPrivateObject.mockResolvedValueOnce(new Uint8Array([4, 3, 2, 1]));
    await expect(
      (await mismatch.service.prepare(resourceId)).loadValidatedBytes(),
    ).rejects.toMatchObject({ code: 'CATALOG_PUBLIC_RESOURCE_HASH_MISMATCH' });

    const unavailable = subject();
    unavailable.storage.downloadPrivateObject.mockRejectedValueOnce(
      new CatalogError('CATALOG_STORAGE_DOWNLOAD_FAILED', 'INFRASTRUCTURE', 'Storage failed.'),
    );
    await expect(
      (await unavailable.service.prepare(resourceId)).loadValidatedBytes(),
    ).rejects.toMatchObject({ code: 'CATALOG_STORAGE_DOWNLOAD_FAILED' });
  });
});
