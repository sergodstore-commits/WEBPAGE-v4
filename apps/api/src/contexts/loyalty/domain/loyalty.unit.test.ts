import { describe, expect, it } from 'vitest';

import {
  assertAdminCorrection,
  assertCanCreateReservation,
  availablePoints,
  calculateEarn,
  calculateRedeem,
  cancellationLoyaltyEffects,
} from './loyalty.js';

describe('Loyalty pure policies', () => {
  it('calculates available points without assuming balance is nonnegative', () => {
    expect(availablePoints(10, 3)).toBe(7);
    expect(availablePoints(-2, 3)).toBe(-5);
  });

  it('earns by integer floor after all product discounts and excludes shipping', () => {
    expect(
      calculateEarn({
        accountLinked: true,
        earnClpPerPoint: 300,
        merchandiseSubtotalClp: 2000,
        pointsDiscountClp: 300,
        promotionDiscountClp: 400,
        shippingFeeClp: 9999,
      }),
    ).toEqual({ loyaltyEligibleAmountClp: 1300, pointsEarned: 4 });
    expect(
      calculateEarn({
        accountLinked: true,
        earnClpPerPoint: 300,
        merchandiseSubtotalClp: 1199,
        pointsDiscountClp: 0,
        promotionDiscountClp: 0,
        shippingFeeClp: 0,
      }).pointsEarned,
    ).toBe(3);
  });

  it('returns zero earned points for an anonymous operation and clamps the base to zero', () => {
    expect(
      calculateEarn({
        accountLinked: false,
        earnClpPerPoint: 100,
        merchandiseSubtotalClp: 100,
        pointsDiscountClp: 0,
        promotionDiscountClp: 0,
        shippingFeeClp: 500,
      }),
    ).toEqual({ loyaltyEligibleAmountClp: 100, pointsEarned: 0 });
  });

  it('calculates redemption maximum with basis points and integer floor', () => {
    expect(
      calculateRedeem({
        balance: 100,
        maximumRedeemBasisPoints: 2500,
        merchandiseSubtotalClp: 4100,
        minimumRedeemPoints: 2,
        promotionDiscountClp: 0,
        redeemClpPerPoint: 300,
        requestedPoints: 3,
        reservedPoints: 4,
        shippingFeeClp: 5000,
      }),
    ).toEqual({
      availablePoints: 96,
      maxRedeemablePoints: 3,
      pointsDiscountClp: 900,
      redeemBaseClp: 4100,
    });
  });

  it('supports no configured maximum and rejects minimum, debt and insufficient available points', () => {
    expect(
      calculateRedeem({
        balance: 20,
        maximumRedeemBasisPoints: null,
        merchandiseSubtotalClp: 1000,
        minimumRedeemPoints: 0,
        promotionDiscountClp: 0,
        redeemClpPerPoint: 100,
        requestedPoints: 10,
        reservedPoints: 0,
        shippingFeeClp: 1000,
      }).maxRedeemablePoints,
    ).toBe(10);
    expect(() =>
      calculateRedeem({
        balance: 10,
        maximumRedeemBasisPoints: null,
        merchandiseSubtotalClp: 1000,
        minimumRedeemPoints: 5,
        promotionDiscountClp: 0,
        redeemClpPerPoint: 100,
        requestedPoints: 2,
        reservedPoints: 0,
        shippingFeeClp: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'LOYALTY_MINIMUM_REDEEM_NOT_MET' }));
    expect(() =>
      calculateRedeem({
        balance: -1,
        maximumRedeemBasisPoints: null,
        merchandiseSubtotalClp: 1000,
        minimumRedeemPoints: 0,
        promotionDiscountClp: 0,
        redeemClpPerPoint: 100,
        requestedPoints: 1,
        reservedPoints: 0,
        shippingFeeClp: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'LOYALTY_DEBT_BLOCKS_REDEEM' }));
    expect(() =>
      calculateRedeem({
        balance: 5,
        maximumRedeemBasisPoints: null,
        merchandiseSubtotalClp: 1000,
        minimumRedeemPoints: 0,
        promotionDiscountClp: 0,
        redeemClpPerPoint: 100,
        requestedPoints: 2,
        reservedPoints: 4,
        shippingFeeClp: 0,
      }),
    ).toThrowError(expect.objectContaining({ code: 'LOYALTY_AVAILABLE_POINTS_INSUFFICIENT' }));
  });

  it('blocks new reservations in debt while preserving the validity of existing reservations', () => {
    expect(() =>
      assertCanCreateReservation({ balance: -2, points: 1, reservedPoints: 5 }),
    ).toThrowError(expect.objectContaining({ code: 'LOYALTY_DEBT_BLOCKS_RESERVATION' }));
    expect(availablePoints(-2, 5)).toBe(-7);
  });

  it('returns original effects for total cancellation', () => {
    expect(
      cancellationLoyaltyEffects({ originalPointsEarned: 8, originalPointsRedeemed: 3 }),
    ).toEqual({
      earnedPointsToReverse: 8,
      pointsToRestore: 3,
    });
  });

  it('allows correction inside balance, rejects new debt and never deepens existing debt', () => {
    expect(assertAdminCorrection(10, -10)).toBe(0);
    expect(assertAdminCorrection(-10, 4)).toBe(-6);
    expect(() => assertAdminCorrection(3, -4)).toThrowError(
      expect.objectContaining({ code: 'LOYALTY_CORRECTION_NEGATIVE_BALANCE' }),
    );
    expect(() => assertAdminCorrection(-3, -1)).toThrowError(
      expect.objectContaining({ code: 'LOYALTY_CORRECTION_DEBT_RANGE_INVALID' }),
    );
    expect(() => assertAdminCorrection(-3, 4)).toThrowError(
      expect.objectContaining({ code: 'LOYALTY_CORRECTION_DEBT_RANGE_INVALID' }),
    );
  });
});
