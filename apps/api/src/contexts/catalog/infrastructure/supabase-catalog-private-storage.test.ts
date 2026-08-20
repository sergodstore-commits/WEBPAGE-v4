import { describe, expect, it, vi } from 'vitest';

import {
  provisionCatalogAssetBucket,
  SupabaseCatalogPrivateStorage,
  type CatalogStorageAdminApi,
} from './supabase-catalog-private-storage.js';

const bucket = {
  allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'],
  file_size_limit: 15 * 1024 * 1024,
  id: 'catalog-assets',
  name: 'catalog-assets',
  public: false,
};

function storageSubject(overrides: Partial<CatalogStorageAdminApi> = {}) {
  const file = {
    download: vi
      .fn()
      .mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
    exists: vi.fn().mockResolvedValue({ data: true, error: null }),
    list: vi.fn().mockResolvedValue({ data: [{ name: 'opaque-key' }], error: null }),
    upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
  const storage = {
    createBucket: vi.fn().mockResolvedValue({ data: {}, error: null }),
    from: vi.fn().mockReturnValue(file),
    getBucket: vi.fn().mockResolvedValue({ data: bucket, error: null }),
    ...overrides,
  } as CatalogStorageAdminApi;
  return { adapter: new SupabaseCatalogPrivateStorage(storage, 'catalog-assets'), file, storage };
}

describe('Supabase catalog private storage', () => {
  it('uploads without upsert and supports private existence and download', async () => {
    const test = storageSubject();
    await expect(
      test.adapter.uploadPrivateObject({
        bytes: new Uint8Array([1, 2, 3]),
        declaredMimeType: 'image/png',
        secureStorageKey: '0198a8be-6677-7000-8000-000000000003',
      }),
    ).resolves.toBe('CREATED');
    expect(test.file.upload).toHaveBeenCalledWith(
      '0198a8be-6677-7000-8000-000000000003',
      expect.any(Uint8Array),
      { contentType: 'image/png', upsert: false },
    );
    await expect(
      test.adapter.privateObjectExists('0198a8be-6677-7000-8000-000000000003'),
    ).resolves.toBe(true);
    await expect(
      test.adapter.downloadPrivateObject('0198a8be-6677-7000-8000-000000000003'),
    ).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it('lists opaque object keys through the supported Storage API', async () => {
    const test = storageSubject();
    await expect(test.adapter.listPrivateObjectKeys()).resolves.toEqual(['opaque-key']);
    expect(test.file.list).toHaveBeenCalledWith('', {
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' },
    });
  });

  it('walks nested evidence folders so reconciliation can detect every private object', async () => {
    const test = storageSubject();
    test.file.list.mockImplementation(async (prefix: string) => ({
      data:
        prefix === ''
          ? [{ id: null, name: 'evidence' }]
          : prefix === 'evidence'
            ? [{ id: null, name: '0198c100-0000-7000-8000-000000000001' }]
            : [{ id: 'stored-object', name: 'receipt.pdf' }],
      error: null,
    }));
    await expect(test.adapter.listPrivateObjectKeys()).resolves.toEqual([
      'evidence/0198c100-0000-7000-8000-000000000001/receipt.pdf',
    ]);
  });

  it('reconciles an existing object without overwriting it', async () => {
    const test = storageSubject();
    test.file.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'already exists', status: 409 },
    });
    await expect(
      test.adapter.uploadPrivateObject({
        bytes: new Uint8Array([1]),
        declaredMimeType: 'image/png',
        secureStorageKey: '0198a8be-6677-7000-8000-000000000003',
      }),
    ).resolves.toBe('ALREADY_EXISTS');
  });

  it('maps provider failures without leaking provider details', async () => {
    const test = storageSubject();
    test.file.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'secret-key-value', status: 500 },
    });
    test.file.exists.mockResolvedValueOnce({
      data: false,
      error: { message: 'secret-key-value', status: 500 },
    });
    const failure = await test.adapter
      .uploadPrivateObject({
        bytes: new Uint8Array([1]),
        declaredMimeType: 'image/png',
        secureStorageKey: '0198a8be-6677-7000-8000-000000000003',
      })
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'CATALOG_STORAGE_UPLOAD_FAILED' });
    expect(JSON.stringify(failure)).not.toContain('secret-key-value');
  });

  it('maps malformed or unreadable download responses to the safe storage error', async () => {
    const malformed = storageSubject();
    malformed.file.download.mockResolvedValueOnce({ data: {} as Blob, error: null });
    await expect(malformed.adapter.downloadPrivateObject('opaque-key')).rejects.toMatchObject({
      code: 'CATALOG_STORAGE_DOWNLOAD_FAILED',
    });

    const unreadable = storageSubject();
    unreadable.file.download.mockResolvedValueOnce({
      data: {
        arrayBuffer: vi.fn().mockRejectedValue(new Error('provider detail')),
      } as unknown as Blob,
      error: null,
    });
    const failure = await unreadable.adapter
      .downloadPrivateObject('opaque-key')
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'CATALOG_STORAGE_DOWNLOAD_FAILED' });
    expect(JSON.stringify(failure)).not.toContain('provider detail');
  });

  it('creates, verifies and rejects incompatible bucket configuration', async () => {
    const missing = storageSubject({
      getBucket: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'not found', status: 404 },
      }),
    });
    await expect(provisionCatalogAssetBucket(missing.storage, 'catalog-assets')).resolves.toBe(
      'CREATED',
    );
    expect(missing.storage.createBucket).toHaveBeenCalledWith('catalog-assets', {
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'],
      fileSizeLimit: 15 * 1024 * 1024,
      public: false,
    });

    const existing = storageSubject();
    await expect(provisionCatalogAssetBucket(existing.storage, 'catalog-assets')).resolves.toBe(
      'VERIFIED',
    );

    const incompatible = storageSubject({
      getBucket: vi.fn().mockResolvedValue({
        data: { ...bucket, public: true },
        error: null,
      }),
    });
    await expect(
      provisionCatalogAssetBucket(incompatible.storage, 'catalog-assets'),
    ).rejects.toMatchObject({ code: 'CATALOG_STORAGE_BUCKET_INCOMPATIBLE' });
  });
});
