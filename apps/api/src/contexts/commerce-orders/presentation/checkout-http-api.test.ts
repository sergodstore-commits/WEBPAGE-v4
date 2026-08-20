import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { CheckoutService } from '../application/checkout-service.js';
import { CheckoutError } from '../domain/checkout.js';
import { CheckoutHttpApi } from './checkout-http-api.js';

const accountId = '0198a8be-6677-7000-8000-000000000001';
const groupId = '0198a8be-6677-7000-8000-000000000002';
const branchId = '0198a8be-6677-7000-8000-000000000003';
const item = {
  appliedPromotions: [],
  branchId,
  canCreateOrder: true,
  cartGroupId: groupId,
  checkoutVersion: 2,
  coupon: null,
  deliveryIntent: {
    branchId,
    lastValidatedAt: '2026-08-13T12:00:00.000Z',
    mode: 'PICKUP',
    validationErrorCodes: [],
    validationStatus: 'VALID',
  },
  groupType: 'REGULAR',
  lines: [],
  loyalty: {
    availablePoints: 0,
    configured: false,
    maxRedeemablePoints: 0,
    pointsDiscountClp: 0,
    requestedPoints: 0,
    validationErrorCodes: [],
  },
  merchandiseSubtotalClp: 0,
  promotionDiscountClp: 0,
  recalculatedAt: '2026-08-13T12:00:00.000Z',
  requiresExternalPayment: false,
  orderTotalWithoutShippingClp: 1000,
  shippingCostAmountClp: null,
  shippingIncludedInOrderTotal: false,
  shippingLabel: null,
  shippingPaymentMode: null,
  totalAmountClp: 0,
  validationErrorCodes: [],
} as const;
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const mutationResult = { item, replayed: false };
const checkout = {
  clearCoupon: vi.fn().mockResolvedValue(mutationResult),
  clearIntent: vi.fn().mockResolvedValue(mutationResult),
  clearPoints: vi.fn().mockResolvedValue(mutationResult),
  getSummary: vi.fn().mockResolvedValue({ item }),
  replaceIntent: vi.fn().mockResolvedValue(mutationResult),
  revalidate: vi.fn().mockResolvedValue(mutationResult),
  selectCoupon: vi.fn().mockResolvedValue(mutationResult),
  selectPoints: vi.fn().mockResolvedValue(mutationResult),
};
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(
  new CheckoutHttpApi(identity, checkout as unknown as CheckoutService, logger),
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
beforeEach(() => vi.clearAllMocks());

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer private-token',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
  });
}

