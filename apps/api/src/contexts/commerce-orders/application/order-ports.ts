import type { OrderState } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

export interface OrderLineView {
  readonly orderLineId: string;
  readonly productId: string;
  readonly preorderCampaignId: string | null;
  readonly quantity: number;
  readonly saleType: 'PREORDER' | 'REGULAR';
  readonly sku: string;
  readonly productName: string;
  readonly unitPriceClp: number;
  readonly lineSubtotalClp: number;
  readonly language: string | null;
  readonly edition: string | null;
  readonly condition: string | null;
}

export interface OrderView {
  readonly orderId: string;
  readonly publicNumber: string;
  readonly accountId: string;
  readonly cartGroupId: string;
  readonly branchId: string;
  readonly orderType: 'PREORDER' | 'REGULAR';
  readonly state: OrderState;
  readonly deliveryMode: 'FREIGHT_COLLECT' | 'PICKUP';
  readonly deliverySnapshot: Record<string, unknown>;
  readonly merchandiseSubtotalClp: number;
  readonly promotionDiscountClp: number;
  readonly pointsDiscountClp: number;
  readonly totalAmountClp: number;
  readonly shippingIncludedInOrderTotal: false;
  readonly currency: 'CLP';
  readonly checkoutVersion: number;
  readonly requiresExternalPayment: boolean;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly OrderLineView[];
}

export interface OrderRepository {
  getForAccount(accountId: string, orderId: string): Promise<OrderView>;
  getForAdmin(orderId: string): Promise<OrderView>;
  listForAccount(input: {
    readonly accountId: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly state?: OrderState;
  }): Promise<{ readonly items: readonly OrderView[]; readonly nextCursor: string | null }>;
  listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly state?: OrderState;
  }): Promise<{ readonly items: readonly OrderView[]; readonly nextCursor: string | null }>;
  expirePending(input: {
    readonly context: ExecutionContext;
    readonly limit: number;
  }): Promise<{ readonly expired: number }>;
}
