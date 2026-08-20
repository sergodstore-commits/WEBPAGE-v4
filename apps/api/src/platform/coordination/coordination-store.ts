import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import type {
  Clock,
  ExecutionContext,
  TechnicalActionAuthorizer,
  UuidGenerator,
} from '@sergod/foundation';
import {
  metadataRegistry,
  type InfrastructureErrorCode,
  type PayloadRegistry,
} from '@sergod/contracts';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../persistence/postgres.js';

interface IdempotencyRow extends QueryResultRow {
  attempts: number;
  fingerprint: string;
  idempotency_record_id: string;
  lease_expires_at: Date | null;
  result_reference: string | null;
  status: 'COMPLETED' | 'FAILED_FINAL' | 'FAILED_RETRYABLE' | 'PROCESSING';
}

export type IdempotencyAcquisition =
  | { readonly kind: 'ACQUIRED'; readonly attempts: number; readonly recordId: string }
  | { readonly kind: 'COMPLETED'; readonly resultReference: string | null }
  | { readonly kind: 'CONFLICT' | 'FAILED_FINAL' | 'IN_PROGRESS' };

export interface OutboxClaim extends QueryResultRow {
  readonly attempts: number;
  readonly event_id: string;
  readonly event_schema_version: number;
  readonly event_type: string;
  readonly payload: unknown;
  readonly payload_contract: string;
}

export interface InboxClaim extends QueryResultRow {
  readonly attempts: number;
  readonly encrypted_payload: Buffer;
  readonly inbox_id: string;
  readonly message_type: string;
  readonly payload_contract: string;
}

