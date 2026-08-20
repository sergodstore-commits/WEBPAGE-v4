import { z } from 'zod';

export const paymentProviderSchema = z.enum(['FLOW', 'WEBPAY']);
export const paymentStatusSchema = z.enum([
  'CREATED',
  'PENDING',
  'REQUIRES_ACTION',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);
export const createPaymentAttemptSchema = z
  .object({
    payerEmail: z.email().max(254),
    provider: paymentProviderSchema,
  })
  .strict();
export const paymentListQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    orderId: z.uuid().optional(),
    provider: paymentProviderSchema.optional(),
    status: paymentStatusSchema.optional(),
  })
  .strict();

export type PaymentProvider = z.infer<typeof paymentProviderSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type CreatePaymentAttempt = z.infer<typeof createPaymentAttemptSchema>;
