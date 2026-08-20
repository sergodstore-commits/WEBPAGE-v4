import type { ExecutionContext } from '@sergod/foundation';
import { describe, expect, it, vi } from 'vitest';

import type {
  CheckoutRepository,
  CheckoutSummaryView,
} from '../../src/contexts/commerce-orders/application/checkout-ports.js';
import { CheckoutService } from '../../src/contexts/commerce-orders/application/checkout-service.js';

const accountId = '0198a8be-6677-7000-8000-000000000001';
const groupId = '0198a8be-6677-7000-8000-000000000002';
const branchId = '0198a8be-6677-7000-8000-000000000003';
const context: ExecutionContext = {
  actorId: accountId,
  actorType: 'USER',
  causationId: '0198a8be-6677-7000-8000-000000000004',
  correlationId: '0198a8be-6677-7000-8000-000000000005',
  idempotencyKey: 'checkout-intent-1',
};
const summary: CheckoutSummaryView = {
  appliedPromotions: [],
  branchId,
  canCreateOrder: true,
  cartGroupId: groupId,
  checkoutVersion: 2,
  coupon: null,
  deliveryIntent: {
    branchId,
    lastValidatedAt: new Date('2026-08-13T12:00:00.000Z'),
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
  recalculatedAt: new Date('2026-08-13T12:00:00.000Z'),
  requiresExternalPayment: false,
  orderTotalWithoutShippingClp: 1000,
  shippingCostAmountClp: null,
  shippingIncludedInOrderTotal: false,
  shippingLabel: null,
  shippingPaymentMode: null,
  totalAmountClp: 0,
  validationErrorCodes: [],
};

function subject() {
  const repository: CheckoutRepository = {
    createOrder: vi.fn(async () => ({
      replayed: false,
      order: {
        expiresAt: new Date('2026-08-13T12:15:00.000Z'),
        orderId: '0198a8be-6677-7000-8000-000000000010',
        publicNumber: 'SG-2026-000001',
        requiresExternalPayment: false,
        state: 'PENDING_PAYMENT' as const,
        totalAmountClp: 0,
      },
    })),
    getSummary: vi.fn(async () => summary),
    mutate: vi.fn(async () => ({ replayed: false, summary })),
  };
  return { repository, service: new CheckoutService(repository) };
}

describe('Phase 9B checkout application service', () => {
  it('normalizes provisional delivery and creates a stable request fingerprint', async () => {
    const first = subject();
    await first.service.replaceIntent(context, accountId, groupId.toUpperCase(), {
      branchId: branchId.toUpperCase(),
      mode: 'PICKUP',
    });
    const second = subject();
    await second.service.replaceIntent(context, accountId, groupId, {
      branchId,
      mode: 'PICKUP',
    });
    const firstInput = vi.mocked(first.repository.mutate).mock.calls[0]?.[0];
    const secondInput = vi.mocked(second.repository.mutate).mock.calls[0]?.[0];
    expect(firstInput?.operation).toEqual({
      intent: { branchId, mode: 'PICKUP' },
      kind: 'REPLACE_INTENT',
    });
    expect(firstInput?.requestFingerprint).toBe(secondInput?.requestFingerprint);
  });

  it('requires Idempotency-Key for every checkout mutation before persistence', async () => {
    const { repository, service } = subject();
    const contextWithoutKey: ExecutionContext = {
      actorId: accountId,
      actorType: 'USER',
      correlationId: context.correlationId,
    };
    await expect(service.clearCoupon(contextWithoutKey, accountId, groupId)).rejects.toMatchObject({
      code: 'CHECKOUT_IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(repository.mutate).not.toHaveBeenCalled();
  });

  it('creates an idempotent Order command with a stable checkout fingerprint', async () => {
    const { repository, service } = subject();
    const result = await service.createOrder(context, accountId, groupId.toUpperCase());
    expect(result.item.publicNumber).toBe('SG-2026-000001');
    expect(result.item.expiresAt).toBe('2026-08-13T12:15:00.000Z');
    const input = vi.mocked(repository.createOrder).mock.calls[0]?.[0];
    expect(input?.cartGroupId).toBe(groupId);
    expect(input?.idempotencyKey).toBe(context.idempotencyKey);
    expect(input?.requestFingerprint).toHaveLength(64);
  });

  it('serializes provisional dates without creating a delivery snapshot', async () => {
    const { service } = subject();
    const result = await service.getSummary(accountId, groupId);
    expect(result.item.deliveryIntent?.lastValidatedAt).toBe('2026-08-13T12:00:00.000Z');
    expect(result.item.recalculatedAt).toBe('2026-08-13T12:00:00.000Z');
    expect(JSON.stringify(result)).not.toContain('DeliverySnapshot.v1');
  });
});
