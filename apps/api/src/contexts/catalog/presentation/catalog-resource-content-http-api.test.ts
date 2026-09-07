import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createServer } from '../../../presentation/http/create-server.js';
import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import type { CatalogPublicResourceService } from '../application/catalog-public-resource-service.js';
import { CatalogResourceContentHttpApi } from './catalog-resource-content-http-api.js';

const entityId = '0198a8be-6677-7000-8000-000000000010';
const resourceId = '0198a8be-6677-7000-8000-000000000020';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId: entityId } }),
} as unknown as IdentityAccessService;
const resources = {
  prepareCatalogAdmin: vi.fn().mockResolvedValue({
    byteSize: 5,
    loadValidatedBytes: () => Promise.resolve(Buffer.from('image')),
    mimeType: 'image/webp',
  }),
} as unknown as CatalogPublicResourceService;
const server = createServer(new CatalogResourceContentHttpApi(identity, resources));
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

describe('Catalog resource content HTTP API', () => {
  it('delivers a private product image only after ADMIN authorization', async () => {
    const response = await fetch(
      `${origin}/api/v1/admin/catalog/products/${entityId}/resources/${resourceId}/content`,
      { headers: { authorization: 'Bearer admin-token' } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('image');
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'admin-token',
      capability: { kind: 'ADMIN' },
    });
    expect(resources.prepareCatalogAdmin).toHaveBeenCalledWith('PRODUCT', entityId, resourceId);
  });
});
