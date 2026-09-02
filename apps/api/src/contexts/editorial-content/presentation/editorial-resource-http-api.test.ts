import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createServer } from '../../../presentation/http/create-server.js';
import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import type { EditorialMediaService } from '../application/editorial-media-service.js';
import { EditorialResourceHttpApi } from './editorial-resource-http-api.js';

const entryId = '0198a8be-6677-7000-8000-000000000010';
const resourceId = '0198a8be-6677-7000-8000-000000000020';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId: entryId } }),
} as unknown as IdentityAccessService;
const media = {
  prepare: vi.fn().mockResolvedValue({
    byteSize: 5,
    loadValidatedBytes: () => Promise.resolve(Buffer.from('image')),
    mimeType: 'image/webp',
  }),
} as unknown as EditorialMediaService;
const server = createServer(new EditorialResourceHttpApi(identity, media));
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

describe('Editorial resource HTTP API', () => {
  it('delivers a private draft image only after ADMIN authorization', async () => {
    const response = await fetch(
      `${origin}/api/v1/admin/content/${entryId}/resources/${resourceId}/content`,
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
    expect(media.prepare).toHaveBeenCalledWith(entryId, resourceId);
  });
});
