import { z } from 'zod';
const text = z.string().trim().min(1).max(500);
const phoneE164 = z.string().regex(/^\+[1-9]\d{7,14}$/u);
const safeHttpsUrl = z.url().superRefine((value, context) => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '')
    context.addIssue({ code: 'custom', message: 'A credential-free HTTPS URL is required.' });
});
export const publicServiceInfoSchema = z
  .object({
    branchId: z.uuid(),
    publicAddress: text,
    openingHours: text,
    publicContacts: text,
    directions: text.nullish(),
    mapUrl: safeHttpsUrl.nullish(),
    reason: text.nullish(),
  })
  .strict();
export const serviceInfoTransitionSchema = z
  .object({ nextState: z.enum(['PUBLISHED', 'WITHDRAWN']), reason: text })
  .strict();
export const persistedDeliverySnapshotV1Schema = z.discriminatedUnion('mode', [
  z
    .object({
      snapshot_contract: z.literal('DeliverySnapshot.v1'),
      snapshot_schema_version: z.literal(1),
      mode: z.literal('PICKUP'),
      recipientName: text,
      contactEmail: z.email().nullable(),
      contactPhone: phoneE164.nullable(),
      capturedAt: z.iso.datetime({ offset: true }),
      branchId: z.uuid(),
      publicAddress: text,
      publicServiceInfoRevisionId: z.uuid(),
      openingHours: text,
    })
    .strict(),
  z
    .object({
      snapshot_contract: z.literal('DeliverySnapshot.v1'),
      snapshot_schema_version: z.literal(1),
      mode: z.literal('SHIPPING'),
      branchId: z.uuid(),
      recipientName: text,
      contactEmail: z.email().nullable(),
      contactPhone: phoneE164.nullable(),
      capturedAt: z.iso.datetime({ offset: true }),
      address: text,
      commune: text,
      details: text.nullish(),
      shippingZoneId: z.uuid(),
      shippingZoneName: text,
      shippingZoneVersion: z.int().positive(),
      shippingOptionId: z.uuid(),
      shippingOptionVersion: z.int().positive(),
      carrier: z.enum(['CHILEXPRESS', 'STARKEN']),
      feeAmountClp: z.int().min(0),
    })
    .strict(),
]);
const deliverySnapshotV2ContactSchema = z.object({
  snapshot_contract: z.literal('DeliverySnapshot.v2'),
  snapshot_schema_version: z.literal(2),
  recipientName: text,
  contactEmail: z.email().nullable(),
  contactPhone: phoneE164.nullable(),
  capturedAt: z.iso.datetime({ offset: true }),
});
export const deliverySnapshotV2Schema = z.discriminatedUnion('mode', [
  deliverySnapshotV2ContactSchema
    .extend({
      mode: z.literal('PICKUP'),
      branchId: z.uuid(),
      publicAddress: text,
      publicServiceInfoRevisionId: z.uuid(),
      openingHours: text,
    })
    .strict(),
  deliverySnapshotV2ContactSchema
    .extend({
      mode: z.literal('SHIPPING'),
      shippingPaymentMode: z.literal('FREIGHT_COLLECT'),
      destinationType: z.literal('CARRIER_AGENCY'),
      carrier: z.enum(['CHILEXPRESS', 'STARKEN']),
      destinationCommune: z.string().trim().min(1).max(100),
      agencyDestination: text,
      shippingCostAmountClp: z.literal(0),
      shippingIncludedInOrderTotal: z.literal(false),
      orderTotalWithoutShippingClp: z.int().min(0),
    })
    .strict(),
]);
export const deliverySnapshotSchema = deliverySnapshotV2Schema;
const deliveryContactSchema = z
  .object({
    recipientName: text,
    contactEmail: z.email().nullable(),
    contactPhone: phoneE164.nullable(),
  })
  .refine((value) => value.contactEmail !== null || value.contactPhone !== null, {
    message: 'At least one contact is required.',
  });
export const deliveryIntentSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('PICKUP'), branchId: z.uuid(), recipientName: text }).strict(),
  z
    .object({
      mode: z.literal('SHIPPING'),
      recipientName: text,
      shippingPaymentMode: z.literal('FREIGHT_COLLECT'),
      destinationType: z.literal('CARRIER_AGENCY'),
      carrier: z.enum(['CHILEXPRESS', 'STARKEN']),
      destinationCommune: z.string().trim().min(1).max(100),
      agencyDestination: text,
      shippingIncludedInOrderTotal: z.literal(false),
    })
    .strict(),
]);
export const deliverySnapshotInputSchema = z.discriminatedUnion('mode', [
  deliveryContactSchema.extend({ mode: z.literal('PICKUP'), branchId: z.uuid() }).strict(),
  deliveryContactSchema
    .extend({
      mode: z.literal('SHIPPING'),
      shippingPaymentMode: z.literal('FREIGHT_COLLECT'),
      destinationType: z.literal('CARRIER_AGENCY'),
      carrier: z.enum(['CHILEXPRESS', 'STARKEN']),
      destinationCommune: z.string().trim().min(1).max(100),
      agencyDestination: text,
      shippingIncludedInOrderTotal: z.literal(false),
    })
    .strict(),
]);
