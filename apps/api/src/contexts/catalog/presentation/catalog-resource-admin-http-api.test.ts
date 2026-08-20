import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createServer } from '../../../presentation/http/create-server.js';
import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import type { CatalogResourceAdminService } from '../application/catalog-resource-admin-service.js';
import { CatalogResourceAdminHttpApi } from './catalog-resource-admin-http-api.js';

const entityId = '0198a8be-6677-7000-8000-000000000001';
const resourceId = '0198a8be-6677-7000-8000-000000000002';
const now = new Date('2026-08-01T12:00:00.000Z');
const item = {
  altText: 'Imagen de catálogo',
  byteSize: 1_024,
  heightPx: 320,
  isPrimary: false,
  mimeTypeReal: 'image/png' as const,
  originalFilenameSafe: 'imagen.png',
  position: 1,
  replacedResourceId: null,
  resourceId,
  retiredAt: null,
  retiredBy: null,
  sha256Hex: 'a'.repeat(64),
  state: 'ACTIVE' as const,
  uploadedAt: now,
  uploadedBy: entityId,
  validatedAt: now,
  widthPx: 320,
};

function serviceDouble() {
  return {
    list: vi.fn().mockResolvedValue({ etag: '"etag"', items: [item], nextCursor: null }),
    reorder: vi.fn().mockResolvedValue({ etag: '"new-etag"', items: [item], replayed: false }),
    replace: vi.fn().mockResolvedValue({ item, replayed: false }),
    retire: vi.fn().mockResolvedValue({ item: { ...item, state: 'REMOVED' }, replayed: false }),
    selectPrimary: vi
      .fn()
      .mockResolvedValue({ item: { ...item, isPrimary: true }, replayed: false }),
    upload: vi.fn().mockResolvedValue({ item, replayed: false }),
  };
}

const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId: entityId } }),
} as unknown as IdentityAccessService;
const catalog = serviceDouble();
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(
  new CatalogResourceAdminHttpApi(
    identity,
    catalog as unknown as CatalogResourceAdminService,
    logger,
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

describe('Catalog resource administrative HTTP API', () => {
  it('exposes exactly the six approved operations for each of four fixed owner segments', async () => {
    for (const segment of ['tcg-games', 'categories', 'collections', 'products']) {
      const base = `/api/v1/admin/catalog/${segment}/${entityId}/resources`;
      const responses = await Promise.all([
        request(`${base}?limit=10`),
        request(base, { body: uploadForm(), method: 'POST' }),
        request(`${base}/order`, {
          body: JSON.stringify({ orderedResourceIds: [resourceId] }),
          headers: { 'content-type': 'application/json', 'if-match': '"etag"' },
          method: 'PATCH',
        }),
        request(`${base}/primary`, {
          body: JSON.stringify({ resourceId }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        }),
        request(`${base}/${resourceId}/replacements`, {
          body: replacementForm(),
          method: 'POST',
        }),
        request(`${base}/${resourceId}/retirements`, {
          body: JSON.stringify({ reason: 'Retiro justificado' }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      ]);
      expect(responses.map((response) => response.status)).toEqual([200, 201, 200, 200, 201, 200]);
    }
    expect(catalog.list).toHaveBeenCalledTimes(4);
    expect(catalog.upload).toHaveBeenCalledTimes(4);
    expect(catalog.reorder).toHaveBeenCalledTimes(4);
    expect(catalog.selectPrimary).toHaveBeenCalledTimes(4);
    expect(catalog.replace).toHaveBeenCalledTimes(4);
    expect(catalog.retire).toHaveBeenCalledTimes(4);
  });

  it('requires If-Match only for reordering', async () => {
    const response = await request(`/api/v1/admin/catalog/products/${entityId}/resources/order`, {
      body: JSON.stringify({ orderedResourceIds: [resourceId] }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PRECONDITION_REQUIRED' },
    });
  });

  it('authenticates before parsing an invalid multipart body', async () => {
    const deniedIdentity = {
      authorize: vi
        .fn()
        .mockRejectedValue(new IdentityAccessError('AUTHENTICATION_REQUIRED', 401, 'denied')),
    } as unknown as IdentityAccessService;
    const deniedServer = createServer(
      new CatalogResourceAdminHttpApi(
        deniedIdentity,
        catalog as unknown as CatalogResourceAdminService,
        logger,
      ),
    );
    await new Promise<void>((resolve) => deniedServer.listen(0, '127.0.0.1', resolve));
    try {
      const address = deniedServer.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/admin/catalog/products/${entityId}/resources`,
        {
          body: 'not multipart',
          headers: { authorization: 'Bearer invalid', 'content-type': 'multipart/form-data' },
          method: 'POST',
        },
      );
      expect(response.status).toBe(401);
    } finally {
      await new Promise<void>((resolve) => deniedServer.close(() => resolve()));
    }
  });

  it('requires authorization for GET and denies non-active administrative sessions', async () => {
    const base = `/api/v1/admin/catalog/products/${entityId}/resources?limit=10`;
    const missing = await fetch(`${origin}${base}`);
    expect(missing.status).toBe(401);

    for (const code of ['CLIENT_ACTIVE', 'ADMIN_DEACTIVATED', 'SESSION_INVALIDATED']) {
      const deniedIdentity = {
        authorize: vi.fn().mockRejectedValue(new IdentityAccessError(code, 403, 'denied')),
      } as unknown as IdentityAccessService;
      const deniedServer = createServer(
        new CatalogResourceAdminHttpApi(
          deniedIdentity,
          catalog as unknown as CatalogResourceAdminService,
          logger,
        ),
      );
      await new Promise<void>((resolve) => deniedServer.listen(0, '127.0.0.1', resolve));
      try {
        const address = deniedServer.address() as AddressInfo;
        const response = await fetch(`http://127.0.0.1:${address.port}${base}`, {
          headers: { authorization: 'Bearer denied' },
        });
        expect(response.status).toBe(403);
      } finally {
        await new Promise<void>((resolve) => deniedServer.close(() => resolve()));
      }
    }
  });

  it('does not expose unapproved dynamic owner routes', async () => {
    const response = await request(
      `/api/v1/admin/catalog/arbitrary/${entityId}/resources?limit=10`,
    );
    expect(response.status).toBe(404);
  });
});

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-token',
      ...(init.method === undefined || init.method === 'GET'
        ? {}
        : { 'idempotency-key': 'test-key' }),
      ...init.headers,
    },
  });
}

function uploadForm(): FormData {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'imagen.png');
  form.set('altText', 'Imagen de catálogo');
  form.set('position', '1');
  return form;
}

function replacementForm(): FormData {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'reemplazo.png');
  form.set('altText', 'Imagen reemplazada');
  form.set('reason', 'Corrección editorial');
  return form;
}
