import { z } from 'zod';

export const promotionStateSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'CANCELLED',
]);
export const couponStateSchema = z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED']);
export const promotionActivationModeSchema = z.enum(['AUTOMATIC', 'COUPON_REQUIRED']);
export const promotionScopeSchema = z.enum(['LINE', 'ORDER']);
export const promotionChannelSchema = z.enum(['POS', 'ECOMMERCE', 'BOTH']);
export const promotionTargetSideSchema = z.enum(['BENEFITED', 'QUALIFYING', 'REWARD']);
export const promotionTargetKindSchema = z.enum([
  'ALL_PRODUCTS',
  'PRODUCT',
  'CATEGORY',
  'TCG_GAME',
]);

const nullablePositiveInteger = z.number().int().positive().safe().nullable();
const optionalInstant = z.iso.datetime({ offset: true }).nullable();

export const promotionBenefitSchema = z.discriminatedUnion('type', [
  z
    .object({
      basisPoints: z.number().int().min(1).max(10_000),
      type: z.literal('PERCENTAGE_DISCOUNT'),
    })
    .strict(),
  z
    .object({
      amountClp: z.number().int().positive().safe(),
      type: z.literal('FIXED_AMOUNT_DISCOUNT'),
    })
    .strict(),
  z
    .object({ priceClp: z.number().int().nonnegative().safe(), type: z.literal('FIXED_PRICE') })
    .strict(),
  z
    .object({
      buyQuantity: z.number().int().positive().safe(),
      getQuantity: z.number().int().positive().safe(),
      type: z.literal('BUY_X_GET_Y'),
    })
    .strict(),
]);

export const promotionTargetSchema = z
  .object({
    categoryId: z.uuid().nullable(),
    gameId: z.uuid().nullable(),
    kind: promotionTargetKindSchema,
    position: z.number().int().positive().safe(),
    productId: z.uuid().nullable(),
    side: promotionTargetSideSchema,
  })
  .strict()
  .superRefine((target, context) => {
    const references = [target.productId, target.categoryId, target.gameId].filter(
      (value) => value !== null,
    );
    const valid =
      (target.kind === 'ALL_PRODUCTS' && references.length === 0) ||
      (target.kind === 'PRODUCT' && target.productId !== null && references.length === 1) ||
      (target.kind === 'CATEGORY' && target.categoryId !== null && references.length === 1) ||
      (target.kind === 'TCG_GAME' && target.gameId !== null && references.length === 1);
    if (!valid)
      context.addIssue({ code: 'custom', message: 'Target reference does not match its kind.' });
  });

export const promotionWeeklyScheduleSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    endMinuteLocal: z.number().int().min(1).max(1440),
    position: z.number().int().positive().safe(),
    startMinuteLocal: z.number().int().min(0).max(1439),
  })
  .strict()
  .refine((value) => value.startMinuteLocal < value.endMinuteLocal, {
    message: 'Schedule start must be before end.',
  });

export const promotionConfigurationSchema = z
  .object({
    activationMode: promotionActivationModeSchema,
    benefit: promotionBenefitSchema,
    branchId: z.uuid().nullable(),
    channel: promotionChannelSchema,
    endsAt: z.iso.datetime({ offset: true }),
    globalLimit: nullablePositiveInteger,
    minimumEligibleAmountClp: nullablePositiveInteger,
    minimumEligibleQuantity: nullablePositiveInteger,
    name: z.string().trim().min(1).max(255),
    perAccountLimit: nullablePositiveInteger,
    priority: z.number().int().safe(),
    schedules: z.array(promotionWeeklyScheduleSchema).max(10_000),
    scope: promotionScopeSchema,
    startsAt: z.iso.datetime({ offset: true }),
    targets: z.array(promotionTargetSchema).min(1).max(10_000),
  })
  .strict();

export const createPromotionSchema = promotionConfigurationSchema;
export const editPromotionSchema = promotionConfigurationSchema;
export const promotionTransitionSchema = z.object({ nextState: promotionStateSchema }).strict();
export const promotionListQuerySchema = z
  .object({
    activationMode: promotionActivationModeSchema.optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
    state: promotionStateSchema.optional(),
  })
  .strict();

export const createCouponSchema = z
  .object({
    code: z.string().min(1).max(255),
    endsAt: optionalInstant,
    globalLimit: nullablePositiveInteger,
    perAccountLimit: nullablePositiveInteger,
    promotionId: z.uuid(),
    startsAt: optionalInstant,
  })
  .strict();
export const couponTransitionSchema = z.object({ nextState: couponStateSchema }).strict();
export const couponListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
    promotionId: z.uuid().optional(),
    state: couponStateSchema.optional(),
  })
  .strict();

export const evaluationLineSchema = z
  .object({
    categoryId: z.uuid(),
    gameId: z.uuid(),
    lineId: z.string().min(1).max(255),
    productId: z.uuid(),
    quantity: z.number().int().positive().safe(),
    unitPriceClp: z.number().int().nonnegative().safe(),
  })
  .strict();
export const usageCounterSchema = z
  .object({
    committed: z.number().int().nonnegative().safe(),
    released: z.number().int().nonnegative().safe(),
    reserved: z.number().int().nonnegative().safe(),
  })
  .strict();
