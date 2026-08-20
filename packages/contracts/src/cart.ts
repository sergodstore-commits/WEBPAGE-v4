import { z } from 'zod';

const positiveQuantity = z.number().int().positive().safe();

export const cartEmptyMutationSchema = z.object({}).strict();

export const cartAddLineSchema = z
  .object({
    preorderCampaignId: z.uuid().nullable(),
    productId: z.uuid(),
    quantity: positiveQuantity,
  })
  .strict();

export const cartUpdateLineSchema = z.object({ quantity: positiveQuantity }).strict();

export const cartMoveConflictLineSchema = z.object({ targetGroupId: z.uuid() }).strict();

export const cartCreateCompatibleGroupSchema = z.object({}).strict();

export type CartAddLine = z.infer<typeof cartAddLineSchema>;
export type CartUpdateLine = z.infer<typeof cartUpdateLineSchema>;
export type CartMoveConflictLine = z.infer<typeof cartMoveConflictLineSchema>;
