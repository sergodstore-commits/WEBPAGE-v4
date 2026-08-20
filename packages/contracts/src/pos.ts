import { z } from 'zod';
import { deliveryIntentSchema } from './service-coverage.js';
const reason = z.string().trim().min(1).max(500);
const phoneE164 = z.string().regex(/^\+[1-9]\d{7,14}$/u);
export const createPosSaleSchema = z
  .object({
    branchId: z.uuid(),
    saleType: z.enum(['REGULAR', 'PREORDER']),
    accountId: z.uuid().optional(),
    buyerName: z.string().trim().min(1).max(200).optional(),
    buyerEmail: z.email().optional(),
    buyerPhone: phoneE164.optional(),
  })
  .strict();
export const posLineSchema = z
  .object({
    productId: z.uuid(),
    quantity: z.int().positive().max(10000),
    preorderCampaignId: z.uuid().optional(),
  })
  .strict();
export const updatePosLineSchema = z.object({ quantity: z.int().positive().max(10000) }).strict();
export const posBuyerSchema = z
  .object({
    accountId: z.uuid().nullable(),
    buyerName: z.string().trim().min(1).max(200).nullable(),
    buyerEmail: z.email().nullable(),
    buyerPhone: phoneE164.nullable(),
    delivery: deliveryIntentSchema.nullable(),
  })
  .strict();
export const posCouponSchema = z
  .object({ couponCode: z.string().trim().min(1).max(80).nullable() })
  .strict();
export const posLoyaltySchema = z.object({ points: z.int().min(0) }).strict();
export const posSettlementSchema = z
  .object({
    amountClp: z.int().positive(),
    externalMoneyMethodId: z.uuid(),
    reference: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export const posCompleteSchema = z.object({}).strict();
export const externalMoneyMethodSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/u),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable(),
    publicInstructions: z.string().trim().max(1000).nullable(),
  })
  .strict();
export const editExternalMoneyMethodSchema = externalMoneyMethodSchema.omit({ code: true });
export const moneyMethodTransitionSchema = z
  .object({ nextState: z.enum(['ACTIVE', 'INACTIVE', 'RETIRED']), reason })
  .strict();
export const posListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100),
    cursor: z.string().optional(),
    state: z
      .enum(['DRAFT', 'AWAITING_EXTERNAL_PAYMENT_CONFIRMATION', 'COMPLETED', 'DISCARDED'])
      .optional(),
  })
  .strict();
