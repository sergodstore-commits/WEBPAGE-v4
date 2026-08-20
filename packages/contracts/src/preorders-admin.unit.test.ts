import { describe, expect, it } from 'vitest';

import {
  createPreorderCampaignSchema,
  preorderCampaignListQuerySchema,
  preorderOperationalStateSchema,
} from './preorders-admin.js';

describe('preorders admin contracts', () => {
  it('accepts the campaign contract and rejects unknown input', () => {
    const valid = {
      branchId: crypto.randomUUID(),
      capacity: 10,
      closesAt: '2026-08-11T12:00:00.000Z',
      estimatedArrivalText: 'Octubre 2026',
      fulfillmentGroupKey: null,
      opensAt: '2026-08-10T12:00:00.000Z',
      productId: crypto.randomUUID(),
    };
    expect(createPreorderCampaignSchema.parse(valid)).toEqual(valid);
    expect(() => createPreorderCampaignSchema.parse({ ...valid, unknown: true })).toThrow();
  });

  it('keeps the campaign lifecycle intentionally small', () => {
    for (const state of ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED']) {
      expect(preorderOperationalStateSchema.parse(state)).toBe(state);
    }
    for (const state of ['RECEIVING', 'FULFILLING', 'COMPLETED']) {
      expect(() => preorderOperationalStateSchema.parse(state)).toThrow();
    }
  });

  it('requires bounded pagination and closed filters', () => {
    expect(preorderCampaignListQuerySchema.parse({ limit: '100' })).toEqual({ limit: 100 });
    expect(() => preorderCampaignListQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() => preorderCampaignListQuerySchema.parse({ limit: 10, unknown: 'x' })).toThrow();
  });
});
