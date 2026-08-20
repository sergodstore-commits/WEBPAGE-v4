import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  InventoryMovementView,
  InventoryPositionView,
  InventoryRepository,
} from '../application/ports.js';
import {
  InventoryError,
  inventoryProjection,
  type RegularInventoryMovementType,
} from '../domain/inventory.js';

export class PgInventoryRepository implements InventoryRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async findPosition(productId: string): Promise<InventoryPositionView | null> {
    const result = await this.pool.query<PositionRow>(positionQuery(false), [productId]);
    const row = result.rows[0];
    if (row === undefined) return null;
    return mapPosition(row);
  }

  async listMovements(input: Parameters<InventoryRepository['listMovements']>[0]) {
    const parameters: unknown[] = [input.productId];
    let cursorClause = '';
    if (input.cursor !== undefined) {
      parameters.push(input.cursor.occurredAt, input.cursor.movementId);
      cursorClause = `AND (m.occurred_at, m.movement_id) < ($2, $3::uuid)`;
    }
    parameters.push(input.limit + 1);
    const result = await this.pool.query<MovementRow>(
      `SELECT m.movement_id, m.inventory_position_id, m.movement_type, m.quantity,
              m.source_type, m.source_id, m.actor_id, m.reason, m.reference,
              m.idempotency_key, m.correlation_id, m.occurred_at
         FROM inventory_movements m
         JOIN inventory_positions ip ON ip.inventory_position_id = m.inventory_position_id
        WHERE ip.product_id = $1::uuid ${cursorClause}
        ORDER BY m.occurred_at DESC, m.movement_id DESC
        LIMIT $${parameters.length}`,
      parameters,
    );
    return {
      hasMore: result.rows.length > input.limit,
      items: result.rows.slice(0, input.limit).map(mapMovement),
    };
  }

  async applyRegularMovement(input: Parameters<InventoryRepository['applyRegularMovement']>[0]) {
    return this.idempotent('INVENTORY_REGULAR_MUTATION', input, async (transaction, now) => {
      const positionResult = await transaction.query<LockedPositionRow>(positionQuery(true), [
        input.productId,
      ]);
      const position = positionResult.rows[0];
      if (position === undefined) {
        throw new InventoryError(
          'INVENTORY_POSITION_NOT_FOUND',
          'NOT_FOUND',
          'Inventory position was not found.',
        );
      }
      if (position.sale_type !== 'REGULAR') {
        throw new InventoryError(
          'INVENTORY_REGULAR_OPERATION_NOT_ALLOWED',
          'CONFLICT',
          'Regular inventory operations require a REGULAR product.',
        );
      }
      if (input.movementType === 'STOCK_ENTRY' && position.publication_status === 'ARCHIVED') {
        throw new InventoryError(
          'INVENTORY_ARCHIVED_STOCK_ENTRY_NOT_ALLOWED',
          'CONFLICT',
          'Archived products do not accept discretionary stock entries.',
        );
      }

      const currentOnHand = safeNonnegativeInteger(position.on_hand, 'on_hand');
      const reserved = safeNonnegativeInteger(position.reserved, 'reserved');
      const nextOnHand =
        input.movementType === 'NEGATIVE_ADJUSTMENT'
          ? currentOnHand - input.quantity
          : currentOnHand + input.quantity;
      if (!Number.isSafeInteger(nextOnHand) || nextOnHand < reserved) {
        throw new InventoryError(
          'INVENTORY_INSUFFICIENT_AVAILABLE',
          'CONFLICT',
          'The requested movement would violate current inventory availability.',
        );
      }

      await transaction.query(
        `UPDATE inventory_positions
              SET on_hand = $2, version = version + 1, updated_at = $3
            WHERE inventory_position_id = $1`,
        [position.inventory_position_id, nextOnHand, now],
      );
      const movementId = this.uuids.generate();
      await transaction.query(
        `INSERT INTO inventory_movements (
             movement_id, inventory_position_id, movement_type, quantity, source_type,
             source_id, actor_id, reason, reference, idempotency_key, correlation_id, occurred_at
           ) VALUES ($1, $2, $3, $4, $5, $1::uuid::text, $6, $7, $8, $9, $10, $11)`,
        [
          movementId,
          position.inventory_position_id,
          input.movementType,
          input.quantity,
          input.movementType === 'STOCK_ENTRY' ? 'MANUAL_STOCK_ENTRY' : 'INVENTORY_ADJUSTMENT',
          requiredActor(input.context),
          input.reason,
          input.reference,
          input.idempotencyKey,
          input.context.correlationId,
          now,
        ],
      );
      await this.audit(transaction, input.context, input.movementType, movementId, input.reason);
      return movementId;
    });
  }

  async setThresholdOverride(input: Parameters<InventoryRepository['setThresholdOverride']>[0]) {
    const result = await this.idempotent(
      'INVENTORY_THRESHOLD_OVERRIDE',
      input,
      async (transaction, now) => {
        const locked = await transaction.query<LockedPositionRow>(positionQuery(true), [
          input.productId,
        ]);
        const position = locked.rows[0];
        if (position === undefined) {
          throw new InventoryError(
            'INVENTORY_POSITION_NOT_FOUND',
            'NOT_FOUND',
            'Inventory position was not found.',
          );
        }
        await transaction.query(
          `UPDATE inventory_positions
              SET low_stock_threshold_override = $2, version = version + 1, updated_at = $3
            WHERE inventory_position_id = $1`,
          [position.inventory_position_id, input.lowStockThresholdOverride, now],
        );
        await this.audit(
          transaction,
          input.context,
          'LOW_STOCK_THRESHOLD_OVERRIDE_CHANGED',
          position.inventory_position_id,
        );
        return position.inventory_position_id;
      },
    );
    return { replayed: result.replayed };
  }

  private async idempotent(
    scope: string,
    input: {
      readonly context: ExecutionContext;
      readonly idempotencyKey: string;
      readonly requestFingerprint: string;
    },
    operation: (transaction: PgTransaction, now: Date) => Promise<string>,
  ): Promise<{ readonly movementId: string; readonly replayed: boolean }> {
    try {
      return await this.#transactions.execute(async (transaction) => {
        const now = this.clock.now();
        const recordId = this.uuids.generate();
        const inserted = await transaction.query(
          `INSERT INTO idempotency_records (
             idempotency_record_id, scope, idempotency_key, fingerprint, status, attempts,
             processing_started_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 'PROCESSING', 1, $5, $5, $5)
           ON CONFLICT (scope, idempotency_key) DO NOTHING`,
          [recordId, scope, input.idempotencyKey, input.requestFingerprint, now],
        );
        if (inserted.rowCount === 0) {
          const existing = await transaction.query<{
            fingerprint: string;
            result_reference: string | null;
            status: string;
          }>(
            `SELECT fingerprint, result_reference, status FROM idempotency_records
              WHERE scope = $1 AND idempotency_key = $2 FOR UPDATE`,
            [scope, input.idempotencyKey],
          );
          const row = existing.rows[0];
          if (row === undefined || row.fingerprint !== input.requestFingerprint) {
            throw new InventoryError(
              'INVENTORY_IDEMPOTENCY_CONFLICT',
              'CONFLICT',
              'Idempotency key was reused with incompatible input.',
            );
          }
          if (row.status === 'COMPLETED' && row.result_reference !== null) {
            return { movementId: row.result_reference, replayed: true };
          }
          throw new InventoryError(
            'INVENTORY_IDEMPOTENCY_IN_PROGRESS',
            'CONFLICT',
            'Inventory command with this idempotency key is still in progress.',
          );
        }
        const reference = await operation(transaction, now);
        await transaction.query(
          `UPDATE idempotency_records
              SET status = 'COMPLETED', result_reference = $2, completed_at = $3,
                  source_type = $4, source_id = $2, updated_at = $3
            WHERE idempotency_record_id = $1`,
          [recordId, reference, now, scope],
        );
        return { movementId: reference, replayed: false };
      });
    } catch (error) {
      if (error instanceof InventoryError) throw error;
      throw mapPostgresError(error);
    }
  }

  private async audit(
    transaction: PgTransaction,
    context: ExecutionContext,
    action: string,
    resourceId: string,
    reason?: string | null,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO audit_entries (
         audit_entry_id, actor_id, actor_type, action, resource_type, resource_id,
         result, reason, correlation_id, causation_id, idempotency_key, occurred_at
       ) VALUES ($1, $2, $3, $4, 'INVENTORY', $5, 'SUCCESS', $6, $7, $8, $9, $10)`,
      [
        this.uuids.generate(),
        context.actorId ?? null,
        context.actorType,
        `INVENTORY_${action}`,
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

interface PositionRow extends QueryResultRow {
  readonly branch_id: string;
  readonly default_threshold: string | null;
  readonly inventory_position_id: string;
  readonly low_stock_threshold_override: string | null;
  readonly on_hand: string;
  readonly product_id: string;
  readonly reserved: string;
  readonly updated_at: Date;
  readonly version: string;
}

interface LockedPositionRow extends PositionRow {
  readonly publication_status: string;
  readonly sale_type: 'PREORDER' | 'REGULAR';
}

interface MovementRow extends QueryResultRow {
  readonly actor_id: string | null;
  readonly correlation_id: string;
  readonly idempotency_key: string;
  readonly inventory_position_id: string;
  readonly movement_id: string;
  readonly movement_type: RegularInventoryMovementType;
  readonly occurred_at: Date;
  readonly quantity: string;
  readonly reason: string | null;
  readonly reference: string | null;
  readonly source_id: string;
  readonly source_type: string;
}

function positionQuery(lock: boolean): string {
  return `SELECT ip.inventory_position_id, ip.product_id, ip.branch_id, ip.on_hand,
                 ip.reserved, ip.low_stock_threshold_override, ip.version, ip.updated_at,
                 p.sale_type, p.publication_status,
                 config.integer_value AS default_threshold
            FROM inventory_positions ip
            JOIN products p ON p.product_id = ip.product_id
            LEFT JOIN system_configurations config
              ON config.configuration_key = 'DEFAULT_LOW_STOCK_THRESHOLD'
             AND config.scope = 'GLOBAL' AND config.state = 'ACTIVE'
           WHERE ip.product_id = $1::uuid${lock ? ' FOR UPDATE OF ip' : ''}`;
}

function mapPosition(row: PositionRow): InventoryPositionView {
  if (row.default_threshold === null) {
    throw new InventoryError(
      'INVENTORY_DEFAULT_THRESHOLD_REQUIRED',
      'INFRASTRUCTURE',
      'The required global low-stock threshold is not configured.',
    );
  }
  const onHand = safeNonnegativeInteger(row.on_hand, 'on_hand');
  const reserved = safeNonnegativeInteger(row.reserved, 'reserved');
  const override =
    row.low_stock_threshold_override === null
      ? null
      : safeNonnegativeInteger(row.low_stock_threshold_override, 'low_stock_threshold_override');
  const projection = inventoryProjection({
    defaultThreshold: safeNonnegativeInteger(row.default_threshold, 'default_threshold'),
    onHand,
    override,
    reserved,
  });
  return {
    ...projection,
    branchId: row.branch_id,
    inventoryPositionId: row.inventory_position_id,
    lowStockThresholdOverride: override,
    onHand,
    productId: row.product_id,
    reserved,
    updatedAt: row.updated_at,
    version: safePositiveInteger(row.version, 'version'),
  };
}

function mapMovement(row: MovementRow): InventoryMovementView {
  return {
    actorId: row.actor_id,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    inventoryPositionId: row.inventory_position_id,
    movementId: row.movement_id,
    movementType: row.movement_type,
    occurredAt: row.occurred_at,
    quantity: safePositiveInteger(row.quantity, 'quantity'),
    reason: row.reason,
    reference: row.reference,
    sourceId: row.source_id,
    sourceType: row.source_type,
  };
}

function safeNonnegativeInteger(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Inventory ${field} is outside the supported integer range.`);
  }
  return parsed;
}

function safePositiveInteger(value: string, field: string): number {
  const parsed = safeNonnegativeInteger(value, field);
  if (parsed === 0) throw new Error(`Inventory ${field} must be positive.`);
  return parsed;
}

function requiredActor(context: ExecutionContext): string {
  if (context.actorId === undefined) {
    throw new InventoryError(
      'INVENTORY_ACCESS_DENIED',
      'VALIDATION',
      'Inventory actor is required.',
    );
  }
  return context.actorId;
}

function mapPostgresError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('code' in error)) return error;
  const code = String(error.code);
  if (code === '23505') {
    return new InventoryError(
      'INVENTORY_UNIQUE_CONFLICT',
      'CONFLICT',
      'Inventory uniqueness constraint was rejected.',
      { cause: error },
    );
  }
  if (code === '23503') {
    return new InventoryError(
      'INVENTORY_REFERENCE_NOT_FOUND',
      'NOT_FOUND',
      'Inventory reference was not found.',
      { cause: error },
    );
  }
  if (code === '23514') {
    return new InventoryError(
      'INVENTORY_INVARIANT_VIOLATION',
      'CONFLICT',
      'Inventory invariant was rejected.',
      { cause: error },
    );
  }
  return error;
}
