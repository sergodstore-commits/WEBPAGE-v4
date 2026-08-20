import { z } from 'zod';

export const loyaltyConfigurationStateSchema = z.enum(['DRAFT', 'ACTIVE', 'RETIRED']);
export const loyaltyMovementTypeSchema = z.enum([
  'EARN',
  'REDEEM',
  'EARN_REVERSAL',
  'REDEEM_RESTORE',
  'ADMIN_CORRECTION',
]);

const configurationFields = {
  branchId: z.uuid(),
  earnClpPerPoint: z.number().int().positive().safe(),
  maximumRedeemBasisPoints: z.number().int().min(1).max(10_000).nullable(),
  minimumRedeemPoints: z.number().int().nonnegative().safe(),
  redeemClpPerPoint: z.number().int().positive().safe(),
} as const;

export const createLoyaltyConfigurationSchema = z.object(configurationFields).strict();
export const editLoyaltyConfigurationSchema = z
  .object({
    earnClpPerPoint: configurationFields.earnClpPerPoint,
    maximumRedeemBasisPoints: configurationFields.maximumRedeemBasisPoints,
    minimumRedeemPoints: configurationFields.minimumRedeemPoints,
    redeemClpPerPoint: configurationFields.redeemClpPerPoint,
  })
  .strict();
export const loyaltyConfigurationTransitionSchema = z
  .object({ nextState: z.literal('ACTIVE') })
  .strict();
export const loyaltyConfigurationListQuerySchema = z
  .object({
    branchId: z.uuid().optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
    state: loyaltyConfigurationStateSchema.optional(),
  })
  .strict();
export const activeLoyaltyConfigurationQuerySchema = z.object({ branchId: z.uuid() }).strict();
export const loyaltyMovementListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
  })
  .strict();
export const loyaltyAdminCorrectionSchema = z
  .object({
    pointsSigned: z
      .number()
      .int()
      .safe()
      .refine((value) => value !== 0),
    reason: z.string().trim().min(1),
  })
  .strict();

export const loyaltyConfigurationSnapshotSchema = z
  .object({
    earnClpPerPoint: configurationFields.earnClpPerPoint,
    loyaltyConfigurationId: z.uuid(),
    maximumRedeemBasisPoints: configurationFields.maximumRedeemBasisPoints,
    minimumRedeemPoints: configurationFields.minimumRedeemPoints,
    redeemClpPerPoint: configurationFields.redeemClpPerPoint,
    snapshot_contract: z.literal('LoyaltyConfigurationSnapshot.v1'),
    snapshot_schema_version: z.literal(1),
    versionNumber: z.number().int().positive().safe(),
  })
  .strict();

export type LoyaltyConfigurationState = z.infer<typeof loyaltyConfigurationStateSchema>;
export type LoyaltyMovementType = z.infer<typeof loyaltyMovementTypeSchema>;
export type CreateLoyaltyConfiguration = z.infer<typeof createLoyaltyConfigurationSchema>;
export type EditLoyaltyConfiguration = z.infer<typeof editLoyaltyConfigurationSchema>;
export type LoyaltyAdminCorrection = z.infer<typeof loyaltyAdminCorrectionSchema>;
export type LoyaltyConfigurationSnapshotV1 = z.infer<typeof loyaltyConfigurationSnapshotSchema>;

/** Source-bound intent only. Persistence requires a real Order and belongs to Phase 9. */
export interface FutureLoyaltyReservationIntent {
  readonly accountId: string;
  readonly expiresAt: string;
  readonly idempotencyKey: string;
  readonly orderId: string;
  readonly points: number;
  readonly snapshot: LoyaltyConfigurationSnapshotV1;
}
