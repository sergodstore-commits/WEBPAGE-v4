import { createHash } from 'node:crypto';

import type { Clock, UuidGenerator } from '@sergod/foundation';
import type { Pool } from 'pg';

import { PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type { CatalogRepository, CatalogStorageInventoryPort } from './ports.js';

const JOB_NAME = 'CATALOG_STORAGE_RECONCILIATION';
const LEASE_MS = 15 * 60 * 1_000;

export interface CatalogStorageReconciliationResult {
  readonly anomalies: number;
  readonly compatible: number;
  readonly kind: 'COMPLETED' | 'IN_PROGRESS' | 'SUCCEEDED';
  readonly scanned: number;
  readonly usage: CatalogStorageUsage;
}

export interface CatalogStorageUsage {
  readonly activeBytes: number;
  readonly activeObjects: number;
  readonly orphanBytes: number;
  readonly orphanObjects: number;
  readonly retainedBytes: number;
  readonly retainedObjects: number;
  readonly totalBytes: number;
  readonly totalObjects: number;
}

type MutableCatalogStorageUsage = {
  -readonly [Key in keyof CatalogStorageUsage]: CatalogStorageUsage[Key];
};

const emptyUsage = (): MutableCatalogStorageUsage => ({
  activeBytes: 0,
  activeObjects: 0,
  orphanBytes: 0,
  orphanObjects: 0,
  retainedBytes: 0,
  retainedObjects: 0,
  totalBytes: 0,
  totalObjects: 0,
});

export class CatalogStorageReconciler {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly repository: CatalogRepository,
    private readonly storage: CatalogStorageInventoryPort,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async run(input: {
    readonly correlationId: string;
    readonly scheduledFor: Date;
  }): Promise<CatalogStorageReconciliationResult> {
    const acquired = await this.acquire(input);
    if (acquired.kind !== 'ACQUIRED') {
      return { anomalies: 0, compatible: 0, kind: acquired.kind, scanned: 0, usage: emptyUsage() };
    }
    try {
      const metadata = await this.repository.listResourcesForReconciliation();
      const objectKeys = await this.storage.listPrivateObjectKeys();
      const knownKeys = new Set(metadata.map((resource) => resource.secureStorageKey));
      const availableKeys = new Set(objectKeys);
      const usage = emptyUsage();
      let anomalies = 0;
      let compatible = 0;

      for (const resource of metadata) {
        if (!availableKeys.has(resource.secureStorageKey)) {
          anomalies += 1;
          await this.auditAnomaly(
            input.correlationId,
            resource.resourceId,
            resource.state === 'ACTIVE' ? 'ACTIVE_OBJECT_MISSING' : 'METADATA_OBJECT_MISSING',
          );
          continue;
        }
        const storedBytes = await this.storage.downloadPrivateObject(resource.secureStorageKey);
        addKnownUsage(usage, resource.state, storedBytes.byteLength);
        const storedHash = sha256(storedBytes);
        if (resource.sha256Hex !== null && storedHash !== resource.sha256Hex) {
          anomalies += 1;
          await this.auditAnomaly(input.correlationId, resource.resourceId, 'OBJECT_HASH_MISMATCH');
          continue;
        }
        compatible += 1;
      }

      for (const key of objectKeys) {
        if (knownKeys.has(key)) continue;
        const storedBytes = await this.storage.downloadPrivateObject(key);
        usage.orphanBytes += storedBytes.byteLength;
        usage.orphanObjects += 1;
        usage.totalBytes += storedBytes.byteLength;
        usage.totalObjects += 1;
        anomalies += 1;
        await this.auditAnomaly(input.correlationId, opaqueKeyReference(key), 'ORPHAN_OBJECT');
      }

      const scanned = metadata.length + objectKeys.filter((key) => !knownKeys.has(key)).length;
      await this.complete(acquired.runId, { anomalies, compatible, scanned });
      await this.auditCompletion(input.correlationId, acquired.runId, anomalies);
      return { anomalies, compatible, kind: 'COMPLETED', scanned, usage };
    } catch (error) {
      await this.fail(acquired.runId);
      throw error;
    }
  }

  private async acquire(input: {
    readonly correlationId: string;
    readonly scheduledFor: Date;
  }): Promise<
    | { readonly kind: 'ACQUIRED'; readonly runId: string }
    | { readonly kind: 'IN_PROGRESS' | 'SUCCEEDED' }
  > {
    return this.#transactions.execute(async (transaction) => {
      const now = this.clock.now();
      const runId = this.uuids.generate();
      const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
      const idempotencyKey = `${JOB_NAME}:${input.scheduledFor.toISOString()}`;
      const inserted = await transaction.query(
        `INSERT INTO scheduled_job_runs (
           scheduled_job_run_id, job_name, scheduled_for, idempotency_key, state,
           attempts, processing_started_at, lease_expires_at, correlation_id,
           created_at, updated_at
         ) VALUES ($1, $2, $3, $4, 'RUNNING', 1, $5, $6, $7, $5, $5)
         ON CONFLICT DO NOTHING`,
        [
          runId,
          JOB_NAME,
          input.scheduledFor,
          idempotencyKey,
          now,
          leaseExpiresAt,
          input.correlationId,
        ],
      );
      if (inserted.rowCount === 1) return { kind: 'ACQUIRED', runId };
      const current = await transaction.query<{
        lease_expires_at: Date | null;
        scheduled_job_run_id: string;
        state: 'FAILED' | 'RUNNING' | 'SUCCEEDED';
      }>(
        `SELECT scheduled_job_run_id, state, lease_expires_at
           FROM scheduled_job_runs WHERE job_name = $1 AND scheduled_for = $2 FOR UPDATE`,
        [JOB_NAME, input.scheduledFor],
      );
      const row = current.rows[0];
      if (row === undefined) throw new Error('Catalog reconciliation run could not be acquired.');
      if (row.state === 'SUCCEEDED') return { kind: 'SUCCEEDED' };
      if (
        row.state === 'RUNNING' &&
        row.lease_expires_at !== null &&
        row.lease_expires_at.getTime() > now.getTime()
      ) {
        return { kind: 'IN_PROGRESS' };
      }
      await transaction.query(
        `UPDATE scheduled_job_runs
            SET state = 'RUNNING', attempts = attempts + 1, processing_started_at = $2,
                lease_expires_at = $3, completed_at = NULL, last_error_code = NULL,
                correlation_id = $4, updated_at = $2
          WHERE scheduled_job_run_id = $1`,
        [row.scheduled_job_run_id, now, leaseExpiresAt, input.correlationId],
      );
      return { kind: 'ACQUIRED', runId: row.scheduled_job_run_id };
    });
  }

  private async complete(
    runId: string,
    counts: { readonly anomalies: number; readonly compatible: number; readonly scanned: number },
  ): Promise<void> {
    const now = this.clock.now();
    await this.pool.query(
      `UPDATE scheduled_job_runs
          SET state = 'SUCCEEDED', completed_at = $2, lease_expires_at = NULL,
              processed_count = $3, succeeded_count = $4, failed_count = $5,
              result_summary = $6::jsonb, updated_at = $2
        WHERE scheduled_job_run_id = $1 AND state = 'RUNNING'`,
      [
        runId,
        now,
        counts.scanned,
        counts.compatible,
        counts.anomalies,
        JSON.stringify({
          failed: counts.anomalies,
          metadata_contract: 'ScheduledJobResultSummary.v1',
          metadata_schema_version: 1,
          scanned: counts.scanned,
          skipped: 0,
          succeeded: counts.compatible,
        }),
      ],
    );
  }

  private async fail(runId: string): Promise<void> {
    const now = this.clock.now();
    await this.pool.query(
      `UPDATE scheduled_job_runs
          SET state = 'FAILED', completed_at = $2, lease_expires_at = NULL,
              last_error_code = 'CATALOG_RECONCILIATION_FAILED', updated_at = $2
        WHERE scheduled_job_run_id = $1 AND state = 'RUNNING'`,
      [runId, now],
    );
  }

  private auditAnomaly(
    correlationId: string,
    resourceId: string,
    reason: string,
  ): Promise<unknown> {
    return this.audit(
      correlationId,
      'CATALOG_STORAGE_ANOMALY_DETECTED',
      resourceId,
      'FAILURE',
      reason,
    );
  }

  private auditCompletion(
    correlationId: string,
    runId: string,
    anomalies: number,
  ): Promise<unknown> {
    return this.audit(
      correlationId,
      'CATALOG_STORAGE_RECONCILED',
      runId,
      'SUCCESS',
      anomalies === 0 ? undefined : 'ANOMALIES_RECORDED',
    );
  }

  private audit(
    correlationId: string,
    action: string,
    resourceId: string,
    result: 'FAILURE' | 'SUCCESS',
    reason?: string,
  ): Promise<unknown> {
    return this.pool.query(
      `INSERT INTO audit_entries (
         audit_entry_id, actor_id, actor_type, action, resource_type, resource_id,
         result, reason, correlation_id, occurred_at
       ) VALUES ($1, NULL, 'SYSTEM', $2, 'CATALOG_STORAGE_RECONCILIATION', $3,
                 $4, $5, $6, $7)`,
      [
        this.uuids.generate(),
        action,
        resourceId,
        result,
        reason ?? null,
        correlationId,
        this.clock.now(),
      ],
    );
  }
}

function addKnownUsage(
  usage: MutableCatalogStorageUsage,
  state: 'ACTIVE' | 'QUARANTINED' | 'REMOVED' | 'REPLACED',
  byteSize: number,
): void {
  usage.totalBytes += byteSize;
  usage.totalObjects += 1;
  if (state === 'ACTIVE') {
    usage.activeBytes += byteSize;
    usage.activeObjects += 1;
    return;
  }
  usage.retainedBytes += byteSize;
  usage.retainedObjects += 1;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function opaqueKeyReference(key: string): string {
  return `opaque:${createHash('sha256').update(key).digest('hex')}`;
}
