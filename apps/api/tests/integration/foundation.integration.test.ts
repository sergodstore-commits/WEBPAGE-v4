import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PayloadRegistry } from '@sergod/contracts';
import { CryptoUuidGenerator, FixedClock } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import { Pool } from 'pg';
import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CoordinationStore } from '../../src/platform/coordination/coordination-store.js';
import {
  createPostgresPool,
  PgTransaction,
  PgTransactionExecutor,
} from '../../src/platform/persistence/postgres.js';

const correlationId = '0198a8be-6677-7000-8000-000000000001';
const clock = new FixedClock(new Date('2026-07-31T12:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
const probeSchema = z.object({ probeId: z.string().uuid() }).strict();
const payloads = new PayloadRegistry([
  {
    contract: 'FoundationProbe.v1',
    maximumBytes: 1024,
    messageType: 'FOUNDATION_PROBE',
    owner: 'Foundation integration test',
    schema: probeSchema,
    schemaVersion: 1,
  },
]);
const encryptionKey = Buffer.alloc(32, 23);

let pool: Pool;
let store: CoordinationStore;

async function localDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  const value = JSON.parse(text) as { databaseUrl: string };
  return value.databaseUrl;
}

async function migrate(url: string): Promise<void> {
  await runner({
    checkOrder: true,
    databaseUrl: url,
    dir: resolve('apps/api/migrations'),
    direction: 'up',
    ignorePattern: 'README\\.md',
    migrationsTable: 'pg_migrations',
    schema: 'public',
    singleTransaction: true,
  });
}

async function enqueueProbe(probeId = crypto.randomUUID()): Promise<string> {
  return store.transactionExecutor().execute((transaction) =>
    store.enqueueOutbox(transaction, {
      aggregateId: probeId,
      aggregateType: 'FOUNDATION_PROBE',
      correlationId,
      eventType: 'FOUNDATION_PROBE',
      payload: { probeId },
      payloadContract: 'FoundationProbe.v1',
      schemaVersion: 1,
    }),
  );
}

beforeAll(async () => {
  const url = await localDatabaseUrl();
  await migrate(url);
  pool = createPostgresPool(url, { max: 20 });
  store = new CoordinationStore(pool, clock, uuids, payloads, payloads, encryptionKey);
});

beforeEach(async () => {
  clock.set(new Date('2026-07-31T12:00:00.000Z'));
  await pool.query(`
    TRUNCATE audit_entries, idempotency_records, outbox_events,
             inbox_messages, scheduled_job_runs CASCADE
  `);
});

afterAll(async () => {
  await pool.end();
});

describe('PostgreSQL foundation integration', () => {
  it('uses one connection for BEGIN/COMMIT/ROLLBACK and performs a real rollback', async () => {
    const executor = new PgTransactionExecutor(pool);
    let firstBackend = 0;
    let secondBackend = 0;

    await expect(
      executor.execute(async (transaction) => {
        const first = await transaction.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        firstBackend = first.rows[0]?.pid ?? 0;
        await transaction.query(
          `INSERT INTO audit_entries (
             audit_entry_id, actor_type, action, result, correlation_id, occurred_at
           ) VALUES ($1, 'SYSTEM', 'ROLLBACK_PROBE', 'SUCCESS', $2, $3)`,
          [crypto.randomUUID(), correlationId, clock.now()],
        );
        const second = await transaction.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        secondBackend = second.rows[0]?.pid ?? 0;
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(firstBackend).toBeGreaterThan(0);
    expect(secondBackend).toBe(firstBackend);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) FROM audit_entries WHERE action = 'ROLLBACK_PROBE'`,
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  it('writes Outbox in the same transaction as its origin', async () => {
    const executor = new PgTransactionExecutor(pool);
    await expect(
      executor.execute(async (transaction: PgTransaction) => {
        await store.writeAudit(transaction, {
          action: 'OUTBOX_ATOMICITY_PROBE',
          context: { actorType: 'SYSTEM', correlationId },
          result: 'SUCCESS',
        });
        await store.enqueueOutbox(transaction, {
          aggregateId: crypto.randomUUID(),
          aggregateType: 'FOUNDATION_PROBE',
          correlationId,
          eventType: 'FOUNDATION_PROBE',
          payload: { probeId: crypto.randomUUID() },
          payloadContract: 'FoundationProbe.v1',
          schemaVersion: 1,
        });
        throw new Error('rollback both');
      }),
    ).rejects.toThrow('rollback both');

    const counts = await pool.query<{ audits: string; events: string }>(
      `SELECT
         (SELECT count(*) FROM audit_entries) AS audits,
         (SELECT count(*) FROM outbox_events) AS events`,
    );
    expect(counts.rows[0]).toEqual({ audits: '0', events: '0' });
  });

  it('handles idempotency with the same and a different fingerprint', async () => {
    const first = await store.acquireIdempotency({
      fingerprint: 'sha256:same',
      key: 'request-1',
      leaseMs: 30_000,
      scope: 'FOUNDATION_TEST',
    });
    expect(first.kind).toBe('ACQUIRED');
    if (first.kind !== 'ACQUIRED') throw new Error('Expected acquisition.');

    expect(
      await store.acquireIdempotency({
        fingerprint: 'sha256:same',
        key: 'request-1',
        leaseMs: 30_000,
        scope: 'FOUNDATION_TEST',
      }),
    ).toEqual({ kind: 'IN_PROGRESS' });

    await store.completeIdempotency(first.recordId, 'result:1');
    expect(
      await store.acquireIdempotency({
        fingerprint: 'sha256:same',
        key: 'request-1',
        leaseMs: 30_000,
        scope: 'FOUNDATION_TEST',
      }),
    ).toEqual({ kind: 'COMPLETED', resultReference: 'result:1' });
    expect(
      await store.acquireIdempotency({
        fingerprint: 'sha256:different',
        key: 'request-1',
        leaseMs: 30_000,
        scope: 'FOUNDATION_TEST',
      }),
    ).toEqual({ kind: 'CONFLICT' });
  });

  it('claims Outbox concurrently without claiming any event twice', async () => {
    const ids = await Promise.all([enqueueProbe(), enqueueProbe(), enqueueProbe()]);
    const [workerA, workerB] = await Promise.all([
      store.claimOutbox(2, 30_000),
      store.claimOutbox(2, 30_000),
    ]);
    const claimed = [...workerA, ...workerB].map((row) => row.event_id);

    expect(claimed).toHaveLength(3);
    expect(new Set(claimed).size).toBe(3);
    expect(new Set(claimed)).toEqual(new Set(ids));
  });

  it('retries and recovers the same Outbox record', async () => {
    const id = await enqueueProbe();
    const [first] = await store.claimOutbox(1, 1_000);
    expect(first?.event_id).toBe(id);
    await store.failOutbox(id, 'DEPENDENCY_UNAVAILABLE', {
      baseBackoffMs: 100,
      maxAttempts: 3,
      retryable: true,
    });
    clock.set(new Date('2026-07-31T12:00:00.101Z'));
    const [retried] = await store.claimOutbox(1, 1);
    expect(retried?.event_id).toBe(id);
    expect(retried?.attempts).toBe(2);

    clock.set(new Date('2026-07-31T12:00:00.103Z'));
    const recovered = await store.recoverExpiredLeases();
    expect(recovered.outbox).toBe(1);
    const [claimedAgain] = await store.claimOutbox(1, 1_000);
    expect(claimedAgain?.event_id).toBe(id);
    expect(claimedAgain?.attempts).toBe(3);
  });

  it('deduplicates Inbox and stores only encrypted authentic payload bytes', async () => {
    const probeId = crypto.randomUUID();
    const first = await store.receiveInbox({
      externalMessageId: 'external-1',
      messageType: 'FOUNDATION_PROBE',
      payload: { probeId },
      payloadContract: 'FoundationProbe.v1',
      schemaVersion: 1,
      source: 'FOUNDATION_TEST_SOURCE',
    });
    const duplicate = await store.receiveInbox({
      externalMessageId: 'external-1',
      messageType: 'FOUNDATION_PROBE',
      payload: { probeId },
      payloadContract: 'FoundationProbe.v1',
      schemaVersion: 1,
      source: 'FOUNDATION_TEST_SOURCE',
    });

    expect(first.duplicate).toBe(false);
    expect(duplicate).toEqual({ duplicate: true, inboxId: first.inboxId });
    const persisted = await pool.query<{ encrypted_payload: Buffer }>(
      `SELECT encrypted_payload FROM inbox_messages WHERE inbox_id = $1`,
      [first.inboxId],
    );
    expect(persisted.rows[0]?.encrypted_payload.toString('utf8')).not.toContain(probeId);
    const [claim] = await store.claimInbox(1, 30_000);
    expect(store.decryptInboxPayload(claim?.encrypted_payload ?? Buffer.alloc(0))).toEqual({
      probeId,
    });
  });

  it('applies Inbox backoff on the same record and reaches a safe final failure', async () => {
    const received = await store.receiveInbox({
      externalMessageId: 'retryable-inbox',
      messageType: 'FOUNDATION_PROBE',
      payload: { probeId: crypto.randomUUID() },
      payloadContract: 'FoundationProbe.v1',
      schemaVersion: 1,
      source: 'FOUNDATION_TEST_SOURCE',
    });
    await store.claimInbox(1, 30_000);
    await store.failInbox(received.inboxId, 'DEPENDENCY_UNAVAILABLE', {
      baseBackoffMs: 100,
      maxAttempts: 2,
      retryable: true,
    });
    expect(await store.claimInbox(1, 30_000)).toHaveLength(0);

    clock.set(new Date('2026-07-31T12:00:00.101Z'));
    const [retry] = await store.claimInbox(1, 30_000);
    expect(retry).toMatchObject({ attempts: 2, inbox_id: received.inboxId });
    await store.failInbox(received.inboxId, 'SCHEMA_VALIDATION_FAILED', {
      baseBackoffMs: 100,
      maxAttempts: 2,
      retryable: true,
    });
    const final = await pool.query<{ last_error_code: string; state: string }>(
      `SELECT state, last_error_code FROM inbox_messages WHERE inbox_id = $1`,
      [received.inboxId],
    );
    expect(final.rows[0]).toEqual({
      last_error_code: 'SCHEMA_VALIDATION_FAILED',
      state: 'FAILED',
    });
  });

  it('allows only one worker to acquire the same scheduled window', async () => {
    const scheduledFor = new Date('2026-07-31T12:00:00.000Z');
    const input = {
      allowFailedRetry: false,
      correlationId,
      idempotencyKey: 'job:window',
      jobName: 'FOUNDATION_LEASE_RECOVERY',
      leaseMs: 30_000,
      scheduledFor,
    };
    const results = await Promise.all([
      store.acquireScheduledJob(input),
      store.acquireScheduledJob(input),
    ]);

    expect(results.filter(({ kind }) => kind === 'ACQUIRED')).toHaveLength(1);
    expect(results.filter(({ kind }) => kind === 'IN_PROGRESS')).toHaveLength(1);
    const count = await pool.query<{ count: string }>('SELECT count(*) FROM scheduled_job_runs');
    expect(count.rows[0]?.count).toBe('1');
  });

  it('recovers expired leases for all four coordination records without new logical records', async () => {
    const idempotency = await store.acquireIdempotency({
      fingerprint: 'sha256:lease',
      key: 'lease',
      leaseMs: 1,
      scope: 'FOUNDATION_TEST',
    });
    if (idempotency.kind !== 'ACQUIRED') throw new Error('Expected idempotency acquisition.');
    const eventId = await enqueueProbe();
    await store.claimOutbox(1, 1);
    const inbox = await store.receiveInbox({
      externalMessageId: 'lease',
      messageType: 'FOUNDATION_PROBE',
      payload: { probeId: crypto.randomUUID() },
      payloadContract: 'FoundationProbe.v1',
      schemaVersion: 1,
      source: 'FOUNDATION_TEST_SOURCE',
    });
    await store.claimInbox(1, 1);
    const job = await store.acquireScheduledJob({
      allowFailedRetry: true,
      correlationId,
      idempotencyKey: 'lease-job',
      jobName: 'FOUNDATION_LEASE_RECOVERY',
      leaseMs: 1,
      scheduledFor: new Date('2026-07-31T12:00:00.000Z'),
    });
    if (job.kind !== 'ACQUIRED') throw new Error('Expected job acquisition.');

    clock.set(new Date('2026-07-31T12:00:00.002Z'));
    expect(await store.recoverExpiredLeases()).toEqual({
      idempotency: 1,
      inbox: 1,
      outbox: 1,
      scheduledJobs: 1,
    });
    const idempotencyAgain = await store.acquireIdempotency({
      fingerprint: 'sha256:lease',
      key: 'lease',
      leaseMs: 30_000,
      scope: 'FOUNDATION_TEST',
    });
    const [eventAgain] = await store.claimOutbox(1, 30_000);
    const [inboxAgain] = await store.claimInbox(1, 30_000);
    const jobAgain = await store.acquireScheduledJob({
      allowFailedRetry: true,
      correlationId,
      idempotencyKey: 'lease-job',
      jobName: 'FOUNDATION_LEASE_RECOVERY',
      leaseMs: 30_000,
      scheduledFor: new Date('2026-07-31T12:00:00.000Z'),
    });

    expect(idempotencyAgain).toMatchObject({
      kind: 'ACQUIRED',
      recordId: idempotency.recordId,
    });
    expect(eventAgain?.event_id).toBe(eventId);
    expect(inboxAgain?.inbox_id).toBe(inbox.inboxId);
    expect(jobAgain).toMatchObject({ kind: 'ACQUIRED', runId: job.runId });
    const counts = await pool.query<{ count: string }>(
      `SELECT (
        (SELECT count(*) FROM idempotency_records) +
        (SELECT count(*) FROM outbox_events) +
        (SELECT count(*) FROM inbox_messages) +
        (SELECT count(*) FROM scheduled_job_runs)
      ) AS count`,
    );
    expect(counts.rows[0]?.count).toBe('4');
  });

  it('requires authorization for manual FAILED reactivation and audits both outcomes', async () => {
    const eventId = await enqueueProbe();
    await store.claimOutbox(1, 30_000);
    await store.failOutbox(eventId, 'SCHEMA_VALIDATION_FAILED', {
      baseBackoffMs: 1,
      maxAttempts: 1,
      retryable: false,
    });
    const context = {
      actorId: crypto.randomUUID(),
      actorType: 'USER' as const,
      correlationId,
    };

    expect(
      await store.reactivateFailedRecord(
        'OUTBOX',
        eventId,
        context,
        {
          authorize: async () => false,
        },
        30_000,
      ),
    ).toBe(false);
    expect(
      await store.reactivateFailedRecord(
        'OUTBOX',
        eventId,
        context,
        {
          authorize: async () => true,
        },
        30_000,
      ),
    ).toBe(true);

    const event = await pool.query<{ last_error_code: string; state: string }>(
      `SELECT state, last_error_code FROM outbox_events WHERE event_id = $1`,
      [eventId],
    );
    expect(event.rows[0]).toEqual({
      last_error_code: 'SCHEMA_VALIDATION_FAILED',
      state: 'PENDING',
    });
    const audits = await pool.query<{ reason: string; result: string }>(
      `SELECT reason, result FROM audit_entries ORDER BY occurred_at, audit_entry_id`,
    );
    expect(audits.rows).toEqual(
      expect.arrayContaining([
        { reason: 'AUTHORIZATION_DENIED', result: 'FAILURE' },
        { reason: 'TECHNICAL_REACTIVATION', result: 'SUCCESS' },
      ]),
    );
  });
});
