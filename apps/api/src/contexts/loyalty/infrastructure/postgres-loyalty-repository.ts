import type { LoyaltyConfigurationState, LoyaltyMovementType } from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  LoyaltyAccountView,
  LoyaltyConfigurationView,
  LoyaltyMovementView,
  LoyaltyRepository,
} from '../application/ports.js';
import { assertAdminCorrection, LoyaltyError } from '../domain/loyalty.js';

export class PgLoyaltyRepository implements LoyaltyRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async findAccount(accountId: string): Promise<LoyaltyAccountView | null> {
    const result = await this.pool.query<LoyaltyAccountRow>(
      `SELECT * FROM loyalty_accounts WHERE account_id=$1`,
      [accountId],
    );
    return result.rows[0] === undefined ? null : mapAccount(result.rows[0]);
  }

  async findConfiguration(id: string): Promise<LoyaltyConfigurationView | null> {
    const result = await this.pool.query<LoyaltyConfigurationRow>(
      `SELECT * FROM loyalty_configurations WHERE loyalty_configuration_id=$1`,
      [id],
    );
    return result.rows[0] === undefined ? null : mapConfiguration(result.rows[0]);
  }

  async findActiveConfiguration(branchId: string): Promise<LoyaltyConfigurationView | null> {
    const result = await this.pool.query<LoyaltyConfigurationRow>(
      `SELECT * FROM loyalty_configurations WHERE branch_id=$1 AND state='ACTIVE'`,
      [branchId],
    );
    return result.rows[0] === undefined ? null : mapConfiguration(result.rows[0]);
  }

  async listConfigurations(input: Parameters<LoyaltyRepository['listConfigurations']>[0]) {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (input.branchId !== undefined) {
      values.push(input.branchId);
      clauses.push(`branch_id=$${values.length}::uuid`);
    }
    if (input.state !== undefined) {
      values.push(input.state);
      clauses.push(`state=$${values.length}`);
    }
    if (input.cursor !== undefined) {
      values.push(input.cursor.createdAt, input.cursor.id);
      clauses.push(
        `(created_at,loyalty_configuration_id)<($${values.length - 1},$${values.length}::uuid)`,
      );
    }
    values.push(input.limit + 1);
    const result = await this.pool.query<LoyaltyConfigurationRow>(
      `SELECT * FROM loyalty_configurations${clauses.length === 0 ? '' : ` WHERE ${clauses.join(' AND ')}`}
       ORDER BY created_at DESC,loyalty_configuration_id DESC LIMIT $${values.length}`,
      values,
    );
    return {
      hasMore: result.rows.length > input.limit,
      items: result.rows.slice(0, input.limit).map(mapConfiguration),
    };
  }

  async listMovements(input: Parameters<LoyaltyRepository['listMovements']>[0]) {
    const values: unknown[] = [input.accountId];
    let cursor = '';
    if (input.cursor !== undefined) {
      values.push(input.cursor.occurredAt, input.cursor.movementId);
      cursor = `AND (m.occurred_at,m.movement_id)<($2,$3::uuid)`;
    }
    values.push(input.limit + 1);
    const result = await this.pool.query<LoyaltyMovementRow>(
      `SELECT m.* FROM loyalty_movements m
       JOIN loyalty_accounts a ON a.loyalty_account_id=m.loyalty_account_id
       WHERE a.account_id=$1 ${cursor}
       ORDER BY m.occurred_at DESC,m.movement_id DESC LIMIT $${values.length}`,
      values,
    );
    return {
      hasMore: result.rows.length > input.limit,
      items: result.rows.slice(0, input.limit).map(mapMovement),
    };
  }

  async createConfiguration(input: Parameters<LoyaltyRepository['createConfiguration']>[0]) {
    return this.idempotent(
      'LOYALTY_CONFIGURATION_CREATE',
      input,
      async (transaction, now) => {
        await lockBranch(transaction, input.configuration.branchId);
        const version = await transaction.query<{ next_version: string }>(
          `SELECT (COALESCE(max(version_number),0)+1)::text next_version
           FROM loyalty_configurations WHERE branch_id=$1`,
          [input.configuration.branchId],
        );
        const id = this.uuids.generate();
        const actor = requiredActor(input.context);
        const configuration = input.configuration;
        await transaction.query(
          `INSERT INTO loyalty_configurations (
          loyalty_configuration_id,branch_id,version_number,earn_clp_per_point,
          redeem_clp_per_point,minimum_redeem_points,maximum_redeem_basis_points,
          state,created_by,created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9)`,
          [
            id,
            configuration.branchId,
            required(version.rows[0]).next_version,
            configuration.earnClpPerPoint,
            configuration.redeemClpPerPoint,
            configuration.minimumRedeemPoints,
            configuration.maximumRedeemBasisPoints,
            actor,
            now,
          ],
        );
        await this.audit(
          transaction,
          input.context,
          'LOYALTY_CONFIGURATION_CREATED',
          'LOYALTY_CONFIGURATION',
          id,
        );
        return id;
      },
      (id, replayed) => ({ loyaltyConfigurationId: id, replayed }),
    );
  }

  async updateConfiguration(input: Parameters<LoyaltyRepository['updateConfiguration']>[0]) {
    return this.idempotent(
      'LOYALTY_CONFIGURATION_EDIT',
      input,
      async (transaction) => {
        const current = await lockConfiguration(transaction, input.loyaltyConfigurationId);
        if (current.state !== 'DRAFT') throw conflict('LOYALTY_CONFIGURATION_IMMUTABLE');
        const configuration = input.configuration;
        await transaction.query(
          `UPDATE loyalty_configurations SET earn_clp_per_point=$2,redeem_clp_per_point=$3,
          minimum_redeem_points=$4,maximum_redeem_basis_points=$5
         WHERE loyalty_configuration_id=$1`,
          [
            input.loyaltyConfigurationId,
            configuration.earnClpPerPoint,
            configuration.redeemClpPerPoint,
            configuration.minimumRedeemPoints,
            configuration.maximumRedeemBasisPoints,
          ],
        );
        await this.audit(
          transaction,
          input.context,
          'LOYALTY_CONFIGURATION_EDITED',
          'LOYALTY_CONFIGURATION',
          input.loyaltyConfigurationId,
        );
        return input.loyaltyConfigurationId;
      },
      (id, replayed) => ({ loyaltyConfigurationId: id, replayed }),
    );
  }

  async activateConfiguration(input: Parameters<LoyaltyRepository['activateConfiguration']>[0]) {
    return this.idempotent(
      'LOYALTY_CONFIGURATION_ACTIVATE',
      input,
      async (transaction, now) => {
        const target = await lockConfiguration(transaction, input.loyaltyConfigurationId);
        if (target.state !== 'DRAFT') throw conflict('LOYALTY_CONFIGURATION_TRANSITION_INVALID');
        await lockBranch(transaction, target.branch_id);
        const actor = requiredActor(input.context);
        await transaction.query(
          `UPDATE loyalty_configurations SET state='RETIRED',retired_by=$2,retired_at=$3
          WHERE branch_id=$1 AND state='ACTIVE'`,
          [target.branch_id, actor, now],
        );
        await transaction.query(
          `UPDATE loyalty_configurations SET state='ACTIVE',activated_by=$2,activated_at=$3
          WHERE loyalty_configuration_id=$1`,
          [input.loyaltyConfigurationId, actor, now],
        );
        await this.audit(
          transaction,
          input.context,
          'LOYALTY_CONFIGURATION_ACTIVATED',
          'LOYALTY_CONFIGURATION',
          input.loyaltyConfigurationId,
        );
        return input.loyaltyConfigurationId;
      },
      (id, replayed) => ({ loyaltyConfigurationId: id, replayed }),
    );
  }

  async applyAdminCorrection(input: Parameters<LoyaltyRepository['applyAdminCorrection']>[0]) {
    return this.idempotent(
      'LOYALTY_ADMIN_CORRECTION',
      input,
      async (transaction, now) => {
        const account = await transaction.query<LoyaltyAccountRow>(
          `SELECT * FROM loyalty_accounts WHERE account_id=$1 FOR UPDATE`,
          [input.accountId],
        );
        const row = account.rows[0];
        if (row === undefined) throw notFound('LOYALTY_ACCOUNT_NOT_FOUND');
        const nextBalance = assertAdminCorrection(integer(row.balance), input.pointsSigned);
        const movementId = this.uuids.generate();
        await transaction.query(
          `UPDATE loyalty_accounts SET balance=$2,version=version+1,updated_at=$3
          WHERE loyalty_account_id=$1`,
          [row.loyalty_account_id, nextBalance, now],
        );
        await transaction.query(
          `INSERT INTO loyalty_movements (
          movement_id,loyalty_account_id,type,points_signed,source_type,source_id,
          actor_id,reason,balance_after,idempotency_key,occurred_at
        ) VALUES ($1,$2,'ADMIN_CORRECTION',$3,'ADMIN_CORRECTION',$1,$4,$5,$6,$7,$8)`,
          [
            movementId,
            row.loyalty_account_id,
            input.pointsSigned,
            requiredActor(input.context),
            input.reason,
            nextBalance,
            input.idempotencyKey,
            now,
          ],
        );
        await this.audit(
          transaction,
          input.context,
          'LOYALTY_ADMIN_CORRECTION',
          'LOYALTY_MOVEMENT',
          movementId,
          input.reason,
        );
        return movementId;
      },
      (movementId, replayed) => ({ movementId, replayed }),
    );
  }

  private async idempotent<Result>(
    scope: string,
    input: {
      readonly context: ExecutionContext;
      readonly idempotencyKey: string;
      readonly requestFingerprint: string;
    },
    operation: (transaction: PgTransaction, now: Date) => Promise<string>,
    map: (reference: string, replayed: boolean) => Result,
  ): Promise<Result> {
    try {
      return await this.#transactions.execute(async (transaction) => {
        const now = this.clock.now();
        const recordId = this.uuids.generate();
        const inserted = await transaction.query(
          `INSERT INTO idempotency_records (
            idempotency_record_id,scope,idempotency_key,fingerprint,status,attempts,
            processing_started_at,created_at,updated_at
          ) VALUES ($1,$2,$3,$4,'PROCESSING',1,$5,$5,$5)
          ON CONFLICT (scope,idempotency_key) DO NOTHING`,
          [recordId, scope, input.idempotencyKey, input.requestFingerprint, now],
        );
        if (inserted.rowCount === 0) {
          const existing = await transaction.query<{
            fingerprint: string;
            result_reference: string | null;
            status: string;
          }>(
            `SELECT fingerprint,result_reference,status FROM idempotency_records
              WHERE scope=$1 AND idempotency_key=$2 FOR UPDATE`,
            [scope, input.idempotencyKey],
          );
          const row = existing.rows[0];
          if (row === undefined || row.fingerprint !== input.requestFingerprint)
            throw conflict('LOYALTY_IDEMPOTENCY_CONFLICT');
          if (row.status === 'COMPLETED' && row.result_reference !== null)
            return map(row.result_reference, true);
          throw conflict('LOYALTY_IDEMPOTENCY_IN_PROGRESS');
        }
        const reference = await operation(transaction, now);
        await transaction.query(
          `UPDATE idempotency_records SET status='COMPLETED',result_reference=$2,
            completed_at=$3,source_type=$4,source_id=$2,updated_at=$3
            WHERE idempotency_record_id=$1`,
          [recordId, reference, now, scope],
        );
        return map(reference, false);
      });
    } catch (error) {
      if (error instanceof LoyaltyError) throw error;
      throw mapPostgresError(error);
    }
  }

  private async audit(
    transaction: PgTransaction,
    context: ExecutionContext,
    action: string,
    resourceType: string,
    resourceId: string,
    reason?: string,
  ) {
    await transaction.query(
      `INSERT INTO audit_entries (
        audit_entry_id,actor_id,actor_type,action,resource_type,resource_id,result,
        reason,correlation_id,causation_id,idempotency_key,occurred_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'SUCCESS',$7,$8,$9,$10,$11)`,
      [
        this.uuids.generate(),
        context.actorId ?? null,
        context.actorType,
        action,
        resourceType,
        resourceId,
        reason ?? null,
        context.correlationId,
        context.causationId ?? null,
        context.idempotencyKey ?? null,
        this.clock.now(),
      ],
    );
  }
}

