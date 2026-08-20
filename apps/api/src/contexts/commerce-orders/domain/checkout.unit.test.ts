import { describe, expect, it } from 'vitest';

import {
  normalizeCheckoutIntent,
  normalizeCommune,
  requiredCheckoutIdempotencyKey,
} from './checkout.js';

describe('checkout domain', () => {
  it('normalizes only editable provisional delivery fields', () => {
    expect(
      normalizeCheckoutIntent({
        agencyDestination: '  Agencia   Starken Centro ',
        carrier: 'STARKEN',
        destinationCommune: '  Copiapó ',
        destinationType: 'CARRIER_AGENCY',
        mode: 'SHIPPING',
        recipientName: '  Ana   Pérez ',
        shippingIncludedInOrderTotal: false,
        shippingPaymentMode: 'FREIGHT_COLLECT',
      }),
    ).toEqual({
      agencyDestination: 'Agencia Starken Centro',
      carrier: 'STARKEN',
      destinationCommune: 'Copiapó',
      destinationType: 'CARRIER_AGENCY',
      mode: 'SHIPPING',
      recipientName: 'Ana Pérez',
      shippingIncludedInOrderTotal: false,
      shippingPaymentMode: 'FREIGHT_COLLECT',
    });
    expect(normalizeCommune(' Ñuñoa ')).toBe('NUNOA');
  });

  it('requires a non-empty idempotency key', () => {
    expect(requiredCheckoutIdempotencyKey(' checkout-1 ')).toBe('checkout-1');
    expect(() => requiredCheckoutIdempotencyKey(' ')).toThrow();
  });
});
