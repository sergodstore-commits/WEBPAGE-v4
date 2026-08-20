import { describe, expect, it } from 'vitest';

import { canExpireOrder, formatOrderPublicNumber } from './order.js';

describe('Order domain', () => {
  it('formats the concurrent-safe public sequence into the CURRENT public number', () => {
    expect(formatOrderPublicNumber(2026, 1)).toBe('SG-2026-000001');
    expect(formatOrderPublicNumber(2026, 999999)).toBe('SG-2026-999999');
  });

  it('expires only pending-payment orders whose deadline elapsed', () => {
    const now = new Date('2026-08-20T04:00:00.000Z');
    expect(canExpireOrder('PENDING_PAYMENT', new Date('2026-08-20T03:59:59.000Z'), now)).toBe(true);
    expect(canExpireOrder('PENDING_PAYMENT', new Date('2026-08-20T04:00:01.000Z'), now)).toBe(false);
    expect(canExpireOrder('PAID', new Date('2026-08-20T03:59:59.000Z'), now)).toBe(false);
  });
});
