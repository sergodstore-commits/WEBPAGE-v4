import type { PaymentProvider, PaymentStatus } from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  PaymentAttemptView,
  PaymentRepository,
  VerifiedProviderResult,
} from '../application/payment-ports.js';
import { assertPaymentTransition, assertVerifiedPayment, PaymentError } from '../domain/payment.js';

export class PgPaymentRepository implements PaymentRepository {
  private readonly transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.transactions = new PgTransactionExecutor(pool);
  }

  createAttempt(input: {
    readonly accountId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly orderId: string;
    readonly provider: PaymentProvider;
    readonly requestFingerprint: string;
  }) {
    return this.transactions.execute(async (transaction) => {
      const replay = await transaction.query<AttemptRow>(
        `SELECT attempt.*,orders.public_number FROM payment_attempts attempt
         JOIN orders ON orders.order_id=attempt.order_id
         WHERE attempt.account_id=$1 AND attempt.idempotency_key=$2 FOR UPDATE`,
        [input.accountId, input.idempotencyKey],
      );
      const replayed = replay.rows[0];
      if (replayed !== undefined) {
        if (replayed.request_fingerprint !== input.requestFingerprint) {
          throw conflict('PAYMENT_IDEMPOTENCY_CONFLICT');
        }
        return { attempt: mapAttempt(replayed), replayed: true };
      }
      const order = await transaction.query<OrderPaymentRow>(
        `SELECT order_id,account_id,public_number,state,total_amount_clp,currency,
                requires_external_payment,expires_at,delivery_mode,delivery_snapshot
         FROM orders WHERE order_id=$1 AND account_id=$2 FOR UPDATE`,
        [input.orderId, input.accountId],
      );
      const row = order.rows[0];
      if (row === undefined) throw notFound('ORDER_NOT_FOUND');
      if (
        row.state !== 'PENDING_PAYMENT' ||
        !row.requires_external_payment ||
        Number(row.total_amount_clp) <= 0 ||
        (row.expires_at !== null && row.expires_at <= this.clock.now())
      ) {
        throw conflict('ORDER_NOT_PAYABLE');
      }
      const active = await transaction.query(
        `SELECT 1 FROM payment_attempts WHERE order_id=$1
          AND status IN ('CREATED','PENDING','REQUIRES_ACTION') FOR UPDATE`,
        [row.order_id],
      );
      if ((active.rowCount ?? 0) > 0) throw conflict('PAYMENT_ATTEMPT_ALREADY_ACTIVE');
      const attemptId = this.uuids.generate();
      const now = this.clock.now();
      await transaction.query(
        `INSERT INTO payment_attempts(payment_attempt_id,order_id,account_id,provider,status,
           amount_clp,currency,idempotency_key,request_fingerprint,created_at,updated_at)
         VALUES($1,$2,$3,$4,'CREATED',$5,'CLP',$6,$7,$8,$8)`,
        [
          attemptId,
          row.order_id,
          input.accountId,
          input.provider,
          row.total_amount_clp,
          input.idempotencyKey,
          input.requestFingerprint,
          now,
        ],
      );
      await this.event(transaction, {
        attemptId,
        context: input.context,
        from: null,
        reason: 'CUSTOMER_REQUESTED_PAYMENT',
        source: 'CUSTOMER',
        to: 'CREATED',
      });
      return {
        attempt: mapAttempt({
          account_id: input.accountId,
          amount_clp: row.total_amount_clp,
          authorized_at: null,
          created_at: now,
          currency: 'CLP',
          expires_at: null,
          failure_code: null,
          idempotency_key: input.idempotencyKey,
          order_id: row.order_id,
          payment_attempt_id: attemptId,
          provider: input.provider,
          provider_reference: null,
          public_number: row.public_number,
          redirect_url: null,
          request_fingerprint: input.requestFingerprint,
          status: 'CREATED',
          terminal_at: null,
          updated_at: now,
        }),
        replayed: false,
      };
    });
  }

  attachProviderSession(input: {
    readonly attemptId: string;
    readonly expiresAt: Date | null;
    readonly providerReference: string;
    readonly redirectUrl: string;
  }): Promise<PaymentAttemptView> {
    return this.transactions.execute(async (transaction) => {
      const now = this.clock.now();
      const updated = await transaction.query<AttemptRow>(
        `UPDATE payment_attempts attempt SET status='REQUIRES_ACTION',provider_reference=$2,
           redirect_url=$3,expires_at=$4,updated_at=$5,version=version+1
         FROM orders WHERE attempt.payment_attempt_id=$1 AND attempt.status='CREATED'
           AND orders.order_id=attempt.order_id RETURNING attempt.*,orders.public_number`,
        [input.attemptId, input.providerReference, input.redirectUrl, input.expiresAt, now],
      );
      const row = updated.rows[0];
      if (row === undefined) throw conflict('PAYMENT_STATE_CONFLICT');
      await this.event(transaction, {
        attemptId: input.attemptId,
        context: { actorType: 'SYSTEM', correlationId: this.uuids.generate() },
        from: 'CREATED',
        reason: 'PROVIDER_SESSION_CREATED',
        source: 'SYSTEM',
        to: 'REQUIRES_ACTION',
      });
      return mapAttempt(row);
    });
  }

  async failInitialization(attemptId: string, failureCode: string): Promise<void> {
    const now = this.clock.now();
    await this.pool.query(
      `UPDATE payment_attempts SET status='FAILED',failure_code=$2,terminal_at=$3,
         updated_at=$3,version=version+1 WHERE payment_attempt_id=$1 AND status='CREATED'`,
      [attemptId, failureCode, now],
    );
  }

  applyVerifiedResult(input: {
    readonly context: ExecutionContext;
    readonly provider: PaymentProvider;
    readonly result: VerifiedProviderResult;
  }) {
    return this.transactions.execute(async (transaction) => {
      const found = await transaction.query<AttemptRow>(
        `SELECT attempt.*,orders.public_number FROM payment_attempts attempt
         JOIN orders ON orders.order_id=attempt.order_id
         WHERE attempt.provider=$1 AND attempt.provider_reference=$2 FOR UPDATE`,
        [input.provider, input.result.providerReference],
      );
      const attempt = found.rows[0];
      if (attempt === undefined) throw notFound('PAYMENT_ATTEMPT_NOT_FOUND');
      assertVerifiedPayment({
        actualAmountClp: input.result.amountClp,
        actualCurrency: input.result.currency,
        actualOrderReference: input.result.orderReference,
        expectedAmountClp: Number(attempt.amount_clp),
        expectedOrderReference: attempt.public_number,
      });
      if (attempt.status === input.result.status) {
        return { attempt: mapAttempt(attempt), replayed: true };
      }
      assertPaymentTransition(attempt.status, input.result.status);
      const now = this.clock.now();
      const terminal = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(
        input.result.status,
      );
      const updated = await transaction.query<AttemptRow>(
        `UPDATE payment_attempts attempt SET status=$2,failure_code=$3,
           authorized_at=CASE WHEN $2='SUCCEEDED' THEN $4 ELSE authorized_at END,
           terminal_at=CASE WHEN $5 THEN $4 ELSE NULL END,updated_at=$4,version=version+1
         FROM orders WHERE attempt.payment_attempt_id=$1 AND orders.order_id=attempt.order_id
         RETURNING attempt.*,orders.public_number`,
        [
          attempt.payment_attempt_id,
          input.result.status,
          input.result.failureCode ?? null,
          now,
          terminal,
        ],
      );
      const result = updated.rows[0];
      if (result === undefined) throw conflict('PAYMENT_STATE_CONFLICT');
      await this.event(transaction, {
        attemptId: attempt.payment_attempt_id,
        context: input.context,
        from: attempt.status,
        reason: 'PROVIDER_STATUS_VERIFIED',
        source: input.provider,
        to: input.result.status,
      });
      if (input.result.status === 'SUCCEEDED' || input.result.status === 'FAILED') {
        await transaction.query(
          `INSERT INTO notification_outbox(notification_id,event_type,recipient_account_id,
             recipient_email,payload,idempotency_key,status,next_attempt_at,created_at,updated_at)
           SELECT $1,$2,account.account_id,account.current_email,$3,$4,'PENDING',$5,$5,$5
           FROM user_accounts account WHERE account.account_id=$6
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            this.uuids.generate(),
            input.result.status === 'SUCCEEDED' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
            JSON.stringify({ orderPublicNumber: attempt.public_number }),
            `payment:${attempt.payment_attempt_id}:${input.result.status}`,
            now,
            attempt.account_id,
          ],
        );
      }
      if (input.result.status === 'SUCCEEDED') {
        await this.confirmOrder(transaction, attempt.order_id, input.context, now);
      }
      return { attempt: mapAttempt(result), replayed: false };
    });
  }

  getForAccount(accountId: string, attemptId: string): Promise<PaymentAttemptView> {
    return loadAttempt(this.pool, attemptId, accountId);
  }
  getForAdmin(attemptId: string): Promise<PaymentAttemptView> {
    return loadAttempt(this.pool, attemptId);
  }
  async getProviderLookupForAdmin(attemptId: string) {
    const result = await this.pool.query<AttemptRow>(attemptSql('attempt.payment_attempt_id=$1'), [
      attemptId,
    ]);
    const row = result.rows[0];
    if (row === undefined || row.provider_reference === null) {
      throw notFound('PAYMENT_ATTEMPT_NOT_FOUND');
    }
    return { attempt: mapAttempt(row), providerReference: row.provider_reference };
  }
  async listForOrder(accountId: string, orderId: string) {
    const result = await this.pool.query<AttemptRow>(
      `${attemptSql('attempt.order_id=$1 AND attempt.account_id=$2')}
       ORDER BY attempt.created_at DESC,attempt.payment_attempt_id DESC`,
      [orderId, accountId],
    );
    return result.rows.map(mapAttempt);
  }
  async listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly orderId?: string;
    readonly provider?: PaymentProvider;
    readonly status?: PaymentStatus;
  }) {
    const values: unknown[] = [];
    const conditions: string[] = [];
    for (const [column, value] of [
      ['attempt.order_id', input.orderId],
      ['attempt.provider', input.provider],
      ['attempt.status', input.status],
    ] as const) {
      if (value !== undefined) {
        values.push(value);
        conditions.push(`${column}=$${values.length}`);
      }
    }
    if (input.cursor !== undefined) {
      values.push(input.cursor);
      conditions.push(`attempt.payment_attempt_id < $${values.length}::uuid`);
    }
    values.push(input.limit + 1);
    const result = await this.pool.query<AttemptRow>(
      `${attemptSql(conditions.length === 0 ? 'TRUE' : conditions.join(' AND '))}
       ORDER BY attempt.payment_attempt_id DESC LIMIT $${values.length}`,
      values,
    );
    const page = result.rows.slice(0, input.limit);
    return {
      items: page.map(mapAttempt),
      nextCursor:
        result.rows.length > input.limit ? (page.at(-1)?.payment_attempt_id ?? null) : null,
    };
  }

  private async confirmOrder(
    transaction: PgTransaction,
    orderId: string,
    context: ExecutionContext,
    now: Date,
  ): Promise<void> {
    const order = await transaction.query<OrderPaymentRow>(
      `SELECT order_id,account_id,public_number,state,total_amount_clp,currency,
              requires_external_payment,expires_at,delivery_mode,delivery_snapshot
       FROM orders WHERE order_id=$1 FOR UPDATE`,
      [orderId],
    );
    const row = order.rows[0];
    if (row === undefined) throw notFound('ORDER_NOT_FOUND');
    if (row.state === 'PAID') return;
    if (row.state !== 'PENDING_PAYMENT') {
      await transaction.query(
        `INSERT INTO order_state_history(order_state_history_id,order_id,from_state,to_state,reason,
           actor_id,correlation_id,occurred_at) VALUES($1,$2,$3,$3,'LATE_PAYMENT_REQUIRES_REVIEW',$4,$5,$6)`,
        [
          this.uuids.generate(),
          orderId,
          row.state,
          context.actorId ?? null,
          context.correlationId,
          now,
        ],
      );
      return;
    }
    const inventory = await transaction.query<ReservationRow>(
      `SELECT order_inventory_reservation_id reservation_id,inventory_position_id source_id,quantity
       FROM order_inventory_reservations WHERE order_id=$1 AND status='ACTIVE' FOR UPDATE`,
      [orderId],
    );
    for (const reservation of inventory.rows) {
      const consumed = await transaction.query(
        `UPDATE inventory_positions SET on_hand=on_hand-$2,reserved=reserved-$2,
           version=version+1,updated_at=$3 WHERE inventory_position_id=$1
           AND on_hand >= $2 AND reserved >= $2`,
        [reservation.source_id, reservation.quantity, now],
      );
      if (consumed.rowCount !== 1) throw infrastructure('ORDER_RESERVATION_INVARIANT_BROKEN');
      await transaction.query(
        `UPDATE order_inventory_reservations SET status='CONSUMED',consumed_at=$2
         WHERE order_inventory_reservation_id=$1`,
        [reservation.reservation_id, now],
      );
    }
    const preorders = await transaction.query<ReservationRow>(
      `SELECT order_preorder_reservation_id reservation_id,preorder_campaign_id source_id,quantity
       FROM order_preorder_reservations WHERE order_id=$1 AND status='ACTIVE' FOR UPDATE`,
      [orderId],
    );
    for (const reservation of preorders.rows) {
      const committed = await transaction.query(
        `UPDATE preorder_campaigns SET temporarily_reserved=temporarily_reserved-$2,
           committed=committed+$2,version=version+1,updated_at=$3
         WHERE preorder_campaign_id=$1 AND temporarily_reserved >= $2`,
        [reservation.source_id, reservation.quantity, now],
      );
      if (committed.rowCount !== 1) {
        throw infrastructure('ORDER_PREORDER_RESERVATION_INVARIANT_BROKEN');
      }
      await transaction.query(
        `UPDATE order_preorder_reservations SET status='COMMITTED',committed_at=$2
         WHERE order_preorder_reservation_id=$1`,
        [reservation.reservation_id, now],
      );
    }
    await transaction.query(
      `UPDATE orders SET state='PAID',paid_at=$2,expires_at=NULL,updated_at=$2,version=version+1
       WHERE order_id=$1 AND state='PENDING_PAYMENT'`,
      [orderId, now],
    );
    await transaction.query(
      `INSERT INTO order_state_history(order_state_history_id,order_id,from_state,to_state,reason,
         actor_id,correlation_id,occurred_at) VALUES($1,$2,'PENDING_PAYMENT','PAID',
         'PAYMENT_VERIFIED',$3,$4,$5)`,
      [this.uuids.generate(), orderId, context.actorId ?? null, context.correlationId, now],
    );
    const snapshot = row.delivery_snapshot;
    await transaction.query(
      `INSERT INTO order_fulfillments(fulfillment_id,order_id,method,status,recipient_name,
         recipient_phone,carrier,commune,agency,created_at,updated_at)
       VALUES($1,$2,$3,'PENDING',$4,$5,$6,$7,$8,$9,$9) ON CONFLICT(order_id) DO NOTHING`,
      [
        this.uuids.generate(),
        orderId,
        row.delivery_mode,
        text(snapshot.recipientName),
        text(snapshot.contactPhone),
        text(snapshot.carrier),
        text(snapshot.destinationCommune),
        text(snapshot.agencyDestination),
        now,
      ],
    );
  }

  private event(
    transaction: PgTransaction,
    input: {
      readonly attemptId: string;
      readonly context: ExecutionContext;
      readonly from: PaymentStatus | null;
      readonly reason: string;
      readonly source: 'ADMIN' | 'CUSTOMER' | 'FLOW' | 'SYSTEM' | 'WEBPAY';
      readonly to: PaymentStatus;
    },
  ) {
    return transaction.query(
      `INSERT INTO payment_attempt_events(payment_attempt_event_id,payment_attempt_id,from_status,
         to_status,source,reason,actor_id,correlation_id,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        this.uuids.generate(),
        input.attemptId,
        input.from,
        input.to,
        input.source,
        input.reason,
        input.context.actorId ?? null,
        input.context.correlationId,
        this.clock.now(),
      ],
    );
  }
}

async function loadAttempt(pool: Pool, attemptId: string, accountId?: string) {
  const result = await pool.query<AttemptRow>(
    attemptSql(
      accountId === undefined
        ? 'attempt.payment_attempt_id=$1'
        : 'attempt.payment_attempt_id=$1 AND attempt.account_id=$2',
    ),
    accountId === undefined ? [attemptId] : [attemptId, accountId],
  );
  const row = result.rows[0];
  if (row === undefined) throw notFound('PAYMENT_ATTEMPT_NOT_FOUND');
  return mapAttempt(row);
}

function attemptSql(where: string): string {
  return `SELECT attempt.*,orders.public_number FROM payment_attempts attempt
    JOIN orders ON orders.order_id=attempt.order_id WHERE ${where}`;
}

function mapAttempt(row: AttemptRow): PaymentAttemptView {
  return {
    accountId: row.account_id,
    amountClp: Number(row.amount_clp),
    authorizedAt: row.authorized_at,
    createdAt: row.created_at,
    currency: 'CLP',
    expiresAt: row.expires_at,
    failureCode: row.failure_code,
    orderId: row.order_id,
    orderPublicNumber: row.public_number,
    paymentAttemptId: row.payment_attempt_id,
    provider: row.provider,
    redirectUrl: row.redirect_url,
    status: row.status,
    terminalAt: row.terminal_at,
    updatedAt: row.updated_at,
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
function conflict(code: string) {
  return new PaymentError(code, 'CONFLICT', 'Payment operation conflicts with current state.');
}
function notFound(code: string) {
  return new PaymentError(code, 'NOT_FOUND', 'Payment resource was not found.');
}
function infrastructure(code: string) {
  return new PaymentError(code, 'INFRASTRUCTURE', 'Payment persistence invariant failed.');
}

interface AttemptRow extends QueryResultRow {
  readonly account_id: string;
  readonly amount_clp: number | string;
  readonly authorized_at: Date | null;
  readonly created_at: Date;
  readonly currency: 'CLP';
  readonly expires_at: Date | null;
  readonly failure_code: string | null;
  readonly idempotency_key: string;
  readonly order_id: string;
  readonly payment_attempt_id: string;
  readonly provider: PaymentProvider;
  readonly provider_reference: string | null;
  readonly public_number: string;
  readonly redirect_url: string | null;
  readonly request_fingerprint: string;
  readonly status: PaymentStatus;
  readonly terminal_at: Date | null;
  readonly updated_at: Date;
}
interface OrderPaymentRow extends QueryResultRow {
  readonly account_id: string;
  readonly currency: 'CLP';
  readonly delivery_mode: 'FREIGHT_COLLECT' | 'PICKUP';
  readonly delivery_snapshot: Record<string, unknown>;
  readonly expires_at: Date | null;
  readonly order_id: string;
  readonly public_number: string;
  readonly requires_external_payment: boolean;
  readonly state: string;
  readonly total_amount_clp: number | string;
}
interface ReservationRow extends QueryResultRow {
  readonly quantity: number | string;
  readonly reservation_id: string;
  readonly source_id: string;
}
