import { z } from 'zod';

const positiveQuantity = z.number().int().positive().safe();
const optionalText = z.string().trim().min(1).max(500).nullable().optional();

export const inventoryStockEntrySchema = z
  .object({ quantity: positiveQuantity, reason: optionalText, reference: optionalText })
  .strict()
  .refine((value) => value.reason != null || value.reference != null, {
    message: 'A stock entry requires a reason or reference.',
  });

export const inventoryAdjustmentSchema = z
  .object({
    direction: z.enum(['POSITIVE', 'NEGATIVE']),
    investigationReference: z.string().trim().min(1).max(255),
    quantity: positiveQuantity,
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const inventoryThresholdOverrideSchema = z
  .object({ lowStockThresholdOverride: z.number().int().nonnegative().safe().nullable() })
  .strict();

export const inventoryMovementListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
  })
  .strict();

export type InventoryStockEntry = z.infer<typeof inventoryStockEntrySchema>;
export type InventoryAdjustment = z.infer<typeof inventoryAdjustmentSchema>;
export type InventoryThresholdOverride = z.infer<typeof inventoryThresholdOverrideSchema>;
