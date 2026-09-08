import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createServer } from '../../../presentation/http/create-server.js';
import type { CatalogPublicQueryService } from '../application/catalog-public-query-service.js';
import { CatalogError } from '../domain/catalog.js';
import { CatalogPublicHttpApi, CatalogPublicRateLimiter } from './catalog-public-http-api.js';

const id = '0198a8be-6677-7000-8000-000000000001';
const secondId = '0198a8be-6677-7000-8000-000000000002';
const primaryResource = {
  altText: 'Imagen principal',
  heightPx: 800,
  mimeType: 'image/webp' as const,
  resourceId: secondId,
  widthPx: 600,
};
const game = { gameId: id, name: 'Pokémon', slug: 'pokemon' };
const category = { categoryId: id, name: 'Cartas' };
const collection = { collectionId: id, game, name: 'Base' };
const card = {
  availabilityStatus: 'LAST_UNITS' as const,
  availableForPurchase: true,
  game,
  name: 'Pikachu',
  priceAmountClp: 5000,
  primaryResource,
  productId: id,
  saleType: 'REGULAR' as const,
};
const detail = {
  ...card,
  category,
  collection: { collectionId: id, name: 'Base' },
  condition: 'NEAR MINT',
  description: 'Descripción pública',
  edition: 'FIRST EDITION',
  language: 'es-CL',
  preorder: null,
  resources: [primaryResource],
  sku: 'PK-001',
};

function serviceDouble() {
  return {
    getProduct: vi.fn().mockResolvedValue(detail),
    listCategories: vi.fn().mockResolvedValue({ items: [category], nextCursor: null }),
    listCollections: vi.fn().mockResolvedValue({ items: [collection], nextCursor: null }),
    listFilterValues: vi.fn().mockResolvedValue({ items: ['NEAR MINT'], nextCursor: null }),
    listGames: vi.fn().mockResolvedValue({ items: [game], nextCursor: null }),
    listProducts: vi.fn().mockResolvedValue({ items: [card], nextCursor: null }),
  };
}

const catalog = serviceDouble();
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(
  new CatalogPublicHttpApi(
    catalog as unknown as CatalogPublicQueryService,
    logger,
    new CatalogPublicRateLimiter(1000, 60_000),
  ),
);
let origin: string;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
});

