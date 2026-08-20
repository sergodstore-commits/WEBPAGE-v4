import { createHash } from 'node:crypto';

import type {
  CheckoutCouponSelection,
  CheckoutDeliveryIntent,
  CheckoutPointsSelection,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import { normalizeCheckoutIntent, requiredCheckoutIdempotencyKey } from '../domain/checkout.js';
import type {
  CheckoutMutationOperation,
  CheckoutRepository,
  CheckoutSummaryView,
} from './checkout-ports.js';

export class CheckoutService {
  constructor(private readonly repository: CheckoutRepository) {}

  async getSummary(accountId: string, cartGroupId: string) {
    return { item: serializeSummary(await this.repository.getSummary(accountId, cartGroupId)) };
  }

  async replaceIntent(
    context: ExecutionContext,
    accountId: string,
    cartGroupId: string,
    intent: CheckoutDeliveryIntent,
  ) {
    return this.mutate(context, accountId, cartGroupId, {
      intent: normalizeCheckoutIntent(intent),
      kind: 'REPLACE_INTENT',
    });
  }

  clearIntent(context: ExecutionContext, accountId: string, cartGroupId: string) {
    return this.mutate(context, accountId, cartGroupId, { kind: 'CLEAR_INTENT' });
  }

  selectCoupon(
    context: ExecutionContext,
    accountId: string,
    cartGroupId: string,
    input: CheckoutCouponSelection,
  ) {
    return this.mutate(context, accountId, cartGroupId, {
      code: input.code,
      kind: 'SELECT_COUPON',
    });
  }

  clearCoupon(context: ExecutionContext, accountId: string, cartGroupId: string) {
    return this.mutate(context, accountId, cartGroupId, { kind: 'CLEAR_COUPON' });
  }

  selectPoints(
    context: ExecutionContext,
    accountId: string,
    cartGroupId: string,
    input: CheckoutPointsSelection,
  ) {
    return this.mutate(context, accountId, cartGroupId, {
      kind: 'SELECT_POINTS',
      points: input.points,
    });
  }

  clearPoints(context: ExecutionContext, accountId: string, cartGroupId: string) {
    return this.mutate(context, accountId, cartGroupId, { kind: 'CLEAR_POINTS' });
  }

  revalidate(context: ExecutionContext, accountId: string, cartGroupId: string) {
    return this.mutate(context, accountId, cartGroupId, { kind: 'REVALIDATE' });
  }

  private async mutate(
    context: ExecutionContext,
    accountId: string,
    cartGroupId: string,
    operation: CheckoutMutationOperation,
  ) {
    const idempotencyKey = requiredCheckoutIdempotencyKey(context.idempotencyKey);
    const normalizedGroupId = cartGroupId.toLowerCase();
    const result = await this.repository.mutate({
      accountId,
      cartGroupId: normalizedGroupId,
      context,
      idempotencyKey,
      operation,
      requestFingerprint: createHash('sha256')
        .update(JSON.stringify({ accountId, cartGroupId: normalizedGroupId, operation }))
        .digest('hex'),
    });
    return { item: serializeSummary(result.summary), replayed: result.replayed };
  }
}

function serializeSummary(summary: CheckoutSummaryView) {
  return {
    ...summary,
    deliveryIntent:
      summary.deliveryIntent === null
        ? null
        : {
            ...summary.deliveryIntent,
            lastValidatedAt: summary.deliveryIntent.lastValidatedAt?.toISOString() ?? null,
          },
    recalculatedAt: summary.recalculatedAt.toISOString(),
  };
}
