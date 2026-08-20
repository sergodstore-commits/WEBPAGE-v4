import { describe, expect, it } from 'vitest';

import {
  assertCampaignWindow,
  assertOperationalTransition,
  assertPublicationTransition,
  campaignAvailability,
} from './preorders.js';

const opensAt = new Date('2026-08-10T12:00:00.000Z');
const closesAt = new Date('2026-08-11T12:00:00.000Z');
const inside = new Date('2026-08-10T13:00:00.000Z');

describe('preorder campaign domain', () => {
  it('enforces the campaign window and opening source', () => {
    expect(() => assertCampaignWindow(opensAt, closesAt)).not.toThrow();
    expect(() => assertCampaignWindow(closesAt, opensAt)).toThrowError(
      expect.objectContaining({ code: 'PREORDER_WINDOW_INVALID' }),
    );
    expect(() =>
      assertOperationalTransition({
        closesAt,
        current: 'DRAFT',
        next: 'OPEN',
        now: inside,
        opensAt,
        source: 'ADMIN',
      }),
    ).not.toThrow();
    expect(() =>
      assertOperationalTransition({
        closesAt,
        current: 'SCHEDULED',
        next: 'OPEN',
        now: inside,
        opensAt,
        source: 'ADMIN',
      }),
    ).toThrowError(expect.objectContaining({ code: 'PREORDER_SCHEDULED_OPEN_JOB_REQUIRED' }));
  });

  it('keeps publication independent from operational state', () => {
    expect(() =>
      assertPublicationTransition({
        current: 'DRAFT',
        next: 'PUBLISHED',
        operationalState: 'SCHEDULED',
      }),
    ).not.toThrow();
    expect(() =>
      assertPublicationTransition({
        current: 'DRAFT',
        next: 'PUBLISHED',
        operationalState: 'DRAFT',
      }),
    ).toThrowError(expect.objectContaining({ code: 'PREORDER_PUBLICATION_STATE_INVALID' }));
  });

  it('derives capacity availability from reservations and commitments only', () => {
    expect(
      campaignAvailability({
        capacity: 10,
        committed: 4,
        temporarilyReserved: 1,
      }),
    ).toEqual({ availableCapacity: 5 });
  });
});