export type JobAcquisition =
  | { readonly kind: 'ACQUIRED'; readonly attempts: number; readonly runId: string }
  | { readonly kind: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' };

export type ReactivatableRecordKind = 'IDEMPOTENCY' | 'INBOX' | 'OUTBOX' | 'SCHEDULED_JOB';

export class CoordinationStore {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
    private readonly outboxPayloads: PayloadRegistry,
    private readonly inboxPayloads: PayloadRegistry,
    private readonly inboxEncryptionKey: Buffer,
  ) {
    if (inboxEncryptionKey.byteLength !== 32) {
      throw new RangeError('Inbox encryption requires a 32-byte key.');
    }
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async acquireIdempotency(input: {
    readonly fingerprint: string;
    readonly key: string;
    readonly leaseMs: number;
    readonly scope: string;
  }): Promise<IdempotencyAcquisition> {
    return this.#transactions.execute(async (transaction) => {
      const now = this.clock.now();
      const lease = new Date(now.getTime() + input.leaseMs);
      const inserted = await transaction.query(
        `INSERT INTO idempotency_records (
           idempotency_record_id, scope, idempotency_key, fingerprint, status, attempts,
           processing_started_at, lease_expires_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'PROCESSING', 1, $5, $6, $5, $5)
         ON CONFLICT (scope, idempotency_key) DO NOTHING`,
        [this.uuids.generate(), input.scope, input.key, input.fingerprint, now, lease],
      );
      const result = await transaction.query<IdempotencyRow>(
        `SELECT *
           FROM idempotency_records
          WHERE scope = $1 AND idempotency_key = $2
          FOR UPDATE`,
        [input.scope, input.key],
      );
      const row = requiredRow(result.rows[0]);
      if (row.fingerprint !== input.fingerprint) {
        return { kind: 'CONFLICT' };
      }
      if (row.status === 'COMPLETED') {
        return { kind: 'COMPLETED', resultReference: row.result_reference };
      }
      if (row.status === 'FAILED_FINAL') {
        return { kind: 'FAILED_FINAL' };
      }
      if (inserted.rowCount === 1) {
        return { attempts: row.attempts, kind: 'ACQUIRED', recordId: row.idempotency_record_id };
      }
      if (
        row.status === 'PROCESSING' &&
        row.lease_expires_at !== null &&
        row.lease_expires_at.getTime() > now.getTime()
      ) {
        return { kind: 'IN_PROGRESS' };
      }

      const recovered = await transaction.query<IdempotencyRow>(
        `UPDATE idempotency_records
            SET status = 'PROCESSING',
                attempts = attempts + 1,
                processing_started_at = $2,
                lease_expires_at = $3,
                last_error_code = CASE
                  WHEN status = 'PROCESSING' THEN 'LEASE_LOST'
                  ELSE last_error_code
                END,
                failed_at = NULL,
                updated_at = $2
          WHERE idempotency_record_id = $1
          RETURNING *`,
        [row.idempotency_record_id, now, lease],
      );
      const acquired = requiredRow(recovered.rows[0]);
      return {
        attempts: acquired.attempts,
        kind: 'ACQUIRED',
        recordId: acquired.idempotency_record_id,
      };
    });
  }

  async completeIdempotency(recordId: string, resultReference: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE idempotency_records
          SET status = 'COMPLETED', result_reference = $2, completed_at = $3,
              lease_expires_at = NULL, updated_at = $3
        WHERE idempotency_record_id = $1 AND status = 'PROCESSING'`,
      [recordId, resultReference, this.clock.now()],
    );
    assertUpdated(result.rowCount);
  }

  async failIdempotency(
    recordId: string,
    errorCode: InfrastructureErrorCode,
    retryable: boolean,
  ): Promise<void> {
    const now = this.clock.now();
    const result = await this.pool.query(
      `UPDATE idempotency_records
          SET status = $2, last_error_code = $3, failed_at = $4,
              lease_expires_at = NULL, updated_at = $4
        WHERE idempotency_record_id = $1 AND status = 'PROCESSING'`,
      [recordId, retryable ? 'FAILED_RETRYABLE' : 'FAILED_FINAL', errorCode, now],
    );
    assertUpdated(result.rowCount);
  }

  async enqueueOutbox(
    transaction: PgTransaction,
    input: {
      readonly aggregateId: string;
      readonly aggregateType: string;
      readonly causationId?: string;
      readonly correlationId: string;
      readonly eventType: string;
      readonly payload: unknown;
      readonly payloadContract: string;
      readonly schemaVersion: number;
    },
  ): Promise<string> {
    const payload = this.outboxPayloads.validate(
      input.eventType,
      input.schemaVersion,
      input.payloadContract,
      input.payload,
    );
    const id = this.uuids.generate();
    const now = this.clock.now();
    await transaction.query(
      `INSERT INTO outbox_events (
         event_id, aggregate_type, aggregate_id, event_type, event_schema_version,
         payload_contract, payload, correlation_id, causation_id, state, attempts,
         available_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', 0, $10, $10)`,
      [
        id,
        input.aggregateType,
        input.aggregateId,
        input.eventType,
        input.schemaVersion,
        input.payloadContract,
        payload,
        input.correlationId,
        input.causationId ?? null,
        now,
      ],
    );
    return id;
  }

  async claimOutbox(limit: number, leaseMs: number): Promise<readonly OutboxClaim[]> {
    const now = this.clock.now();
    const lease = new Date(now.getTime() + leaseMs);
    const result = await this.pool.query<OutboxClaim>(
      `WITH candidates AS (
         SELECT event_id
           FROM outbox_events
          WHERE state = 'PENDING'
            AND available_at <= $1
            AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
          ORDER BY available_at, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT $2
       )
       UPDATE outbox_events AS event
          SET state = 'PROCESSING', attempts = event.attempts + 1,
              processing_started_at = $1, lease_expires_at = $3
         FROM candidates
        WHERE event.event_id = candidates.event_id
        RETURNING event.*`,
      [now, limit, lease],
    );
    return result.rows;
  }

  async completeOutbox(eventId: string): Promise<void> {
    const now = this.clock.now();
    const result = await this.pool.query(
      `UPDATE outbox_events
          SET state = 'PROCESSED', processed_at = $2, lease_expires_at = NULL
        WHERE event_id = $1 AND state = 'PROCESSING'`,
      [eventId, now],
    );
    assertUpdated(result.rowCount);
  }

  async failOutbox(
    eventId: string,
    errorCode: InfrastructureErrorCode,
    options: {
      readonly baseBackoffMs: number;
      readonly maxAttempts: number;
      readonly retryable: boolean;
    },
  ): Promise<void> {
    const now = this.clock.now();
    const result = await this.pool.query<{ attempts: number }>(
      `SELECT attempts FROM outbox_events WHERE event_id = $1 AND state = 'PROCESSING'`,
      [eventId],
    );
    const attempts = requiredRow(result.rows[0]).attempts;
    const retry = options.retryable && attempts < options.maxAttempts;
    const nextAttempt = retry
      ? new Date(now.getTime() + options.baseBackoffMs * 2 ** Math.max(0, attempts - 1))
      : null;
    const updated = await this.pool.query(
      `UPDATE outbox_events
          SET state = $2, available_at = COALESCE($5::timestamptz, available_at),
              next_attempt_at = $5::timestamptz, last_error_code = $3,
              failed_at = CASE WHEN $2 = 'FAILED' THEN $4::timestamptz ELSE NULL END,
              lease_expires_at = NULL
        WHERE event_id = $1 AND state = 'PROCESSING'`,
      [eventId, retry ? 'PENDING' : 'FAILED', errorCode, now, nextAttempt],
    );
    assertUpdated(updated.rowCount);
  }

  async receiveInbox(input: {
    readonly externalMessageId: string;
    readonly messageType: string;
    readonly payload: unknown;
    readonly payloadContract: string;
    readonly safeHeaders?: unknown;
    readonly schemaVersion: number;
    readonly source: string;
  }): Promise<{ readonly duplicate: boolean; readonly inboxId: string }> {
    const payload = this.inboxPayloads.validate(
      input.messageType,
      input.schemaVersion,
      input.payloadContract,
      input.payload,
    );
    const serialized = Buffer.from(JSON.stringify(payload), 'utf8');
    if (serialized.byteLength > 256 * 1024) {
      throw new RangeError('Inbox payload exceeds 256 KiB.');
    }
    const hash = createHash('sha256').update(serialized).digest('hex');
    const encrypted = encrypt(serialized, this.inboxEncryptionKey);
    const safeHeaders =
      input.safeHeaders === undefined
        ? null
        : metadataRegistry.validate('SafeInboundHeaders.v1', input.safeHeaders);
    const id = this.uuids.generate();
    const result = await this.pool.query<{ inbox_id: string; payload_hash: string }>(
      `INSERT INTO inbox_messages (
         inbox_id, source, external_message_id, message_type, event_schema_version,
         payload_contract, payload_hash, encrypted_payload, safe_headers_snapshot,
         state, attempts, received_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'RECEIVED', 0, $10)
       ON CONFLICT (source, external_message_id) DO UPDATE
         SET external_message_id = EXCLUDED.external_message_id
       RETURNING inbox_id, payload_hash`,
      [
        id,
        input.source,
        input.externalMessageId,
        input.messageType,
        input.schemaVersion,
        input.payloadContract,
        hash,
        encrypted,
        safeHeaders,
        this.clock.now(),
      ],
    );
    const row = requiredRow(result.rows[0]);
    if (row.payload_hash !== hash) {
      throw new Error('A duplicate Inbox identity carried a different payload hash.');
    }
    return { duplicate: row.inbox_id !== id, inboxId: row.inbox_id };
  }

  async claimInbox(limit: number, leaseMs: number): Promise<readonly InboxClaim[]> {
    const now = this.clock.now();
    const lease = new Date(now.getTime() + leaseMs);
    const result = await this.pool.query<InboxClaim>(
      `WITH candidates AS (
         SELECT inbox_id
           FROM inbox_messages
          WHERE state = 'RECEIVED'
            AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
          ORDER BY received_at
          FOR UPDATE SKIP LOCKED
          LIMIT $2
       )
       UPDATE inbox_messages AS message
          SET state = 'PROCESSING', attempts = message.attempts + 1,
              processing_started_at = $1, lease_expires_at = $3
         FROM candidates
        WHERE message.inbox_id = candidates.inbox_id
        RETURNING message.*`,
      [now, limit, lease],
    );
    return result.rows;
  }

  decryptInboxPayload(encrypted: Buffer): unknown {
    return JSON.parse(decrypt(encrypted, this.inboxEncryptionKey).toString('utf8')) as unknown;
  }

  async completeInbox(inboxId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE inbox_messages
          SET state = 'PROCESSED', processed_at = $2, lease_expires_at = NULL
        WHERE inbox_id = $1 AND state = 'PROCESSING'`,
      [inboxId, this.clock.now()],
    );
    assertUpdated(result.rowCount);
  }

  async failInbox(
    inboxId: string,
    errorCode: InfrastructureErrorCode,
    options: {
      readonly baseBackoffMs: number;
      readonly maxAttempts: number;
      readonly retryable: boolean;
    },
  ): Promise<void> {
    const now = this.clock.now();
    const current = await this.pool.query<{ attempts: number }>(
      `SELECT attempts FROM inbox_messages WHERE inbox_id = $1 AND state = 'PROCESSING'`,
      [inboxId],
    );
    const attempts = requiredRow(current.rows[0]).attempts;
    const retry = options.retryable && attempts < options.maxAttempts;
    const nextAttempt = retry
      ? new Date(now.getTime() + options.baseBackoffMs * 2 ** Math.max(0, attempts - 1))
      : null;
    const result = await this.pool.query(
      `UPDATE inbox_messages
          SET state = $2, last_error_code = $3, next_attempt_at = $4,
              failed_at = CASE WHEN $2 = 'FAILED' THEN $5::timestamptz ELSE NULL END,
              lease_expires_at = NULL
        WHERE inbox_id = $1 AND state = 'PROCESSING'`,
      [inboxId, retry ? 'RECEIVED' : 'FAILED', errorCode, nextAttempt, now],
    );
    assertUpdated(result.rowCount);
  }

  async acquireScheduledJob(input: {
    readonly allowFailedRetry: boolean;
    readonly correlationId: string;
    readonly idempotencyKey: string;
    readonly jobName: string;
    readonly leaseMs: number;
    readonly scheduledFor: Date;
  }): Promise<JobAcquisition> {
    return this.#transactions.execute(async (transaction) => {
      const now = this.clock.now();
      const lease = new Date(now.getTime() + input.leaseMs);
      const id = this.uuids.generate();
      const inserted = await transaction.query(
        `INSERT INTO scheduled_job_runs (
           scheduled_job_run_id, job_name, scheduled_for, idempotency_key, state,
           attempts, processing_started_at, lease_expires_at, correlation_id,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'RUNNING', 1, $5, $6, $7, $5, $5)
         ON CONFLICT DO NOTHING`,
        [
          id,
          input.jobName,
          input.scheduledFor,
          input.idempotencyKey,
          now,
          lease,
          input.correlationId,
        ],
      );
      const result = await transaction.query<{
        attempts: number;
        lease_expires_at: Date | null;
        scheduled_job_run_id: string;
        state: 'FAILED' | 'RUNNING' | 'SUCCEEDED';
      }>(
        `SELECT attempts, lease_expires_at, scheduled_job_run_id, state
           FROM scheduled_job_runs
          WHERE job_name = $1 AND scheduled_for = $2
          FOR UPDATE`,
        [input.jobName, input.scheduledFor],
      );
      const row = requiredRow(result.rows[0]);
      if (inserted.rowCount === 1) {
        return { attempts: 1, kind: 'ACQUIRED', runId: id };
      }
      if (row.state === 'SUCCEEDED') {
        return { kind: 'SUCCEEDED' };
      }
      if (
        row.state === 'RUNNING' &&
        row.lease_expires_at !== null &&
        row.lease_expires_at.getTime() > now.getTime()
      ) {
        return { kind: 'IN_PROGRESS' };
      }
      if (row.state === 'FAILED' && !input.allowFailedRetry) {
        return { kind: 'FAILED' };
      }
      const updated = await transaction.query<{ attempts: number; scheduled_job_run_id: string }>(
        `UPDATE scheduled_job_runs
            SET state = 'RUNNING', attempts = attempts + 1, processing_started_at = $2,
                lease_expires_at = $3, completed_at = NULL,
                last_error_code = CASE WHEN state = 'RUNNING' THEN 'LEASE_LOST' ELSE last_error_code END,
                updated_at = $2
          WHERE scheduled_job_run_id = $1
          RETURNING attempts, scheduled_job_run_id`,
        [row.scheduled_job_run_id, now, lease],
      );
      const acquired = requiredRow(updated.rows[0]);
      return {
        attempts: acquired.attempts,
        kind: 'ACQUIRED',
        runId: acquired.scheduled_job_run_id,
      };
    });
  }

  async completeScheduledJob(
    runId: string,
    counts: { readonly failed: number; readonly processed: number; readonly succeeded: number },
    summary: unknown,
  ): Promise<void> {
    const now = this.clock.now();
    const validatedSummary = metadataRegistry.validate('ScheduledJobResultSummary.v1', summary);
    const result = await this.pool.query(
      `UPDATE scheduled_job_runs
          SET state = 'SUCCEEDED', completed_at = $2, lease_expires_at = NULL,
              processed_count = $3, succeeded_count = $4, failed_count = $5,
              result_summary = $6, updated_at = $2
        WHERE scheduled_job_run_id = $1 AND state = 'RUNNING'`,
      [runId, now, counts.processed, counts.succeeded, counts.failed, validatedSummary],
    );
    assertUpdated(result.rowCount);
  }

  async failScheduledJob(runId: string, errorCode: InfrastructureErrorCode): Promise<void> {
    const now = this.clock.now();
    const result = await this.pool.query(
      `UPDATE scheduled_job_runs
          SET state = 'FAILED', last_error_code = $2, completed_at = $3,
              lease_expires_at = NULL, updated_at = $3
        WHERE scheduled_job_run_id = $1 AND state = 'RUNNING'`,
      [runId, errorCode, now],
    );
    assertUpdated(result.rowCount);
  }

  async recoverExpiredLeases(): Promise<{
    readonly idempotency: number;
    readonly inbox: number;
    readonly outbox: number;
    readonly scheduledJobs: number;
  }> {
    const now = this.clock.now();
    return this.#transactions.execute(async (transaction) => {
      const idempotency = await transaction.query(
        `UPDATE idempotency_records
            SET status = 'FAILED_RETRYABLE', last_error_code = 'LEASE_LOST',
                failed_at = $1, lease_expires_at = NULL, updated_at = $1
          WHERE status = 'PROCESSING' AND lease_expires_at <= $1`,
        [now],
      );
      const outbox = await transaction.query(
        `UPDATE outbox_events
            SET state = 'PENDING', last_error_code = 'LEASE_LOST',
                next_attempt_at = $1, lease_expires_at = NULL
          WHERE state = 'PROCESSING' AND lease_expires_at <= $1`,
        [now],
      );
      const inbox = await transaction.query(
        `UPDATE inbox_messages
            SET state = 'RECEIVED', last_error_code = 'LEASE_LOST',
                next_attempt_at = $1, lease_expires_at = NULL
          WHERE state = 'PROCESSING' AND lease_expires_at <= $1`,
        [now],
      );
      const scheduled = await transaction.query(
        `UPDATE scheduled_job_runs
            SET state = 'FAILED', last_error_code = 'LEASE_LOST',
                completed_at = $1, lease_expires_at = NULL, updated_at = $1
          WHERE state = 'RUNNING' AND lease_expires_at <= $1`,
        [now],
      );
      return {
        idempotency: idempotency.rowCount ?? 0,
        inbox: inbox.rowCount ?? 0,
        outbox: outbox.rowCount ?? 0,
        scheduledJobs: scheduled.rowCount ?? 0,
      };
    });
  }

  async reactivateFailedRecord(
    kind: ReactivatableRecordKind,
    recordId: string,
    context: ExecutionContext & { readonly actorId: string; readonly actorType: 'SYSTEM' | 'USER' },
    authorizer: TechnicalActionAuthorizer,
    leaseMs: number,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
      throw new RangeError('Technical reactivation lease must be a positive integer.');
    }
    const action = `REACTIVATE_${kind}`;
    const authorized = await authorizer.authorize({
      action,
      actorId: context.actorId,
      actorType: context.actorType,
    });
    return this.#transactions.execute(async (transaction) => {
      if (!authorized) {
        await this.writeAudit(transaction, {
          action,
          context,
          reason: 'AUTHORIZATION_DENIED',
          resourceId: recordId,
          resourceType: kind,
          result: 'FAILURE',
        });
        return false;
      }

      const now = this.clock.now();
      const updated = await reactivate(
        transaction,
        kind,
        recordId,
        now,
        new Date(now.getTime() + leaseMs),
      );
      await this.writeAudit(transaction, {
        action,
        context,
        reason: updated ? 'TECHNICAL_REACTIVATION' : 'STATE_CONFLICT',
        resourceId: recordId,
        resourceType: kind,
        result: updated ? 'SUCCESS' : 'FAILURE',
      });
      return updated;
    });
  }

  async writeAudit(
    transaction: PgTransaction,
    input: {
      readonly action: string;
      readonly context: ExecutionContext;
      readonly diagnosticContext?: unknown;
      readonly reason?: string;
      readonly resourceId?: string;
      readonly resourceType?: string;
      readonly result: 'FAILURE' | 'SUCCESS';
    },
  ): Promise<string> {
    const id = this.uuids.generate();
    const diagnosticContext =
      input.diagnosticContext === undefined
        ? null
        : metadataRegistry.validate('AuditDiagnosticContext.v1', input.diagnosticContext);
    await transaction.query(
      `INSERT INTO audit_entries (
         audit_entry_id, actor_id, actor_type, action, resource_type, resource_id,
         result, reason, correlation_id, causation_id, idempotency_key,
         diagnostic_context, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        input.context.actorId ?? null,
        input.context.actorType,
        input.action,
        input.resourceType ?? null,
        input.resourceId ?? null,
        input.result,
        input.reason ?? null,
        input.context.correlationId,
        input.context.causationId ?? null,
        input.context.idempotencyKey ?? null,
        diagnosticContext,
        this.clock.now(),
      ],
    );
    return id;
  }

  transactionExecutor(): PgTransactionExecutor {
    return this.#transactions;
  }
}

