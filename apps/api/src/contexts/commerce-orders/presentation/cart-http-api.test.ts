import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { CartService } from '../application/cart-service.js';
import { CartError } from '../domain/cart.js';
import { CartHttpApi } from './cart-http-api.js';

const accountId = '0198a8be-6677-7000-8000-000000000001';
const lineId = '0198a8be-6677-7000-8000-000000000002';
const groupId = '0198a8be-6677-7000-8000-000000000003';
const productId = '0198a8be-6677-7000-8000-000000000004';
const token = 'A'.repeat(43);
const cookie = `sergod_cart_session=${token}`;
const item = {
  cartId: '0198a8be-6677-7000-8000-000000000005',
  createdAt: '2026-08-11T12:00:00.000Z',
  expiresAt: '2026-08-11T12:30:00.000Z',
  groups: [],
  mergedIntoCartId: null,
  ownerKind: 'ANONYMOUS',
  state: 'ACTIVE',
  updatedAt: '2026-08-11T12:00:00.000Z',
  version: 1,
} as const;
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const cart = {
  addLine: vi.fn().mockResolvedValue({ item, replayed: false }),
  createCompatibleGroup: vi.fn().mockResolvedValue({ item, replayed: false }),
  createCurrent: vi.fn().mockResolvedValue({ item, replayed: false }),
  getCurrent: vi.fn().mockResolvedValue({ item }),
  merge: vi.fn().mockResolvedValue({ item: { ...item, ownerKind: 'ACCOUNT' }, replayed: false }),
  moveConflictLine: vi.fn().mockResolvedValue({ item, replayed: false }),
  removeLine: vi.fn().mockResolvedValue({ item, replayed: false }),
  updateLine: vi.fn().mockResolvedValue({ item, replayed: false }),
};
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(new CartHttpApi(identity, cart as unknown as CartService, logger));
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

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
  });
}

describe('Cart HTTP API', () => {
  it('creates an opaque HttpOnly anonymous session and retrieves only its cart', async () => {
    const created = await request('/api/v1/cart', {
      body: '{}',
      headers: { 'idempotency-key': 'create-cart' },
      method: 'POST',
    });
    expect(created.status).toBe(201);
    const setCookie = created.headers.get('set-cookie');
    expect(setCookie).toMatch(
      /^sergod_cart_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax$/u,
    );
    expect(cart.createCurrent).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: expect.any(String), idempotencyKey: 'create-cart' }),
      expect.objectContaining({
        anonymousSessionId: expect.stringMatching(/^[0-9a-f]{64}$/u),
        kind: 'ANONYMOUS',
      }),
    );

    const current = await request('/api/v1/cart', { headers: { cookie } });
    expect(current.status).toBe(200);
    expect(cart.getCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        anonymousSessionId: expect.stringMatching(/^[0-9a-f]{64}$/u),
        kind: 'ANONYMOUS',
      }),
    );
  });

  it('exposes strict line and conflict mutation routes with Idempotency-Key', async () => {
    const calls: readonly [string, RequestInit][] = [
      [
        '/api/v1/cart/lines',
        {
          body: JSON.stringify({ preorderCampaignId: null, productId, quantity: 1 }),
          method: 'POST',
        },
      ],
      [`/api/v1/cart/lines/${lineId}`, { body: JSON.stringify({ quantity: 2 }), method: 'PUT' }],
      [`/api/v1/cart/lines/${lineId}`, { method: 'DELETE' }],
      [
        `/api/v1/cart/conflicts/${lineId}/move`,
        { body: JSON.stringify({ targetGroupId: groupId }), method: 'POST' },
      ],
      [`/api/v1/cart/conflicts/${lineId}/compatible-group`, { body: '{}', method: 'POST' }],
    ];
    for (const [path, init] of calls) {
      const response = await request(path, {
        ...init,
        headers: { cookie, 'idempotency-key': crypto.randomUUID() },
      });
      expect(response.status, `${init.method} ${path}`).not.toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(cart.addLine).toHaveBeenCalled();
    expect(cart.updateLine).toHaveBeenCalled();
    expect(cart.removeLine).toHaveBeenCalled();
    expect(cart.moveConflictLine).toHaveBeenCalled();
    expect(cart.createCompatibleGroup).toHaveBeenCalled();
  });

  it('uses ACCOUNT_SELF authorization for authenticated carts and clears the anonymous cookie after merge', async () => {
    const response = await request('/api/v1/cart/merge', {
      body: '{}',
      headers: {
        authorization: 'Bearer private-token',
        cookie,
        'idempotency-key': 'merge-cart',
      },
      method: 'POST',
    });
    expect(response.status).toBe(200);
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'private-token',
      capability: { kind: 'ACCOUNT_SELF' },
    });
    expect(cart.merge).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: accountId, idempotencyKey: 'merge-cart' }),
      accountId,
      expect.stringMatching(/^[0-9a-f]{64}$/u),
    );
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('requires session, authentication semantics and idempotency without accepting unknown fields', async () => {
    expect((await request('/api/v1/cart')).status).toBe(401);
    expect(
      (
        await request('/api/v1/cart/lines', {
          body: JSON.stringify({ preorderCampaignId: null, productId, quantity: 1 }),
          headers: { cookie },
          method: 'POST',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request('/api/v1/cart/lines', {
          body: JSON.stringify({
            actorId: accountId,
            preorderCampaignId: null,
            productId,
            quantity: 1,
          }),
          headers: { cookie, 'idempotency-key': 'strict' },
          method: 'POST',
        })
      ).status,
    ).toBe(422);
  });

  it('maps identity, ownership and infrastructure failures to closed correlated errors', async () => {
    vi.mocked(identity.authorize).mockRejectedValueOnce(
      new IdentityAccessError('SESSION_INVALID', 401, 'private provider detail'),
    );
    let response = await request('/api/v1/cart', { headers: { authorization: 'Bearer bad' } });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('private provider detail');

    vi.mocked(identity.authorize).mockRejectedValueOnce(
      new IdentityAccessError('ACCESS_DENIED', 403, 'private authorization detail'),
    );
    response = await request('/api/v1/cart', {
      headers: { authorization: 'Bearer valid-but-forbidden' },
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('private authorization detail');

    cart.getCurrent.mockRejectedValueOnce(
      new CartError(
        'CART_ANONYMOUS_INACTIVITY_CONFIGURATION_REQUIRED',
        'INFRASTRUCTURE',
        'database detail',
      ),
    );
    response = await request('/api/v1/cart', { headers: { cookie } });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain('database detail');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: expect.any(String),
        error: 'DEPENDENCY_UNAVAILABLE',
      }),
      expect.any(String),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(token);
  });
});
