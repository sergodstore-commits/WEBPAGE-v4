import { createHash } from 'node:crypto';

import type { CouponState, PromotionConfiguration, PromotionState } from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  CouponDetail,
  PromotionDetail,
  PromotionPageCursor,
  PromotionsRepository,
} from '../application/ports.js';
import {
  assertPromotionEditable,
  nextCouponState,
  nextPromotionState,
  PromotionError,
} from '../domain/promotions.js';

interface PromotionRow extends QueryResultRow {
  readonly activated_at: Date | null;
  readonly activation_mode: PromotionConfiguration['activationMode'];
  readonly benefit_type: PromotionConfiguration['benefit']['type'];
  readonly branch_id: string | null;
  readonly buy_x_quantity: string | null;
  readonly channel: PromotionConfiguration['channel'];
  readonly created_at: Date;
  readonly ends_at: Date;
  readonly fixed_amount_clp: string | null;
  readonly fixed_price_clp: string | null;
  readonly get_y_quantity: string | null;
  readonly global_limit: string | null;
  readonly minimum_eligible_amount_clp: string | null;
  readonly minimum_eligible_quantity: string | null;
  readonly name: string;
  readonly per_account_limit: string | null;
  readonly percentage_basis_points: number | null;
  readonly priority: number;
  readonly promotion_id: string;
  readonly scope: PromotionConfiguration['scope'];
  readonly starts_at: Date;
  readonly state: PromotionState;
  readonly updated_at: Date;
}

interface CouponRow extends QueryResultRow {
  readonly coupon_id: string;
  readonly created_at: Date;
  readonly ends_at: Date | null;
  readonly global_limit: string | null;
  readonly normalized_code: string;
  readonly per_account_limit: string | null;
  readonly promotion_id: string;
  readonly starts_at: Date | null;
  readonly state: CouponState;
}

