import type { AddressInfo } from 'node:net';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createServer } from '../../../presentation/http/create-server.js';
import type { PromotionsAdminService } from '../application/promotions-admin-service.js';
import { PromotionsAdminHttpApi } from './promotions-admin-http-api.js';

const id = '0198a8be-6677-7000-8000-000000000001';
const service = {
  createCoupon: vi.fn().mockResolvedValue({ item: { couponId: id }, replayed: false }),
  createPromotion: vi.fn().mockResolvedValue({ item: { promotionId: id }, replayed: false }),
  editPromotion: vi.fn().mockResolvedValue({ item: { promotionId: id }, replayed: false }),
  getCoupon: vi.fn().mockResolvedValue({ couponId: id }),
  getPromotion: vi.fn().mockResolvedValue({ promotionId: id }),
  listCoupons: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listPromotions: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  preview: vi.fn().mockResolvedValue({
    couponStatus: 'NOT_PROVIDED',
    snapshots: [],
    totalDiscountAmountClp: 0,
    usageIntention: null,
  }),
  transitionCoupon: vi.fn().mockResolvedValue({ item: { couponId: id }, replayed: false }),
  transitionPromotion: vi.fn().mockResolvedValue({ item: { promotionId: id }, replayed: false }),
};
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId: id } }),
} as unknown as IdentityAccessService;
const server = createServer(
  new PromotionsAdminHttpApi(identity, service as unknown as PromotionsAdminService, {
    error: vi.fn(),
    info: vi.fn(),
  }),
);
let origin: string;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  async () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    ),
);

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-token',
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json', 'idempotency-key': 'phase-5-key' }),
      ...init.headers,
    },
  });
}

const promotion = {
  activationMode: 'AUTOMATIC',
  benefit: { basisPoints: 1000, type: 'PERCENTAGE_DISCOUNT' },
  branchId: null,
  channel: 'BOTH',
  endsAt: '2026-09-01T00:00:00.000Z',
  globalLimit: null,
  minimumEligibleAmountClp: null,
  minimumEligibleQuantity: null,
  name: 'Promotion',
  perAccountLimit: null,
  priority: 1,
  schedules: [],
  scope: 'LINE',
  startsAt: '2026-08-01T00:00:00.000Z',
  targets: [
    {
      categoryId: null,
      gameId: null,
      kind: 'ALL_PRODUCTS',
      position: 1,
      productId: null,
      side: 'BENEFITED',
    },
  ],
};

describe('Promotions administrative HTTP API', () => {
  it('exposes the approved Promotion and Coupon operations with correlation', async () => {
    const calls: readonly [string, RequestInit][] = [
      ['/api/v1/admin/promotions?limit=10', { method: 'GET' }],
      ['/api/v1/admin/promotions', { body: JSON.stringify(promotion), method: 'POST' }],
      [`/api/v1/admin/promotions/${id}`, { method: 'GET' }],
      [`/api/v1/admin/promotions/${id}`, { body: JSON.stringify(promotion), method: 'PATCH' }],
      [
        `/api/v1/admin/promotions/${id}/state-transitions`,
        { body: JSON.stringify({ nextState: 'CANCELLED' }), method: 'POST' },
      ],
      ['/api/v1/admin/coupons?limit=10', { method: 'GET' }],
      [
        '/api/v1/admin/coupons',
        {
          body: JSON.stringify({
            code: 'SAVE',
            endsAt: null,
            globalLimit: null,
            perAccountLimit: null,
            promotionId: id,
            startsAt: null,
          }),
          method: 'POST',
        },
      ],
      [`/api/v1/admin/coupons/${id}`, { method: 'GET' }],
      [
        `/api/v1/admin/coupons/${id}/state-transitions`,
        { body: JSON.stringify({ nextState: 'ACTIVE' }), method: 'POST' },
      ],
    ];
    for (const [path, init] of calls) {
      const response = await request(path, init);
      expect(response.status, `${init.method} ${path}`).not.toBe(404);
      expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
    }
  });

  it('requires authentication and Idempotency-Key while preview stays non-mutating', async () => {
    const unauthenticated = await fetch(`${origin}/api/v1/admin/promotions?limit=10`);
    expect(unauthenticated.status).toBe(401);
    const missingKey = await fetch(`${origin}/api/v1/admin/promotions`, {
      body: JSON.stringify(promotion),
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(missingKey.status).toBe(422);
  });

  it('rejects unknown routes, filters, fields and malformed identifiers safely', async () => {
    expect((await request('/api/v1/admin/promotions?limit=10&secret=x')).status).toBe(422);
    expect((await request('/api/v1/admin/promotions/not-a-uuid')).status).toBe(422);
    expect((await request('/api/v1/admin/coupons/extra/path')).status).toBe(404);
    expect(
      (
        await request('/api/v1/admin/promotions', {
          body: JSON.stringify({ ...promotion, conditions: {} }),
          method: 'POST',
        })
      ).status,
    ).toBe(422);
  });
});
