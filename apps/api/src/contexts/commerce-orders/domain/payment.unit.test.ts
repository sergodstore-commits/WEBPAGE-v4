import { describe, expect, it } from 'vitest';

import {
  assertPaymentTransition,
  assertVerifiedPayment,
  normalizeFlowStatus,
  normalizeWebpayStatus,
} from './payment.js';

describe('Payments domain', () => {
  it('normalizes official provider states without trusting browser redirects', () => {
    expect(normalizeFlowStatus(2)).toBe('SUCCEEDED');
    expect(normalizeWebpayStatus('AUTHORIZED', 0)).toBe('SUCCEEDED');
    expect(() => normalizeWebpayStatus('AUTHORIZED', -1)).toThrow();
  });

  it('rejects amount, currency and order-reference manipulation', () => {
    expect(() =>
      assertVerifiedPayment({
        actualAmountClp: 999,
        actualCurrency: 'CLP',
        actualOrderReference: 'SG-2026-000001',
        expectedAmountClp: 1000,
        expectedOrderReference: 'SG-2026-000001',
      }),
    ).toThrowError(/amount/u);
  });

  it('keeps success terminal while allowing a verified late success after expiry', () => {
    expect(() => assertPaymentTransition('SUCCEEDED', 'FAILED')).toThrowError(/not allowed/u);
    expect(() => assertPaymentTransition('EXPIRED', 'SUCCEEDED')).not.toThrow();
  });
});
