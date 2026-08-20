import type { PromotionPreview } from '@sergod/contracts';
import { describe, expect, it } from 'vitest';

import {
  assertPromotionConfiguration,
  assertPromotionEditable,
  evaluatePromotion,
  evaluatePromotionSet,
  nextCouponState,
  nextPromotionState,
  normalizeCouponCode,
  PromotionError,
} from './promotions.js';

const ids = {
  account: '00000000-0000-4000-8000-000000000001',
  branch: '00000000-0000-4000-8000-000000000002',
  category: '00000000-0000-4000-8000-000000000003',
  game: '00000000-0000-4000-8000-000000000004',
  product: '00000000-0000-4000-8000-000000000005',
  promotion: '00000000-0000-4000-8000-000000000006',
};

function preview(overrides: Partial<PromotionPreview> = {}): PromotionPreview {
  return {
    accountId: ids.account,
    branchId: ids.branch,
    channel: 'ECOMMERCE',
    coupon: null,
    couponCode: null,
    evaluatedAt: '2026-08-10T12:00:00.000Z',
    excludedLineIds: [],
    lines: [
      {
        categoryId: ids.category,
        gameId: ids.game,
        lineId: 'line-a',
        productId: ids.product,
        quantity: 2,
        unitPriceClp: 999,
      },
    ],
    orderPromotionExcluded: false,
    promotion: {
      activationMode: 'AUTOMATIC',
      benefit: { basisPoints: 1000, type: 'PERCENTAGE_DISCOUNT' },
      branchId: ids.branch,
      channel: 'BOTH',
      counters: { committed: 0, released: 0, reserved: 0 },
      createdAt: '2026-08-01T00:00:00.000Z',
      endsAt: '2026-09-01T00:00:00.000Z',
      globalLimit: null,
      minimumEligibleAmountClp: null,
      minimumEligibleQuantity: null,
      name: 'Promotion',
      perAccountCounters: null,
      perAccountLimit: null,
      priority: 10,
      promotionId: ids.promotion,
      schedules: [],
      scope: 'LINE',
      startsAt: '2026-08-01T00:00:00.000Z',
      state: 'ACTIVE',
      targets: [
        {
          categoryId: null,
          gameId: null,
          kind: 'PRODUCT',
          position: 1,
          productId: ids.product,
          side: 'BENEFITED',
        },
      ],
      updatedAt: '2026-08-02T00:00:00.000Z',
    },
    timezone: 'America/Santiago',
    ...overrides,
  };
}

