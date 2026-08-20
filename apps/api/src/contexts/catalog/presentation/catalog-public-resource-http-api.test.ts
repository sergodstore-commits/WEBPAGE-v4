import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { describe, expect, it, vi } from 'vitest';

import {
  CompositeHttpRouteHandler,
  createServer,
} from '../../../presentation/http/create-server.js';
import { CatalogPublicResourceService } from '../application/catalog-public-resource-service.js';
import type { CatalogPublicResourceQueryPort } from '../application/catalog-public-ports.js';
import type { CatalogPrivateStoragePort } from '../application/ports.js';
import type { CatalogPublicQueryService } from '../application/catalog-public-query-service.js';
import { CatalogPublicHttpApi, CatalogPublicRateLimiter } from './catalog-public-http-api.js';
import { CatalogPublicResourceHttpApi } from './catalog-public-resource-http-api.js';

const resourceId = '0198a8be-6677-7000-8000-000000000001';
const secureStorageKey = '0198a8be-6677-7000-8000-000000000099';
const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
const sha256Hex = createHash('sha256').update(bytes).digest('hex');

function resourceSubject() {
  const repository = {
    findPublicResource: vi.fn().mockResolvedValue({
      byteSize: bytes.byteLength,
      mimeTypeReal: 'image/png' as const,
      resourceId,
      secureStorageKey,
      sha256Hex,
    }),
  };
  const storage = {
    downloadPrivateObject: vi.fn().mockResolvedValue(bytes),
    privateObjectExists: vi.fn(),
    uploadPrivateObject: vi.fn(),
  };
  const logger = { error: vi.fn(), info: vi.fn() };
  return {
    logger,
    repository,
    service: new CatalogPublicResourceService(
      repository as unknown as CatalogPublicResourceQueryPort,
      storage as unknown as CatalogPrivateStoragePort,
    ),
    storage,
  };
}