describe('Phase 9B Checkout HTTP API', () => {
  it('requires BUYER authorization and exposes summary and current intent', async () => {
    let response = await request(`/api/v1/checkout/groups/${groupId}/summary`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { item: { cartGroupId: string } }).item.cartGroupId).toBe(
      groupId,
    );
    response = await request(`/api/v1/checkout/groups/${groupId}/delivery-intent`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { item: unknown }).item).toMatchObject({
      branchId,
      mode: 'PICKUP',
    });
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'private-token',
      capability: { kind: 'BUYER' },
    });
  });

  it('routes every provisional mutation with Idempotency-Key and strict bodies', async () => {
    const calls: readonly [string, RequestInit][] = [
      [
        `/api/v1/checkout/groups/${groupId}/delivery-intent`,
        { body: JSON.stringify({ branchId, mode: 'PICKUP' }), method: 'PUT' },
      ],
      [
        `/api/v1/checkout/groups/${groupId}/coupon`,
        { body: JSON.stringify({ code: 'CHECKOUT10' }), method: 'PUT' },
      ],
      [
        `/api/v1/checkout/groups/${groupId}/points`,
        { body: JSON.stringify({ points: 10 }), method: 'PUT' },
      ],
      [`/api/v1/checkout/groups/${groupId}/revalidate`, { body: '{}', method: 'POST' }],
      [`/api/v1/checkout/groups/${groupId}/delivery-intent`, { method: 'DELETE' }],
      [`/api/v1/checkout/groups/${groupId}/coupon`, { method: 'DELETE' }],
      [`/api/v1/checkout/groups/${groupId}/points`, { method: 'DELETE' }],
    ];
    for (const [path, init] of calls) {
      const response = await request(path, {
        ...init,
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      expect(response.status, `${init.method} ${path}`).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(checkout.replaceIntent).toHaveBeenCalled();
    expect(checkout.selectCoupon).toHaveBeenCalled();
    expect(checkout.selectPoints).toHaveBeenCalled();
    expect(checkout.revalidate).toHaveBeenCalled();
    expect(checkout.clearIntent).toHaveBeenCalled();
    expect(checkout.clearCoupon).toHaveBeenCalled();
    expect(checkout.clearPoints).toHaveBeenCalled();
  });

  it('rejects unauthorized checkout, missing keys and non-contract fields', async () => {
    vi.mocked(identity.authorize).mockRejectedValueOnce(
      new IdentityAccessError('SESSION_INVALID', 401, 'provider private detail'),
    );
    expect((await request(`/api/v1/checkout/groups/${groupId}/summary`)).status).toBe(401);
    expect(
      (
        await request(`/api/v1/checkout/groups/${groupId}/delivery-intent`, {
          body: JSON.stringify({ branchId, mode: 'PICKUP' }),
          method: 'PUT',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(`/api/v1/checkout/groups/${groupId}/delivery-intent`, {
          body: JSON.stringify({
            branchId,
            contactEmail: 'forbidden@example.test',
            mode: 'PICKUP',
          }),
          headers: { 'idempotency-key': 'strict-intent' },
          method: 'PUT',
        })
      ).status,
    ).toBe(422);
    for (const forbidden of [{ address: 'Domicilio no permitido' }, { shippingCostAmountClp: 0 }]) {
      const response = await request(`/api/v1/checkout/groups/${groupId}/delivery-intent`, {
        body: JSON.stringify({
          agencyDestination: 'Agencia Starken Centro',
          carrier: 'STARKEN',
          destinationCommune: 'Copiapó',
          destinationType: 'CARRIER_AGENCY',
          mode: 'SHIPPING',
          recipientName: 'Cliente',
          shippingIncludedInOrderTotal: false,
          shippingPaymentMode: 'FREIGHT_COLLECT',
          ...forbidden,
        }),
        headers: { 'idempotency-key': crypto.randomUUID() },
        method: 'PUT',
      });
      expect(response.status).toBe(422);
    }
  });

  it('maps account, coupon, delivery and ownership failures to safe public errors', async () => {
    checkout.getSummary.mockRejectedValueOnce(
      new CheckoutError('CHECKOUT_GROUP_NOT_FOUND', 'NOT_FOUND', 'private owner detail'),
    );
    let response = await request(`/api/v1/checkout/groups/${groupId}/summary`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('private owner detail');
    checkout.selectCoupon.mockRejectedValueOnce(
      new CheckoutError('COUPON_INVALID', 'CONFLICT', 'private coupon detail'),
    );
    response = await request(`/api/v1/checkout/groups/${groupId}/coupon`, {
      body: JSON.stringify({ code: 'NO' }),
      headers: { 'idempotency-key': 'invalid-coupon' },
      method: 'PUT',
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'COUPON_INVALID',
    );
  });

  it('logs only correlated safe metadata when a dependency fails', async () => {
    checkout.getSummary.mockRejectedValueOnce(
      Object.assign(new Error('SQL with secret'), { code: '08006' }),
    );
    const response = await request(`/api/v1/checkout/groups/${groupId}/summary`);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('SQL with secret');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: expect.any(String),
        error: 'DEPENDENCY_UNAVAILABLE',
      }),
      expect.any(String),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private-token');
  });
});
