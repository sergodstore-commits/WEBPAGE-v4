export type CartErrorCategory = 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class CartError extends Error {
  constructor(
    readonly code: string,
    readonly category: CartErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CartError';
  }
}

export type CartOwner =
  | { readonly accountId: string; readonly kind: 'ACCOUNT' }
  | { readonly anonymousSessionId: string; readonly kind: 'ANONYMOUS' };

export function assertPositiveCartQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new CartError('CART_QUANTITY_INVALID', 'VALIDATION', 'Cart quantity must be positive.');
  }
}

export function requiredCartIdempotencyKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new CartError(
      'CART_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'Cart mutation requires an idempotency key.',
    );
  }
  return normalized;
}