async function withServer(
  handler: ConstructorParameters<typeof CompositeHttpRouteHandler>[0][number],
  run: (origin: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
}

function resourceApi(
  test: ReturnType<typeof resourceSubject>,
  limiter = new CatalogPublicRateLimiter(1000, 60_000),
) {
  return new CatalogPublicResourceHttpApi(test.service, test.logger, limiter);
}

describe('Public catalog resource HTTP API', () => {
  it('returns validated bytes with the closed binary headers and no Storage location', async () => {
    const test = resourceSubject();
    await withServer(resourceApi(test), async (origin) => {
      const response = await fetch(`${origin}/api/v1/catalog/resources/${resourceId}/content`);
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('content-length')).toBe(String(bytes.byteLength));
      expect(response.headers.get('content-disposition')).toBe('inline');
      expect(response.headers.get('cache-control')).toBe('public, no-cache');
      expect(response.headers.get('etag')).toMatch(/^"[A-Za-z0-9_-]+"$/u);
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
    });
    expect(test.storage.downloadPrivateObject).toHaveBeenCalledOnce();
  });

  it('handles HEAD from visible PostgreSQL metadata without downloading Storage content', async () => {
    const test = resourceSubject();
    await withServer(resourceApi(test), async (origin) => {
      const response = await fetch(`${origin}/api/v1/catalog/resources/${resourceId}/content`, {
        method: 'HEAD',
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('content-length')).toBe(String(bytes.byteLength));
      expect(response.headers.get('content-disposition')).toBe('inline');
      expect(response.headers.get('etag')).toBeTruthy();
    });
    expect(test.storage.downloadPrivateObject).not.toHaveBeenCalled();
  });

  it('supports exact, list, weak and wildcard If-None-Match without calling Storage', async () => {
    const test = resourceSubject();
    await withServer(resourceApi(test), async (origin) => {
      const path = `${origin}/api/v1/catalog/resources/${resourceId}/content`;
      const head = await fetch(path, { method: 'HEAD' });
      const etag = head.headers.get('etag');
      expect(etag).toBeTruthy();
      for (const condition of [etag ?? '', `"different", W/${etag}`, `W/${etag}`, '*']) {
        const response = await fetch(path, { headers: { 'If-None-Match': condition } });
        expect(response.status, condition).toBe(304);
        expect(await response.text(), condition).toBe('');
        expect(response.headers.get('etag'), condition).toBe(etag);
        expect(response.headers.get('cache-control'), condition).toBe('public, no-cache');
        expect(response.headers.get('x-content-type-options'), condition).toBe('nosniff');
      }
    });
    expect(test.storage.downloadPrivateObject).not.toHaveBeenCalled();
  });

  it('returns 200 for mismatched or malformed conditions and validates Storage', async () => {
    for (const condition of ['"different"', 'unquoted', 'W/ "malformed"']) {
      const test = resourceSubject();
      await withServer(resourceApi(test), async (origin) => {
        const response = await fetch(`${origin}/api/v1/catalog/resources/${resourceId}/content`, {
          headers: { 'If-None-Match': condition },
        });
        expect(response.status, condition).toBe(200);
      });
      expect(test.storage.downloadPrivateObject).toHaveBeenCalledOnce();
    }
  });

  it('makes malformed, missing and non-visible resources indistinguishable without Storage', async () => {
    const test = resourceSubject();
    await withServer(resourceApi(test), async (origin) => {
      let response = await fetch(`${origin}/api/v1/catalog/resources/not-a-uuid/content`);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: 'CATALOG_RESOURCE_NOT_FOUND', message: 'Catalog resource was not found.' },
      });
      expect(test.repository.findPublicResource).not.toHaveBeenCalled();

      test.repository.findPublicResource.mockResolvedValueOnce(null);
      response = await fetch(`${origin}/api/v1/catalog/resources/${resourceId}/content`);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        error: { code: 'CATALOG_RESOURCE_NOT_FOUND', message: 'Catalog resource was not found.' },
      });
    });
    expect(test.storage.downloadPrivateObject).not.toHaveBeenCalled();
  });

  it('rejects query parameters and redacts integrity and Storage failures', async () => {
    const test = resourceSubject();
    await withServer(resourceApi(test), async (origin) => {
      let response = await fetch(
        `${origin}/api/v1/catalog/resources/${resourceId}/content?download=true`,
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });

      test.storage.downloadPrivateObject.mockResolvedValueOnce(new Uint8Array([9, 9, 9]));
      response = await fetch(`${origin}/api/v1/catalog/resources/${resourceId}/content`);
      const text = await response.text();
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(text).toContain('DEPENDENCY_UNAVAILABLE');
      expect(text).not.toMatch(
        /secureStorageKey|catalog-assets|0198a8be-6677-7000-8000-000000000099/u,
      );
      expect(response.headers.get('etag')).toBeNull();
      expect(response.headers.get('content-disposition')).toBeNull();
    });
    expect(JSON.stringify(test.logger.error.mock.calls)).not.toMatch(
      /secureStorageKey|catalog-assets|0198a8be-6677-7000-8000-000000000099/u,
    );
  });

  it('shares one rate limit with existing public catalog routes for GET and HEAD', async () => {
    const test = resourceSubject();
    const limiter = new CatalogPublicRateLimiter(2, 60_000);
    const queryService = {
      listGames: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const handler = new CompositeHttpRouteHandler([
      resourceApi(test, limiter),
      new CatalogPublicHttpApi(
        queryService as unknown as CatalogPublicQueryService,
        test.logger,
        limiter,
      ),
    ]);
    await withServer(handler, async (origin) => {
      expect(
        (
          await fetch(`${origin}/api/v1/catalog/resources/${resourceId}/content`, {
            method: 'HEAD',
          })
        ).status,
      ).toBe(200);
      expect((await fetch(`${origin}/api/v1/catalog/tcg-games?limit=10`)).status).toBe(200);
      const blocked = await fetch(`${origin}/api/v1/catalog/resources/${resourceId}/content`);
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get('retry-after')).toBe('60');
      expect(blocked.headers.get('cache-control')).toBe('no-store');
      expect(await blocked.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    });
    expect(test.storage.downloadPrivateObject).not.toHaveBeenCalled();
  });
});
