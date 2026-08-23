import { describe, expect, it } from 'vitest';

import { orderListQuerySchema, orderStateSchema } from './orders.js';

describe('order contracts', () => {
  it('accepts only CURRENT order states', () => {
    expect(orderStateSchema.parse('PENDING_PAYMENT')).toBe('PENDING_PAYMENT');
    expect(orderStateSchema.parse('FULFILLED')).toBe('FULFILLED');
    expect(() => orderStateSchema.parse('REFUNDED')).toThrow();
  });

  it('normalizes list limits and rejects unknown query fields', () => {
    expect(orderListQuerySchema.parse({ limit: '25' })).toEqual({ limit: 25 });
    expect(orderListQuerySchema.parse({ limit: '25', orderType: 'PREORDER' })).toEqual({
      limit: 25,
      orderType: 'PREORDER',
    });
    expect(() => orderListQuerySchema.parse({ limit: '101' })).toThrow();
    expect(() => orderListQuerySchema.parse({ orderType: 'SUBSCRIPTION' })).toThrow();
    expect(() => orderListQuerySchema.parse({ unexpected: 'x' })).toThrow();
  });
});
