import type { ExecutionContext } from '@sergod/foundation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogEntityAdminService } from '../../src/contexts/catalog/application/catalog-entity-admin-service.js';
import type {
  CatalogAdminAuthorizer,
  CatalogRepository,
} from '../../src/contexts/catalog/application/ports.js';

const actorId = '0198a8be-6677-7000-8000-000000000001';
const context: ExecutionContext = {
  actorId,
  actorType: 'USER',
  correlationId: '0198a8be-6677-7000-8000-000000000002',
  idempotencyKey: 'admin-catalog-1',
};
const timestamp = new Date('2026-08-01T12:00:00.000Z');

function game(gameId = '0198a8be-6677-7000-8000-000000000010') {
  return {
    archivedAt: null,
    createdAt: timestamp,
    description: null,
    gameId,
    name: 'Juego',
    publicationStatus: 'DRAFT' as const,
    slug: 'juego',
    updatedAt: timestamp,
  };
}

function subject() {
  const repository = {
    createGame: vi.fn().mockResolvedValue({ gameId: game().gameId, replayed: false }),
    findEntity: vi.fn().mockResolvedValue({ id: game().gameId, publicationStatus: 'DRAFT' }),
    findGame: vi.fn().mockResolvedValue(game()),
    findProduct: vi.fn(),
    listGames: vi.fn().mockResolvedValue({ hasMore: true, items: [game()] }),
    transitionEntity: vi.fn().mockResolvedValue({ entityId: game().gameId, replayed: false }),
    updateProduct: vi.fn(),
  } as unknown as CatalogRepository;
  const authorizer: CatalogAdminAuthorizer = { assertCanManageCatalog: vi.fn() };
  return { authorizer, repository, service: new CatalogEntityAdminService(repository, authorizer) };
}

describe('Catalog entity administration application service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('authorizes and creates with a stable route-aware request fingerprint', async () => {
    const test = subject();
    const result = await test.service.createGame(context, {
      description: '  Juego principal  ',
      name: '  Juego   TCG ',
      slug: ' juego-tcg ',
    });
    expect(result).toEqual({ item: game(), replayed: false });
    expect(test.authorizer.assertCanManageCatalog).toHaveBeenCalledWith(context);
    expect(test.repository.createGame).toHaveBeenCalledWith({
      context,
      description: 'Juego principal',
      idempotencyKey: 'admin-catalog-1',
      name: 'Juego TCG',
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      slug: 'juego-tcg',
    });
  });

  it('does not require idempotency for GET but requires it for mutation', async () => {
    const test = subject();
    const queryContext = {
      actorId,
      actorType: 'USER' as const,
      correlationId: context.correlationId,
    };
    await expect(test.service.getGame(queryContext, game().gameId)).resolves.toEqual(game());
    await expect(
      test.service.createGame(queryContext, { description: null, name: 'Juego', slug: 'juego' }),
    ).rejects.toMatchObject({ code: 'CATALOG_IDEMPOTENCY_KEY_REQUIRED' });
  });

  it('builds an opaque stable cursor and rejects a modified or cross-filter cursor', async () => {
    const test = subject();
    const first = await test.service.listGames(context, { limit: 1 });
    expect(first.nextCursor).toMatch(/^[^.]+\.[^.]+$/u);
    const cursor = first.nextCursor;
    if (cursor === null) throw new Error('Expected the first page to provide a cursor.');
    vi.mocked(test.repository.listGames).mockResolvedValueOnce({ hasMore: false, items: [] });
    await test.service.listGames(context, { cursor, limit: 1 });
    expect(test.repository.listGames).toHaveBeenLastCalledWith({
      cursor: { createdAt: timestamp, id: game().gameId },
      limit: 1,
    });
    const changed = `${cursor.slice(0, -1)}x`;
    await expect(
      test.service.listGames(context, { cursor: changed, limit: 1 }),
    ).rejects.toMatchObject({
      code: 'CATALOG_CURSOR_INVALID',
    });
    await expect(
      test.service.listGames(context, { cursor, limit: 1, publicationStatus: 'DRAFT' }),
    ).rejects.toMatchObject({ code: 'CATALOG_CURSOR_INVALID' });
  });

  it('normalizes a partial Product edit while preserving the closed current product', async () => {
    const test = subject();
    const productId = '0198a8be-6677-7000-8000-000000000020';
    vi.mocked(test.repository.findProduct).mockResolvedValue({
      archivedAt: null,
      categoryId: '0198a8be-6677-7000-8000-000000000021',
      collectionId: null,
      condition: null,
      createdAt: timestamp,
      description: null,
      edition: null,
      gameId: '0198a8be-6677-7000-8000-000000000022',
      language: null,
      name: 'Producto',
      priceAmountClp: 1000,
      productId,
      publicationStatus: 'DRAFT',
      saleType: 'REGULAR',
      sku: 'SKU-1',
      updatedAt: timestamp,
    });
    vi.mocked(test.repository.updateProduct).mockResolvedValue({ productId, replayed: false });
    await test.service.editProduct(context, productId, {
      condition: ' near   mint ',
      language: 'es-cl',
    });
    expect(test.repository.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({
          condition: 'NEAR MINT',
          language: 'es-CL',
          sku: 'SKU-1',
        }),
        requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    );
  });

  it('passes an explicit descendant strategy and never introduces resource dependencies', async () => {
    const test = subject();
    vi.mocked(test.repository.findEntity).mockResolvedValue({
      id: game().gameId,
      publicationStatus: 'PUBLISHED',
    });
    vi.mocked(test.repository.findGame).mockResolvedValue({
      ...game(),
      publicationStatus: 'UNPUBLISHED',
    });
    await test.service.transitionParent(context, 'TCG_GAME', game().gameId, {
      descendantStrategy: 'UNPUBLISH',
      nextStatus: 'UNPUBLISHED',
    });
    expect(test.repository.transitionEntity).toHaveBeenCalledWith(
      expect.objectContaining({ descendantStrategy: 'UNPUBLISH', entityType: 'TCG_GAME' }),
    );
    expect(Object.keys(test.service)).not.toContain('storage');
  });
});
