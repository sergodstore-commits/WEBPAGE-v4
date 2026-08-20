import { z } from 'zod';

const checkoutText = z.string().trim().min(1).max(500);

export const checkoutDeliveryIntentSchema = z.discriminatedUnion('mode', [
  z.object({ branchId: z.uuid(), mode: z.literal('PICKUP') }).strict(),
  z
    .object({
      mode: z.literal('SHIPPING'),
      recipientName: checkoutText,
      shippingPaymentMode: z.literal('FREIGHT_COLLECT'),
      destinationType: z.literal('CARRIER_AGENCY'),
      carrier: z.enum(['CHILEXPRESS', 'STARKEN']),
      destinationCommune: z.string().trim().min(1).max(100),
      agencyDestination: checkoutText,
      shippingIncludedInOrderTotal: z.literal(false),
    })
    .strict(),
]);

export const checkoutCouponSelectionSchema = z
  .object({ code: z.string().trim().min(1).max(255) })
  .strict();

export const checkoutPointsSelectionSchema = z
  .object({ points: z.number().int().positive().safe() })
  .strict();

export const checkoutEmptyMutationSchema = z.object({}).strict();

export type CheckoutDeliveryIntent = z.infer<typeof checkoutDeliveryIntentSchema>;
export type CheckoutCouponSelection = z.infer<typeof checkoutCouponSelectionSchema>;
export type CheckoutPointsSelection = z.infer<typeof checkoutPointsSelectionSchema>;