function encrypt(plain: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

function decrypt(encrypted: Buffer, key: Buffer): Buffer {
  if (encrypted.byteLength < 28) {
    throw new Error('Encrypted Inbox payload is invalid.');
  }
  const nonce = encrypted.subarray(0, 12);
  const tag = encrypted.subarray(12, 28);
  const ciphertext = encrypted.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function reactivate(
  transaction: PgTransaction,
  kind: ReactivatableRecordKind,
  recordId: string,
  now: Date,
  leaseExpiresAt: Date,
): Promise<boolean> {
  const statements: Record<ReactivatableRecordKind, string> = {
    IDEMPOTENCY: `UPDATE idempotency_records
                     SET status = 'FAILED_RETRYABLE', updated_at = $2
                   WHERE idempotency_record_id = $1 AND status = 'FAILED_FINAL'`,
    INBOX: `UPDATE inbox_messages
               SET state = 'RECEIVED', next_attempt_at = $2, failed_at = NULL
             WHERE inbox_id = $1 AND state = 'FAILED'`,
    OUTBOX: `UPDATE outbox_events
                SET state = 'PENDING', available_at = $2, next_attempt_at = $2, failed_at = NULL
              WHERE event_id = $1 AND state = 'FAILED'`,
    SCHEDULED_JOB: `UPDATE scheduled_job_runs
                       SET state = 'RUNNING', attempts = attempts + 1,
                           processing_started_at = $2, lease_expires_at = $3,
                           completed_at = NULL, updated_at = $2
                     WHERE scheduled_job_run_id = $1 AND state = 'FAILED'`,
  };
  const parameters = kind === 'SCHEDULED_JOB' ? [recordId, now, leaseExpiresAt] : [recordId, now];
  const result = await transaction.query(statements[kind], parameters);
  return result.rowCount === 1;
}

function assertUpdated(rowCount: number | null): void {
  if (rowCount !== 1) {
    throw new Error('The coordination record was not in the required state.');
  }
}

function requiredRow<Row>(row: Row | undefined): Row {
  if (row === undefined) {
    throw new Error('The expected coordination record does not exist.');
  }
  return row;
}
