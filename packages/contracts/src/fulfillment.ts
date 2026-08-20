import { z } from 'zod';

export const fulfillmentStatusSchema = z.enum([
  'PENDING',
  'PREPARING',
  'READY_FOR_PICKUP',
  'SHIPPED',
  'FULFILLED',
]);
export const fulfillmentTransitionSchema = z
  .object({
    carrier: z.enum(['CHILEXPRESS', 'STARKEN']).optional(),
    trackingCode: z.string().trim().min(1).max(120).optional(),
    toStatus: fulfillmentStatusSchema,
  })
  .strict();

export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;
export type FulfillmentTransition = z.infer<typeof fulfillmentTransitionSchema>;