async function lockBranch(transaction: PgTransaction, branchId: string): Promise<void> {
  await transaction.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('LOYALTY_CONFIGURATION:' || $1::text,0))`,
    [branchId],
  );
  const result = await transaction.query(
    `SELECT branch_id FROM branches WHERE branch_id=$1 FOR UPDATE`,
    [branchId],
  );
  if (result.rowCount !== 1) throw notFound('LOYALTY_BRANCH_NOT_FOUND');
}
async function lockConfiguration(
  transaction: PgTransaction,
  id: string,
): Promise<LoyaltyConfigurationRow> {
  const result = await transaction.query<LoyaltyConfigurationRow>(
    `SELECT * FROM loyalty_configurations WHERE loyalty_configuration_id=$1 FOR UPDATE`,
    [id],
  );
  if (result.rows[0] === undefined) throw notFound('LOYALTY_CONFIGURATION_NOT_FOUND');
  return result.rows[0];
}

interface LoyaltyAccountRow extends QueryResultRow {
  readonly account_id: string;
  readonly balance: string;
  readonly created_at: Date;
  readonly loyalty_account_id: string;
  readonly reserved_points: string;
  readonly updated_at: Date;
  readonly version: string;
}
interface LoyaltyConfigurationRow extends QueryResultRow {
  readonly activated_at: Date | null;
  readonly activated_by: string | null;
  readonly branch_id: string;
  readonly created_at: Date;
  readonly created_by: string;
  readonly earn_clp_per_point: string;
  readonly loyalty_configuration_id: string;
  readonly maximum_redeem_basis_points: number | null;
  readonly minimum_redeem_points: string;
  readonly redeem_clp_per_point: string;
  readonly retired_at: Date | null;
  readonly retired_by: string | null;
  readonly state: LoyaltyConfigurationState;
  readonly version_number: string;
}
interface LoyaltyMovementRow extends QueryResultRow {
  readonly actor_id: string | null;
  readonly balance_after: string;
  readonly earn_clp_per_point_snapshot: string | null;
  readonly idempotency_key: string;
  readonly loyalty_account_id: string;
  readonly loyalty_configuration_id: string | null;
  readonly loyalty_eligible_amount_snapshot: string | null;
  readonly movement_id: string;
  readonly occurred_at: Date;
  readonly points_signed: string;
  readonly reason: string | null;
  readonly redeem_clp_per_point_snapshot: string | null;
  readonly source_id: string;
  readonly source_type: string;
  readonly type: LoyaltyMovementType;
}

function mapAccount(row: LoyaltyAccountRow): LoyaltyAccountView {
  return {
    accountId: row.account_id,
    balance: integer(row.balance),
    createdAt: row.created_at,
    loyaltyAccountId: row.loyalty_account_id,
    reservedPoints: nonnegative(row.reserved_points),
    updatedAt: row.updated_at,
    version: positive(row.version),
  };
}
function mapConfiguration(row: LoyaltyConfigurationRow): LoyaltyConfigurationView {
  return {
    activatedAt: row.activated_at,
    activatedBy: row.activated_by,
    branchId: row.branch_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    earnClpPerPoint: positive(row.earn_clp_per_point),
    loyaltyConfigurationId: row.loyalty_configuration_id,
    maximumRedeemBasisPoints: row.maximum_redeem_basis_points,
    minimumRedeemPoints: nonnegative(row.minimum_redeem_points),
    redeemClpPerPoint: positive(row.redeem_clp_per_point),
    retiredAt: row.retired_at,
    retiredBy: row.retired_by,
    state: row.state,
    versionNumber: positive(row.version_number),
  };
}
function mapMovement(row: LoyaltyMovementRow): LoyaltyMovementView {
  return {
    actorId: row.actor_id,
    balanceAfter: integer(row.balance_after),
    earnClpPerPointSnapshot: nullableInteger(row.earn_clp_per_point_snapshot),
    idempotencyKey: row.idempotency_key,
    loyaltyAccountId: row.loyalty_account_id,
    loyaltyConfigurationId: row.loyalty_configuration_id,
    loyaltyEligibleAmountSnapshot: nullableInteger(row.loyalty_eligible_amount_snapshot),
    movementId: row.movement_id,
    occurredAt: row.occurred_at,
    pointsSigned: integer(row.points_signed),
    reason: row.reason,
    redeemClpPerPointSnapshot: nullableInteger(row.redeem_clp_per_point_snapshot),
    sourceId: row.source_id,
    sourceType: row.source_type,
    type: row.type,
  };
}
function integer(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('Loyalty integer is outside the safe range.');
  return parsed;
}
function nonnegative(value: string): number {
  const parsed = integer(value);
  if (parsed < 0) throw new Error('Loyalty value must be nonnegative.');
  return parsed;
}
function positive(value: string): number {
  const parsed = nonnegative(value);
  if (parsed === 0) throw new Error('Loyalty value must be positive.');
  return parsed;
}
function nullableInteger(value: string | null): number | null {
  return value === null ? null : integer(value);
}
function requiredActor(context: ExecutionContext): string {
  if (context.actorId === undefined)
    throw new LoyaltyError('LOYALTY_ACCESS_DENIED', 'VALIDATION', 'Actor is required.');
  return context.actorId;
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected row was not returned.');
  return value;
}
function conflict(code: string): LoyaltyError {
  return new LoyaltyError(code, 'CONFLICT', 'Loyalty state conflicts with the request.');
}
function notFound(code: string): LoyaltyError {
  return new LoyaltyError(code, 'NOT_FOUND', 'Loyalty resource was not found.');
}
function mapPostgresError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('code' in error)) return error;
  const code = String(error.code);
  if (code === '23505' || code === '23514') return conflict('LOYALTY_INVARIANT_CONFLICT');
  if (code === '23503') return notFound('LOYALTY_REFERENCE_NOT_FOUND');
  return error;
}
