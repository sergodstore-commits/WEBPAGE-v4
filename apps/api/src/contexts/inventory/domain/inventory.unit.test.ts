import { describe, expect, it } from 'vitest';

import { assertPositiveQuantity, inventoryProjection } from './inventory.js';

describe('Inventory domain', () => {
  it('derives available and low stock from the effective threshold without persisting either', () => {
    expect(
      inventoryProjection({ defaultThreshold: 3, onHand: 8, override: null, reserved: 5 }),
    ).toEqual({
      available: 3,
      effectiveLowStockThreshold: 3,
      lowStock: true,
      thresholdSource: 'GLOBAL',
    });
    expect(
      inventoryProjection({ defaultThreshold: 3, onHand: 1, override: 0, reserved: 1 }),
    ).toEqual({
      available: 0,
      effectiveLowStockThreshold: 0,
      lowStock: false,
      thresholdSource: 'OVERRIDE',
    });
  });

  it('rejects zero, negative, fractional and unsafe quantities', () => {
    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assertPositiveQuantity(quantity)).toThrow('positive safe integer');
    }
  });
});
