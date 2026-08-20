import type { Clock } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  NotificationEventType,
  NotificationJob,
  NotificationQueue,
} from '../application/notification-service.js';

export class PgNotificationQueue implements NotificationQueue {
  private readonly transactions: PgTransactionExecutor;

  constructor(
    pool: Pool,
    private readonly clock: Clock,
    private readonly leaseMs: number,
    private readonly maxAttempts: number,
  ) {
    this.transactions = new PgTransactionExecutor(pool);
  }

  claim(limit: number): Promise<readonly NotificationJob[]> {
    return this.transactions.execute(async (transaction) => {
      const now = this.clock.now();
      await transaction.query(
        `UPDATE notification_outbox SET status='RETRY',next_attempt_at=$1,
           last_error_code='WORKER_LEASE_EXPIRED',updated_at=$1
         WHERE status='SENDING' AND updated_at <= $2`,
        [now, new Date(now.getTime() - this.leaseMs)],
      );
      const due = await transaction.query<{ notification_id: string }>(
        `SELECT notification_id FROM notification_outbox
          WHERE status IN ('PENDING','RETRY') AND next_attempt_at <= $1
          ORDER BY next_attempt_at,notification_id FOR UPDATE SKIP LOCKED LIMIT $2`,
        [now, limit],
      );
      if (due.rows.length === 0) return [];
      const claimed = await transaction.query<Row>(
        `UPDATE notification_outbox SET status='SENDING',attempt_count=attempt_count+1,updated_at=$2
          WHERE notification_id=ANY($1::uuid[])
          RETURNING notification_id,event_type,recipient_email,payload`,
        [due.rows.map((row) => row.notification_id), now],
      );
      return claimed.rows.map((row) => ({
        eventType: row.event_type,
        notificationId: row.notification_id,
        payload: row.payload,
        recipientEmail: row.recipient_email,
      }));
    });
  }

  async markFailed(notificationId: string, errorCode: string, retryAt: Date): Promise<void> {
    await this.transactions.execute(async (transaction) => {
      const result = await transaction.query(
        `UPDATE notification_outbox
          SET status=CASE WHEN attempt_count >= $4 THEN 'DEAD' ELSE 'RETRY' END,
              next_attempt_at=CASE WHEN attempt_count >= $4 THEN next_attempt_at ELSE $3 END,
              last_error_code=$2,updated_at=$5
          WHERE notification_id=$1 AND status='SENDING'`,
        [notificationId, errorCode, retryAt, this.maxAttempts, this.clock.now()],
      );
      if (result.rowCount !== 1)
        throw new Error('Notification failure acknowledgement conflicted.');
    });
  }

  async markSent(notificationId: string): Promise<void> {
    const now = this.clock.now();
    await this.transactions.execute(async (transaction) => {
      const result = await transaction.query(
        `UPDATE notification_outbox SET status='SENT',sent_at=$2,last_error_code=NULL,updated_at=$2
          WHERE notification_id=$1 AND status='SENDING'`,
        [notificationId, now],
      );
      if (result.rowCount !== 1)
        throw new Error('Notification success acknowledgement conflicted.');
    });
  }
}

interface Row extends QueryResultRow {
  readonly event_type: NotificationEventType;
  readonly notification_id: string;
  readonly payload: Record<string, unknown>;
  readonly recipient_email: string;
}
