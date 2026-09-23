import { z } from 'zod';

export const preorderOperationalStateSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'OPEN',
  'CLOSED',
  'CANCELLED',
]);
export const preorderPublicationStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED']);

const positiveQuantity = z.number().int().positive().safe();
const optionalText = z.string().trim().min(1).max(500).nullable();
const instant = z.iso.datetime({ offset: true });

export const createPreorderCampaignSchema = z
  .object({
    branchId: z.uuid(),
    capacity: positiveQuantity,
    closesAt: instant,
    estimatedArrivalText: z.string().trim().min(1).max(500),
    fulfillmentGroupKey: z.string().trim().min(1).max(255).nullable(),
    maxPerCustomer: positiveQuantity.nullable().optional(),
    opensAt: instant,
    productId: z.uuid(),
  })
  .strict();

export const editPreorderCampaignSchema = z
  .object({
    branchId: z.uuid(),
    capacity: positiveQuantity,
    closesAt: instant,
    estimatedArrivalText: z.string().trim().min(1).max(500),
    fulfillmentGroupKey: z.string().trim().min(1).max(255).nullable(),
    maxPerCustomer: positiveQuantity.nullable().optional(),
    opensAt: instant,
    productId: z.uuid(),
  })
  .strict();

export const preorderOperationalTransitionSchema = z
  .object({ nextState: preorderOperationalStateSchema, reason: optionalText })
  .strict();

export const preorderPublicationTransitionSchema = z
  .object({ nextStatus: z.enum(['PUBLISHED', 'UNPUBLISHED']), reason: optionalText })
  .strict();

export const preorderCampaignListQuerySchema = z
  .object({
    branchId: z.uuid().optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
    operationalState: preorderOperationalStateSchema.optional(),
    productId: z.uuid().optional(),
    publicationStatus: preorderPublicationStatusSchema.optional(),
  })
  .strict();

export type CreatePreorderCampaign = z.infer<typeof createPreorderCampaignSchema>;
export type EditPreorderCampaign = z.infer<typeof editPreorderCampaignSchema>;
export type PreorderOperationalState = z.infer<typeof preorderOperationalStateSchema>;
export type PreorderPublicationStatus = z.infer<typeof preorderPublicationStatusSchema>;
export type PreorderOperationalTransition = z.infer<typeof preorderOperationalTransitionSchema>;
export type PreorderPublicationTransition = z.infer<typeof preorderPublicationTransitionSchema>;