export class PgPromotionsRepository implements PromotionsRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async createPromotion(input: Parameters<PromotionsRepository['createPromotion']>[0]) {
    return this.idempotent(
      'PROMOTION_CREATE',
      input,
      async (transaction, now) => {
        const promotionId = this.uuids.generate();
        await this.insertPromotion(transaction, promotionId, input.configuration, now);
        await this.replaceChildren(transaction, promotionId, input.configuration);
        await this.audit(transaction, input.context, 'PROMOTION_CREATED', 'PROMOTION', promotionId);
        return promotionId;
      },
      (promotionId, replayed) => ({ promotionId, replayed }),
    );
  }

  async updatePromotion(input: Parameters<PromotionsRepository['updatePromotion']>[0]) {
    return this.idempotent(
      'PROMOTION_UPDATE',
      input,
      async (transaction, now) => {
        const current = await this.lockPromotion(transaction, input.promotionId);
        assertPromotionEditable(current.state, current.starts_at.toISOString(), now);
        if (
          current.state === 'SCHEDULED' &&
          new Date(input.configuration.startsAt).getTime() <= now.getTime()
        ) {
          throw conflict('PROMOTION_SCHEDULED_WINDOW_INVALID');
        }
        const benefit = benefitColumns(input.configuration);
        await transaction.query(
          `UPDATE promotions SET
           name=$2, activation_mode=$3, scope=$4, channel=$5, benefit_type=$6,
           percentage_basis_points=$7, fixed_amount_clp=$8, fixed_price_clp=$9,
           buy_x_quantity=$10, get_y_quantity=$11, branch_id=$12,
           minimum_eligible_quantity=$13, minimum_eligible_amount_clp=$14,
           global_limit=$15, per_account_limit=$16, starts_at=$17, ends_at=$18,
           priority=$19, updated_at=$20
         WHERE promotion_id=$1`,
          [
            input.promotionId,
            input.configuration.name,
            input.configuration.activationMode,
            input.configuration.scope,
            input.configuration.channel,
            input.configuration.benefit.type,
            benefit.percentage,
            benefit.fixedAmount,
            benefit.fixedPrice,
            benefit.buyX,
            benefit.getY,
            input.configuration.branchId,
            input.configuration.minimumEligibleQuantity,
            input.configuration.minimumEligibleAmountClp,
            input.configuration.globalLimit,
            input.configuration.perAccountLimit,
            input.configuration.startsAt,
            input.configuration.endsAt,
            input.configuration.priority,
            now,
          ],
        );
        await transaction.query(`DELETE FROM promotion_targets WHERE promotion_id=$1`, [
          input.promotionId,
        ]);
        await transaction.query(`DELETE FROM promotion_weekly_schedules WHERE promotion_id=$1`, [
          input.promotionId,
        ]);
        await this.replaceChildren(transaction, input.promotionId, input.configuration);
        await this.audit(
          transaction,
          input.context,
          'PROMOTION_UPDATED',
          'PROMOTION',
          input.promotionId,
        );
        return input.promotionId;
      },
      (promotionId, replayed) => ({ promotionId, replayed }),
    );
  }

  async transitionPromotion(input: Parameters<PromotionsRepository['transitionPromotion']>[0]) {
    return this.idempotent(
      'PROMOTION_TRANSITION',
      input,
      async (transaction, now) => {
        const current = await this.lockPromotion(transaction, input.promotionId);
        const next = nextPromotionState(
          current.state,
          input.nextState,
          current.starts_at.toISOString(),
          current.ends_at.toISOString(),
          now,
          input.source,
        );
        await transaction.query(
          `UPDATE promotions SET state=$2, updated_at=$3,
           activated_at=CASE WHEN $2='ACTIVE' THEN COALESCE(activated_at,$3) ELSE activated_at END
         WHERE promotion_id=$1`,
          [input.promotionId, next, now],
        );
        await this.audit(
          transaction,
          input.context,
          'PROMOTION_STATE_CHANGED',
          'PROMOTION',
          input.promotionId,
          `${current.state}->${next}`,
        );
        return input.promotionId;
      },
      (promotionId, replayed) => ({ promotionId, replayed }),
    );
  }

  async createCoupon(input: Parameters<PromotionsRepository['createCoupon']>[0]) {
    return this.idempotent(
      'COUPON_CREATE',
      input,
      async (transaction, now) => {
        await this.lockPromotion(transaction, input.coupon.promotionId);
        const couponId = this.uuids.generate();
        await transaction.query(
          `INSERT INTO coupons (
          coupon_id,promotion_id,normalized_code,state,starts_at,ends_at,
          global_limit,per_account_limit,created_at
        ) VALUES ($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8)`,
          [
            couponId,
            input.coupon.promotionId,
            input.coupon.normalizedCode,
            input.coupon.startsAt,
            input.coupon.endsAt,
            input.coupon.globalLimit,
            input.coupon.perAccountLimit,
            now,
          ],
        );
        await this.audit(transaction, input.context, 'COUPON_CREATED', 'COUPON', couponId);
        return couponId;
      },
      (couponId, replayed) => ({ couponId, replayed }),
    );
  }

  async transitionCoupon(input: Parameters<PromotionsRepository['transitionCoupon']>[0]) {
    return this.idempotent(
      'COUPON_TRANSITION',
      input,
      async (transaction, now) => {
        const result = await transaction.query<CouponRow>(
          `SELECT * FROM coupons WHERE coupon_id=$1 FOR UPDATE`,
          [input.couponId],
        );
        const current = result.rows[0];
        if (current === undefined) throw notFound('COUPON_NOT_FOUND');
        const next = nextCouponState(
          current.state,
          input.nextState,
          current.starts_at?.toISOString() ?? null,
          current.ends_at?.toISOString() ?? null,
          now,
          input.source,
        );
        await transaction.query(`UPDATE coupons SET state=$2 WHERE coupon_id=$1`, [
          input.couponId,
          next,
        ]);
        await this.audit(
          transaction,
          input.context,
          'COUPON_STATE_CHANGED',
          'COUPON',
          input.couponId,
          `${current.state}->${next}`,
        );
        return input.couponId;
      },
      (couponId, replayed) => ({ couponId, replayed }),
    );
  }

  async findPromotion(promotionId: string): Promise<PromotionDetail | null> {
    const result = await this.pool.query<PromotionRow>(
      `SELECT * FROM promotions WHERE promotion_id=$1`,
      [promotionId],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    const [targets, schedules] = await Promise.all([
      this.pool.query<{
        category_id: string | null;
        game_id: string | null;
        position: number;
        product_id: string | null;
        side: PromotionConfiguration['targets'][number]['side'];
        target_kind: PromotionConfiguration['targets'][number]['kind'];
      }>(
        `SELECT category_id,game_id,position,product_id,side,target_kind FROM promotion_targets WHERE promotion_id=$1 ORDER BY side,position`,
        [promotionId],
      ),
      this.pool.query<{
        day_of_week: number;
        end_minute_local: number;
        position: number;
        start_minute_local: number;
      }>(
        `SELECT day_of_week,end_minute_local,position,start_minute_local FROM promotion_weekly_schedules WHERE promotion_id=$1 ORDER BY day_of_week,position`,
        [promotionId],
      ),
    ]);
    return mapPromotion(row, targets.rows, schedules.rows);
  }

  async findCoupon(couponId: string): Promise<CouponDetail | null> {
    const result = await this.pool.query<CouponRow>(`SELECT * FROM coupons WHERE coupon_id=$1`, [
      couponId,
    ]);
    return result.rows[0] === undefined ? null : mapCoupon(result.rows[0]);
  }

  async listPromotions(input: Parameters<PromotionsRepository['listPromotions']>[0]) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (input.state !== undefined) {
      values.push(input.state);
      clauses.push(`state=$${values.length}`);
    }
    if (input.activationMode !== undefined) {
      values.push(input.activationMode);
      clauses.push(`activation_mode=$${values.length}`);
    }
    addCursor(clauses, values, input.cursor, 'promotion_id');
    values.push(input.limit + 1);
    const result = await this.pool.query<PromotionRow>(
      `SELECT * FROM promotions ${where(clauses)} ORDER BY created_at DESC,promotion_id DESC LIMIT $${values.length}`,
      values,
    );
    const rows = result.rows.slice(0, input.limit);
    const items = await Promise.all(rows.map((row) => this.findPromotion(row.promotion_id)));
    return {
      hasMore: result.rows.length > input.limit,
      items: items.filter((item): item is PromotionDetail => item !== null),
    };
  }

  async listCoupons(input: Parameters<PromotionsRepository['listCoupons']>[0]) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (input.state !== undefined) {
      values.push(input.state);
      clauses.push(`state=$${values.length}`);
    }
    if (input.promotionId !== undefined) {
      values.push(input.promotionId);
      clauses.push(`promotion_id=$${values.length}`);
    }
    addCursor(clauses, values, input.cursor, 'coupon_id');
    values.push(input.limit + 1);
    const result = await this.pool.query<CouponRow>(
      `SELECT * FROM coupons ${where(clauses)} ORDER BY created_at DESC,coupon_id DESC LIMIT $${values.length}`,
      values,
    );
    return {
      hasMore: result.rows.length > input.limit,
      items: result.rows.slice(0, input.limit).map(mapCoupon),
    };
  }

  async expireDue(context: ExecutionContext, now: Date) {
    return this.#transactions.execute(async (transaction) => {
      const promotions = await transaction.query<{ promotion_id: string }>(
        `UPDATE promotions SET state='EXPIRED',updated_at=$1
          WHERE state IN ('SCHEDULED','ACTIVE','SUSPENDED') AND ends_at <= $1
          RETURNING promotion_id`,
        [now],
      );
      const activated = await transaction.query<{ promotion_id: string }>(
        `UPDATE promotions SET state='ACTIVE',updated_at=$1,activated_at=COALESCE(activated_at,$1)
          WHERE state='SCHEDULED' AND starts_at <= $1 AND ends_at > $1
          RETURNING promotion_id`,
        [now],
      );
      const coupons = await transaction.query<{ coupon_id: string }>(
        `UPDATE coupons SET state='EXPIRED'
          WHERE state IN ('DRAFT','ACTIVE','SUSPENDED') AND ends_at IS NOT NULL AND ends_at <= $1
          RETURNING coupon_id`,
        [now],
      );
      for (const row of promotions.rows)
        await this.audit(
          transaction,
          context,
          'PROMOTION_EXPIRED',
          'PROMOTION',
          row.promotion_id,
          'SCHEDULED_JOB',
        );
      for (const row of activated.rows)
        await this.audit(
          transaction,
          context,
          'PROMOTION_ACTIVATED',
          'PROMOTION',
          row.promotion_id,
          'SCHEDULED_JOB',
        );
      for (const row of coupons.rows)
        await this.audit(
          transaction,
          context,
          'COUPON_EXPIRED',
          'COUPON',
          row.coupon_id,
          'SCHEDULED_JOB',
        );
      return {
        coupons: coupons.rowCount ?? 0,
        promotions: (promotions.rowCount ?? 0) + (activated.rowCount ?? 0),
      };
    });
  }

  private async insertPromotion(
    transaction: PgTransaction,
    promotionId: string,
    configuration: PromotionConfiguration,
    now: Date,
  ) {
    const benefit = benefitColumns(configuration);
    await transaction.query(
      `INSERT INTO promotions (
        promotion_id,name,state,activation_mode,scope,channel,benefit_type,
        percentage_basis_points,fixed_amount_clp,fixed_price_clp,buy_x_quantity,get_y_quantity,
        branch_id,minimum_eligible_quantity,minimum_eligible_amount_clp,global_limit,
        per_account_limit,starts_at,ends_at,priority,created_at,updated_at
      ) VALUES ($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)`,
      [
        promotionId,
        configuration.name,
        configuration.activationMode,
        configuration.scope,
        configuration.channel,
        configuration.benefit.type,
        benefit.percentage,
        benefit.fixedAmount,
        benefit.fixedPrice,
        benefit.buyX,
        benefit.getY,
        configuration.branchId,
        configuration.minimumEligibleQuantity,
        configuration.minimumEligibleAmountClp,
        configuration.globalLimit,
        configuration.perAccountLimit,
        configuration.startsAt,
        configuration.endsAt,
        configuration.priority,
        now,
      ],
    );
  }

  private async replaceChildren(
    transaction: PgTransaction,
    promotionId: string,
    configuration: PromotionConfiguration,
  ) {
    for (const target of configuration.targets) {
      await transaction.query(
        `INSERT INTO promotion_targets (
          promotion_target_id,promotion_id,side,target_kind,product_id,category_id,game_id,position
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          this.uuids.generate(),
          promotionId,
          target.side,
          target.kind,
          target.productId,
          target.categoryId,
          target.gameId,
          target.position,
        ],
      );
    }
    for (const schedule of configuration.schedules) {
      await transaction.query(
        `INSERT INTO promotion_weekly_schedules (
          promotion_weekly_schedule_id,promotion_id,day_of_week,start_minute_local,end_minute_local,position
        ) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          this.uuids.generate(),
          promotionId,
          schedule.dayOfWeek,
          schedule.startMinuteLocal,
          schedule.endMinuteLocal,
          schedule.position,
        ],
      );
    }
  }

  private async lockPromotion(
    transaction: PgTransaction,
    promotionId: string,
  ): Promise<PromotionRow> {
    const result = await transaction.query<PromotionRow>(
      `SELECT * FROM promotions WHERE promotion_id=$1 FOR UPDATE`,
      [promotionId],
    );
    const row = result.rows[0];
    if (row === undefined) throw notFound('PROMOTION_NOT_FOUND');
    return row;
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
          ) VALUES ($1,$2,$3,$4,'PROCESSING',1,$5,$5,$5) ON CONFLICT (scope,idempotency_key) DO NOTHING`,
          [recordId, scope, input.idempotencyKey, input.requestFingerprint, now],
        );
        if (inserted.rowCount === 0) {
          const existing = await transaction.query<{
            fingerprint: string;
            result_reference: string | null;
            status: string;
          }>(
            `SELECT fingerprint,result_reference,status FROM idempotency_records WHERE scope=$1 AND idempotency_key=$2 FOR UPDATE`,
            [scope, input.idempotencyKey],
          );
          const row = existing.rows[0];
          if (row === undefined || row.fingerprint !== input.requestFingerprint)
            throw conflict('PROMOTIONS_IDEMPOTENCY_CONFLICT');
          if (row.status === 'COMPLETED' && row.result_reference !== null)
            return map(row.result_reference, true);
          throw conflict('PROMOTIONS_IDEMPOTENCY_IN_PROGRESS');
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

function mapPromotion(
  row: PromotionRow,
  targets: readonly {
    category_id: string | null;
    game_id: string | null;
    position: number;
    product_id: string | null;
    side: PromotionConfiguration['targets'][number]['side'];
    target_kind: PromotionConfiguration['targets'][number]['kind'];
  }[],
  schedules: readonly {
    day_of_week: number;
    end_minute_local: number;
    position: number;
    start_minute_local: number;
  }[],
): PromotionDetail {
  return {
    activatedAt: row.activated_at,
    activationMode: row.activation_mode,
    benefit: mapBenefit(row),
    branchId: row.branch_id,
    channel: row.channel,
    createdAt: row.created_at,
    endsAt: row.ends_at.toISOString(),
    globalLimit: integer(row.global_limit),
    minimumEligibleAmountClp: integer(row.minimum_eligible_amount_clp),
    minimumEligibleQuantity: integer(row.minimum_eligible_quantity),
    name: row.name,
    perAccountLimit: integer(row.per_account_limit),
    priority: row.priority,
    promotionId: row.promotion_id,
    schedules: schedules.map((item) => ({
      dayOfWeek: item.day_of_week,
      endMinuteLocal: item.end_minute_local,
      position: item.position,
      startMinuteLocal: item.start_minute_local,
    })),
    scope: row.scope,
    startsAt: row.starts_at.toISOString(),
    state: row.state,
    targets: targets.map((item) => ({
      categoryId: item.category_id,
      gameId: item.game_id,
      kind: item.target_kind,
      position: item.position,
      productId: item.product_id,
      side: item.side,
    })),
    updatedAt: row.updated_at,
  };
}

function mapBenefit(row: PromotionRow): PromotionConfiguration['benefit'] {
  if (row.benefit_type === 'PERCENTAGE_DISCOUNT')
    return { basisPoints: requiredInteger(row.percentage_basis_points), type: row.benefit_type };
  if (row.benefit_type === 'FIXED_AMOUNT_DISCOUNT')
    return { amountClp: requiredInteger(row.fixed_amount_clp), type: row.benefit_type };
  if (row.benefit_type === 'FIXED_PRICE')
    return { priceClp: requiredInteger(row.fixed_price_clp), type: row.benefit_type };
  return {
    buyQuantity: requiredInteger(row.buy_x_quantity),
    getQuantity: requiredInteger(row.get_y_quantity),
    type: row.benefit_type,
  };
}

function mapCoupon(row: CouponRow): CouponDetail {
  return {
    couponId: row.coupon_id,
    createdAt: row.created_at,
    endsAt: row.ends_at,
    globalLimit: integer(row.global_limit),
    normalizedCode: row.normalized_code,
    perAccountLimit: integer(row.per_account_limit),
    promotionId: row.promotion_id,
    startsAt: row.starts_at,
    state: row.state,
  };
}

function benefitColumns(configuration: PromotionConfiguration) {
  const benefit = configuration.benefit;
  return {
    buyX: benefit.type === 'BUY_X_GET_Y' ? benefit.buyQuantity : null,
    fixedAmount: benefit.type === 'FIXED_AMOUNT_DISCOUNT' ? benefit.amountClp : null,
    fixedPrice: benefit.type === 'FIXED_PRICE' ? benefit.priceClp : null,
    getY: benefit.type === 'BUY_X_GET_Y' ? benefit.getQuantity : null,
    percentage: benefit.type === 'PERCENTAGE_DISCOUNT' ? benefit.basisPoints : null,
  };
}

function integer(value: string | number | null): number | null {
  if (value === null) return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new PromotionError(
      'PROMOTIONS_DATA_INVALID',
      'INFRASTRUCTURE',
      'Stored number is invalid.',
    );
  return result;
}
function requiredInteger(value: string | number | null): number {
  const result = integer(value);
  if (result === null)
    throw new PromotionError(
      'PROMOTIONS_DATA_INVALID',
      'INFRASTRUCTURE',
      'Stored benefit is invalid.',
    );
  return result;
}
function addCursor(
  clauses: string[],
  values: unknown[],
  cursor: PromotionPageCursor | undefined,
  idColumn: 'coupon_id' | 'promotion_id',
) {
  if (cursor === undefined) return;
  values.push(cursor.createdAt, cursor.id);
  clauses.push(`(created_at,${idColumn}) < ($${values.length - 1},$${values.length})`);
}
function where(clauses: readonly string[]): string {
  return clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
}
function notFound(code: string) {
  return new PromotionError(code, 'NOT_FOUND', 'Resource was not found.');
}
function conflict(code: string) {
  return new PromotionError(code, 'CONFLICT', 'The operation conflicts with current state.');
}
function mapPostgresError(error: unknown): unknown {
  if (error instanceof PromotionError) return error;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code);
    if (code === '23505') return conflict('PROMOTIONS_UNIQUE_CONFLICT');
    if (code === '23503') return notFound('PROMOTIONS_REFERENCE_NOT_FOUND');
    if (code === '23514') return conflict('PROMOTIONS_CONSTRAINT_CONFLICT');
  }
  return error;
}

export function promotionFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`;
}
