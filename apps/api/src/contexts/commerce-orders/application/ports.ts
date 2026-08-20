import type { ExecutionContext } from '@sergod/foundation';

import type { CartOwner } from '../domain/cart.js';
import type { StoredCartDeliveryIntent } from '../domain/checkout.js';

export interface CartLineView {
  readonly cartLineId: string;
  readonly condition: string | null;
  readonly createdAt: Date;
  readonly edition: string | null;
  readonly estimatedLineTotalClp: number;
  readonly language: string | null;
  readonly preorderCampaignId: string | null;
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleType: 'PREORDER' | 'REGULAR';
  readonly sku: string;
  readonly unitPriceClp: number;
  readonly updatedAt: Date;
}

export interface CartGroupView {
  readonly cartGroupId: string;
  readonly checkoutVersion: number;
  readonly conflictReasonCodes: readonly string[];
  readonly createdAt: Date;
  readonly deliveryIntent: StoredCartDeliveryIntent | null;
  readonly groupType: 'CONFLICT' | 'PREORDER' | 'REGULAR';
  readonly lines: readonly CartLineView[];
  readonly preorderFulfillmentGroupKey: string | null;
  readonly requestedPoints: number | null;
  readonly selectedCouponId: string | null;
  readonly state: 'ACTIVE' | 'CONFLICT' | 'REMOVED';
  readonly updatedAt: Date;
}

export interface CartView {
  readonly cartId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date | null;
  readonly groups: readonly CartGroupView[];
  readonly mergedIntoCartId: string | null;
  readonly ownerKind: CartOwner['kind'];
  readonly state: 'ACTIVE' | 'EXPIRED' | 'MERGED';
  readonly updatedAt: Date;
  readonly version: number;
}

export interface CartMutationBase {
  readonly context: ExecutionContext;
  readonly idempotencyKey: string;
  readonly owner: CartOwner;
  readonly requestFingerprint: string;
}

export interface CartRepository {
  addLine(
    input: CartMutationBase & {
      readonly preorderCampaignId: string | null;
      readonly productId: string;
      readonly quantity: number;
    },
  ): Promise<{ readonly cart: CartView; readonly replayed: boolean }>;
  createCompatibleGroup(
    input: CartMutationBase & { readonly cartLineId: string },
  ): Promise<{ readonly cart: CartView; readonly replayed: boolean }>;
  ensureCart(
    input: CartMutationBase,
  ): Promise<{ readonly cart: CartView; readonly replayed: boolean }>;
  findCart(owner: CartOwner): Promise<CartView | null>;
  merge(
    input: Omit<CartMutationBase, 'owner'> & {
      readonly accountId: string;
      readonly anonymousSessionId: string;
    },
  ): Promise<{ readonly cart: CartView; readonly replayed: boolean }>;
  moveConflictLine(
    input: CartMutationBase & { readonly cartLineId: string; readonly targetGroupId: string },
  ): Promise<{ readonly cart: CartView; readonly replayed: boolean }>;
  processExpiredAnonymousCarts(
    context: ExecutionContext,
    now: Date,
  ): Promise<{ readonly expired: number; readonly scanned: number }>;
  removeLine(
    input: CartMutationBase & { readonly cartLineId: string },
  ): Promise<{ readonly cart: CartView; readonly replayed: boolean }>;
  updateLine(
    input: CartMutationBase & { readonly cartLineId: string; readonly quantity: number },
  ): Promise<{ readonly cart: CartView; readonly replayed: boolean }>;
}
