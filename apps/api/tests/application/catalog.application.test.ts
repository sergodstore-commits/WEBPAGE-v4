import { createHash } from 'node:crypto';

import type { ExecutionContext } from '@sergod/foundation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogService } from '../../src/contexts/catalog/application/catalog-service.js';
import type {
  CatalogAdminAuthorizer,
  CatalogImageOptimizationPort,
  CatalogPrivateStoragePort,
  CatalogRepository,
  CatalogResourceValidationPort,
} from '../../src/contexts/catalog/application/ports.js';

const context: ExecutionContext = {
  actorId: '0198a8be-6677-7000-8000-000000000001',
  actorType: 'USER',
  correlationId: '0198a8be-6677-7000-8000-000000000002',
  idempotencyKey: 'catalog-command-1',
};

function subject(optimizer?: CatalogImageOptimizationPort) {
  const repository = {
    activateResource: vi.fn().mockResolvedValue({ replayed: false, resourceId: 'resource-1' }),
    attachCatalogMedia: vi.fn(),
    attachProductMedia: vi.fn(),
    createCategory: vi.fn().mockResolvedValue({ categoryId: 'category-1', replayed: false }),
    createCollection: vi.fn(),
    createGame: vi.fn(),
    createProduct: vi.fn().mockResolvedValue({ productId: 'product-1', replayed: false }),
    findEntity: vi.fn(),
    findResource: vi.fn().mockResolvedValue({
      originalFilenameSafe: 'resource.png',
      resourceId: 'resource-1',
      secureStorageKey: '0198a8be-6677-7000-8000-000000000003',
      state: 'QUARANTINED',
    }),
    registerQuarantinedResource: vi.fn().mockResolvedValue({
      replayed: false,
      resourceId: 'resource-1',
      secureStorageKey: '0198a8be-6677-7000-8000-000000000003',
    }),
    transitionEntity: vi.fn(),
    transitionResource: vi.fn(),
  } as unknown as CatalogRepository;
  const authorizer: CatalogAdminAuthorizer = { assertCanManageCatalog: vi.fn() };
  const validator: CatalogResourceValidationPort = {
    validate: vi.fn().mockImplementation((input) => ({
      byteSize: input.bytes.byteLength,
      heightPx: 800,
      megapixels: 0.48,
      mimeTypeReal: 'image/png',
      originalFilenameSafe: input.originalFilenameSafe,
      secureStorageKey: input.secureStorageKey,
      sha256Hex: createHash('sha256').update(input.bytes).digest('hex'),
      widthPx: 600,
    })),
  };
  const storage: CatalogPrivateStoragePort = {
    downloadPrivateObject: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    privateObjectExists: vi.fn().mockResolvedValue(true),
    uploadPrivateObject: vi.fn().mockResolvedValue('CREATED'),
  };
  return {
    authorizer,
    repository,
    service: new CatalogService(repository, authorizer, validator, storage, optimizer),
    storage,
    validator,
  };
}

