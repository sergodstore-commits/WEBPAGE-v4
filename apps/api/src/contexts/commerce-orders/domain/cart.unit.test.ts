import { describe, expect, it } from 'vitest';

import { assertPositiveCartQuantity, CartError, requiredCartIdempotencyKey } from './cart.js';

describe('Cart domain policies', () => {
  it('accepts only positive safe quantities', () => {
    expect(() => assertPositiveCartQuantity(1)).not.toThrow();
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assertPositiveCartQuantity(value)).toThrowError(
        expect.objectContaining({ code: 'CART_QUANTITY_INVALID' }),
      );
    }
  });

  it('requires a non-empty idempotency key', () => {
    expect(requiredCartIdempotencyKey(' cart-key ')).toBe('cart-key');
    expect(() => requiredCartIdempotencyKey(' ')).toThrowError(CartError);
  });
});
