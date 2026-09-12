import type {
  ConfigurationKey,
  SystemConfigurationState,
  SystemConfigurationValue,
} from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  SystemConfigurationRepository,
  SystemConfigurationView,
} from '../application/ports.js';
import { SystemConfigurationError } from '../domain/system-configuration.js';

const IDEMPOTENCY_SCOPE = 'SYSTEM_CONFIGURATION_MUTATION';

export class PgSystemConfigurationRepository implements SystemConfigurationRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async findById(id: string): Promise<SystemConfigurationView | null> {
    const result = await this.pool.query<SystemConfigurationRow>(
      `SELECT * FROM system_configurations WHERE system_configuration_id=$1`,
      [id],
    );
    return result.rows[0] === undefined ? null : mapConfiguration(result.rows[0]);
  }

  async findActive(key: ConfigurationKey): Promise<SystemConfigurationView | null> {
    const result = await this.pool.query<SystemConfigurationRow>(
      `SELECT * FROM system_configurations
        WHERE configuration_key=$1 AND scope='GLOBAL' AND state='ACTIVE'`,
      [key],
    );
    return result.rows[0] === undefined ? null : mapConfiguration(result.rows[0]);
  }

  async list(input: Parameters<SystemConfigurationRepository['list']>[0]) {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input.configurationKey !== undefined) {
      values.push(input.configurationKey);
      clauses.push(`configuration_key=$${values.length}`);
    }
    if (input.state !== undefined) {
      values.push(input.state);
      clauses.push(`state=$${values.length}`);
    }
    if (input.cursor !== undefined) {
      values.push(input.cursor.createdAt, input.cursor.id);
      clauses.push(
        `(created_at,system_configuration_id)<($${values.length - 1},$${values.length}::uuid)`,
      );
    }
    values.push(input.limit + 1);
    const result = await this.pool.query<SystemConfigurationRow>(
      `SELECT * FROM system_configurations
        ${clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`}
        ORDER BY created_at DESC,system_configuration_id DESC LIMIT $${values.length}`,
      values,
    );
    return {
      hasMore: result.rows.length > input.limit,
      items: result.rows.slice(0, input.limit).map(mapConfiguration),
    };
  }

  createVersion(input: Parameters<SystemConfigurationRepository['createVersion']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      await lockScope(transaction, input.configurationKey);
      const next = await transaction.query<{ next_version: string }>(
        `SELECT (COALESCE(max(version_number),0)+1)::text AS next_version
          FROM system_configurations
          WHERE configuration_key=$1 AND scope='GLOBAL'`,
        [input.configurationKey],
      );
      const id = this.uuids.generate();
      const columns = valueColumns(input.value, input.configurationKey);
      await transaction.query(
        `INSERT INTO system_configurations(
          system_configuration_id,configuration_key,scope,branch_id,value_type,
          integer_value,boolean_value,text_value,reference_id,version_number,state,
          created_by,created_at,correlation_id
        ) VALUES($1,$2,'GLOBAL',NULL,$3,$4,$5,$6,$7,$8,'DRAFT',$9,$10,$11)`,
        [
          id,
          input.configurationKey,
          columns.valueType,
          columns.integerValue,
          columns.booleanValue,
          columns.textValue,
          columns.referenceId,
          required(next.rows[0]).next_version,
          requiredActor(input.context),
          now,
          input.context.correlationId,
        ],
      );
      await this.audit(
        transaction,
        input.context,
        'SYSTEM_CONFIGURATION_VERSION_CREATED',
        id,
        input.reason,
        now,
      );
      return id;
    });
  }

  updateDraft(input: Parameters<SystemConfigurationRepository['updateDraft']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      const current = await lockConfiguration(transaction, input.systemConfigurationId);
      if (current.state !== 'DRAFT') throw conflict('SYSTEM_CONFIGURATION_IMMUTABLE');
      const columns = valueColumns(input.value, current.configuration_key);
      if (columns.valueType !== current.value_type) {
        throw validation('SYSTEM_CONFIGURATION_VALUE_INVALID');
      }
      await transaction.query(
        `UPDATE system_configurations
          SET integer_value=$2,boolean_value=$3,text_value=$4,reference_id=$5
          WHERE system_configuration_id=$1`,
        [
          input.systemConfigurationId,
          columns.integerValue,
          columns.booleanValue,
          columns.textValue,
          columns.referenceId,
        ],
      );
      await this.audit(
        transaction,
        input.context,
        'SYSTEM_CONFIGURATION_DRAFT_EDITED',
        input.systemConfigurationId,
        input.reason,
        now,
      );
      return input.systemConfigurationId;
    });
  }

  activate(input: Parameters<SystemConfigurationRepository['activate']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      const identity = await configurationIdentity(transaction, input.systemConfigurationId);
      await lockScope(transaction, identity.configuration_key);
      const target = await lockConfiguration(transaction, input.systemConfigurationId);
      if (target.state !== 'DRAFT') {
        throw conflict('SYSTEM_CONFIGURATION_TRANSITION_INVALID');
      }
      await validateReferenceForActivation(transaction, target);
      const actor = requiredActor(input.context);
      const previous = await transaction.query<{ system_configuration_id: string }>(
        `UPDATE system_configurations
          SET state='RETIRED',retired_by=$2,retired_at=$3
          WHERE configuration_key=$1 AND scope='GLOBAL' AND state='ACTIVE'
          RETURNING system_configuration_id`,
        [target.configuration_key, actor, now],
      );
      for (const row of previous.rows) {
        await this.audit(
          transaction,
          input.context,
          'SYSTEM_CONFIGURATION_RETIRED',
          row.system_configuration_id,
          input.reason,
          now,
        );
      }
      await transaction.query(
        `UPDATE system_configurations
          SET state='ACTIVE',activated_by=$2,activated_at=$3
          WHERE system_configuration_id=$1`,
        [input.systemConfigurationId, actor, now],
      );
      await this.audit(
        transaction,
        input.context,
        'SYSTEM_CONFIGURATION_ACTIVATED',
        input.systemConfigurationId,
        input.reason,
        now,
      );
      return input.systemConfigurationId;
    });
  }

  retire(input: Parameters<SystemConfigurationRepository['retire']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      const identity = await configurationIdentity(transaction, input.systemConfigurationId);
      await lockScope(transaction, identity.configuration_key);
      const target = await lockConfiguration(transaction, input.systemConfigurationId);
      if (target.state !== 'ACTIVE') {
        throw conflict('SYSTEM_CONFIGURATION_TRANSITION_INVALID');
      }
      await transaction.query(
        `UPDATE system_configurations SET state='RETIRED',retired_by=$2,retired_at=$3
          WHERE system_configuration_id=$1`,
        [input.systemConfigurationId, requiredActor(input.context), now],
      );
      await this.audit(
        transaction,
        input.context,
        'SYSTEM_CONFIGURATION_RETIRED',
        input.systemConfigurationId,
        input.reason,
        now,
      );
      return input.systemConfigurationId;
    });
  }

  private async idempotent(
    input: {
      readonly context: ExecutionContext;
      readonly idempotencyKey: string;
      readonly requestFingerprint: string;
    },
    operation: (transaction: PgTransaction, now: Date) => Promise<string>,
  ) {
    try {
      return await this.#transactions.execute(async (transaction) => {
        const now = this.clock.now();
        const recordId = this.uuids.generate();
        const inserted = await transaction.query(
          `INSERT INTO idempotency_records(
            idempotency_record_id,scope,idempotency_key,fingerprint,status,attempts,
            processing_started_at,created_at,updated_at
          ) VALUES($1,$2,$3,$4,'PROCESSING',1,$5,$5,$5)
          ON CONFLICT(scope,idempotency_key) DO NOTHING`,
          [recordId, IDEMPOTENCY_SCOPE, input.idempotencyKey, input.requestFingerprint, now],
        );
        if (inserted.rowCount === 0) {
          const existing = await transaction.query<IdempotencyRow>(
            `SELECT fingerprint,result_reference,status FROM idempotency_records
              WHERE scope=$1 AND idempotency_key=$2 FOR UPDATE`,
            [IDEMPOTENCY_SCOPE, input.idempotencyKey],
          );
          const row = existing.rows[0];
          if (row === undefined || row.fingerprint !== input.requestFingerprint) {
            throw conflict('SYSTEM_CONFIGURATION_IDEMPOTENCY_CONFLICT');
          }
          if (row.status !== 'COMPLETED' || row.result_reference === null) {
            throw conflict('SYSTEM_CONFIGURATION_IDEMPOTENCY_IN_PROGRESS');
          }
          return { replayed: true, systemConfigurationId: row.result_reference };
        }
        const id = await operation(transaction, now);
        await transaction.query(
          `UPDATE idempotency_records SET status='COMPLETED',result_reference=$2,
            completed_at=$3,source_type='SYSTEM_CONFIGURATION',source_id=$2,updated_at=$3
            WHERE idempotency_record_id=$1`,
          [recordId, id, now],
        );
        return { replayed: false, systemConfigurationId: id };
      });
    } catch (error) {
      if (error instanceof SystemConfigurationError) throw error;
      throw mapPostgresError(error);
    }
  }

  private async audit(
    transaction: PgTransaction,
    context: ExecutionContext,
    action: string,
    resourceId: string,
    reason: string,
    now: Date,
  ) {
    await transaction.query(
      `INSERT INTO audit_entries(
        audit_entry_id,actor_id,actor_type,action,resource_type,resource_id,result,reason,
        correlation_id,causation_id,idempotency_key,occurred_at
      ) VALUES($1,$2,$3,$4,'SYSTEM_CONFIGURATION',$5,'SUCCESS',$6,$7,$8,$9,$10)`,
      [
        this.uuids.generate(),
        context.actorId ?? null,
        context.actorType,
        action,
        resourceId,
        reason,
        context.correlationId,
        context.causationId ?? null,
        context.idempotencyKey ?? null,
        now,
      ],
    );
  }
}

async function lockScope(transaction: PgTransaction, key: ConfigurationKey): Promise<void> {
  await transaction.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('SYSTEM_CONFIGURATION:GLOBAL:' || $1,0))`,
    [key],
  );
}

