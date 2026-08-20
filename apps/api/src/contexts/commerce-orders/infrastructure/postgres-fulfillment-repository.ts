import type { FulfillmentStatus } from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type { FulfillmentRepository, FulfillmentView } from '../application/fulfillment-ports.js';
import { assertFulfillmentTransition, FulfillmentError } from '../domain/fulfillment.js';

export class PgFulfillmentRepository implements FulfillmentRepository {
  private readonly transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.transactions = new PgTransactionExecutor(pool);
  }

  getForAccount(accountId: string, orderId: string): Promise<FulfillmentView> {
    return load(this.pool, 'fulfillment.order_id=$1 AND orders.account_id=$2', [
      orderId,
      accountId,
    ]);
  }
  getForAdmin(fulfillmentId: string): Promise<FulfillmentView> {
    return load(this.pool, 'fulfillment.fulfillment_id=$1', [fulfillmentId]);
  }
  async listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly status?: FulfillmentStatus;
  }) {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (input.status !== undefined) {
      values.push(input.status);
      conditions.push(`fulfillment.status=$${values.length}`);
    }
    if (input.cursor !== undefined) {
      values.push(input.cursor);
      conditions.push(`fulfillment.fulfillment_id < $${values.length}::uuid`);
    }
    values.push(input.limit + 1);
    const result = await this.pool.query<FulfillmentRow>(
      `${sql(conditions.length === 0 ? 'TRUE' : conditions.join(' AND '))}
       ORDER BY fulfillment.fulfillment_id DESC LIMIT $${values.length}`,
      values,
    );
    const page = result.rows.slice(0, input.limit);
    return {
      items: page.map(map),
      nextCursor: result.rows.length > input.limit ? (page.at(-1)?.fulfillment_id ?? null) : null,
    };
  }
  transition(input: {
    readonly carrier?: 'CHILEXPRESS' | 'STARKEN';
    readonly context: ExecutionContext;
    readonly fulfillmentId: string;
    readonly toStatus: FulfillmentStatus;
    readonly trackingCode?: string;
  }): Promise<FulfillmentView> {
    return this.transactions.execute(async (transaction) => {
      const current = await transaction.query<FulfillmentRow>(
        `${sql('fulfillment.fulfillment_id=$1')} FOR UPDATE`,
        [input.fulfillmentId],
      );
      const row = current.rows[0];
      if (row === undefined) throw notFound();
      assertFulfillmentTransition(row.method, row.status, input.toStatus);
      if (
        input.toStatus === 'SHIPPED' &&
        (input.carrier === undefined || input.trackingCode === undefined)
      ) {
        throw new FulfillmentError(
          'FULFILLMENT_TRACKING_REQUIRED',
          'VALIDATION',
          'Carrier and tracking are required to ship.',
        );
      }
      const now = this.clock.now();
      await transaction.query(
        `UPDATE order_fulfillments SET status=$2,carrier=COALESCE($3,carrier),
           tracking_code=COALESCE($4,tracking_code),
           prepared_at=CASE WHEN $2='PREPARING' THEN $5 ELSE prepared_at END,
           ready_at=CASE WHEN $2='READY_FOR_PICKUP' THEN $5 ELSE ready_at END,
           shipped_at=CASE WHEN $2='SHIPPED' THEN $5 ELSE shipped_at END,
           fulfilled_at=CASE WHEN $2='FULFILLED' THEN $5 ELSE fulfilled_at END,
           updated_at=$5,version=version+1 WHERE fulfillment_id=$1`,
        [
          input.fulfillmentId,
          input.toStatus,
          input.carrier ?? null,
          input.trackingCode ?? null,
          now,
        ],
      );
      const orderState = input.toStatus === 'PENDING' ? 'PAID' : input.toStatus;
      await transaction.query(
        `UPDATE orders SET state=$2,updated_at=$3,version=version+1 WHERE order_id=$1`,
        [row.order_id, orderState, now],
      );
      await transaction.query(
        `INSERT INTO order_state_history(order_state_history_id,order_id,from_state,to_state,reason,
           actor_id,correlation_id,occurred_at)
         VALUES($1,$2,$3,$4,'FULFILLMENT_TRANSITION',$5,$6,$7)`,
        [
          this.uuids.generate(),
          row.order_id,
          row.status === 'PENDING' ? 'PAID' : row.status,
          orderState,
          input.context.actorId ?? null,
          input.context.correlationId,
          now,
        ],
      );
      await transaction.query(
        `INSERT INTO fulfillment_events(fulfillment_event_id,fulfillment_id,from_status,to_status,
           actor_id,correlation_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          this.uuids.generate(),
          input.fulfillmentId,
          row.status,
          input.toStatus,
          input.context.actorId ?? null,
          input.context.correlationId,
          now,
        ],
      );
      const notificationTypes: Partial<Record<FulfillmentStatus, string>> = {
        PREPARING: 'ORDER_PREPARING',
        READY_FOR_PICKUP: 'ORDER_READY_FOR_PICKUP',
        SHIPPED: 'ORDER_SHIPPED',
        FULFILLED: 'ORDER_FULFILLED',
      };
      const notificationType = notificationTypes[input.toStatus];
      if (notificationType !== undefined) {
        await transaction.query(
          `INSERT INTO notification_outbox(notification_id,event_type,recipient_account_id,
             recipient_email,payload,idempotency_key,status,next_attempt_at,created_at,updated_at)
           SELECT $1,$2,account.account_id,account.current_email,$3,$4,'PENDING',$5,$5,$5
           FROM orders JOIN user_accounts account ON account.account_id=orders.account_id
           WHERE orders.order_id=$6 ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            this.uuids.generate(),
            notificationType,
            JSON.stringify({
              orderPublicNumber: row.public_number,
              ...(input.trackingCode === undefined ? {} : { trackingCode: input.trackingCode }),
            }),
            `fulfillment:${input.fulfillmentId}:${input.toStatus}`,
            now,
            row.order_id,
          ],
        );
      }
      return load(transaction, 'fulfillment.fulfillment_id=$1', [input.fulfillmentId]);
    });
  }
}

