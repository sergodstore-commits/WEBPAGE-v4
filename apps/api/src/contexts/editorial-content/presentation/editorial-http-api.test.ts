import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { EditorialService } from '../application/editorial-service.js';
import type { EditorialMediaService } from '../application/editorial-media-service.js';
import { EditorialHttpApi } from './editorial-http-api.js';

const accountId = '0198a8be-6677-7000-8000-000000000001';
const entryId = '0198a8be-6677-7000-8000-000000000010';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const editorial = {
  listAdmin: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listPublic: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  transition: vi.fn().mockResolvedValue({ item: { status: 'PUBLISHED' } }),
} as unknown as EditorialService;
const media = {
  upload: vi.fn().mockResolvedValue({ item: { editorialEntryId: entryId }, replayed: false }),
} as unknown as EditorialMediaService;
const server = createServer(new EditorialHttpApi(identity, editorial, media));
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
beforeEach(() => vi.clearAllMocks());

describe('Editorial HTTP API', () => {
  it('serves public tournament content without authenticating', async () => {
    const response = await fetch(`${origin}/api/v1/content?type=TOURNAMENT&limit=12`);
    expect(response.status).toBe(200);
    expect(editorial.listPublic).toHaveBeenCalledWith({ limit: 12, type: 'TOURNAMENT' });
    expect(identity.authorize).not.toHaveBeenCalled();
  });

  it('protects editorial publication with ADMIN capability', async () => {
    const response = await fetch(`${origin}/api/v1/admin/content/${entryId}/publish`, {
      headers: { authorization: 'Bearer admin-token' },
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'admin-token',
      capability: { kind: 'ADMIN' },
    });
    expect(editorial.transition).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: accountId }),
      entryId,
      'PUBLISHED',
    );
  });

  it('uploads a validated editorial image with ADMIN authorization and idempotency', async () => {
    const form = new FormData();
    form.set('file', new Blob(['image'], { type: 'image/webp' }), 'news.webp');
    form.set('altText', 'Mesa de juego durante el evento');
    form.set('placement', 'LEFT');
    form.set('width', 'MEDIUM');
    const response = await fetch(`${origin}/api/v1/admin/content/${entryId}/resources`, {
      body: form,
      headers: { authorization: 'Bearer admin-token', 'idempotency-key': 'editorial-upload-1' },
      method: 'POST',
    });
    expect(identity.authorize).toHaveBeenCalled();
    expect(response.status, await response.clone().text()).toBe(201);
    expect(media.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        altText: 'Mesa de juego durante el evento',
        context: expect.objectContaining({ idempotencyKey: 'editorial-upload-1' }),
        editorialEntryId: entryId,
        placement: 'LEFT',
        width: 'MEDIUM',
      }),
    );
  });
});
