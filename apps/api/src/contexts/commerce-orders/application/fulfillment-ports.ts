import type { FulfillmentStatus } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

export interface FulfillmentView {
  readonly fulfillmentId: string;
  readonly orderId: string;
  readonly orderPublicNumber: string;
  readonly method: 'FREIGHT_COLLECT' | 'PICKUP';
  readonly status: FulfillmentStatus;
  readonly recipientName: string | null;
  readonly recipientPhone: string | null;
  readonly carrier: 'CHILEXPRESS' | 'STARKEN' | null;
  readonly commune: string | null;
  readonly agency: string | null;
  readonly trackingCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FulfillmentRepository {
  getForAccount(accountId: string, orderId: string): Promise<FulfillmentView>;
  getForAdmin(fulfillmentId: string): Promise<FulfillmentView>;
  listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly status?: FulfillmentStatus;
  }): Promise<{ readonly items: readonly FulfillmentView[]; readonly nextCursor: string | null }>;
  transition(input: {
    readonly carrier?: 'CHILEXPRESS' | 'STARKEN';
    readonly context: ExecutionContext;
    readonly fulfillmentId: string;
    readonly toStatus: FulfillmentStatus;
    readonly trackingCode?: string;
  }): Promise<FulfillmentView>;
}