async function load(
  queryable: Queryable,
  where: string,
  values: readonly unknown[],
): Promise<FulfillmentView> {
  const result = await queryable.query<FulfillmentRow>(sql(where), [...values]);
  const row = result.rows[0];
  if (row === undefined) throw notFound();
  return map(row);
}
interface Queryable {
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}
function sql(where: string): string {
  return `SELECT fulfillment.*,orders.public_number FROM order_fulfillments fulfillment
    JOIN orders ON orders.order_id=fulfillment.order_id WHERE ${where}`;
}
function map(row: FulfillmentRow): FulfillmentView {
  return {
    agency: row.agency,
    carrier: row.carrier,
    commune: row.commune,
    createdAt: row.created_at,
    fulfillmentId: row.fulfillment_id,
    method: row.method,
    orderId: row.order_id,
    orderPublicNumber: row.public_number,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    status: row.status,
    trackingCode: row.tracking_code,
    updatedAt: row.updated_at,
  };
}
function notFound() {
  return new FulfillmentError('FULFILLMENT_NOT_FOUND', 'NOT_FOUND', 'Fulfillment was not found.');
}
interface FulfillmentRow extends QueryResultRow {
  readonly agency: string | null;
  readonly carrier: 'CHILEXPRESS' | 'STARKEN' | null;
  readonly commune: string | null;
  readonly created_at: Date;
  readonly fulfillment_id: string;
  readonly method: 'FREIGHT_COLLECT' | 'PICKUP';
  readonly order_id: string;
  readonly public_number: string;
  readonly recipient_name: string | null;
  readonly recipient_phone: string | null;
  readonly status: FulfillmentStatus;
  readonly tracking_code: string | null;
  readonly updated_at: Date;
}
