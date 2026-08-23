import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { OrderService } from '../application/order-service.js';
import { OrderHttpApi } from './order-http-api.js';

const accountId = '0198a8be-6677-7000-8000-000000000001';
const orderId = '0198a8be-6677-7000-8000-000000000010';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const item = {
  accountId,
  branchId: '0198a8be-6677-7000-8000-000000000003',
  cartGroupId: '0198a8be-6677-7000-8000-000000000002',
  checkoutVersion: 3,
  createdAt: '2026-08-20T04:30:00.000Z',
  currency: 'CLP',
  deliveryMode: 'PICKUP',
  deliverySnapshot: { mode: 'PICKUP' },
  expiresAt: '2026-08-20T04:45:00.000Z',
  lines: [],
  merchandiseSubtotalClp: 10000,
  orderId,
  orderType: 'REGULAR',
  pointsDiscountClp: 0,
  promotionDiscountClp: 0,
  publicNumber: 'SG-2026-000001',
  requiresExternalPayment: true,
  shippingIncludedInOrderTotal: false,
  state: 'PENDING_PAYMENT',
  totalAmountClp: 10000,
  updatedAt: '2026-08-20T04:30:00.000Z',
} as const;
const orders = {
  getForAccount: vi.fn().mockResolvedValue({ item }),
  getForAdmin: vi.fn().mockResolvedValue({ item }),
  listForAccount: vi.fn().mockResolvedValue({ items: [item], nextCursor: null }),
  listForAdmin: vi.fn().mockResolvedValue({ items: [item], nextCursor: null }),
};
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(new OrderHttpApi(identity, orders as unknown as OrderService, logger));
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

function request(path: string) {
  return fetch(`${origin}${path}`, { headers: { authorization: 'Bearer private-token' } });
}

describe('Orders HTTP API', () => {
  it('scopes customer reads to BUYER and account id', async () => {
    const response = await request(`/api/v1/orders/${orderId}`);
    expect(response.status).toBe(200);
    expect(orders.getForAccount).toHaveBeenCalledWith(accountId, orderId);
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'private-token',
      capability: { kind: 'BUYER' },
    });
  });

  it('uses ADMIN authorization for admin history', async () => {
    const response = await request(
      '/api/v1/admin/orders?limit=10&state=PENDING_PAYMENT&orderType=PREORDER',
    );
    expect(response.status).toBe(200);
    expect(orders.listForAdmin).toHaveBeenCalledWith({
      limit: 10,
      orderType: 'PREORDER',
      state: 'PENDING_PAYMENT',
    });
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'private-token',
      capability: { kind: 'ADMIN' },
    });
  });

  it('rejects invalid identifiers before repository access', async () => {
    const response = await request('/api/v1/orders/not-a-uuid');
    expect(response.status).toBe(422);
    expect(orders.getForAccount).not.toHaveBeenCalled();
  });
});
