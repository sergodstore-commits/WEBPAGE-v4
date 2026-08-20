import { createHash } from 'node:crypto';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool } from 'pg';
import {
  snapshotRegistry,
  type AppliedPromotionSnapshotV1,
  type PromotionPreview,
} from '@sergod/contracts';
import { evaluatePromotionSet } from '../../promotions/domain/promotions.js';
import { calculateEarn, calculateRedeem, LoyaltyError } from '../../loyalty/domain/loyalty.js';
import {
  PgTransactionExecutor,
  type PgTransaction,
} from '../../../platform/persistence/postgres.js';
import { PosError, type PosRepository } from '../application/pos-service.js';
export class PgPosRepository implements PosRepository {
  private readonly tx: PgTransactionExecutor;
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly ids: UuidGenerator,
  ) {
    this.tx = new PgTransactionExecutor(pool);
  }
  private async cmd(
    c: ExecutionContext,
    scope: string,
    p: ReturnType<JSON['parse']>,
    run: (t: PgTransaction, n: Date) => Promise<string>,
  ) {
    if (!c.idempotencyKey)
      throw new PosError('IDEMPOTENCY_KEY_REQUIRED', 422, 'Idempotency-Key is required.');
    const fp = createHash('sha256').update(JSON.stringify(p)).digest('hex');
    try {
      return await this.tx.execute(async (t) => {
        await t.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
          `${scope}:${c.idempotencyKey}`,
        ]);
        const q = await t.query<ReturnType<JSON['parse']>>(
          `SELECT fingerprint,result_reference FROM idempotency_records WHERE scope=$1 AND idempotency_key=$2 FOR UPDATE`,
          [scope, c.idempotencyKey],
        );
        if (q.rows[0]) {
          if (q.rows[0].fingerprint !== fp)
            throw new PosError('IDEMPOTENCY_CONFLICT', 409, 'Idempotency key conflict.');
          return { id: q.rows[0].result_reference, replayed: true };
        }
        const n = this.clock.now(),
          id = await run(t, n);
        await t.query(
          `INSERT INTO idempotency_records(idempotency_record_id,scope,idempotency_key,fingerprint,result_reference,status,source_type,source_id,attempts,completed_at,created_at,updated_at)VALUES($1,$2,$3,$4,$5,'COMPLETED','POS_SALE',$5,1,$6,$6,$6)`,
          [this.ids.generate(), scope, c.idempotencyKey, fp, id, n],
        );
        await t.query(
          `INSERT INTO audit_entries(audit_entry_id,actor_id,actor_type,action,resource_type,resource_id,result,correlation_id,idempotency_key,occurred_at)VALUES($1,$2,'USER',$3,'POS_SALE',$4,'SUCCESS',$5,$6,$7)`,
          [this.ids.generate(), c.actorId, scope, id, c.correlationId, c.idempotencyKey, n],
        );
        return { id, replayed: false };
      });
    } catch (error) {
      if (error instanceof PosError) throw error;
      if (isPostgresIntegrityError(error))
        throw new PosError(
          scope === 'POS_METHOD_CREATE' ? 'MONEY_METHOD_CODE_CONFLICT' : 'POS_STATE_CONFLICT',
          409,
          'The operation conflicts with sale rules.',
        );
      throw error;
    }
  }
  create(c: ExecutionContext, i: ReturnType<JSON['parse']>) {
    return this.cmd(c, 'POS_CREATE', i, async (t, n) => {
      const id = this.ids.generate();
      if (i.accountId) await this.assertActiveAccount(t, i.accountId);
      await t.query(
        `INSERT INTO pos_sales(pos_sale_id,public_sale_number,branch_id,sale_type,state,account_id,buyer_name,buyer_email,buyer_phone,created_by,created_at,updated_at)VALUES($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9,$10,$10)`,
        [
          id,
          `POS-${n.toISOString().replace(/\D/gu, '').slice(0, 14)}-${id.slice(0, 8).toUpperCase()}`,
          i.branchId,
          i.saleType,
          i.accountId ?? null,
          i.buyerName ?? null,
          i.buyerEmail?.trim().toLowerCase() ?? null,
          i.buyerPhone ?? null,
          c.actorId,
          n,
        ],
      );
      await t.query(`INSERT INTO pos_sale_state_history VALUES($1,$2,NULL,'DRAFT',$3,NULL,$4,$5)`, [
        this.ids.generate(),
        id,
        c.actorId,
        c.correlationId,
        n,
      ]);
      return id;
    });
  }
  async get(_c: ExecutionContext, id: string) {
    const s = await this.pool.query(`SELECT * FROM pos_sales WHERE pos_sale_id=$1`, [id]);
    if (!s.rows[0]) throw new PosError('POS_SALE_NOT_FOUND', 404, 'Sale not found.');
    const l = await this.pool.query(
      `SELECT * FROM pos_sale_lines WHERE pos_sale_id=$1 ORDER BY created_at,pos_sale_line_id`,
      [id],
    );
    const settlements = await this.pool.query(
      `SELECT pos_sale_settlement_id,kind,amount_clp,method_snapshot,external_reference,evidence_note AS note,declared_at FROM pos_sale_settlements WHERE pos_sale_id=$1`,
      [id],
    );
    return { item: hydratePosSale(s.rows[0]), lines: l.rows, settlements: settlements.rows };
  }
  async list(_c: ExecutionContext, q: ReturnType<JSON['parse']>) {
    let cursor: { createdAt: string; id: string } | null = null;
    if (q.cursor) {
      try {
        cursor = JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8')) as {
          createdAt: string;
          id: string;
        };
        if (!cursor.createdAt || !cursor.id) throw new Error('invalid');
      } catch {
        throw new PosError('CURSOR_INVALID', 422, 'Cursor is invalid.');
      }
    }
    const r = await this.pool.query(
      `SELECT * FROM pos_sales WHERE ($1::text IS NULL OR state=$1) AND ($2::timestamptz IS NULL OR (created_at,pos_sale_id)<($2,$3::uuid)) ORDER BY created_at DESC,pos_sale_id DESC LIMIT $4`,
      [q.state ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, q.limit + 1],
    );
    const hasMore = r.rows.length > q.limit;
    const items = r.rows.slice(0, q.limit).map(hydratePosSale);
    const last = items.at(-1);
    return {
      items,
      hasMore,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                createdAt: new Date(last.created_at).toISOString(),
                id: last.pos_sale_id,
              }),
            ).toString('base64url')
          : null,
    };
  }
  async findSku(_c: ExecutionContext, sku: string) {
    const r = await this.pool.query(
      `SELECT product_id,sku,name,sale_type,price_amount_clp,publication_status FROM products WHERE upper(sku)=upper($1)`,
      [sku],
    );
    if (!r.rows[0]) throw new PosError('PRODUCT_NOT_FOUND', 404, 'Product not found.');
    return { item: r.rows[0] };
  }
  addLine(c: ExecutionContext, id: string, i: ReturnType<JSON['parse']>) {
    return this.cmd(c, 'POS_LINE_ADD', { id, ...i }, async (t, n) => {
      const s = await this.lockDraft(t, id),
        p = await t.query<ReturnType<JSON['parse']>>(
          `SELECT * FROM products WHERE product_id=$1 FOR SHARE`,
          [i.productId],
        );
      const x = p.rows[0];
      if (!x || x.publication_status !== 'PUBLISHED')
        throw new PosError('PRODUCT_NOT_AVAILABLE', 409, 'Product unavailable.');
      if (x.sale_type !== s.sale_type)
        throw new PosError(
          'POS_MIXED_SALE_TYPES',
          409,
          'Regular and preorder lines cannot be mixed.',
        );
      if (s.sale_type === 'PREORDER' && !i.preorderCampaignId)
        throw new PosError('PREORDER_CAMPAIGN_REQUIRED', 422, 'Campaign is required.');
      if (s.sale_type === 'REGULAR' && i.preorderCampaignId)
        throw new PosError('PREORDER_CAMPAIGN_NOT_ALLOWED', 422, 'Campaign is not allowed.');
      const line = this.ids.generate(),
        subtotal = Number(x.price_amount_clp) * i.quantity;
      if (i.preorderCampaignId) {
        const campaign = (
          await t.query<ReturnType<JSON['parse']>>(
            `SELECT product_id,branch_id FROM preorder_campaigns WHERE preorder_campaign_id=$1`,
            [i.preorderCampaignId],
          )
        ).rows[0];
        if (!campaign || campaign.product_id !== x.product_id || campaign.branch_id !== s.branch_id)
          throw new PosError('PREORDER_CAMPAIGN_INCOMPATIBLE', 409, 'Campaign is incompatible.');
      }
      await t.query(
        `INSERT INTO pos_sale_lines(pos_sale_line_id,pos_sale_id,product_id,preorder_campaign_id,sku_snapshot,product_name_snapshot,product_attributes_snapshot,game_id_snapshot,category_id_snapshot,collection_id_snapshot,unit_price_amount_clp,quantity,line_subtotal_amount_clp,final_line_total_amount_clp,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$14)`,
        [
          line,
          id,
          x.product_id,
          i.preorderCampaignId ?? null,
          x.sku,
          x.name,
          JSON.stringify({
            snapshot_contract: 'ProductAttributesSnapshot.v1',
            snapshot_schema_version: 1,
            condition: x.condition,
            edition: x.edition,
            language: x.language,
          }),
          x.game_id,
          x.category_id,
          x.collection_id,
          x.price_amount_clp,
          i.quantity,
          subtotal,
          n,
        ],
      );
      await this.retotal(t, id, n);
      return line;
    });
  }
  removeLine(c: ExecutionContext, id: string, line: string) {
    return this.cmd(c, 'POS_LINE_REMOVE', { id, line }, async (t, n) => {
      await this.lockDraft(t, id);
      const result = await t.query(
        `DELETE FROM pos_sale_lines WHERE pos_sale_id=$1 AND pos_sale_line_id=$2`,
        [id, line],
      );
      if (!result.rowCount) throw new PosError('POS_LINE_NOT_FOUND', 404, 'Line not found.');
      await this.retotal(t, id, n);
      return line;
    });
  }
  updateLine(c: ExecutionContext, id: string, line: string, quantity: number) {
    return this.cmd(c, 'POS_LINE_UPDATE', { id, line, quantity }, async (t, n) => {
      await this.lockDraft(t, id);
      const result = await t.query(
        `UPDATE pos_sale_lines SET quantity=$3,line_subtotal_amount_clp=unit_price_amount_clp*$3,final_line_total_amount_clp=unit_price_amount_clp*$3,updated_at=$4 WHERE pos_sale_id=$1 AND pos_sale_line_id=$2`,
        [id, line, quantity, n],
      );
      if (!result.rowCount) throw new PosError('POS_LINE_NOT_FOUND', 404, 'Line not found.');
      await this.retotal(t, id, n);
      return line;
    });
  }
  setBuyer(c: ExecutionContext, id: string, i: ReturnType<JSON['parse']>) {
    return this.cmd(c, 'POS_BUYER', { id, ...i }, async (t, n) => {
      const sale = await this.lockDraft(t, id);
      let buyerEmail = i.buyerEmail?.trim().toLowerCase() ?? null;
      let buyerPhone = i.buyerPhone ?? null;
      let deliveryInput =
        i.delivery === null
          ? null
          : { ...i.delivery, contactEmail: buyerEmail, contactPhone: buyerPhone };
      if (i.accountId) {
        const account = await this.requireActiveAccount(t, i.accountId);
        buyerEmail = account.current_email;
        buyerPhone = account.current_phone;
        if (i.delivery !== null) {
          deliveryInput = {
            ...i.delivery,
            contactEmail: account.current_email,
            contactPhone: account.current_phone,
          };
        }
      }
      if (sale.sale_type === 'REGULAR' && i.delivery !== null)
        throw new PosError(
          'REGULAR_DELIVERY_NOT_ALLOWED',
          422,
          'Regular sales do not have delivery.',
        );
      if (sale.sale_type === 'PREORDER' && i.delivery === null)
        throw new PosError('PREORDER_DELIVERY_REQUIRED', 422, 'Preorder delivery is required.');
      const snapshot: ReturnType<JSON['parse']> | null =
        deliveryInput === null
          ? null
          : await this.buildDeliverySnapshot(t, deliveryInput, Number(sale.total_amount_clp), n);
      if (snapshot?.mode === 'PICKUP' && snapshot.branchId !== sale.branch_id)
        throw new PosError(
          'DELIVERY_BRANCH_MISMATCH',
          409,
          'Delivery must belong to the sale branch.',
        );
      await t.query(
        `UPDATE pos_sales SET account_id=$2,buyer_name=$3,buyer_email=$4,buyer_phone=$5,delivery_snapshot=$6,delivery_mode=$7,shipping_fee_amount_clp=$8,version=version+1,updated_at=$9 WHERE pos_sale_id=$1`,
        [
          id,
          i.accountId,
          i.buyerName,
          buyerEmail,
          buyerPhone,
          snapshot,
          snapshot?.mode ?? 'NONE',
          snapshot?.mode === 'SHIPPING' ? null : 0,
          n,
        ],
      );
      return id;
    });
  }
  setCoupon(c: ExecutionContext, id: string, code: string | null) {
    return this.cmd(c, 'POS_COUPON', { id, code }, async (t, n) => {
      await this.lockDraft(t, id);
      await t.query(
        `UPDATE pos_sales SET coupon_code_normalized=$2,version=version+1,updated_at=$3 WHERE pos_sale_id=$1`,
        [id, code?.toUpperCase() ?? null, n],
      );
      return id;
    });
  }
  setLoyalty(c: ExecutionContext, id: string, points: number) {
    return this.cmd(c, 'POS_LOYALTY', { id, points }, async (t, n) => {
      await this.lockDraft(t, id);
      await t.query(
        `UPDATE pos_sales SET loyalty_points_requested=$2,version=version+1,updated_at=$3 WHERE pos_sale_id=$1`,
        [id, points, n],
      );
      return id;
    });
  }
  prepare(c: ExecutionContext, id: string) {
    return this.cmd(c, 'POS_PREPARE', { id }, async (t, n) => {
      const s = await this.lockDraft(t, id);
      await this.freezeIdentity(t, s, n);
      if (!(await t.query(`SELECT 1 FROM pos_sale_lines WHERE pos_sale_id=$1`, [id])).rowCount)
        throw new PosError('POS_LINES_REQUIRED', 409, 'At least one line is required.');
      await this.retotal(t, id, n);
      await this.evaluateAndCommitPromotions(t, c, id, n, false);
      await this.applyLoyalty(t, c, id, n, false);
      await this.syncDeliverySnapshotTotal(t, id);
      const refreshed = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT total_amount_clp FROM pos_sales WHERE pos_sale_id=$1`,
          [id],
        )
      ).rows[0];
      if (Number(refreshed.total_amount_clp) > 0)
        await this.state(t, c, id, 'AWAITING_EXTERNAL_PAYMENT_CONFIRMATION', n);
      return id;
    });
  }
  returnToDraft(c: ExecutionContext, id: string, reason: string) {
    return this.cmd(c, 'POS_RETURN_TO_DRAFT', { id, reason }, async (t, n) => {
      const sale = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT * FROM pos_sales WHERE pos_sale_id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!sale) throw new PosError('POS_SALE_NOT_FOUND', 404, 'Sale not found.');
      if (sale.state !== 'AWAITING_EXTERNAL_PAYMENT_CONFIRMATION')
        throw new PosError(
          'POS_RETURN_TO_DRAFT_INVALID',
          409,
          'Only a sale awaiting confirmation can return to draft.',
        );
      await this.state(t, c, id, 'DRAFT', n, reason);
      return id;
    });
  }
  settleAndComplete(c: ExecutionContext, id: string, i: ReturnType<JSON['parse']> | null) {
    return this.cmd(c, 'POS_COMPLETE', { id, settlement: i }, async (t, n) => {
      const s = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT * FROM pos_sales WHERE pos_sale_id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!s) throw new PosError('POS_SALE_NOT_FOUND', 404, 'Sale not found.');
      if (s.state === 'COMPLETED') return id;
      if (!['DRAFT', 'AWAITING_EXTERNAL_PAYMENT_CONFIRMATION'].includes(s.state))
        throw new PosError('POS_NOT_COMPLETABLE', 409, 'Sale cannot complete.');
      await this.freezeIdentity(t, s, n);
      await this.retotal(t, id, n);
      await this.evaluateAndCommitPromotions(t, c, id, n, true);
      await this.applyLoyalty(t, c, id, n, true);
      await this.syncDeliverySnapshotTotal(t, id);
      const current = (
          await t.query<ReturnType<JSON['parse']>>(`SELECT * FROM pos_sales WHERE pos_sale_id=$1`, [
            id,
          ])
        ).rows[0],
        total = Number(current.total_amount_clp);
      if (total > 0 && current.state !== 'AWAITING_EXTERNAL_PAYMENT_CONFIRMATION')
        throw new PosError(
          'POS_PAYMENT_NOT_PREPARED',
          409,
          'Positive sales must be prepared before completion.',
        );
      if (total === 0) {
        if (i !== null)
          throw new PosError(
            'ZERO_TOTAL_EXTERNAL_METHOD_NOT_ALLOWED',
            422,
            'Zero total does not use external money.',
          );
        await t.query(
          `INSERT INTO pos_sale_settlements(pos_sale_settlement_id,pos_sale_id,kind,amount_clp,external_money_method_id,method_snapshot,external_reference,declared_by,declared_at,idempotency_key,correlation_id) VALUES($1,$2,'ZERO_TOTAL',0,NULL,NULL,NULL,$3,$4,$5,$6)`,
          [this.ids.generate(), id, c.actorId, n, c.idempotencyKey, c.correlationId],
        );
      } else {
        if (!i) throw new PosError('SETTLEMENT_REQUIRED', 422, 'Settlement is required.');
        if (i.amountClp !== total)
          throw new PosError(
            'SETTLEMENT_AMOUNT_MISMATCH',
            409,
            'Settlement amount must equal sale total.',
          );
        const m = (
          await t.query<ReturnType<JSON['parse']>>(
            `SELECT * FROM external_money_methods WHERE external_money_method_id=$1 FOR UPDATE`,
            [i.externalMoneyMethodId],
          )
        ).rows[0];
        if (!m || m.state !== 'ACTIVE')
          throw new PosError('MONEY_METHOD_NOT_ACTIVE', 409, 'Active payment method required.');
        const snap = snapshotRegistry.validate('ExternalMoneyMethodSnapshot.v2', {
          snapshot_contract: 'ExternalMoneyMethodSnapshot.v2',
          snapshot_schema_version: 2,
          code: m.code_normalized,
          displayName: m.display_name,
          description: m.description,
          publicInstructions: m.public_instructions,
        });
        await t.query(
          `INSERT INTO pos_sale_settlements(pos_sale_settlement_id,pos_sale_id,kind,amount_clp,external_money_method_id,method_snapshot,external_reference,evidence_note,declared_by,declared_at,idempotency_key,correlation_id) VALUES($1,$2,'EXTERNAL_DECLARED',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            this.ids.generate(),
            id,
            total,
            m.external_money_method_id,
            snap,
            i.reference ?? null,
            i.note ?? null,
            c.actorId,
            n,
            c.idempotencyKey,
            c.correlationId,
          ],
        );
        await t.query(
          `UPDATE external_money_methods SET first_used_at=COALESCE(first_used_at,$2) WHERE external_money_method_id=$1`,
          [m.external_money_method_id, n],
        );
      }
      if (current.sale_type === 'REGULAR') await this.consumeRegular(t, c, current, n);
      else await this.commitPreorder(t, current, n);
      await this.state(t, c, id, 'COMPLETED', n);
      return id;
    });
  }
  discard(c: ExecutionContext, id: string, reason: string) {
    return this.cmd(c, 'POS_DISCARD', { id, reason }, async (t, n) => {
      const sale = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT state FROM pos_sales WHERE pos_sale_id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!sale) throw new PosError('POS_SALE_NOT_FOUND', 404, 'Sale not found.');
      if (!['DRAFT', 'AWAITING_EXTERNAL_PAYMENT_CONFIRMATION'].includes(sale.state))
        throw new PosError('POS_DISCARD_INVALID', 409, 'Sale cannot be discarded.');
      await this.state(t, c, id, 'DISCARDED', n, reason);
      return id;
    });
  }
  createMethod(c: ExecutionContext, i: ReturnType<JSON['parse']>) {
    return this.cmd(c, 'POS_METHOD_CREATE', i, async (t, n) => {
      const id = this.ids.generate();
      await t.query(
        `INSERT INTO external_money_methods(external_money_method_id,code_normalized,display_name,description,public_instructions,direction,requires_external_reference,requires_receipt_resource,requires_evidence_note,state,version,created_by,updated_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'INBOUND',false,false,false,'DRAFT',1,$6,$6,$7,$7)`,
        [id, i.code, i.name, i.description, i.publicInstructions, c.actorId, n],
      );
      return id;
    });
  }
  async getMethod(_c: ExecutionContext, id: string) {
    const row = (
      await this.pool.query(
        `SELECT * FROM external_money_methods WHERE external_money_method_id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) throw new PosError('MONEY_METHOD_NOT_FOUND', 404, 'Method not found.');
    return { item: row };
  }
  editMethod(c: ExecutionContext, id: string, i: ReturnType<JSON['parse']>) {
    return this.cmd(c, 'POS_METHOD_EDIT', { id, ...i }, async (t, n) => {
      const method = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT * FROM external_money_methods WHERE external_money_method_id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!method) throw new PosError('MONEY_METHOD_NOT_FOUND', 404, 'Method not found.');
      if (method.state !== 'DRAFT')
        throw new PosError('MONEY_METHOD_IMMUTABLE', 409, 'Only a draft method is editable.');
      await t.query(
        `UPDATE external_money_methods SET display_name=$2,description=$3,public_instructions=$4,direction='INBOUND',requires_external_reference=false,requires_receipt_resource=false,requires_evidence_note=false,version=version+1,updated_by=$5,updated_at=$6 WHERE external_money_method_id=$1`,
        [id, i.name, i.description, i.publicInstructions, c.actorId, n],
      );
      return id;
    });
  }
  deleteMethod(c: ExecutionContext, id: string) {
    return this.cmd(c, 'POS_METHOD_DELETE', { id }, async (t) => {
      const method = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT * FROM external_money_methods WHERE external_money_method_id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!method) throw new PosError('MONEY_METHOD_NOT_FOUND', 404, 'Method not found.');
      const historyCount = Number(
        (
          await t.query<ReturnType<JSON['parse']>>(
            `SELECT count(*)::int AS count FROM external_money_method_history WHERE external_money_method_id=$1`,
            [id],
          )
        ).rows[0].count,
      );
      if (method.state !== 'DRAFT' || method.first_used_at || historyCount !== 0)
        throw new PosError(
          'MONEY_METHOD_DELETE_FORBIDDEN',
          409,
          'Only an unused draft method can be deleted.',
        );
      await t.query(`DELETE FROM external_money_methods WHERE external_money_method_id=$1`, [id]);
      return id;
    });
  }
  transitionMethod(c: ExecutionContext, id: string, next: string, reason: string) {
    return this.cmd(c, 'POS_METHOD_TRANSITION', { id, next, reason }, async (t, n) => {
      const m = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT * FROM external_money_methods WHERE external_money_method_id=$1 FOR UPDATE`,
          [id],
        )
      ).rows[0];
      if (!m) throw new PosError('MONEY_METHOD_NOT_FOUND', 404, 'Method not found.');
      const allowed: Record<string, readonly string[]> = {
        DRAFT: ['ACTIVE', 'RETIRED'],
        ACTIVE: ['INACTIVE'],
        INACTIVE: ['ACTIVE', 'RETIRED'],
        RETIRED: [],
      };
      if (!(allowed[m.state] ?? []).includes(next))
        throw new PosError('MONEY_METHOD_TRANSITION_INVALID', 409, 'Invalid transition.');
      await t.query(
        `UPDATE external_money_methods SET state=$2,version=version+1,updated_by=$3,updated_at=$4,activated_by=CASE WHEN $2='ACTIVE' THEN $3 ELSE activated_by END,activated_at=CASE WHEN $2='ACTIVE' THEN $4 ELSE activated_at END,deactivated_by=CASE WHEN $2='INACTIVE' THEN $3 ELSE deactivated_by END,deactivated_at=CASE WHEN $2='INACTIVE' THEN $4 ELSE deactivated_at END,retired_by=CASE WHEN $2='RETIRED' THEN $3 ELSE retired_by END,retired_at=CASE WHEN $2='RETIRED' THEN $4 ELSE retired_at END WHERE external_money_method_id=$1`,
        [id, next, c.actorId, n],
      );
      await t.query(`INSERT INTO external_money_method_history VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [
        this.ids.generate(),
        id,
        m.state,
        next,
        reason,
        c.actorId,
        c.correlationId,
        n,
      ]);
      return id;
    });
  }
  async listMethods() {
    return {
      items: (
        await this.pool.query(`SELECT * FROM external_money_methods ORDER BY created_at DESC`)
      ).rows,
    };
  }
  async daily(_c: ExecutionContext, branch: string, date: string) {
    const r = await this.pool.query<ReturnType<JSON['parse']>>(
      `SELECT count(*) sale_count,COALESCE(sum(total_amount_clp),0) gross_amount_clp FROM pos_sales s JOIN branches b USING(branch_id) WHERE s.branch_id=$1 AND s.completed_at IS NOT NULL AND (s.completed_at AT TIME ZONE b.timezone)::date=$2::date`,
      [branch, date],
    );
    return {
      date,
      sale_count: Number(r.rows[0].sale_count),
      gross_amount_clp: Number(r.rows[0].gross_amount_clp),
      net_amount_clp: Number(r.rows[0].gross_amount_clp),
    };
  }
  private async lockDraft(t: PgTransaction, id: string) {
    const x = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM pos_sales WHERE pos_sale_id=$1 FOR UPDATE`,
        [id],
      )
    ).rows[0];
    if (!x) throw new PosError('POS_SALE_NOT_FOUND', 404, 'Sale not found.');
    if (x.state !== 'DRAFT')
      throw new PosError('POS_SALE_IMMUTABLE', 409, 'Sale is no longer mutable.');
    return x;
  }
  private async buildDeliverySnapshot(
    t: PgTransaction,
    input: ReturnType<JSON['parse']>,
    orderTotalWithoutShippingClp: number,
    n: Date,
  ) {
    if (input.mode === 'PICKUP') {
      const info = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT branch_id,public_address,opening_hours,current_published_revision_id FROM public_service_info WHERE branch_id=$1 AND state='PUBLISHED' FOR SHARE`,
          [input.branchId],
        )
      ).rows[0];
      if (!info)
        throw new PosError(
          'PICKUP_INFORMATION_NOT_PUBLISHED',
          409,
          'Pickup information is unavailable.',
        );
      return snapshotRegistry.validate('DeliverySnapshot.v2', {
        snapshot_contract: 'DeliverySnapshot.v2',
        snapshot_schema_version: 2,
        mode: 'PICKUP',
        recipientName: input.recipientName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        branchId: info.branch_id,
        publicAddress: info.public_address,
        publicServiceInfoRevisionId: info.current_published_revision_id,
        openingHours: info.opening_hours,
        capturedAt: n.toISOString(),
      });
    }
    return snapshotRegistry.validate('DeliverySnapshot.v2', {
      snapshot_contract: 'DeliverySnapshot.v2',
      snapshot_schema_version: 2,
      mode: 'SHIPPING',
      recipientName: input.recipientName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      shippingPaymentMode: 'FREIGHT_COLLECT',
      destinationType: 'CARRIER_AGENCY',
      carrier: input.carrier,
      destinationCommune: input.destinationCommune,
      agencyDestination: input.agencyDestination,
      shippingCostAmountClp: null,
      shippingIncludedInOrderTotal: false,
      orderTotalWithoutShippingClp,
      capturedAt: n.toISOString(),
    });
  }
  private async freezeIdentity(t: PgTransaction, s: ReturnType<JSON['parse']>, n: Date) {
    if (
      s.sale_type === 'PREORDER' &&
      !s.account_id &&
      (!s.buyer_name || (!s.buyer_email && !s.buyer_phone))
    )
      throw new PosError(
        'PREORDER_IDENTITY_REQUIRED',
        409,
        'Preorder identity and contact are required.',
      );
    if (s.sale_type === 'PREORDER' && !s.delivery_snapshot)
      throw new PosError('PREORDER_DELIVERY_REQUIRED', 409, 'Preorder delivery is required.');
    if (s.sale_type === 'PREORDER' && !s.account_id) {
      const snapshot = s.delivery_snapshot;
      if (
        snapshot.recipientName !== s.buyer_name ||
        snapshot.contactEmail !== s.buyer_email ||
        snapshot.contactPhone !== s.buyer_phone
      )
        throw new PosError(
          'PREORDER_BUYER_SNAPSHOT_MISMATCH',
          409,
          'Guest identity must match the delivery snapshot.',
        );
    }
    if (s.account_id && !s.identity_frozen_at) {
      const a = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT status,role FROM user_accounts WHERE account_id=$1 FOR SHARE`,
          [s.account_id],
        )
      ).rows[0];
      if (!a || a.status !== 'ACTIVE')
        throw new PosError('ACCOUNT_NOT_ACTIVE', 409, 'Account must be active.');
      await t.query(
        `UPDATE pos_sales SET account_role_snapshot=$2,account_state_snapshot=$3,identity_frozen_at=$4 WHERE pos_sale_id=$1`,
        [s.pos_sale_id, a.role, a.status, n],
      );
    }
  }
  private async assertActiveAccount(t: PgTransaction, accountId: string) {
    await this.requireActiveAccount(t, accountId);
  }
  private async requireActiveAccount(t: PgTransaction, accountId: string) {
    const account = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT status,current_email,current_phone FROM user_accounts WHERE account_id=$1 FOR SHARE`,
        [accountId],
      )
    ).rows[0];
    if (!account || account.status !== 'ACTIVE')
      throw new PosError('ACCOUNT_NOT_ACTIVE', 409, 'Account must be active.');
    return account;
  }
  private async retotal(t: PgTransaction, id: string, n: Date) {
    await t.query(
      `UPDATE pos_sales SET subtotal_amount_clp=(SELECT COALESCE(sum(line_subtotal_amount_clp),0) FROM pos_sale_lines WHERE pos_sale_id=$1),total_amount_clp=GREATEST(0,(SELECT COALESCE(sum(line_subtotal_amount_clp),0) FROM pos_sale_lines WHERE pos_sale_id=$1)-automatic_discount_amount_clp-loyalty_redeemed_amount_clp+COALESCE(shipping_fee_amount_clp,0)),version=version+1,updated_at=$2 WHERE pos_sale_id=$1`,
      [id, n],
    );
    await this.syncDeliverySnapshotTotal(t, id);
  }
  private async syncDeliverySnapshotTotal(t: PgTransaction, id: string) {
    await t.query(
      `UPDATE pos_sales
          SET delivery_snapshot=jsonb_set(
            delivery_snapshot,'{orderTotalWithoutShippingClp}',to_jsonb(total_amount_clp),false)
        WHERE pos_sale_id=$1 AND delivery_mode='SHIPPING'
          AND delivery_snapshot->>'snapshot_contract'='DeliverySnapshot.v2'
          AND delivery_snapshot->>'snapshot_schema_version'='2'`,
      [id],
    );
  }
  private async state(
    t: PgTransaction,
    c: ExecutionContext,
    id: string,
    state: string,
    n: Date,
    reason: string | null = null,
  ) {
    const old = (
      await t.query<ReturnType<JSON['parse']>>(`SELECT state FROM pos_sales WHERE pos_sale_id=$1`, [
        id,
      ])
    ).rows[0].state;
    await t.query(
      `UPDATE pos_sales SET state=$2,prepared_at=CASE WHEN $2='AWAITING_EXTERNAL_PAYMENT_CONFIRMATION' THEN $3 WHEN $2='DRAFT' THEN NULL ELSE prepared_at END,completed_at=CASE WHEN $2='COMPLETED' THEN $3 ELSE completed_at END,discarded_at=CASE WHEN $2='DISCARDED' THEN $3 ELSE discarded_at END,account_role_snapshot=CASE WHEN $2='DRAFT' THEN NULL ELSE account_role_snapshot END,account_state_snapshot=CASE WHEN $2='DRAFT' THEN NULL ELSE account_state_snapshot END,identity_frozen_at=CASE WHEN $2='DRAFT' THEN NULL ELSE identity_frozen_at END,updated_at=$3,version=version+1 WHERE pos_sale_id=$1`,
      [id, state, n],
    );
    await t.query(`INSERT INTO pos_sale_state_history VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [
      this.ids.generate(),
      id,
      old,
      state,
      c.actorId,
      reason,
      c.correlationId,
      n,
    ]);
  }
  private async consumeRegular(
    t: PgTransaction,
    c: ExecutionContext,
    s: ReturnType<JSON['parse']>,
    n: Date,
  ) {
    const lines = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM pos_sale_lines WHERE pos_sale_id=$1 ORDER BY product_id FOR UPDATE`,
        [s.pos_sale_id],
      )
    ).rows;
    for (const line of lines) {
      const p = (
        await t.query<ReturnType<JSON['parse']>>(
          `SELECT * FROM inventory_positions WHERE product_id=$1 AND branch_id=$2 FOR UPDATE`,
          [line.product_id, s.branch_id],
        )
      ).rows[0];
      if (!p || Number(p.on_hand) - Number(p.reserved) < Number(line.quantity))
        throw new PosError('INVENTORY_INSUFFICIENT', 409, 'Insufficient inventory.');
      await t.query(
        `UPDATE inventory_positions SET on_hand=on_hand-$2,version=version+1,updated_at=$3 WHERE inventory_position_id=$1`,
        [p.inventory_position_id, line.quantity, n],
      );
      await t.query(
        `INSERT INTO inventory_movements VALUES($1,$2,'POS_SALE_CONSUMED',$3,'POS_SALE',$4,$5,NULL,NULL,$6,$7,$8)`,
        [
          this.ids.generate(),
          p.inventory_position_id,
          line.quantity,
          s.pos_sale_id,
          c.actorId,
          `${c.idempotencyKey}:${line.pos_sale_line_id}`,
          c.correlationId,
          n,
        ],
      );
    }
  }
  private async commitPreorder(t: PgTransaction, s: ReturnType<JSON['parse']>, n: Date) {
    const lines = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT l.*,c.product_id AS campaign_product_id,c.branch_id AS campaign_branch_id,c.operational_state,c.publication_status,c.capacity,c.temporarily_reserved,c.committed FROM pos_sale_lines l JOIN preorder_campaigns c ON c.preorder_campaign_id=l.preorder_campaign_id WHERE l.pos_sale_id=$1 ORDER BY c.preorder_campaign_id FOR UPDATE OF c`,
        [s.pos_sale_id],
      )
    ).rows;
    for (const l of lines) {
      if (l.operational_state !== 'OPEN' || l.publication_status !== 'PUBLISHED')
        throw new PosError('PREORDER_CAMPAIGN_NOT_OPEN', 409, 'Campaign unavailable.');
      if (
        Number(l.temporarily_reserved) + Number(l.committed) + Number(l.quantity) >
        Number(l.capacity)
      )
        throw new PosError('PREORDER_CAPACITY_EXCEEDED', 409, 'Campaign capacity exceeded.');
      if (l.product_id !== l.campaign_product_id || l.campaign_branch_id !== s.branch_id)
        throw new PosError('PREORDER_CAMPAIGN_INCOMPATIBLE', 409, 'Campaign is incompatible.');
      await t.query(
        `UPDATE preorder_campaigns SET committed=committed+$2,version=version+1,updated_at=$3 WHERE preorder_campaign_id=$1`,
        [l.preorder_campaign_id, l.quantity, n],
      );
      await t.query(
        `INSERT INTO preorder_commitments(preorder_commitment_id,preorder_campaign_id,pos_sale_line_id,account_id,guest_name,guest_email_normalized,guest_phone_e164,channel,state,quantity,fulfillment_snapshot,payment_confirmed_at,expires_at,updated_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'POS','PAID_COMMITTED',$8,$9,$10,NULL,$10,$10)`,
        [
          this.ids.generate(),
          l.preorder_campaign_id,
          l.pos_sale_line_id,
          s.account_id,
          s.account_id ? null : s.buyer_name,
          s.account_id ? null : s.buyer_email,
          s.account_id ? null : s.buyer_phone,
          l.quantity,
          s.delivery_snapshot,
          n,
        ],
      );
    }
  }
  private async evaluateAndCommitPromotions(
    t: PgTransaction,
    c: ExecutionContext,
    saleId: string,
    n: Date,
    commit: boolean,
  ) {
    const sale = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT s.*,b.timezone FROM pos_sales s JOIN branches b USING(branch_id) WHERE pos_sale_id=$1 FOR UPDATE OF s`,
        [saleId],
      )
    ).rows[0];
    const lines = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT pos_sale_line_id,product_id,game_id_snapshot,category_id_snapshot,quantity,unit_price_amount_clp FROM pos_sale_lines WHERE pos_sale_id=$1 ORDER BY pos_sale_line_id`,
        [saleId],
      )
    ).rows;
    if (lines.length === 0)
      throw new PosError('POS_LINES_REQUIRED', 409, 'At least one line is required.');
    const promotions = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM promotions WHERE state='ACTIVE' AND channel IN ('POS','BOTH') AND starts_at<=$1 AND ends_at>$1 AND (branch_id IS NULL OR branch_id=$2) ORDER BY promotion_id FOR UPDATE`,
        [n, sale.branch_id],
      )
    ).rows;
    const previews: PromotionPreview[] = [];
    let couponMatched = sale.coupon_code_normalized === null;
    for (const promotion of promotions) {
      let coupon: ReturnType<JSON['parse']> | null = null;
      if (promotion.activation_mode === 'COUPON_REQUIRED' && sale.coupon_code_normalized) {
        coupon =
          (
            await t.query<ReturnType<JSON['parse']>>(
              `SELECT * FROM coupons WHERE promotion_id=$1 AND normalized_code=$2 FOR UPDATE`,
              [promotion.promotion_id, sale.coupon_code_normalized],
            )
          ).rows[0] ?? null;
        if (coupon) couponMatched = true;
      }
      if (promotion.activation_mode === 'COUPON_REQUIRED' && !coupon) continue;
      const targets = await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM promotion_targets WHERE promotion_id=$1 ORDER BY position,side`,
        [promotion.promotion_id],
      );
      const schedules = await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM promotion_weekly_schedules WHERE promotion_id=$1 ORDER BY position`,
        [promotion.promotion_id],
      );
      const count = async (where: string, values: readonly unknown[]) =>
        Number(
          (
            await t.query<ReturnType<JSON['parse']>>(
              `SELECT count(*)::int AS count FROM promotion_usages WHERE status='COMMITTED' AND ${where}`,
              values,
            )
          ).rows[0].count,
        );
      const promotionCommitted = await count('promotion_id=$1', [promotion.promotion_id]);
      const promotionAccountCommitted = sale.account_id
        ? await count('promotion_id=$1 AND account_id=$2', [
            promotion.promotion_id,
            sale.account_id,
          ])
        : 0;
      const couponCommitted = coupon ? await count('coupon_id=$1', [coupon.coupon_id]) : 0;
      const couponAccountCommitted =
        coupon && sale.account_id
          ? await count('coupon_id=$1 AND account_id=$2', [coupon.coupon_id, sale.account_id])
          : 0;
      previews.push({
        accountId: sale.account_id,
        branchId: sale.branch_id,
        channel: 'POS',
        coupon: coupon
          ? {
              counters: { committed: couponCommitted, released: 0, reserved: 0 },
              couponId: coupon.coupon_id,
              globalLimit: coupon.global_limit === null ? null : Number(coupon.global_limit),
              normalizedCode: coupon.normalized_code,
              perAccountCounters: sale.account_id
                ? { committed: couponAccountCommitted, released: 0, reserved: 0 }
                : null,
              perAccountLimit:
                coupon.per_account_limit === null ? null : Number(coupon.per_account_limit),
              promotionId: coupon.promotion_id,
              state: coupon.state,
              startsAt: coupon.starts_at ? new Date(coupon.starts_at).toISOString() : null,
              endsAt: coupon.ends_at ? new Date(coupon.ends_at).toISOString() : null,
            }
          : null,
        couponCode: coupon ? sale.coupon_code_normalized : null,
        evaluatedAt: n.toISOString(),
        excludedLineIds: [],
        lines: lines.map((line) => ({
          categoryId: line.category_id_snapshot,
          gameId: line.game_id_snapshot,
          lineId: line.pos_sale_line_id,
          productId: line.product_id,
          quantity: Number(line.quantity),
          unitPriceClp: Number(line.unit_price_amount_clp),
        })),
        orderPromotionExcluded: false,
        promotion: {
          activationMode: promotion.activation_mode,
          benefit: this.promotionBenefit(promotion),
          branchId: promotion.branch_id,
          channel: promotion.channel,
          createdAt: new Date(promotion.created_at).toISOString(),
          counters: { committed: promotionCommitted, released: 0, reserved: 0 },
          endsAt: new Date(promotion.ends_at).toISOString(),
          globalLimit: promotion.global_limit === null ? null : Number(promotion.global_limit),
          minimumEligibleAmountClp:
            promotion.minimum_eligible_amount_clp === null
              ? null
              : Number(promotion.minimum_eligible_amount_clp),
          minimumEligibleQuantity:
            promotion.minimum_eligible_quantity === null
              ? null
              : Number(promotion.minimum_eligible_quantity),
          name: promotion.name,
          perAccountCounters: sale.account_id
            ? { committed: promotionAccountCommitted, released: 0, reserved: 0 }
            : null,
          perAccountLimit:
            promotion.per_account_limit === null ? null : Number(promotion.per_account_limit),
          priority: Number(promotion.priority),
          promotionId: promotion.promotion_id,
          schedules: schedules.rows.map((row) => ({
            dayOfWeek: Number(row.day_of_week),
            startMinuteLocal: Number(row.start_minute_local),
            endMinuteLocal: Number(row.end_minute_local),
            position: Number(row.position),
          })),
          scope: promotion.scope,
          startsAt: new Date(promotion.starts_at).toISOString(),
          state: promotion.state,
          targets: targets.rows.map((row) => ({
            categoryId: row.category_id,
            gameId: row.game_id,
            kind: row.target_kind,
            position: Number(row.position),
            productId: row.product_id,
            side: row.side,
          })),
          updatedAt: new Date(promotion.updated_at).toISOString(),
        },
        timezone: sale.timezone,
      });
    }
    if (!couponMatched)
      throw new PosError('COUPON_INVALID', 409, 'Coupon is invalid or unavailable.');
    const evaluated = evaluatePromotionSet(previews);
    if (
      sale.coupon_code_normalized &&
      !Object.values(evaluated.couponStatuses).includes('APPLIED')
    ) {
      const limited = Object.values(evaluated.couponStatuses).includes('LIMIT_REACHED');
      throw new PosError(
        limited ? 'COUPON_LIMIT_REACHED' : 'COUPON_NOT_APPLIED',
        409,
        limited ? 'Coupon limit reached.' : 'Coupon is not applicable.',
      );
    }
    await t.query(
      `UPDATE pos_sale_lines SET line_promotion_discount_amount_clp=0,allocated_sale_promotion_discount_amount_clp=0,promotion_snapshot=NULL WHERE pos_sale_id=$1`,
      [saleId],
    );
    for (const snapshot of evaluated.snapshots) {
      if (commit) await this.commitPromotionUsage(t, c, sale, snapshot, n);
      for (const allocation of snapshot.allocations) {
        const column =
          snapshot.scope === 'LINE'
            ? 'line_promotion_discount_amount_clp'
            : 'allocated_sale_promotion_discount_amount_clp';
        await t.query(
          `UPDATE pos_sale_lines SET ${column}=${column}+$3,promotion_snapshot=COALESCE(promotion_snapshot,'[]'::jsonb)||$4::jsonb WHERE pos_sale_id=$1 AND pos_sale_line_id=$2`,
          [saleId, allocation.lineId, allocation.discountAmountClp, JSON.stringify([snapshot])],
        );
      }
    }
    const couponSnapshot =
      evaluated.snapshots.find((snapshot) => snapshot.couponId !== null) ?? null;
    await t.query(
      `UPDATE pos_sales SET automatic_discount_amount_clp=$2,applied_coupon_snapshot=$3,version=version+1,updated_at=$4 WHERE pos_sale_id=$1`,
      [saleId, evaluated.totalDiscountAmountClp, couponSnapshot, n],
    );
    await this.retotal(t, saleId, n);
  }
  private promotionBenefit(row: ReturnType<JSON['parse']>) {
    if (row.benefit_type === 'PERCENTAGE_DISCOUNT')
      return { type: row.benefit_type, basisPoints: Number(row.percentage_basis_points) } as const;
    if (row.benefit_type === 'FIXED_AMOUNT_DISCOUNT')
      return { type: row.benefit_type, amountClp: Number(row.fixed_amount_clp) } as const;
    if (row.benefit_type === 'FIXED_PRICE')
      return { type: row.benefit_type, priceClp: Number(row.fixed_price_clp) } as const;
    return {
      type: 'BUY_X_GET_Y' as const,
      buyQuantity: Number(row.buy_x_quantity),
      getQuantity: Number(row.get_y_quantity),
    };
  }
  private async commitPromotionUsage(
    t: PgTransaction,
    c: ExecutionContext,
    sale: ReturnType<JSON['parse']>,
    snapshot: AppliedPromotionSnapshotV1,
    n: Date,
  ) {
    await t.query(
      `INSERT INTO promotion_usages(promotion_usage_id,promotion_id,coupon_id,account_id,channel,source_type,source_id,status,discount_amount_clp,applied_promotion_snapshot,claimed_lines_snapshot,qualifying_units_snapshot,benefited_units_snapshot,committed_at,released_at,occurred_at,idempotency_key) VALUES($1,$2,$3,$4,'POS','POS_SALE',$5,'COMMITTED',$6,$7,$8,$9,$10,$11,NULL,$11,$12) ON CONFLICT(promotion_id,source_type,source_id) DO NOTHING`,
      [
        this.ids.generate(),
        snapshot.promotionId,
        snapshot.couponId,
        sale.account_id,
        sale.pos_sale_id,
        snapshot.totalDiscountAmountClp,
        snapshot,
        JSON.stringify(snapshot.allocations),
        JSON.stringify(snapshot.qualifyingUnits),
        JSON.stringify(snapshot.benefitedUnits),
        n,
        `${c.idempotencyKey}:PROMOTION:${snapshot.promotionId}`,
      ],
    );
  }
  private async applyLoyalty(
    t: PgTransaction,
    c: ExecutionContext,
    saleId: string,
    n: Date,
    commit: boolean,
  ) {
    const s = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM pos_sales WHERE pos_sale_id=$1 FOR UPDATE`,
        [saleId],
      )
    ).rows[0];
    if (!s.account_id) {
      if (Number(s.loyalty_points_requested) > 0)
        throw new PosError(
          'LOYALTY_ACCOUNT_REQUIRED',
          409,
          'A linked account is required for loyalty.',
        );
      await t.query(
        `UPDATE pos_sales SET loyalty_redeemed_amount_clp=0,loyalty_points_redeemed=0,loyalty_points_earned=0,loyalty_eligible_amount_clp=0,loyalty_configuration_snapshot=NULL,total_amount_clp=GREATEST(0,subtotal_amount_clp-automatic_discount_amount_clp+COALESCE(shipping_fee_amount_clp,0)) WHERE pos_sale_id=$1`,
        [saleId],
      );
      return;
    }
    const cfg = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM loyalty_configurations WHERE branch_id=$1 AND state='ACTIVE' FOR UPDATE`,
        [s.branch_id],
      )
    ).rows[0];
    if (!cfg) {
      if (Number(s.loyalty_points_requested) > 0)
        throw new PosError('LOYALTY_CONFIGURATION_NOT_ACTIVE', 409, 'Loyalty is not active.');
      await t.query(
        `UPDATE pos_sales SET loyalty_redeemed_amount_clp=0,loyalty_points_redeemed=0,loyalty_points_earned=0,loyalty_eligible_amount_clp=0,loyalty_configuration_snapshot=NULL,total_amount_clp=GREATEST(0,subtotal_amount_clp-automatic_discount_amount_clp+COALESCE(shipping_fee_amount_clp,0)) WHERE pos_sale_id=$1`,
        [saleId],
      );
      return;
    }
    const account = (
      await t.query<ReturnType<JSON['parse']>>(
        `SELECT * FROM loyalty_accounts WHERE account_id=$1 FOR UPDATE`,
        [s.account_id],
      )
    ).rows[0];
    if (!account)
      throw new PosError('LOYALTY_ACCOUNT_NOT_FOUND', 409, 'Loyalty account was not found.');
    let redemption;
    try {
      redemption = calculateRedeem({
        balance: Number(account.balance),
        reservedPoints: Number(account.reserved_points),
        requestedPoints: Number(s.loyalty_points_requested),
        merchandiseSubtotalClp: Number(s.subtotal_amount_clp),
        promotionDiscountClp: Number(s.automatic_discount_amount_clp),
        shippingFeeClp: s.shipping_fee_amount_clp === null ? 0 : Number(s.shipping_fee_amount_clp),
        redeemClpPerPoint: Number(cfg.redeem_clp_per_point),
        minimumRedeemPoints: Number(cfg.minimum_redeem_points),
        maximumRedeemBasisPoints:
          cfg.maximum_redeem_basis_points === null ? null : Number(cfg.maximum_redeem_basis_points),
      });
    } catch (error) {
      if (error instanceof LoyaltyError)
        throw new PosError(error.code, error.category === 'VALIDATION' ? 422 : 409, error.message);
      throw error;
    }
    const redeem = Number(s.loyalty_points_requested);
    const earned = calculateEarn({
      accountLinked: true,
      earnClpPerPoint: Number(cfg.earn_clp_per_point),
      merchandiseSubtotalClp: Number(s.subtotal_amount_clp),
      promotionDiscountClp: Number(s.automatic_discount_amount_clp),
      pointsDiscountClp: redemption.pointsDiscountClp,
      shippingFeeClp: s.shipping_fee_amount_clp === null ? 0 : Number(s.shipping_fee_amount_clp),
    });
    const eligible = earned.loyaltyEligibleAmountClp,
      earn = earned.pointsEarned;
    let balance = Number(account.balance);
    if (commit && redeem) {
      balance -= redeem;
      await t.query(
        `INSERT INTO loyalty_movements(movement_id,loyalty_account_id,type,points_signed,source_type,source_id,actor_id,reason,balance_after,idempotency_key,loyalty_configuration_id,earn_clp_per_point_snapshot,redeem_clp_per_point_snapshot,loyalty_eligible_amount_snapshot,occurred_at) VALUES($1,$2,'REDEEM',$3,'POS_SALE',$4,$5,NULL,$6,$7,$8,NULL,$9,$10,$11)`,
        [
          this.ids.generate(),
          account.loyalty_account_id,
          -redeem,
          s.pos_sale_id,
          c.actorId,
          balance,
          `${c.idempotencyKey}:REDEEM`,
          cfg.loyalty_configuration_id,
          cfg.redeem_clp_per_point,
          eligible,
          n,
        ],
      );
    }
    if (commit && earn) {
      balance += earn;
      await t.query(
        `INSERT INTO loyalty_movements(movement_id,loyalty_account_id,type,points_signed,source_type,source_id,actor_id,reason,balance_after,idempotency_key,loyalty_configuration_id,earn_clp_per_point_snapshot,redeem_clp_per_point_snapshot,loyalty_eligible_amount_snapshot,occurred_at) VALUES($1,$2,'EARN',$3,'POS_SALE',$4,$5,NULL,$6,$7,$8,$9,NULL,$10,$11)`,
        [
          this.ids.generate(),
          account.loyalty_account_id,
          earn,
          s.pos_sale_id,
          c.actorId,
          balance,
          `${c.idempotencyKey}:EARN`,
          cfg.loyalty_configuration_id,
          cfg.earn_clp_per_point,
          eligible,
          n,
        ],
      );
    }
    if (commit)
      await t.query(
        `UPDATE loyalty_accounts SET balance=$2,version=version+1,updated_at=$3 WHERE loyalty_account_id=$1`,
        [account.loyalty_account_id, balance, n],
      );
    const configSnapshot = {
      snapshot_contract: 'LoyaltyConfigurationSnapshot.v1',
      snapshot_schema_version: 1,
      loyaltyConfigurationId: cfg.loyalty_configuration_id,
      branchId: cfg.branch_id,
      versionNumber: Number(cfg.version_number),
      earnClpPerPoint: Number(cfg.earn_clp_per_point),
      redeemClpPerPoint: Number(cfg.redeem_clp_per_point),
      minimumRedeemPoints: Number(cfg.minimum_redeem_points),
      maximumRedeemBasisPoints:
        cfg.maximum_redeem_basis_points === null ? null : Number(cfg.maximum_redeem_basis_points),
    };
    await t.query(
      `UPDATE pos_sales SET loyalty_redeemed_amount_clp=$2,loyalty_points_redeemed=$3,loyalty_points_earned=$4,loyalty_eligible_amount_clp=$5,loyalty_configuration_snapshot=$6,total_amount_clp=GREATEST(0,subtotal_amount_clp-automatic_discount_amount_clp-$2+COALESCE(shipping_fee_amount_clp,0)),version=version+1,updated_at=$7 WHERE pos_sale_id=$1`,
      [saleId, redemption.pointsDiscountClp, redeem, earn, eligible, configSnapshot, n],
    );
  }
}
function isPostgresIntegrityError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return ['23503', '23505', '23514', '23P01'].includes(String(error.code));
}

function hydratePosSale<Row extends Record<string, unknown>>(row: Row): Row {
  const snapshot = row.delivery_snapshot;
  if (snapshot === null || snapshot === undefined) return row;
  if (typeof snapshot !== 'object') throw new Error('Stored delivery snapshot is malformed.');
  const value = snapshot as Record<string, unknown>;
  const key =
    value.snapshot_contract === 'DeliverySnapshot.v1' && value.snapshot_schema_version === 1
      ? 'DeliverySnapshot.v1'
      : value.snapshot_contract === 'DeliverySnapshot.v2' && value.snapshot_schema_version === 2
        ? 'DeliverySnapshot.v2'
        : null;
  if (key === null) throw new Error('Stored delivery snapshot version is unsupported.');
  return { ...row, delivery_snapshot: snapshotRegistry.validate(key, snapshot) };
}