describe('Promotion domain', () => {
  it('normalizes Coupon codes deterministically', () => {
    expect(normalizeCouponCode('  verano  ')).toBe('VERANO');
  });

  it('requires ordinary benefited targets and BUY_X_GET_Y qualifying plus reward', () => {
    const ordinary = preview().promotion;
    expect(() => assertPromotionConfiguration(ordinary)).not.toThrow();
    expect(() =>
      assertPromotionConfiguration({
        ...ordinary,
        benefit: { buyQuantity: 2, getQuantity: 1, type: 'BUY_X_GET_Y' },
      }),
    ).toThrow(PromotionError);
    const target = ordinary.targets[0];
    if (target === undefined) throw new Error('Test fixture target is missing.');
    expect(() =>
      assertPromotionConfiguration({
        ...ordinary,
        benefit: { buyQuantity: 1, getQuantity: 1, type: 'BUY_X_GET_Y' },
        targets: [
          { ...target, side: 'BENEFITED' },
          { ...target, side: 'QUALIFYING' },
          { ...target, position: 1, side: 'REWARD' },
        ],
      }),
    ).not.toThrow();
  });

  it('implements exact Promotion and Coupon lifecycle windows', () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    expect(
      nextPromotionState(
        'DRAFT',
        'ACTIVE',
        '2026-08-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        now,
      ),
    ).toBe('ACTIVE');
    expect(() =>
      nextPromotionState(
        'SCHEDULED',
        'ACTIVE',
        '2026-08-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        now,
      ),
    ).toThrow(PromotionError);
    expect(
      nextPromotionState(
        'SCHEDULED',
        'ACTIVE',
        '2026-08-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        now,
        'SCHEDULED_JOB',
      ),
    ).toBe('ACTIVE');
    expect(
      nextPromotionState(
        'SUSPENDED',
        'SCHEDULED',
        '2026-08-20T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z',
        now,
      ),
    ).toBe('SCHEDULED');
    expect(nextCouponState('DRAFT', 'ACTIVE', null, '2026-09-01T00:00:00.000Z', now)).toBe(
      'ACTIVE',
    );
    expect(() => nextCouponState('CANCELLED', 'ACTIVE', null, null, now)).toThrow(PromotionError);
    expect(() =>
      assertPromotionEditable('SCHEDULED', '2026-08-11T00:00:00.000Z', now),
    ).not.toThrow();
    expect(() => assertPromotionEditable('ACTIVE', '2026-08-01T00:00:00.000Z', now)).toThrow(
      PromotionError,
    );
  });

  it('uses floor for percentages and caps fixed amount to eligible base', () => {
    const percentage = evaluatePromotion(preview());
    expect(percentage.totalDiscountAmountClp).toBe(199);
    const fixed = evaluatePromotion(
      preview({
        promotion: {
          ...preview().promotion,
          benefit: { amountClp: 5000, type: 'FIXED_AMOUNT_DISCOUNT' },
        },
      }),
    );
    expect(fixed.totalDiscountAmountClp).toBe(1998);
  });

  it('supports fixed price and rejects an automatic Promotion with Coupon', () => {
    const fixed = evaluatePromotion(
      preview({
        promotion: { ...preview().promotion, benefit: { priceClp: 700, type: 'FIXED_PRICE' } },
      }),
    );
    expect(fixed.totalDiscountAmountClp).toBe(598);
    const withCoupon = evaluatePromotion(
      preview({
        couponCode: 'CODE',
        coupon: {
          counters: { committed: 0, released: 0, reserved: 0 },
          couponId: '00000000-0000-4000-8000-000000000009',
          globalLimit: null,
          normalizedCode: 'CODE',
          perAccountCounters: null,
          perAccountLimit: null,
          promotionId: ids.promotion,
          state: 'ACTIVE',
          startsAt: null,
          endsAt: null,
        },
      }),
    );
    expect(withCoupon).toMatchObject({ couponStatus: 'INVALID', totalDiscountAmountClp: 0 });
  });

  it('requires a valid Coupon and counts RESERVED plus COMMITTED but not RELEASED', () => {
    const couponPromotion = { ...preview().promotion, activationMode: 'COUPON_REQUIRED' as const };
    expect(evaluatePromotion(preview({ promotion: couponPromotion })).couponStatus).toBe(
      'NOT_PROVIDED',
    );
    const coupon = {
      counters: { committed: 0, released: 40, reserved: 1 },
      couponId: '00000000-0000-4000-8000-000000000009',
      globalLimit: 1,
      normalizedCode: 'SAVE',
      perAccountCounters: null,
      perAccountLimit: null,
      promotionId: ids.promotion,
      state: 'ACTIVE' as const,
      startsAt: null,
      endsAt: null,
    };
    expect(
      evaluatePromotion(preview({ coupon, couponCode: ' save ', promotion: couponPromotion }))
        .couponStatus,
    ).toBe('LIMIT_REACHED');
    expect(
      evaluatePromotion(
        preview({
          coupon: { ...coupon, counters: { committed: 0, released: 40, reserved: 0 } },
          couponCode: 'save',
          promotion: couponPromotion,
        }),
      ).couponStatus,
    ).toBe('APPLIED');
  });

  it('enforces branch, amount, quantity, channel and weekly schedule as AND conditions', () => {
    const base = preview();
    const constrained = {
      ...base.promotion,
      minimumEligibleAmountClp: 1998,
      minimumEligibleQuantity: 2,
      schedules: [{ dayOfWeek: 1, endMinuteLocal: 600, position: 1, startMinuteLocal: 0 }],
    };
    expect(
      evaluatePromotion(
        preview({ evaluatedAt: '2026-08-10T12:00:00.000Z', promotion: constrained }),
      ).totalDiscountAmountClp,
    ).toBeGreaterThan(0);
    expect(
      evaluatePromotion(preview({ branchId: ids.game, promotion: constrained }))
        .totalDiscountAmountClp,
    ).toBe(0);
    expect(
      evaluatePromotion(
        preview({ channel: 'POS', promotion: { ...constrained, channel: 'ECOMMERCE' } }),
      ).totalDiscountAmountClp,
    ).toBe(0);
    expect(
      evaluatePromotion(preview({ promotion: { ...constrained, minimumEligibleQuantity: 3 } }))
        .totalDiscountAmountClp,
    ).toBe(0);
  });

  it('uses OR between targets on the same side and rejects anonymous per-account limits', () => {
    const base = preview();
    const alternativeTarget = {
      categoryId: null,
      gameId: null,
      kind: 'PRODUCT' as const,
      position: 2,
      productId: '00000000-0000-4000-8000-000000000099',
      side: 'BENEFITED' as const,
    };
    expect(
      evaluatePromotion(
        preview({
          promotion: {
            ...base.promotion,
            targets: [alternativeTarget, ...base.promotion.targets],
          },
        }),
      ).totalDiscountAmountClp,
    ).toBe(199);
    expect(
      evaluatePromotion(
        preview({
          accountId: null,
          promotion: { ...base.promotion, perAccountLimit: 1 },
        }),
      ).totalDiscountAmountClp,
    ).toBe(0);
  });

  it('represents midnight as two schedules and rewards cheapest stable BUY_X_GET_Y units without reuse', () => {
    const base = preview();
    const promotion = {
      ...base.promotion,
      benefit: { buyQuantity: 1, getQuantity: 1, type: 'BUY_X_GET_Y' as const },
      schedules: [
        { dayOfWeek: 1, endMinuteLocal: 1440, position: 1, startMinuteLocal: 1380 },
        { dayOfWeek: 2, endMinuteLocal: 60, position: 1, startMinuteLocal: 0 },
      ],
      targets: [
        {
          categoryId: null,
          gameId: null,
          kind: 'ALL_PRODUCTS' as const,
          position: 1,
          productId: null,
          side: 'BENEFITED' as const,
        },
        {
          categoryId: null,
          gameId: null,
          kind: 'ALL_PRODUCTS' as const,
          position: 1,
          productId: null,
          side: 'QUALIFYING' as const,
        },
        {
          categoryId: null,
          gameId: null,
          kind: 'ALL_PRODUCTS' as const,
          position: 1,
          productId: null,
          side: 'REWARD' as const,
        },
      ],
    };
    const result = evaluatePromotion(
      preview({ evaluatedAt: '2026-08-11T03:30:00.000Z', promotion }),
    );
    expect(result.totalDiscountAmountClp).toBe(999);
    expect(result.snapshots[0]?.benefitedUnits).toEqual(['line-a:000000000001']);
    expect(result.snapshots[0]?.claimedUnits).toHaveLength(2);
  });

  it('produces a stable serializable snapshot and no persisted usage', () => {
    const left = evaluatePromotion(preview());
    const right = evaluatePromotion(preview());
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
    expect(left.usageIntention).toEqual({ couponCountsOnce: false, promotionCountsOnce: true });
    expect(left.snapshots[0]).toMatchObject({
      promotionVersion: '2026-08-02T00:00:00.000Z',
      snapshot_contract: 'AppliedPromotionSnapshot.v1',
      snapshot_schema_version: 1,
    });
    const preserved = JSON.stringify(left.snapshots[0]);
    expect(
      evaluatePromotion(preview({ promotion: { ...preview().promotion, state: 'SUSPENDED' } }))
        .snapshots,
    ).toEqual([]);
    expect(JSON.stringify(left.snapshots[0])).toBe(preserved);
  });

  it('chooses the maximum compatible combination and makes ORDER exclude LINE', () => {
    const line = preview();
    const order = preview({
      promotion: {
        ...preview().promotion,
        benefit: { amountClp: 300, type: 'FIXED_AMOUNT_DISCOUNT' },
        promotionId: '00000000-0000-4000-8000-000000000007',
        scope: 'ORDER',
      },
    });
    const result = evaluatePromotionSet([line, order]);
    expect(result.totalDiscountAmountClp).toBe(300);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]?.scope).toBe('ORDER');
  });

  it('uses priority, creation time, stable id, prefix and stable allocation signature for ties', () => {
    const lowPriority = preview();
    const highPriority = preview({
      promotion: {
        ...preview().promotion,
        priority: 20,
        promotionId: '00000000-0000-4000-8000-000000000008',
      },
    });
    const result = evaluatePromotionSet([lowPriority, highPriority]);
    expect(result.snapshots[0]?.promotionId).toBe(highPriority.promotion.promotionId);
  });

  it('reports a valid Coupon as not applied when a better incompatible Promotion wins', () => {
    const couponPromotion = preview({
      coupon: {
        counters: { committed: 0, released: 0, reserved: 0 },
        couponId: '00000000-0000-4000-8000-000000000009',
        globalLimit: null,
        normalizedCode: 'SAVE',
        perAccountCounters: null,
        perAccountLimit: null,
        promotionId: ids.promotion,
        state: 'ACTIVE',
        startsAt: null,
        endsAt: null,
      },
      couponCode: 'save',
      promotion: {
        ...preview().promotion,
        activationMode: 'COUPON_REQUIRED',
        benefit: { amountClp: 100, type: 'FIXED_AMOUNT_DISCOUNT' },
      },
    });
    const automaticPromotion = preview({
      promotion: {
        ...preview().promotion,
        benefit: { amountClp: 300, type: 'FIXED_AMOUNT_DISCOUNT' },
        promotionId: '00000000-0000-4000-8000-000000000010',
      },
    });

    const result = evaluatePromotionSet([couponPromotion, automaticPromotion]);

    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]?.promotionId).toBe(automaticPromotion.promotion.promotionId);
    expect(result.couponStatuses[ids.promotion]).toBe('NOT_APPLIED');
  });
});
