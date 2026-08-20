import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PgFulfillmentRepository } from './postgres-fulfillment-repository.js';

const fulfillmentId = '0198a8be-6677-7000-8000-000000000010';
const orderId = '0198a8be-6677-7000-8000-000000000011';
const now = new Date('2026-08-20T12:00:00Z');
const row = {
  agency: null,
  carrier: null,
  commune: null,
  created_at: now,
  fulfillment_id: fulfillmentId,
  method: 'PICKUP',
  order_id: orderId,
  public_number: 'SG-2026-1',
  recipient_name: 'Buyer',
  recipient_phone: '+56911111111',
  status: 'PENDING',
  tracking_code: null,
  updated_at: now,
};

describe('Postgres Fulfillment repository', () => {
  it('writes Order history and fulfillment events in the same transition', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes('SELECT fulfillment.*')) return { rowCount: 1, rows: [row] };
      return { rowCount: 1, rows: [] };
    });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    let id = 0;
    const repository = new PgFulfillmentRepository(
      pool,
      { now: () => now },
      { generate: () => `event-${++id}` },
    );

    await repository.transition({
      context: { actorId: 'admin-1', actorType: 'USER', correlationId: 'correlation-1' },
      fulfillmentId,
      toStatus: 'PREPARING',
    });

    expect(statements.some((sql) => sql.includes('INSERT INTO order_state_history'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO fulfillment_events'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO notification_outbox'))).toBe(true);
    expect(statements.at(0)).toBe('BEGIN');
    expect(statements.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
