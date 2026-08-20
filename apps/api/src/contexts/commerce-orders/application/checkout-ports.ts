import type {
  AppliedPromotionSnapshotV1,
  CheckoutDeliveryIntent,
  OrderState,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import type { StoredCartDeliveryIntent } from '../domain/checkout.js';

export interface CheckoutLineView {
  readonly availabilityErrorCodes: readonly string[];
  readonly available: boolean;
  readonly cartLineId: string;
  readonly condition: string | null;
  readonly edition: string | null;
  readonly language: string | null;
  readonly lineSubtotalClp: number;
  readonly preorderCampaignId: string | null;
  readonly productId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleType: 'PREORDER' | 'REGULAR';
  readonly sku: string;
  readonly unitPriceClp: number;
}

export interface CheckoutSummaryView {
  readonly appliedPromotions: readonly AppliedPromotionSnapshotV1[];
  readonly branchId: string | null;
  readonly canCreateOrder: boolean;
  readonly cartGroupId: string;
  readonly checkoutVersion: number;
  readonly coupon: null | {
    readonly couponId: string;
    readonly normalizedCode: string;
    readonly status:
      'APPLIED' | 'INVALID' | 'LIMIT_REACHED' | 'NOT_APPLIED' | 'NOT_CURRENT' | 'NOT_ELIGIBLE';
  };
  readonly deliveryIntent: StoredCartDeliveryIntent | null;
  readonly groupType: 'PREORDER' | 'REGULAR';
  readonly lines: readonly CheckoutLineView[];
  readonly loyalty: {
    readonly availablePoints: number;
    readonly configuration: null | {
      readonly branchId: string;
      readonly earnClpPerPoint: number;
      readonly loyaltyConfigurationId: string;
      readonly maximumRedeemBasisPoints: number | null;
      readonly minimumRedeemPoints: number;
      readonly redeemClpPerPoint: number;
      readonly snapshot_contract: 'LoyaltyConfigurationSnapshot.v1';
      readonly snapshot_schema_version: 1;
      readonly versionNumber: number;
    };
    readonly configured: boolean;
    readonly loyaltyEligibleAmountClp: number;
    readonly maxRedeemablePoints: number;
    readonly pointsDiscountClp: number;
    readonly pointsEarned: number;
    readonly requestedPoints: number;
    readonly validationErrorCodes: readonly string[];
  };
  readonly merchandiseSubtotalClp: number;
  readonly promotionDiscountClp: number;
  readonly recalculatedAt: Date;
  readonly requiresExternalPayment: boolean;
  readonly orderTotalWithoutShippingClp: number;
  readonly shippingCostAmountClp: 0;
  readonly shippingIncludedInOrderTotal: false;
  readonly shippingLabel: 'NO INCLUIDO — ENVÍO POR PAGAR' | null;
  readonly shippingPaymentMode: 'FREIGHT_COLLECT' | null;
  readonly totalAmountClp: number;
  readonly validationErrorCodes: readonly string[];
}

export interface CheckoutOrderCreationView {
  readonly orderId: string;
  readonly publicNumber: string;
  readonly state: OrderState;
  readonly totalAmountClp: number;
  readonly requiresExternalPayment: boolean;
  readonly expiresAt: Date | null;
}

export type CheckoutMutationOperation =
  | { readonly intent: CheckoutDeliveryIntent; readonly kind: 'REPLACE_INTENT' }
  | { readonly kind: 'CLEAR_INTENT' }
  | { readonly code: string; readonly kind: 'SELECT_COUPON' }
  | { readonly kind: 'CLEAR_COUPON' }
  | { readonly kind: 'SELECT_POINTS'; readonly points: number }
  | { readonly kind: 'CLEAR_POINTS' }
  | { readonly kind: 'REVALIDATE' };

export interface CheckoutRepository {
  getSummary(accountId: string, cartGroupId: string): Promise<CheckoutSummaryView>;
  createOrder(input: {
    readonly accountId: string;
    readonly cartGroupId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly replayed: boolean; readonly order: CheckoutOrderCreationView }>;
  mutate(input: {
    readonly accountId: string;
    readonly cartGroupId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly operation: CheckoutMutationOperation;
    readonly requestFingerprint: string;
  }): Promise<{ readonly replayed: boolean; readonly summary: CheckoutSummaryView }>;
}

export interface CheckoutDeliveryReadPort {
  validateProvisionalIntent(input: CheckoutDeliveryIntent): Promise<{
    readonly branchId: string | null;
    readonly errorCodes: readonly string[];
  }>;
}
