import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PgAccountDeliveryPreferencesRepository } from './postgres-account-delivery-preferences-repository.js';

describe('Postgres Account delivery preferences repository', () => {
  it('upserts and maps the owned account row', async () => {
    const now = new Date('2026-08-20T12:00:00Z');
    const query = vi.fn().mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          account_id: 'account-1',
          agency_destination: 'Sucursal Centro',
          carrier: 'STARKEN',
          destination_commune: null,
          recipient_name: 'Buyer',
          recipient_phone: '+56911111111',
          updated_at: now,
          version: '2',
        },
      ],
    });
    const repository = new PgAccountDeliveryPreferencesRepository({ query } as unknown as Pool, {
      now: () => now,
    });

    await expect(
      repository.save('account-1', {
        agencyDestination: 'Sucursal Centro',
        carrier: 'STARKEN',
        destinationCommune: null,
        recipientName: 'Buyer',
        recipientPhone: '+56911111111',
      }),
    ).resolves.toMatchObject({ accountId: 'account-1', carrier: 'STARKEN', version: 2 });
    expect(query.mock.calls[0]?.[0]).toContain('ON CONFLICT(account_id) DO UPDATE');
  });
});
