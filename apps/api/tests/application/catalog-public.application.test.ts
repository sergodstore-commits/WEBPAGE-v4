import { describe, expect, it, vi } from 'vitest';

import { CatalogPublicQueryService } from '../../src/contexts/catalog/application/catalog-public-query-service.js';
import type {
  CatalogPublicProductRecord,
  CatalogPublicQueryPort,
} from '../../src/contexts/catalog/application/catalog-public-ports.js';

const firstId = '0198a8be-6677-7000-8000-000000000001';
const secondId = '0198a8be-6677-7000-8000-000000000002';
const record: CatalogPublicProductRecord = {
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
  item: {
    availableForPurchase: false,
    game: { gameId: secondId, name: 'Pokémon', slug: 'pokemon' },
    name: 'Álbum Base',
    priceAmountClp: 5000,
    primaryResource: {
      altText: 'Principal',
      heightPx: 800,
      mimeType: 'image/png',
      resourceId: secondId,
      widthPx: 600,
    },
    productId: firstId,
    saleType: 'REGULAR',
  },
  normalizedName: 'album base',
};

function repositoryDouble() {
  return {
    findProduct: vi.fn().mockResolvedValue(null),
    listCategories: vi.fn().mockResolvedValue({ hasMore: false, items: [] }),
    listCollections: vi.fn().mockResolvedValue({ hasMore: false, items: [] }),
    listFilterValues: vi.fn().mockResolvedValue({ hasMore: false, items: [] }),
    listGames: vi.fn().mockResolvedValue({ hasMore: false, items: [] }),
    listProducts: vi.fn().mockResolvedValue({ hasMore: true, items: [record] }),
  };
}

describe('Public catalog application queries', () => {
  it('normalizes accents and case and requires every term through the repository input', async () => {
    const repository = repositoryDouble();
    const service = new CatalogPublicQueryService(repository as unknown as CatalogPublicQueryPort);
    await service.listProducts({ limit: 10, q: '  POKÉMON   BÁSE ', sort: 'NEWEST' });
    expect(repository.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ searchTerms: ['pokemon', 'base'], sort: 'NEWEST' }),
    );
  });

  it.each(['NEWEST', 'NAME_ASC', 'PRICE_ASC', 'PRICE_DESC'] as const)(
    'round-trips a protected %s keyset cursor',
    async (sort) => {
      const repository = repositoryDouble();
      const service = new CatalogPublicQueryService(
        repository as unknown as CatalogPublicQueryPort,
      );
      const first = await service.listProducts({ limit: 1, sort });
      expect(first.nextCursor).toBeTruthy();
      await service.listProducts({ cursor: first.nextCursor ?? undefined, limit: 1, sort });
      expect(repository.listProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: expect.objectContaining({ productId: firstId, sort }) }),
      );
    },
  );

  it('rejects a modified cursor and reuse with different filters, q or sort', async () => {
    const repository = repositoryDouble();
    const service = new CatalogPublicQueryService(repository as unknown as CatalogPublicQueryPort);
    const first = await service.listProducts({
      gameId: secondId,
      limit: 1,
      q: 'Pokemon',
      sort: 'NEWEST',
    });
    const cursor = first.nextCursor ?? '';
    await expect(
      service.listProducts({
        cursor: `${cursor.slice(0, -1)}x`,
        gameId: secondId,
        limit: 1,
        q: 'Pokemon',
        sort: 'NEWEST',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_PUBLIC_CURSOR_INVALID' });
    await expect(
      service.listProducts({ cursor, gameId: secondId, limit: 1, q: 'Base', sort: 'NEWEST' }),
    ).rejects.toMatchObject({ code: 'CATALOG_PUBLIC_CURSOR_INVALID' });
    await expect(
      service.listProducts({ cursor, gameId: secondId, limit: 1, q: 'Pokemon', sort: 'PRICE_ASC' }),
    ).rejects.toMatchObject({ code: 'CATALOG_PUBLIC_CURSOR_INVALID' });
  });

  it('binds reference and filter-value cursors to their query scope', async () => {
    const repository = repositoryDouble();
    repository.listGames.mockResolvedValueOnce({
      hasMore: true,
      items: [
        {
          item: { gameId: firstId, name: 'Álbum', slug: 'album' },
          normalizedName: 'album',
        },
      ],
    });
    repository.listFilterValues.mockResolvedValueOnce({ hasMore: true, items: ['NEAR MINT'] });
    const service = new CatalogPublicQueryService(repository as unknown as CatalogPublicQueryPort);
    const gamePage = await service.listGames({ limit: 1 });
    if (gamePage.nextCursor === null) throw new Error('Expected game cursor.');
    await expect(
      service.listCategories({ cursor: gamePage.nextCursor, limit: 1 }),
    ).rejects.toMatchObject({ code: 'CATALOG_PUBLIC_CURSOR_INVALID' });
    const values = await service.listFilterValues({ attribute: 'condition', limit: 1 });
    if (values.nextCursor === null) throw new Error('Expected filter cursor.');
    await expect(
      service.listFilterValues({
        attribute: 'edition',
        cursor: values.nextCursor,
        limit: 1,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_PUBLIC_CURSOR_INVALID' });
  });

  it('uses the same not-found result for every non-visible product', async () => {
    const service = new CatalogPublicQueryService(
      repositoryDouble() as unknown as CatalogPublicQueryPort,
    );
    await expect(service.getProduct(firstId)).rejects.toMatchObject({
      code: 'CATALOG_ENTITY_NOT_FOUND',
    });
  });
});
