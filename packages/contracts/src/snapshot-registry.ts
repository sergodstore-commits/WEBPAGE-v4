import { z } from 'zod';

import { ContractRegistry } from './registry.js';
import { appliedPromotionSnapshotSchema } from './promotions-admin.js';
import { loyaltyConfigurationSnapshotSchema } from './loyalty.js';
import { deliverySnapshotV2Schema, persistedDeliverySnapshotV1Schema } from './service-coverage.js';

const envelope = <Shape extends z.ZodRawShape>(contract: string, shape: Shape) =>
  z
    .object({
      snapshot_contract: z.literal(contract),
      snapshot_schema_version: z.literal(1),
      ...shape,
    })
    .strict();

export const snapshotRegistry = new ContractRegistry([
  {
    contract: 'ContentRevisionSnapshot.v1',
    maximumBytes: 256 * 1024,
    owner: 'Content',
    schema: envelope('ContentRevisionSnapshot.v1', {
      sourceType: z.literal('PUBLIC_SERVICE_INFO'),
      sourceId: z.uuid(),
      title: z.string().min(1),
      summary: z.null(),
      bodyOrDescription: z
        .object({
          publicAddress: z.string().min(1),
          openingHours: z.string().min(1),
          publicContacts: z.string().min(1),
          directions: z.string().nullable(),
          mapUrl: z.string().nullable(),
        })
        .strict(),
      slug: z.null(),
      publicByline: z.null(),
      editorialState: z.enum(['DRAFT', 'PUBLISHED', 'WITHDRAWN']),
      publicPublishedAt: z.iso.datetime({ offset: true }).nullable(),
      publicWithdrawnAt: z.iso.datetime({ offset: true }).nullable(),
      featuredOrContentPosition: z.null(),
      authorPublicId: z.null(),
      orderedResources: z.array(z.never()).length(0),
    }),
  },
  {
    contract: 'DeliverySnapshot.v1',
    maximumBytes: 32 * 1024,
    owner: 'Fulfillment',
    schema: persistedDeliverySnapshotV1Schema,
  },
  {
    contract: 'DeliverySnapshot.v2',
    maximumBytes: 32 * 1024,
    owner: 'Fulfillment',
    schema: deliverySnapshotV2Schema,
  },
  {
    contract: 'ExternalMoneyMethodSnapshot.v2',
    maximumBytes: 16 * 1024,
    owner: 'SalesPOS',
    schema: z
      .object({
        snapshot_contract: z.literal('ExternalMoneyMethodSnapshot.v2'),
        snapshot_schema_version: z.literal(2),
        code: z.string(),
        displayName: z.string(),
        description: z.string().nullable(),
        publicInstructions: z.string().nullable(),
      })
      .strict(),
  },
  {
    contract: 'LoyaltyConfigurationSnapshot.v1',
    maximumBytes: 16 * 1024,
    owner: 'Loyalty',
    schema: loyaltyConfigurationSnapshotSchema,
  },
  {
    contract: 'AppliedPromotionSnapshot.v1',
    maximumBytes: 256 * 1024,
    owner: 'Promotions',
    schema: appliedPromotionSnapshotSchema,
  },
  {
    contract: 'ProductAttributesSnapshot.v1',
    maximumBytes: 4 * 1024,
    owner: 'Catalog',
    schema: envelope('ProductAttributesSnapshot.v1', {
      condition: z.string().min(1).max(40).nullable(),
      edition: z.string().min(1).max(80).nullable(),
      language: z.string().min(2).max(35).nullable(),
    }),
  },
  {
    contract: 'SafeInboundHeaders.v1',
    maximumBytes: 4 * 1024,
    owner: 'Foundation',
    schema: envelope('SafeInboundHeaders.v1', {
      content_type: z.string().max(512).nullable(),
      provider_signature_key_id: z.string().max(512).nullable(),
      request_id: z.string().max(512).nullable(),
      user_agent_hash: z.string().max(512).nullable(),
    }),
  },
]);
