import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { CatalogEntityAdminService } from '../application/catalog-entity-admin-service.js';
import { CatalogError } from '../domain/catalog.js';
import { CatalogAdminHttpApi } from './catalog-admin-http-api.js';

const id = '0198a8be-6677-7000-8000-000000000001';
const now = new Date('2026-08-01T12:00:00.000Z');
const baseItem = {
  archivedAt: null,
  createdAt: now,
  description: null,
  name: 'Entidad',
  publicationStatus: 'DRAFT',
  updatedAt: now,
} as const;

const game = { ...baseItem, gameId: id, slug: 'entidad' };
const category = { ...baseItem, categoryId: id };
const collection = { ...baseItem, collectionId: id, gameId: id };
const product = {
  ...baseItem,
  categoryId: id,
  collectionId: null,
  condition: null,
  edition: null,
  gameId: id,
  language: null,
  priceAmountClp: 1000,
  productId: id,
  saleType: 'REGULAR',
  sku: 'SKU-1',
} as const;

function serviceDouble() {
  return {
    createCategory: vi.fn().mockResolvedValue({ item: category, replayed: false }),
    createCollection: vi.fn().mockResolvedValue({ item: collection, replayed: false }),
    createGame: vi.fn().mockResolvedValue({ item: game, replayed: false }),
    createProduct: vi.fn().mockResolvedValue({ item: product, replayed: false }),
    editCategory: vi.fn().mockResolvedValue({ item: category, replayed: false }),
    editCollection: vi.fn().mockResolvedValue({ item: collection, replayed: false }),
    editGame: vi.fn().mockResolvedValue({ item: game, replayed: false }),
    editProduct: vi.fn().mockResolvedValue({ item: product, replayed: false }),
    getCategory: vi.fn().mockResolvedValue(category),
    getCollection: vi.fn().mockResolvedValue(collection),
    getGame: vi.fn().mockResolvedValue(game),
    getProduct: vi.fn().mockResolvedValue(product),
    listCategories: vi.fn().mockResolvedValue({ items: [category], nextCursor: null }),
    listCollections: vi.fn().mockResolvedValue({ items: [collection], nextCursor: null }),
    listGames: vi.fn().mockResolvedValue({ items: [game], nextCursor: null }),
    listProducts: vi.fn().mockResolvedValue({ items: [product], nextCursor: null }),
    transitionParent: vi.fn().mockResolvedValue({ item: game, replayed: false }),
    transitionProduct: vi.fn().mockResolvedValue({ item: product, replayed: false }),
  };
}

const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId: id } }),
} as unknown as IdentityAccessService;
const catalog = serviceDouble();
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(
  new CatalogAdminHttpApi(identity, catalog as unknown as CatalogEntityAdminService, logger),
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

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-token',
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json', 'idempotency-key': 'test-key' }),
      ...init.headers,
    },
  });
}

