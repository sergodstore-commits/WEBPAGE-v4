import type { OrderState } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import type { OrderRepository, OrderView } from './order-ports.js';

export class OrderService {
  constructor(private readonly repository: OrderRepository) {}

  async getForAccount(accountId: string, orderId: string) {
    return { item: serialize(await this.repository.getForAccount(accountId, orderId)) };
  }

  async getForAdmin(orderId: string) {
    return { item: serialize(await this.repository.getForAdmin(orderId)) };
  }

  async listForAccount(
    accountId: string,
    input: { readonly cursor?: string; readonly limit: number; readonly state?: OrderState },
  ) {
    const result = await this.repository.listForAccount({ accountId, ...input });
    return { ...result, items: result.items.map(serialize) };
  }

  async listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly state?: OrderState;
  }) {
    const result = await this.repository.listForAdmin(input);
    return { ...result, items: result.items.map(serialize) };
  }

  expirePending(context: ExecutionContext, limit = 100) {
    return this.repository.expirePending({ context, limit });
  }
}

function serialize(order: OrderView) {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.expiresAt?.toISOString() ?? null,
    updatedAt: order.updatedAt.toISOString(),
  };
}
