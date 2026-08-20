import type { AccountDeliveryPreferences } from '@sergod/contracts';
import type { Clock } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import type {
  AccountDeliveryPreferencesRepository,
  AccountDeliveryPreferencesView,
} from '../application/account-delivery-preferences-service.js';

export class PgAccountDeliveryPreferencesRepository implements AccountDeliveryPreferencesRepository {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
  ) {}

  async get(accountId: string): Promise<AccountDeliveryPreferencesView | null> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM account_delivery_preferences WHERE account_id=$1`,
      [accountId],
    );
    return result.rows[0] === undefined ? null : map(result.rows[0]);
  }

  async save(
    accountId: string,
    preferences: AccountDeliveryPreferences,
  ): Promise<AccountDeliveryPreferencesView> {
    const result = await this.pool.query<Row>(
      `INSERT INTO account_delivery_preferences(account_id,recipient_name,recipient_phone,carrier,
         destination_commune,agency_destination,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(account_id) DO UPDATE SET recipient_name=EXCLUDED.recipient_name,
         recipient_phone=EXCLUDED.recipient_phone,carrier=EXCLUDED.carrier,
         destination_commune=EXCLUDED.destination_commune,
         agency_destination=EXCLUDED.agency_destination,updated_at=EXCLUDED.updated_at,
         version=account_delivery_preferences.version+1
       RETURNING *`,
      [
        accountId,
        preferences.recipientName,
        preferences.recipientPhone,
        preferences.carrier,
        preferences.destinationCommune,
        preferences.agencyDestination,
        this.clock.now(),
      ],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error('Delivery preferences were not persisted.');
    return map(row);
  }
}

function map(row: Row): AccountDeliveryPreferencesView {
  return {
    accountId: row.account_id,
    agencyDestination: row.agency_destination,
    carrier: row.carrier,
    destinationCommune: row.destination_commune,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    updatedAt: row.updated_at,
    version: Number(row.version),
  };
}

interface Row extends QueryResultRow {
  readonly account_id: string;
  readonly agency_destination: string | null;
  readonly carrier: 'CHILEXPRESS' | 'STARKEN' | null;
  readonly destination_commune: string | null;
  readonly recipient_name: string | null;
  readonly recipient_phone: string | null;
  readonly updated_at: Date;
  readonly version: number | string;
}