describe('Public catalog HTTP API', () => {
  it('serves exactly the six anonymous read routes without authorization', async () => {
    const paths = [
      '/api/v1/catalog/tcg-games?limit=10',
      '/api/v1/catalog/categories?limit=10',
      `/api/v1/catalog/collections?gameId=${id}&limit=10`,
      '/api/v1/catalog/products?availabilityStatus=LAST_UNITS&limit=10&maximumPriceClp=9000&minimumPriceClp=1000&sort=PRICE_ASC&q=Pokemon',
      `/api/v1/catalog/products/${id}`,
      '/api/v1/catalog/product-filter-values?attribute=condition&limit=10',
    ];
    for (const path of paths) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('cache-control')).toBe('public, no-cache');
      expect(response.headers.get('etag')).toMatch(/^"[A-Za-z0-9_-]+"$/u);
      expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
    }
    expect(catalog.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        availabilityStatus: 'LAST_UNITS',
        limit: 10,
        maximumPriceClp: 9000,
        minimumPriceClp: 1000,
        q: 'Pokemon',
        sort: 'PRICE_ASC',
      }),
    );
  });

  it('returns only safe card and detail fields', async () => {
    let response = await fetch(`${origin}/api/v1/catalog/products?limit=10`);
    const listed = (await response.json()) as { items: readonly Record<string, unknown>[] };
    expect(Object.keys(listed.items[0] ?? {}).sort()).toEqual(
      [
        'availabilityStatus',
        'availableForPurchase',
        'game',
        'name',
        'priceAmountClp',
        'primaryResource',
        'productId',
        'saleType',
      ].sort(),
    );
    expect(JSON.stringify(listed)).not.toMatch(
      /secureStorageKey|publicationStatus|uploadedBy|sha256|onHand|reserved|stockQuantity/u,
    );

    response = await fetch(`${origin}/api/v1/catalog/products/${id}`);
    const detailed = (await response.json()) as { item: Record<string, unknown> };
    expect(Object.keys(detailed.item).sort()).toEqual(
      [
        'availabilityStatus',
        'availableForPurchase',
        'category',
        'collection',
        'condition',
        'description',
        'edition',
        'game',
        'language',
        'name',
        'priceAmountClp',
        'preorder',
        'primaryResource',
        'productId',
        'resources',
        'saleType',
        'sku',
      ].sort(),
    );
  });

  it('rejects unknown, duplicate and invalid query parameters with no-store', async () => {
    for (const path of [
      '/api/v1/catalog/products?limit=10&rating=5',
      '/api/v1/catalog/products?limit=10&limit=20',
      '/api/v1/catalog/products?limit=10&q=x',
      '/api/v1/catalog/products?limit=0',
      '/api/v1/catalog/product-filter-values?attribute=rarity&limit=10',
    ]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status, path).toBe(422);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    }
  });

  it('revalidates every public route with the exact strong ETag and an empty 304 response', async () => {
    for (const path of [
      '/api/v1/catalog/tcg-games?limit=10',
      '/api/v1/catalog/categories?limit=10',
      `/api/v1/catalog/collections?gameId=${id}&limit=10`,
      '/api/v1/catalog/products?limit=10',
      `/api/v1/catalog/products/${id}`,
      '/api/v1/catalog/product-filter-values?attribute=condition&limit=10',
    ]) {
      const first = await fetch(`${origin}${path}`);
      const etag = first.headers.get('etag');
      expect(first.status, path).toBe(200);
      expect(etag, path).toMatch(/^"[A-Za-z0-9_-]+"$/u);

      const unchanged = await fetch(`${origin}${path}`, {
        headers: { 'If-None-Match': etag ?? '' },
      });
      expect(unchanged.status, path).toBe(304);
      expect(await unchanged.text(), path).toBe('');
      expect(unchanged.headers.get('cache-control'), path).toBe('public, no-cache');
      expect(unchanged.headers.get('etag'), path).toBe(etag);
      expect(unchanged.headers.get('content-security-policy'), path).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(unchanged.headers.get('referrer-policy'), path).toBe('no-referrer');
      expect(unchanged.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(unchanged.headers.get('x-frame-options'), path).toBe('DENY');
      expect(unchanged.headers.get('x-correlation-id'), path).toMatch(/^[0-9a-f-]{36}$/u);
    }
  });

  it('uses RFC weak comparison for lists, weak tags and wildcard', async () => {
    const path = '/api/v1/catalog/tcg-games?limit=10';
    const first = await fetch(`${origin}${path}`);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    for (const condition of [`  "other,tag" ,  W/${etag}  `, `W/${etag}`, '*']) {
      const unchanged = await fetch(`${origin}${path}`, {
        headers: { 'If-None-Match': condition },
      });
      expect(unchanged.status, condition).toBe(304);
      expect(await unchanged.text(), condition).toBe('');
      expect(unchanged.headers.get('cache-control'), condition).toBe('public, no-cache');
    }
  });

  it('ignores mismatched or malformed conditions and never confuses If-None-Match with If-Match', async () => {
    const path = '/api/v1/catalog/tcg-games?limit=10';
    const first = await fetch(`${origin}${path}`);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    for (const headers of [
      { 'If-None-Match': '"different"' },
      { 'If-None-Match': 'unquoted' },
      { 'If-None-Match': 'W/ "malformed"' },
      { 'If-None-Match': `*, ${etag}` },
      { 'If-None-Match': '"unterminated' },
      { 'If-Match': etag ?? '' },
    ]) {
      const response = await fetch(`${origin}${path}`, { headers });
      expect(response.status, JSON.stringify(headers)).toBe(200);
      expect(await response.json()).toMatchObject({ items: [game] });
      expect(response.headers.get('cache-control')).toBe('public, no-cache');
    }
  });

  it('returns 200 and a different strong ETag after a visible change', async () => {
    const path = '/api/v1/catalog/products?limit=10';
    const first = await fetch(`${origin}${path}`);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    catalog.listProducts.mockResolvedValueOnce({
      items: [{ ...card, name: 'Raichu' }],
      nextCursor: null,
    });
    const changed = await fetch(`${origin}${path}`, {
      headers: { 'If-None-Match': etag ?? '' },
    });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
  });

  it('makes invisible and missing products indistinguishable and redacts failures', async () => {
    for (const message of ['invisible product in products table', 'missing product']) {
      catalog.getProduct.mockRejectedValueOnce(
        new CatalogError('CATALOG_ENTITY_NOT_FOUND', 'NOT_FOUND', message),
      );
      const response = await fetch(`${origin}/api/v1/catalog/products/${id}`);
      const text = await response.text();
      expect(response.status).toBe(404);
      expect(text).toContain('CATALOG_ENTITY_NOT_FOUND');
      expect(text).not.toContain(message);
    }

    catalog.listProducts.mockRejectedValueOnce(
      Object.assign(new Error('products DATABASE_URL internal table'), { code: 'ECONNREFUSED' }),
    );
    const dependency = await fetch(`${origin}/api/v1/catalog/products?limit=10`);
    expect(dependency.status).toBe(503);
    expect(await dependency.text()).not.toMatch(/DATABASE_URL|internal table/u);
  });

  it('enforces the public rate limit with a closed 429 response', async () => {
    const limitedServer = createServer(
      new CatalogPublicHttpApi(
        serviceDouble() as unknown as CatalogPublicQueryService,
        logger,
        new CatalogPublicRateLimiter(1, 60_000),
      ),
    );
    await new Promise<void>((resolve, reject) => {
      limitedServer.once('error', reject);
      limitedServer.listen(0, '127.0.0.1', resolve);
    });
    try {
      const limitedOrigin = `http://127.0.0.1:${(limitedServer.address() as AddressInfo).port}`;
      expect((await fetch(`${limitedOrigin}/api/v1/catalog/products?limit=10`)).status).toBe(200);
      const blocked = await fetch(`${limitedOrigin}/api/v1/catalog/products?limit=10`);
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBe('60');
      expect(await blocked.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    } finally {
      await new Promise<void>((resolve, reject) =>
        limitedServer.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });
});