async function configurationIdentity(transaction: PgTransaction, id: string) {
  const result = await transaction.query<{ configuration_key: ConfigurationKey }>(
    `SELECT configuration_key FROM system_configurations WHERE system_configuration_id=$1`,
    [id],
  );
  const row = result.rows[0];
  if (row === undefined) throw notFound();
  return row;
}

async function lockConfiguration(
  transaction: PgTransaction,
  id: string,
): Promise<SystemConfigurationRow> {
  const result = await transaction.query<SystemConfigurationRow>(
    `SELECT * FROM system_configurations WHERE system_configuration_id=$1 FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  if (row === undefined) throw notFound();
  return row;
}

async function validateReferenceForActivation(
  transaction: PgTransaction,
  row: SystemConfigurationRow,
): Promise<void> {
  if (row.configuration_key !== 'PICKUP_BRANCH_ID') return;
  const result = await transaction.query(
    `SELECT 1 FROM branches WHERE branch_id=$1 AND state='ACTIVE'`,
    [row.reference_id],
  );
  if (result.rowCount !== 1) {
    throw conflict('SYSTEM_CONFIGURATION_REFERENCE_NOT_ACTIVE');
  }
}

function valueColumns(value: SystemConfigurationValue, key: ConfigurationKey) {
  if (typeof value === 'number') {
    return {
      booleanValue: null,
      integerValue: value,
      referenceId: null,
      textValue: null,
      valueType: 'INTEGER' as const,
    };
  }
  if (typeof value === 'boolean') {
    return {
      booleanValue: value,
      integerValue: null,
      referenceId: null,
      textValue: null,
      valueType: 'BOOLEAN' as const,
    };
  }
  if (key === 'WEB_APPEARANCE_LAYOUT') {
    return {
      booleanValue: null,
      integerValue: null,
      referenceId: null,
      textValue: value,
      valueType: 'TEXT' as const,
    };
  }
  return {
    booleanValue: null,
    integerValue: null,
    referenceId: value,
    textValue: null,
    valueType: 'REFERENCE' as const,
  };
}

function mapConfiguration(row: SystemConfigurationRow): SystemConfigurationView {
  let value: SystemConfigurationValue;
  if (row.value_type === 'INTEGER') value = safeInteger(row.integer_value);
  else if (row.value_type === 'REFERENCE' && row.reference_id !== null) value = row.reference_id;
  else if (row.value_type === 'TEXT' && row.text_value !== null) value = row.text_value;
  else throw new Error('System configuration row contains an unsupported value type.');
  return {
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    branchId: row.branch_id,
    configurationKey: row.configuration_key,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    retiredAt: row.retired_at,
    retiredBy: row.retired_by,
    scope: 'GLOBAL',
    state: row.state,
    systemConfigurationId: row.system_configuration_id,
    value,
    valueType: row.value_type,
    versionNumber: safeInteger(row.version_number),
  };
}

function safeInteger(value: string | null): number {
  if (value === null) throw new Error('System configuration integer is missing.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('System configuration integer is unsafe.');
  return parsed;
}

function requiredActor(context: ExecutionContext): string {
  if (context.actorId === undefined) {
    throw new SystemConfigurationError(
      'SYSTEM_CONFIGURATION_ACCESS_DENIED',
      'VALIDATION',
      'Access is not available.',
    );
  }
  return context.actorId;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected PostgreSQL result row.');
  return value;
}

function notFound(): SystemConfigurationError {
  return new SystemConfigurationError(
    'SYSTEM_CONFIGURATION_NOT_FOUND',
    'NOT_FOUND',
    'System configuration was not found.',
  );
}

function conflict(code: string): SystemConfigurationError {
  return new SystemConfigurationError(code, 'CONFLICT', 'System configuration conflict.');
}

function validation(code: string): SystemConfigurationError {
  return new SystemConfigurationError(code, 'VALIDATION', 'System configuration is invalid.');
}

function mapPostgresError(error: unknown): SystemConfigurationError {
  const code = postgresCode(error);
  if (code === '23505' || code === '55000') return conflict('SYSTEM_CONFIGURATION_STATE_CONFLICT');
  if (code === '23514' || code === '23503') return validation('SYSTEM_CONFIGURATION_VALUE_INVALID');
  return new SystemConfigurationError(
    'SYSTEM_CONFIGURATION_DEPENDENCY_FAILURE',
    'INFRASTRUCTURE',
    'System configuration persistence failed.',
    { cause: error },
  );
}

function postgresCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null;
}

interface IdempotencyRow extends QueryResultRow {
  readonly fingerprint: string;
  readonly result_reference: string | null;
  readonly status: string;
}

interface SystemConfigurationRow extends QueryResultRow {
  readonly activated_at: Date | null;
  readonly activated_by: string | null;
  readonly boolean_value: boolean | null;
  readonly branch_id: string | null;
  readonly configuration_key: ConfigurationKey;
  readonly correlation_id: string;
  readonly created_at: Date;
  readonly created_by: string;
  readonly integer_value: string | null;
  readonly reference_id: string | null;
  readonly retired_at: Date | null;
  readonly retired_by: string | null;
  readonly scope: 'GLOBAL';
  readonly state: SystemConfigurationState;
  readonly system_configuration_id: string;
  readonly text_value: string | null;
  readonly value_type: 'INTEGER' | 'REFERENCE' | 'TEXT';
  readonly version_number: string;
}