describe('Catalog application', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an independent Category without game or collection fields', async () => {
    const test = subject();
    await test.service.createCategory({ context, description: null, name: 'Accesorios' });
    expect(test.repository.createCategory).toHaveBeenCalledWith({
      context,
      description: null,
      idempotencyKey: context.idempotencyKey,
      name: 'Accesorios',
    });
  });

  it('rejects a fourth product attribute before persistence', async () => {
    const test = subject();
    await expect(
      test.service.createProduct({
        context,
        product: {
          categoryId: '0198a8be-6677-7000-8000-000000000010',
          collectionId: null,
          condition: null,
          description: null,
          edition: null,
          gameId: '0198a8be-6677-7000-8000-000000000011',
          language: null,
          name: 'Producto',
          priceAmountClp: 1000,
          rarity: 'UNAUTHORISED',
          saleType: 'REGULAR',
          sku: 'SKU-1',
        },
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_PRODUCT_INVALID' });
    expect(test.repository.createProduct).not.toHaveBeenCalled();
  });

  it('uses private storage and validated stored bytes before activation', async () => {
    const test = subject();
    await test.service.ingestCatalogImage({
      altText: 'Recurso',
      bytes: new Uint8Array([1, 2, 3]),
      context,
      declaredMimeType: 'image/png',
      originalFilename: 'resource.png',
      position: 1,
    });
    expect(test.storage.uploadPrivateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        secureStorageKey: '0198a8be-6677-7000-8000-000000000003',
      }),
    );
    expect(test.storage.privateObjectExists).toHaveBeenCalledWith(
      '0198a8be-6677-7000-8000-000000000003',
    );
    expect(test.validator.validate).toHaveBeenCalledWith(
      expect.objectContaining({ originalFilenameSafe: 'resource.png' }),
    );
    expect(test.repository.activateResource).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptor: expect.objectContaining({ mimeTypeReal: 'image/png' }),
        idempotencyKey: context.idempotencyKey,
        resourceId: 'resource-1',
      }),
    );
  });

  it('stores and validates the optimized bytes instead of the larger submission', async () => {
    const optimized = new Uint8Array([3, 2, 1]);
    const optimizer: CatalogImageOptimizationPort = {
      optimize: vi.fn().mockResolvedValue(optimized),
    };
    const test = subject(optimizer);
    vi.mocked(test.storage.downloadPrivateObject).mockResolvedValue(optimized);

    await test.service.ingestCatalogImage({
      altText: 'Recurso optimizado',
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      context,
      declaredMimeType: 'image/png',
      originalFilename: 'resource.png',
      position: 1,
    });

    expect(optimizer.optimize).toHaveBeenCalledWith(
      expect.objectContaining({ originalFilenameSafe: 'resource.png' }),
    );
    expect(test.storage.uploadPrivateObject).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: optimized }),
    );
    expect(test.validator.validate).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: optimized }),
    );
  });

  it('leaves the resource quarantined when Storage fails', async () => {
    const test = subject();
    vi.mocked(test.storage.uploadPrivateObject).mockRejectedValueOnce(
      Object.assign(new Error('safe failure'), { code: 'CATALOG_STORAGE_UPLOAD_FAILED' }),
    );
    await expect(
      test.service.ingestCatalogImage({
        altText: 'Recurso',
        bytes: new Uint8Array([1, 2, 3]),
        context,
        declaredMimeType: 'image/png',
        originalFilename: 'resource.png',
        position: 1,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_STORAGE_UPLOAD_FAILED' });
    expect(test.repository.registerQuarantinedResource).toHaveBeenCalledOnce();
    expect(test.repository.activateResource).not.toHaveBeenCalled();
  });

  it('does not activate when the uploaded object cannot be confirmed', async () => {
    const test = subject();
    vi.mocked(test.storage.privateObjectExists).mockResolvedValueOnce(false);
    await expect(
      test.service.ingestCatalogImage({
        altText: 'Recurso',
        bytes: new Uint8Array([1, 2, 3]),
        context,
        declaredMimeType: 'image/png',
        originalFilename: 'resource.png',
        position: 1,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_STORAGE_OBJECT_MISSING' });
    expect(test.repository.activateResource).not.toHaveBeenCalled();
  });

  it('reuses the same private key after PostgreSQL activation fails', async () => {
    const test = subject();
    vi.mocked(test.repository.activateResource)
      .mockRejectedValueOnce(new Error('temporary database failure'))
      .mockResolvedValueOnce({ replayed: false, resourceId: 'resource-1' });
    vi.mocked(test.repository.registerQuarantinedResource)
      .mockResolvedValueOnce({
        replayed: false,
        resourceId: 'resource-1',
        secureStorageKey: '0198a8be-6677-7000-8000-000000000003',
      })
      .mockResolvedValueOnce({
        replayed: true,
        resourceId: 'resource-1',
        secureStorageKey: '0198a8be-6677-7000-8000-000000000003',
      });
    vi.mocked(test.storage.uploadPrivateObject)
      .mockResolvedValueOnce('CREATED')
      .mockResolvedValueOnce('ALREADY_EXISTS');
    const input = {
      altText: 'Recurso',
      bytes: new Uint8Array([1, 2, 3]),
      context,
      declaredMimeType: 'image/png',
      originalFilename: 'resource.png',
      position: 1,
    } as const;
    await expect(test.service.ingestCatalogImage(input)).rejects.toThrow(
      'temporary database failure',
    );
    await expect(test.service.ingestCatalogImage(input)).resolves.toMatchObject({
      resourceId: 'resource-1',
      state: 'ACTIVE',
    });
    expect(test.storage.uploadPrivateObject).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(test.storage.uploadPrivateObject).mock.calls.map(([call]) => call.secureStorageKey),
    ).toEqual(['0198a8be-6677-7000-8000-000000000003', '0198a8be-6677-7000-8000-000000000003']);
  });

  it('requires an authenticated administrator actor and an idempotency key', async () => {
    const test = subject();
    await expect(
      test.service.createCategory({
        context: { actorType: 'SYSTEM', correlationId: context.correlationId },
        name: 'Accesorios',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_ADMIN_REQUIRED' });
    await expect(
      test.service.createCategory({
        context: {
          actorId: '0198a8be-6677-7000-8000-000000000001',
          actorType: context.actorType,
          correlationId: context.correlationId,
        },
        name: 'Accesorios',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_IDEMPOTENCY_KEY_REQUIRED' });
  });
});
