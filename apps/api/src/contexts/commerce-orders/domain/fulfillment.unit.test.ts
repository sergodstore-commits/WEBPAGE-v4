import { describe, expect, it } from 'vitest';

import { assertFulfillmentTransition } from './fulfillment.js';

describe('Fulfillment domain', () => {
  it('routes pickup through ready-for-pickup', () => {
    expect(() =>
      assertFulfillmentTransition('PICKUP', 'PREPARING', 'READY_FOR_PICKUP'),
    ).not.toThrow();
    expect(() => assertFulfillmentTransition('PICKUP', 'PREPARING', 'SHIPPED')).toThrow();
  });

  it('routes freight collect directly through shipped', () => {
    expect(() =>
      assertFulfillmentTransition('FREIGHT_COLLECT', 'PREPARING', 'SHIPPED'),
    ).not.toThrow();
    expect(() =>
      assertFulfillmentTransition('FREIGHT_COLLECT', 'PREPARING', 'READY_FOR_PICKUP'),
    ).toThrow();
  });
});
