import type { FulfillmentStatus } from '@sergod/contracts';

export class FulfillmentError extends Error {
  constructor(
    readonly code: string,
    readonly category: 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION',
    message: string,
  ) {
    super(message);
    this.name = 'FulfillmentError';
  }
}

export function assertFulfillmentTransition(
  method: 'FREIGHT_COLLECT' | 'PICKUP',
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): void {
  const expected: Readonly<Record<FulfillmentStatus, readonly FulfillmentStatus[]>> = {
    PENDING: ['PREPARING'],
    PREPARING: method === 'PICKUP' ? ['READY_FOR_PICKUP'] : ['SHIPPED'],
    READY_FOR_PICKUP: ['FULFILLED'],
    SHIPPED: ['FULFILLED'],
    FULFILLED: [],
  };
  if (!expected[from].includes(to)) {
    throw new FulfillmentError(
      'FULFILLMENT_STATE_CONFLICT',
      'CONFLICT',
      `Fulfillment transition ${from} -> ${to} is not allowed for ${method}.`,
    );
  }
}
