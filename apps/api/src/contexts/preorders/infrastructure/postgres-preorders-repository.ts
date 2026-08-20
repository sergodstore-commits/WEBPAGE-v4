import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type { CampaignView, PreordersRepository } from '../application/ports.js';
import {
  assertOperationalTransition,
  assertPublicationTransition,
  PreorderError,
} from '../domain/preorders.js';

export class PgPreordersRepository implements PreordersRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async createCampaign(input: Parameters<PreordersRepository['createCampaign']>[0]) {
    const result = await this.idempotent('PREORDER_COMMAND', input, async (transaction, now) => {
      const inventoryPositionId = await assertCompatibleCampaignProductBranch(
        transaction,
        input.campaign.productId,
        input.campaign.branchId,
      );
      const campaignId = this.uuids.generate();
      await transaction.query(
        `INSERT INTO preorder_campaigns (
          preorder_campaign_id,product_id,branch_id,fulfillment_group_key,operational_state,
          publication_status,capacity,opens_at,closes_at,estimated_arrival_text,created_by,
          created_at,updated_at
        ) VALUES ($1,$2,$3,$4,'DRAFT','DRAFT',$5,$6,$7,$8,$9,$10,$10)`,
        [
          campaignId,
          input.campaign.productId,
          input.campaign.branchId,
          input.campaign.fulfillmentGroupKey,
          input.campaign.capacity,
          input.campaign.opensAt,
          input.campaign.closesAt,
          input.campaign.estimatedArrivalText,
          requiredActor(input.context),
          now,
        ],
      );
      await transaction.query(
        `INSERT INTO preorder_stock_pools(preorder_stock_pool_id,inventory_position_id,pool_type,
           campaign_id,available_quantity,version,created_at,updated_at)
         VALUES($1,$2,'CAMPAIGN',$3,0,1,$4,$4)`,
        [this.uuids.generate(), inventoryPositionId, campaignId, now],
      );
      await this.history(
        transaction,
        input.context,
        campaignId,
        'OPERATIONAL',
        null,
        'DRAFT',
        null,
        now,
      );
      await this.history(
        transaction,
        input.context,
        campaignId,
        'PUBLICATION',
        null,
        'DRAFT',
        null,
        now,
      );
      await this.audit(
        transaction,
        input.context,
        'PREORDER_CAMPAIGN_CREATED',
        'PREORDER_CAMPAIGN',
        campaignId,
        null,
        now,
      );
      return campaignId;
    });
    return { campaignId: result.reference, replayed: result.replayed };
  }

  async editCampaign(input: Parameters<PreordersRepository['editCampaign']>[0]) {
    const result = await this.idempotent('PREORDER_COMMAND', input, async (transaction, now) => {
      const current = await this.lockCampaign(transaction, input.campaignId);
      if (!['DRAFT', 'SCHEDULED'].includes(current.operational_state)) {
        throw conflict(
          'PREORDER_CAMPAIGN_IMMUTABLE',
          'Campaign fields are immutable in the current state.',
        );
      }
      if (current.temporarily_reserved !== '0' || current.committed !== '0') {
        throw conflict(
          'PREORDER_CAMPAIGN_REFERENCES_EXIST',
          'Campaign identity is immutable after reservations or commitments.',
        );
      }
      const inventoryPositionId = await assertCompatibleCampaignProductBranch(
        transaction,
        input.campaign.productId,
        input.campaign.branchId,
      );
      await transaction.query(
        `UPDATE preorder_campaigns SET product_id=$2,branch_id=$3,fulfillment_group_key=$4,
          capacity=$5,opens_at=$6,closes_at=$7,estimated_arrival_text=$8,
          version=version+1,updated_at=$9 WHERE preorder_campaign_id=$1`,
        [
          input.campaignId,
          input.campaign.productId,
          input.campaign.branchId,
          input.campaign.fulfillmentGroupKey,
          input.campaign.capacity,
          input.campaign.opensAt,
          input.campaign.closesAt,
          input.campaign.estimatedArrivalText,
          now,
        ],
      );
      await transaction.query(
        `UPDATE preorder_stock_pools SET inventory_position_id=$2,version=version+1,updated_at=$3
          WHERE campaign_id=$1 AND pool_type='CAMPAIGN'`,
        [input.campaignId, inventoryPositionId, now],
      );
      await this.audit(
        transaction,
        input.context,
        'PREORDER_CAMPAIGN_EDITED',
        'PREORDER_CAMPAIGN',
        input.campaignId,
        null,
        now,
      );
      return input.campaignId;
    });
    return { campaignId: result.reference, replayed: result.replayed };
  }

  async findCampaign(campaignId: string): Promise<CampaignView | null> {
    const result = await this.pool.query<CampaignRow>(
      `${campaignSelect} WHERE c.preorder_campaign_id=$1`,
      [campaignId],
    );
    return result.rows[0] === undefined ? null : mapCampaign(result.rows[0]);
  }

  async listCampaigns(input: Parameters<PreordersRepository['listCampaigns']>[0]) {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    const add = (expression: string, value: unknown) => {
      parameters.push(value);
      conditions.push(expression.replace('?', `$${parameters.length}`));
    };
    if (input.branchId !== undefined) add('c.branch_id=?::uuid', input.branchId);
    if (input.productId !== undefined) add('c.product_id=?::uuid', input.productId);
    if (input.operationalState !== undefined) add('c.operational_state=?', input.operationalState);
    if (input.publicationStatus !== undefined)
      add('c.publication_status=?', input.publicationStatus);
    if (input.cursor !== undefined) {
      parameters.push(input.cursor.createdAt, input.cursor.id);
      conditions.push(
        `(c.created_at,c.preorder_campaign_id) < ($${parameters.length - 1},$${parameters.length}::uuid)`,
      );
    }
    parameters.push(input.limit + 1);
    const result = await this.pool.query<CampaignRow>(
      `${campaignSelect}${conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`}
       ORDER BY c.created_at DESC,c.preorder_campaign_id DESC LIMIT $${parameters.length}`,
      parameters,
    );
    return {
      hasMore: result.rows.length > input.limit,
      items: result.rows.slice(0, input.limit).map(mapCampaign),
    };
  }

  async transitionOperational(input: Parameters<PreordersRepository['transitionOperational']>[0]) {
    const result = await this.idempotent('PREORDER_COMMAND', input, async (transaction, now) => {
      await this.applyOperationalTransition(transaction, input, now);
      return input.campaignId;
    });
    return { campaignId: result.reference, replayed: result.replayed };
  }

  async transitionPublication(input: Parameters<PreordersRepository['transitionPublication']>[0]) {
    const result = await this.idempotent('PREORDER_COMMAND', input, async (transaction, now) => {
      let productBeforeCampaignLock: { product_id: string; publication_status: string } | undefined;
      if (input.nextStatus === 'PUBLISHED') {
        const campaignProduct = await transaction.query<{ product_id: string }>(
          `SELECT product_id FROM preorder_campaigns WHERE preorder_campaign_id=$1`,
          [input.campaignId],
        );
        if (campaignProduct.rows[0]) {
          const product = await transaction.query<{
            product_id: string;
            publication_status: string;
          }>(`SELECT product_id,publication_status FROM products WHERE product_id=$1 FOR SHARE`, [
            campaignProduct.rows[0].product_id,
          ]);
          productBeforeCampaignLock = product.rows[0];
        }
      }
      const campaign = await this.lockCampaign(transaction, input.campaignId);
      assertPublicationTransition({
        current: campaign.publication_status,
        next: input.nextStatus,
        operationalState: campaign.operational_state,
      });
      if (input.nextStatus === 'PUBLISHED') {
        if (productBeforeCampaignLock?.product_id !== campaign.product_id) {
          throw conflict(
            'PREORDER_CAMPAIGN_CHANGED',
            'The campaign changed while its publication transition was being processed.',
          );
        }
        if (productBeforeCampaignLock.publication_status !== 'PUBLISHED') {
          throw conflict(
            'PREORDER_PRODUCT_NOT_PUBLISHED',
            'A campaign can be published only with its published product.',
          );
        }
      }
      await transaction.query(
        `UPDATE preorder_campaigns SET publication_status=$2,
          published_at=CASE WHEN $2='PUBLISHED' THEN $3 ELSE published_at END,
          unpublished_at=CASE WHEN $2='UNPUBLISHED' THEN $3 ELSE NULL END,
          version=version+1,updated_at=$3 WHERE preorder_campaign_id=$1`,
        [input.campaignId, input.nextStatus, now],
      );
      await this.history(
        transaction,
        input.context,
        input.campaignId,
        'PUBLICATION',
        campaign.publication_status,
        input.nextStatus,
        input.reason,
        now,
      );
      await this.audit(
        transaction,
        input.context,
        'PREORDER_PUBLICATION_TRANSITIONED',
        'PREORDER_CAMPAIGN',
        input.campaignId,
        input.reason,
        now,
      );
      return input.campaignId;
    });
    return { campaignId: result.reference, replayed: result.replayed };
  }

  async processLifecycle(context: ExecutionContext, now: Date) {
    const due = await this.pool.query<{ preorder_campaign_id: string; target: 'CLOSED' | 'OPEN' }>(
      `SELECT preorder_campaign_id,
        CASE WHEN closes_at <= $1 THEN 'CLOSED' ELSE 'OPEN' END AS target
       FROM preorder_campaigns
       WHERE (operational_state='SCHEDULED' AND (opens_at <= $1 OR closes_at <= $1))
          OR (operational_state='OPEN' AND closes_at <= $1)
       ORDER BY preorder_campaign_id`,
      [now],
    );
    let opened = 0;
    let closed = 0;
    let failed = 0;
    for (const candidate of due.rows) {
      try {
        const jobContext = {
          ...context,
          idempotencyKey: `PREORDER_LIFECYCLE:${candidate.preorder_campaign_id}:${candidate.target}:${now.toISOString()}`,
        };
        const result = await this.transitionOperational({
          campaignId: candidate.preorder_campaign_id,
          context: jobContext,
          idempotencyKey: jobContext.idempotencyKey,
          nextState: candidate.target,
          reason: null,
          requestFingerprint: candidate.target,
          source: 'SCHEDULED_JOB',
        });
        if (!result.replayed) {
          if (candidate.target === 'OPEN') opened += 1;
          else closed += 1;
        }
      } catch {
        failed += 1;
      }
    }
    return { closed, failed, opened, scanned: due.rows.length };
  }

  private async applyOperationalTransition(
    transaction: PgTransaction,
    input: Parameters<PreordersRepository['transitionOperational']>[0],
    now: Date,
  ): Promise<void> {
    const campaign = await this.lockCampaign(transaction, input.campaignId);
    assertOperationalTransition({
      closesAt: campaign.closes_at,
      current: campaign.operational_state,
      next: input.nextState,
      now,
      opensAt: campaign.opens_at,
      source: input.source,
    });
    if (
      input.nextState === 'CLOSED' &&
      input.source === 'ADMIN' &&
      now < campaign.closes_at &&
      input.reason === null
    ) {
      throw new PreorderError(
        'PREORDER_CLOSE_REASON_REQUIRED',
        'VALIDATION',
        'Early campaign close requires a reason.',
      );
    }
    const forcedUnpublished = input.nextState === 'CLOSED' || input.nextState === 'CANCELLED';
    await transaction.query(
      `UPDATE preorder_campaigns SET operational_state=$2,
        publication_status=CASE WHEN $3 THEN 'UNPUBLISHED' ELSE publication_status END,
        unpublished_at=CASE WHEN $3 AND publication_status<>'UNPUBLISHED' THEN $4 ELSE unpublished_at END,
        version=version+1,updated_at=$4 WHERE preorder_campaign_id=$1`,
      [input.campaignId, input.nextState, forcedUnpublished, now],
    );
    await this.history(
      transaction,
      input.context,
      input.campaignId,
      'OPERATIONAL',
      campaign.operational_state,
      input.nextState,
      input.reason,
      now,
    );
    if (forcedUnpublished && campaign.publication_status !== 'UNPUBLISHED') {
      await this.history(
        transaction,
        input.context,
        input.campaignId,
        'PUBLICATION',
        campaign.publication_status,
        'UNPUBLISHED',
        input.reason,
        now,
      );
    }
    await this.audit(
      transaction,
      input.context,
      'PREORDER_OPERATIONAL_TRANSITIONED',
      'PREORDER_CAMPAIGN',
      input.campaignId,
      input.reason,
      now,
    );
  }

  private async lockCampaign(transaction: PgTransaction, campaignId: string): Promise<CampaignRow> {
    const result = await transaction.query<CampaignRow>(
      `${campaignSelect} WHERE c.preorder_campaign_id=$1 FOR UPDATE OF c`,
      [campaignId],
    );
    if (result.rows[0] === undefined)
      throw notFound('PREORDER_CAMPAIGN_NOT_FOUND', 'Preorder campaign was not found.');
    return result.rows[0];
  }

  private async idempotent(
    scope: string,
    input: {
      readonly context: ExecutionContext;
      readonly idempotencyKey: string;
      readonly requestFingerprint: string;
    },
    operation: (transaction: PgTransaction, now: Date) => Promise<string>,
  ): Promise<{ readonly reference: string; readonly replayed: boolean }> {
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
            throw conflict(
              'PREORDER_IDEMPOTENCY_CONFLICT',
              'Idempotency key was reused with incompatible input.',
            );
          if (row.status === 'COMPLETED' && row.result_reference !== null)
            return { reference: row.result_reference, replayed: true };
          throw conflict(
            'PREORDER_IDEMPOTENCY_IN_PROGRESS',
            'Preorder command with this key is still in progress.',
          );
        }
        const reference = await operation(transaction, now);
        await transaction.query(
          `UPDATE idempotency_records SET status='COMPLETED',result_reference=$2,
           source_type='PREORDER_COMMAND',source_id=$2,completed_at=$3,updated_at=$3
           WHERE idempotency_record_id=$1`,
          [recordId, reference, now],
        );
        return { reference, replayed: false };
      });
    } catch (error) {
      if (error instanceof PreorderError) throw error;
      throw mapPostgresError(error);
    }
  }

  private async history(
    transaction: PgTransaction,
    context: ExecutionContext,
    campaignId: string,
    dimension: 'OPERATIONAL' | 'PUBLICATION',
    fromValue: string | null,
    toValue: string,
    reason: string | null,
    now: Date,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO preorder_campaign_state_history (
        history_id,campaign_id,dimension,from_value,to_value,actor_id,reason,correlation_id,occurred_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        this.uuids.generate(),
        campaignId,
        dimension,
        fromValue,
        toValue,
        context.actorId ?? null,
        reason,
        context.correlationId,
        now,
      ],
    );
  }

  private async audit(
    transaction: PgTransaction,
    context: ExecutionContext,
    action: string,
    resourceType: string,
    resourceId: string,
    reason: string | null,
    now: Date,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO audit_entries (
        audit_entry_id,actor_id,actor_type,action,resource_type,resource_id,result,reason,
        correlation_id,causation_id,idempotency_key,occurred_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'SUCCESS',$7,$8,$9,$10,$11)`,
      [
        this.uuids.generate(),
        context.actorId ?? null,
        context.actorType,
        action,
        resourceType,
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

const campaignSelect = `SELECT c.* FROM preorder_campaigns c`;

interface CampaignRow extends QueryResultRow {
  branch_id: string;
  capacity: string;
  closes_at: Date;
  committed: string;
  created_at: Date;
  estimated_arrival_text: string;
  fulfillment_group_key: string | null;
  opens_at: Date;
  operational_state: CampaignView['operationalState'];
  preorder_campaign_id: string;
  product_id: string;
  publication_status: CampaignView['publicationStatus'];
  published_at: Date | null;
  temporarily_reserved: string;
  unpublished_at: Date | null;
  updated_at: Date;
  version: string;
}

function mapCampaign(row: CampaignRow): CampaignView {
  return {
    branchId: row.branch_id,
    capacity: integer(row.capacity),
    closesAt: row.closes_at,
    committed: integer(row.committed),
    createdAt: row.created_at,
    estimatedArrivalText: row.estimated_arrival_text,
    fulfillmentGroupKey: row.fulfillment_group_key,
    opensAt: row.opens_at,
    operationalState: row.operational_state,
    preorderCampaignId: row.preorder_campaign_id,
    productId: row.product_id,
    publicationStatus: row.publication_status,
    publishedAt: row.published_at,
    temporarilyReserved: integer(row.temporarily_reserved),
    unpublishedAt: row.unpublished_at,
    updatedAt: row.updated_at,
    version: integer(row.version),
  };
}

async function assertCompatibleCampaignProductBranch(
  transaction: PgTransaction,
  productId: string,
  branchId: string,
): Promise<string> {
  const result = await transaction.query<{ branch_state: string; sale_type: string }>(
    `SELECT p.sale_type,b.state AS branch_state
       FROM products p
       CROSS JOIN branches b
      WHERE p.product_id=$1 AND b.branch_id=$2
      FOR SHARE OF p,b`,
    [productId, branchId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw notFound(
      'PREORDER_PRODUCT_BRANCH_NOT_FOUND',
      'Campaign product or branch was not found.',
    );
  }
  if (row.sale_type !== 'PREORDER' || row.branch_state !== 'ACTIVE') {
    throw conflict(
      'PREORDER_PRODUCT_BRANCH_INVALID',
      'Campaign requires a PREORDER product and ACTIVE branch.',
    );
  }
  const position = await transaction.query<{ inventory_position_id: string }>(
    `SELECT inventory_position_id FROM inventory_positions
      WHERE product_id=$1 AND branch_id=$2 FOR SHARE`,
    [productId, branchId],
  );
  const inventoryPositionId = position.rows[0]?.inventory_position_id;
  if (inventoryPositionId === undefined) {
    throw conflict(
      'PREORDER_INVENTORY_POSITION_REQUIRED',
      'Campaign requires an inventory position for its product and branch.',
    );
  }
  return inventoryPositionId;
}

function integer(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error('Preorder integer is outside the supported range.');
  return parsed;
}
function requiredActor(context: ExecutionContext): string {
  if (context.actorId === undefined)
    throw new PreorderError('PREORDERS_ACCESS_DENIED', 'VALIDATION', 'Actor is required.');
  return context.actorId;
}
function conflict(code: string, message: string): PreorderError {
  return new PreorderError(code, 'CONFLICT', message);
}
function notFound(code: string, message: string): PreorderError {
  return new PreorderError(code, 'NOT_FOUND', message);
}
function mapPostgresError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('code' in error)) return error;
  const code = String(error.code);
  if (code === '23505' || code === '23P01')
    return conflict(
      'PREORDER_UNIQUE_OR_WINDOW_CONFLICT',
      'Preorder uniqueness or campaign window was rejected.',
    );
  if (code === '23503')
    return notFound('PREORDER_REFERENCE_NOT_FOUND', 'Preorder reference was not found.');
  if (code === '23514')
    return conflict('PREORDER_INVARIANT_VIOLATION', 'Preorder invariant was rejected.');
  if (code === '40001' || code === '40P01')
    return conflict(
      'PREORDER_CONCURRENCY_CONFLICT',
      'Concurrent preorder operation must be retried.',
    );
  return error;
}
