import type { FulfillmentStatus } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import type { FulfillmentRepository, FulfillmentView } from './fulfillment-ports.js';

export class FulfillmentService {
  constructor(private readonly repository: FulfillmentRepository) {}

  async getForAccount(accountId: string, orderId: string) {
    return { item: serialize(await this.repository.getForAccount(accountId, orderId)) };
  }
  async getForAdmin(fulfillmentId: string) {
    return { item: serialize(await this.repository.getForAdmin(fulfillmentId)) };
  }
  async listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly status?: FulfillmentStatus;
  }) {
    const result = await this.repository.listForAdmin(input);
    return { ...result, items: result.items.map(serialize) };
  }
  async transition(
    context: ExecutionContext,
    fulfillmentId: string,
    input: {
      readonly carrier?: 'CHILEXPRESS' | 'STARKEN';
      readonly toStatus: FulfillmentStatus;
      readonly trackingCode?: string;
    },
  ) {
    return {
      item: serialize(await this.repository.transition({ context, fulfillmentId, ...input })),
    };
  }
}

function serialize(view: FulfillmentView) {
  return {
    ...view,
    createdAt: view.createdAt.toISOString(),
    shippingCostAmountClp: 0,
    shippingIncludedInOrderTotal: false,
    updatedAt: view.updatedAt.toISOString(),
  };
}
