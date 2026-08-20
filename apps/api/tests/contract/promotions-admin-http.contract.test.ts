import {
  createCouponSchema,
  createPromotionSchema,
  promotionPreviewSchema,
  snapshotRegistry,
} from '@sergod/contracts';
import { describe, expect, it } from 'vitest';

const id = '0198a8be-6677-7000-8000-000000000001';

function promotion() {
  return {
    activationMode: 'AUTOMATIC',
    benefit: { basisPoints: 1000, type: 'PERCENTAGE_DISCOUNT' },
    branchId: null,
    channel: 'BOTH',
    endsAt: '2026-09-01T00:00:00.000Z',
    globalLimit: null,
    minimumEligibleAmountClp: null,
    minimumEligibleQuantity: null,
    name: 'Promotion',
    perAccountLimit: null,
    priority: 1,
    schedules: [],
    scope: 'LINE',
    startsAt: '2026-08-01T00:00:00.000Z',
    targets: [
      {
        categoryId: null,
        gameId: null,
        kind: 'ALL_PRODUCTS',
        position: 1,
        productId: null,
        side: 'BENEFITED',
      },
    ],
  };
}

describe('Promotions administrative HTTP contracts', () => {
  it('exports closed structured Promotion and Coupon contracts', () => {
    expect(createPromotionSchema.parse(promotion())).toBeDefined();
    expect(
      createCouponSchema.parse({
        code: 'SAVE',
        endsAt: null,
        globalLimit: null,
        perAccountLimit: null,
        promotionId: id,
        startsAt: null,
      }),
    ).toBeDefined();
    expect(() => createPromotionSchema.parse({ ...promotion(), conditions: {} })).toThrow();
    expect(() =>
      createPromotionSchema.parse({
        ...promotion(),
        benefit: { type: 'PERCENTAGE_DISCOUNT', basisPoints: 0 },
      }),
    ).toThrow();
    expect(() =>
      createPromotionSchema.parse({
        ...promotion(),
        targets: [
          {
            categoryId: id,
            gameId: null,
            kind: 'ALL_PRODUCTS',
            position: 1,
            productId: null,
            side: 'BENEFITED',
          },
        ],
      }),
    ).toThrow();
  });

  it('requires an explicitly hypothetical, stable and side-effect-free preview input', () => {
    const parsed = promotionPreviewSchema.parse({
      accountId: null,
      branchId: id,
      channel: 'ECOMMERCE',
      coupon: null,
      couponCode: null,
      evaluatedAt: '2026-08-10T00:00:00.000Z',
      excludedLineIds: [],
      lines: [
        {
          categoryId: id,
          gameId: id,
          lineId: 'line-1',
          productId: id,
          quantity: 1,
          unitPriceClp: 1000,
        },
      ],
      orderPromotionExcluded: false,
      promotion: {
        ...promotion(),
        counters: { committed: 0, released: 0, reserved: 0 },
        createdAt: '2026-08-01T00:00:00.000Z',
        perAccountCounters: null,
        promotionId: id,
        state: 'ACTIVE',
        updatedAt: '2026-08-02T00:00:00.000Z',
      },
      timezone: 'America/Santiago',
    });
    expect(parsed).not.toHaveProperty('orderId');
    expect(parsed).not.toHaveProperty('posSaleId');
    expect(parsed).not.toHaveProperty('promotionUsageId');
  });

  it('composes the Promotions context without a commercial source', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile('apps/api/src/main.ts', 'utf8'),
    );
    expect(source).toContain('PromotionsAdminHttpApi');
    expect(source).toContain('PgPromotionsRepository');
    expect(source).not.toContain('PromotionUsage');
  });

  it('registers AppliedPromotionSnapshot.v1 as a closed versioned contract', () => {
    const value = {
      activationMode: 'AUTOMATIC',
      allocations: [{ discountAmountClp: 100, lineId: 'line-1', unitIndexes: [1] }],
      benefit: { basisPoints: 1000, type: 'PERCENTAGE_DISCOUNT' },
      benefitedUnits: ['line-1:000000000001'],
      branchId: null,
      channel: 'BOTH',
      claimedUnits: ['line-1:000000000001'],
      couponCode: null,
      couponId: null,
      endsAt: '2026-09-01T00:00:00.000Z',
      globalLimit: null,
      minimumEligibleAmountClp: null,
      minimumEligibleQuantity: null,
      perAccountLimit: null,
      priority: 1,
      promotionId: id,
      promotionVersion: '2026-08-01T00:00:00.000Z',
      qualifyingUnits: [],
      schedules: [],
      scope: 'LINE',
      snapshot_contract: 'AppliedPromotionSnapshot.v1',
      snapshot_schema_version: 1,
      startsAt: '2026-08-01T00:00:00.000Z',
      targets: [
        {
          categoryId: null,
          gameId: null,
          kind: 'ALL_PRODUCTS',
          position: 1,
          productId: null,
          side: 'BENEFITED',
        },
      ],
      totalDiscountAmountClp: 100,
    };
    expect(snapshotRegistry.validate('AppliedPromotionSnapshot.v1', value)).toEqual(value);
    expect(() =>
      snapshotRegistry.validate('AppliedPromotionSnapshot.v1', { ...value, secret: 'no' }),
    ).toThrow();
  });
});
