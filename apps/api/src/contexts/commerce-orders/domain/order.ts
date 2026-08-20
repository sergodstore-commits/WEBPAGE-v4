import type { OrderState } from '@sergod/contracts';

export type OrderErrorCategory = 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class OrderError extends Error {
  constructor(
    readonly code: string,
    readonly category: OrderErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'OrderError';
  }
}

export function formatOrderPublicNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new OrderError('ORDER_PUBLIC_YEAR_INVALID', 'VALIDATION', 'Order year is invalid.');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new OrderError(
      'ORDER_PUBLIC_SEQUENCE_EXHAUSTED',
      'CONFLICT',
      'Order public sequence is exhausted.',
    );
  }
  return `SG-${year}-${String(sequence).padStart(6, '0')}`;
}

export function canExpireOrder(state: OrderState, expiresAt: Date | null, now: Date): boolean {
  return state === 'PENDING_PAYMENT' && expiresAt !== null && expiresAt <= now;
}
