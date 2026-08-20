import { describe, expect, it } from 'vitest';

import {
  checkoutCouponSelectionSchema,
  checkoutDeliveryIntentSchema,
  checkoutPointsSelectionSchema,
} from './checkout.js';

describe('checkout contracts', () => {
  it('accepts only the canonical PICKUP fields', () => {
    expect(
      checkoutDeliveryIntentSchema.parse({
        branchId: '0198a8be-6677-7000-8000-000000000001',
        mode: 'PICKUP',
      }),
    ).toMatchObject({ mode: 'PICKUP' });
    expect(() =>
      checkoutDeliveryIntentSchema.parse({
        branchId: '0198a8be-6677-7000-8000-000000000001',
        contactEmail: 'not-part-of-cart-intent@example.test',
        mode: 'PICKUP',
      }),
    ).toThrow();
  });

  it('accepts only the canonical SHIPPING fields', () => {
    expect(
      checkoutDeliveryIntentSchema.parse({
        agencyDestination: 'Sucursal Chilexpress Centro, Avenida Copayapu 1234',
        carrier: 'CHILEXPRESS',
        destinationCommune: 'Copiapó',
        destinationType: 'CARRIER_AGENCY',
        mode: 'SHIPPING',
        recipientName: 'Cliente',
        shippingIncludedInOrderTotal: false,
        shippingPaymentMode: 'FREIGHT_COLLECT',
      }),
    ).toMatchObject({ carrier: 'CHILEXPRESS', mode: 'SHIPPING' });
    for (const invalid of [
      { carrier: 'UNKNOWN' },
      { address: 'Domicilio no permitido' },
      { shippingOptionId: '0198a8be-6677-7000-8000-000000000002' },
      { shippingFeeAmountClp: 0 },
      { shippingIncludedInOrderTotal: true },
    ]) {
      expect(() =>
        checkoutDeliveryIntentSchema.parse({
          agencyDestination: 'Sucursal Starken Centro',
          carrier: 'STARKEN',
          destinationCommune: 'Copiapó',
          destinationType: 'CARRIER_AGENCY',
          mode: 'SHIPPING',
          recipientName: 'Cliente',
          shippingIncludedInOrderTotal: false,
          shippingPaymentMode: 'FREIGHT_COLLECT',
          ...invalid,
        }),
      ).toThrow();
    }
  });

  it('requires an explicit coupon code and a positive points request', () => {
    expect(checkoutCouponSelectionSchema.parse({ code: ' CUPON ' })).toEqual({ code: 'CUPON' });
    expect(checkoutPointsSelectionSchema.parse({ points: 10 })).toEqual({ points: 10 });
    expect(() => checkoutPointsSelectionSchema.parse({ points: 0 })).toThrow();
  });
});