export const promotionPreviewSchema = z
  .object({
    accountId: z.uuid().nullable(),
    branchId: z.uuid(),
    channel: z.enum(['POS', 'ECOMMERCE']),
    coupon: z
      .object({
        counters: usageCounterSchema,
        couponId: z.uuid(),
        globalLimit: nullablePositiveInteger,
        normalizedCode: z.string().min(1).max(255),
        perAccountCounters: usageCounterSchema.nullable(),
        perAccountLimit: nullablePositiveInteger,
        promotionId: z.uuid(),
        state: couponStateSchema,
        startsAt: optionalInstant,
        endsAt: optionalInstant,
      })
      .strict()
      .nullable(),
    couponCode: z.string().min(1).max(255).nullable(),
    evaluatedAt: z.iso.datetime({ offset: true }),
    excludedLineIds: z.array(z.string().min(1).max(255)),
    lines: z.array(evaluationLineSchema).min(1).max(10_000),
    orderPromotionExcluded: z.boolean(),
    promotion: promotionConfigurationSchema.extend({
      createdAt: z.iso.datetime({ offset: true }),
      counters: usageCounterSchema,
      perAccountCounters: usageCounterSchema.nullable(),
      promotionId: z.uuid(),
      state: promotionStateSchema,
      updatedAt: z.iso.datetime({ offset: true }),
    }),
    timezone: z.string().min(1).max(255),
  })
  .strict();

export type PromotionState = z.infer<typeof promotionStateSchema>;
export type CouponState = z.infer<typeof couponStateSchema>;
export type PromotionConfiguration = z.infer<typeof promotionConfigurationSchema>;
export type CreatePromotion = z.infer<typeof createPromotionSchema>;
export type EditPromotion = z.infer<typeof editPromotionSchema>;
export type PromotionTransition = z.infer<typeof promotionTransitionSchema>;
export type CreateCoupon = z.infer<typeof createCouponSchema>;
export type CouponTransition = z.infer<typeof couponTransitionSchema>;
export type PromotionPreview = z.infer<typeof promotionPreviewSchema>;

export interface AppliedPromotionSnapshotV1 {
  readonly activationMode: z.infer<typeof promotionActivationModeSchema>;
  readonly allocations: readonly {
    readonly discountAmountClp: number;
    readonly lineId: string;
    readonly unitIndexes: readonly number[];
  }[];
  readonly benefit: z.infer<typeof promotionBenefitSchema>;
  readonly benefitedUnits: readonly string[];
  readonly branchId: string | null;
  readonly channel: z.infer<typeof promotionChannelSchema>;
  readonly claimedUnits: readonly string[];
  readonly couponCode: string | null;
  readonly couponId: string | null;
  readonly endsAt: string;
  readonly globalLimit: number | null;
  readonly minimumEligibleAmountClp: number | null;
  readonly minimumEligibleQuantity: number | null;
  readonly perAccountLimit: number | null;
  readonly priority: number;
  readonly promotionId: string;
  readonly promotionVersion: string;
  readonly qualifyingUnits: readonly string[];
  readonly schedules: readonly z.infer<typeof promotionWeeklyScheduleSchema>[];
  readonly snapshot_contract: 'AppliedPromotionSnapshot.v1';
  readonly snapshot_schema_version: 1;
  readonly scope: z.infer<typeof promotionScopeSchema>;
  readonly startsAt: string;
  readonly targets: readonly z.infer<typeof promotionTargetSchema>[];
  readonly totalDiscountAmountClp: number;
}

export const appliedPromotionSnapshotSchema = z
  .object({
    activationMode: promotionActivationModeSchema,
    allocations: z.array(
      z
        .object({
          discountAmountClp: z.number().int().nonnegative().safe(),
          lineId: z.string().min(1).max(255),
          unitIndexes: z.array(z.number().int().positive().safe()),
        })
        .strict(),
    ),
    benefit: promotionBenefitSchema,
    benefitedUnits: z.array(z.string().min(1).max(512)),
    branchId: z.uuid().nullable(),
    channel: promotionChannelSchema,
    claimedUnits: z.array(z.string().min(1).max(512)),
    couponCode: z.string().min(1).max(255).nullable(),
    couponId: z.uuid().nullable(),
    endsAt: z.iso.datetime({ offset: true }),
    globalLimit: nullablePositiveInteger,
    minimumEligibleAmountClp: nullablePositiveInteger,
    minimumEligibleQuantity: nullablePositiveInteger,
    perAccountLimit: nullablePositiveInteger,
    priority: z.number().int().safe(),
    promotionId: z.uuid(),
    promotionVersion: z.iso.datetime({ offset: true }),
    qualifyingUnits: z.array(z.string().min(1).max(512)),
    schedules: z.array(promotionWeeklyScheduleSchema),
    scope: promotionScopeSchema,
    snapshot_contract: z.literal('AppliedPromotionSnapshot.v1'),
    snapshot_schema_version: z.literal(1),
    startsAt: z.iso.datetime({ offset: true }),
    targets: z.array(promotionTargetSchema),
    totalDiscountAmountClp: z.number().int().nonnegative().safe(),
  })
  .strict();

export interface FuturePromotionUsageIntent {
  readonly couponCountsOnce: boolean;
  readonly expiresAt: string;
  readonly idempotencyKey: string;
  readonly promotionCountsOnce: true;
  readonly snapshot: AppliedPromotionSnapshotV1;
  readonly sourceId: string;
  readonly sourceType: 'ORDER' | 'POS_SALE';
  readonly state: 'RESERVED' | 'COMMITTED' | 'RELEASED';
}
