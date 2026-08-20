import { z } from 'zod';

export const orderStateSchema = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'PREPARING',
  'READY_FOR_PICKUP',
  'SHIPPED',
  'FULFILLED',
  'CANCELLED',
]);

export const orderListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.uuid().optional(),
    state: orderStateSchema.optional(),
  })
  .strict();

export type OrderState = z.infer<typeof orderStateSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
