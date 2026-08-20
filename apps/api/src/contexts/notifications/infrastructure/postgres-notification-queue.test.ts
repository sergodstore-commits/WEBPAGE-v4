import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PgNotificationQueue } from './postgres-notification-queue.js';

describe('Postgres notification outbox queue', () => {
  it('recovers expired leases and claims due jobs with row locking', async () => {
    const statements: string[] = [];
    const now = new Date('2026-08-20T12:00:00Z');
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes('SELECT notification_id FROM notification_outbox')) {
        return { rowCount: 1, rows: [{ notification_id: 'notification-1' }] };
      }
      if (sql.includes("SET status='SENDING'")) {
        return {
          rowCount: 1,
          rows: [
            {
              event_type: 'ORDER_CREATED',
              notification_id: 'notification-1',
              payload: { orderPublicNumber: 'SG-2026-1' },
              recipient_email: 'buyer@example.com',
            },
          ],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const client = { query, release: vi.fn() };
    const queue = new PgNotificationQueue(
      { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool,
      { now: () => now },
      60_000,
      4,
    );

    await expect(queue.claim(25)).resolves.toEqual([
      {
        eventType: 'ORDER_CREATED',
        notificationId: 'notification-1',
        payload: { orderPublicNumber: 'SG-2026-1' },
        recipientEmail: 'buyer@example.com',
      },
    ]);
    expect(statements.some((sql) => sql.includes('WORKER_LEASE_EXPIRED'))).toBe(true);
    expect(statements.some((sql) => sql.includes("attempt_count >= $3 THEN 'DEAD'"))).toBe(true);
    expect(statements.some((sql) => sql.includes('attempt_count < $2'))).toBe(true);
    expect(statements.some((sql) => sql.includes('FOR UPDATE SKIP LOCKED'))).toBe(true);
    expect(statements.at(-1)).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