describe('Catalog administrative HTTP API', () => {
  it('exposes exactly the five operations for each of the four entities', async () => {
    const bodies = {
      categories: { description: null, name: 'Categoría' },
      collections: { description: null, gameId: id, name: 'Colección' },
      products: {
        categoryId: id,
        collectionId: null,
        condition: null,
        description: null,
        edition: null,
        gameId: id,
        language: null,
        name: 'Producto',
        priceAmountClp: 1000,
        saleType: 'REGULAR',
        sku: 'SKU-1',
      },
      'tcg-games': { description: null, name: 'Juego', slug: 'juego' },
    } as const;
    for (const kind of ['tcg-games', 'categories', 'collections', 'products'] as const) {
      const calls: readonly [string, RequestInit][] = [
        [`/api/v1/admin/catalog/${kind}?limit=10`, { method: 'GET' }],
        [`/api/v1/admin/catalog/${kind}`, { body: JSON.stringify(bodies[kind]), method: 'POST' }],
        [`/api/v1/admin/catalog/${kind}/${id}`, { method: 'GET' }],
        [
          `/api/v1/admin/catalog/${kind}/${id}`,
          { body: JSON.stringify({ name: 'Editado' }), method: 'PATCH' },
        ],
        [
          `/api/v1/admin/catalog/${kind}/${id}/publication-transitions`,
          { body: JSON.stringify({ nextStatus: 'ARCHIVED' }), method: 'POST' },
        ],
      ];
      for (const [path, init] of calls) {
        const response = await request(path, init);
        expect(response.status, `${init.method} ${path}`).not.toBe(404);
        expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
      }
    }
  });

  it('requires authentication for GET and returns a correlated safe envelope', async () => {
    const response = await fetch(`${origin}/api/v1/admin/catalog/categories?limit=10`);
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body).toEqual({
      correlationId: response.headers.get('x-correlation-id'),
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
    });
  });

  it('maps invalid tokens and denied accounts without exposing provider details', async () => {
    vi.mocked(identity.authorize).mockRejectedValueOnce(
      new IdentityAccessError('PROVIDER_TOKEN_INVALID', 401, 'raw provider token detail'),
    );
    let response = await request('/api/v1/admin/catalog/categories?limit=10');
    expect(await response.text()).not.toContain('raw provider');
    expect(response.status).toBe(401);

    vi.mocked(identity.authorize).mockRejectedValueOnce(
      new IdentityAccessError('ACCESS_DENIED', 403, 'raw authorization detail'),
    );
    response = await request('/api/v1/admin/catalog/categories?limit=10');
    expect(await response.text()).not.toContain('raw authorization');
    expect(response.status).toBe(403);
  });

  it('rejects unknown fields, empty PATCH, invalid UUID, unsupported filters and missing keys', async () => {
    const unknown = await request('/api/v1/admin/catalog/categories', {
      body: JSON.stringify({ description: null, gameId: id, name: 'Inválida' }),
      method: 'POST',
    });
    expect(unknown.status).toBe(422);

    const empty = await request(`/api/v1/admin/catalog/categories/${id}`, {
      body: '{}',
      method: 'PATCH',
    });
    expect(empty.status).toBe(422);

    const invalidId = await request('/api/v1/admin/catalog/products/not-a-uuid');
    expect(invalidId.status).toBe(422);

    const filter = await request('/api/v1/admin/catalog/products?limit=10&sku=SKU-1');
    expect(filter.status).toBe(422);

    const missingKey = await fetch(`${origin}/api/v1/admin/catalog/categories`, {
      body: JSON.stringify({ description: null, name: 'Categoría' }),
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(missingKey.status).toBe(422);
  });

  it('rejects malformed JSON, wrong content type, oversized input and arrays', async () => {
    const malformed = await request('/api/v1/admin/catalog/categories', {
      body: '{',
      method: 'POST',
    });
    expect(malformed.status).toBe(400);

    const wrongType = await request('/api/v1/admin/catalog/categories', {
      body: JSON.stringify({ description: null, name: 'Categoría' }),
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
    });
    expect(wrongType.status).toBe(422);

    const array = await request('/api/v1/admin/catalog/categories', { body: '[]', method: 'POST' });
    expect(array.status).toBe(422);

    const oversized = await request('/api/v1/admin/catalog/categories', {
      body: JSON.stringify({ description: 'x'.repeat(33 * 1024), name: 'Categoría' }),
      method: 'POST',
    });
    expect(oversized.status).toBe(413);
  });

  it('maps internal catalog failures to the closed public codes without leakage', async () => {
    catalog.createProduct.mockRejectedValueOnce(
      new CatalogError(
        'CATALOG_INVARIANT_VIOLATION',
        'CONFLICT',
        'constraint product_media /secret/path',
      ),
    );
    const response = await request('/api/v1/admin/catalog/products', {
      body: JSON.stringify({
        categoryId: id,
        collectionId: null,
        condition: null,
        description: null,
        edition: null,
        gameId: id,
        language: null,
        name: 'Producto',
        priceAmountClp: 1000,
        saleType: 'REGULAR',
        sku: 'SKU-2',
      }),
      method: 'POST',
    });
    const text = await response.text();
    expect(response.status).toBe(409);
    expect(text).toContain('STATE_CONFLICT');
    expect(text).not.toMatch(/constraint|product_media|secret/u);
  });

  it('returns only the approved Product fields and maps database outages to 503', async () => {
    let response = await request(`/api/v1/admin/catalog/products/${id}`);
    const body = (await response.json()) as { item: Record<string, unknown> };
    expect(Object.keys(body.item).sort()).toEqual(
      [
        'archivedAt',
        'categoryId',
        'collectionId',
        'condition',
        'createdAt',
        'description',
        'edition',
        'gameId',
        'language',
        'name',
        'priceAmountClp',
        'productId',
        'publicationStatus',
        'saleType',
        'sku',
        'updatedAt',
      ].sort(),
    );

    catalog.listProducts.mockRejectedValueOnce(
      Object.assign(new Error('DATABASE_URL and internal host must remain private'), {
        code: 'ECONNREFUSED',
      }),
    );
    response = await request('/api/v1/admin/catalog/products?limit=10');
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(text).toContain('DEPENDENCY_UNAVAILABLE');
    expect(text).not.toMatch(/DATABASE_URL|internal host/u);
  });
});
