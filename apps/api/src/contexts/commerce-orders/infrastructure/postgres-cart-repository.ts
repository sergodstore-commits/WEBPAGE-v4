import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  CartGroupView,
  CartLineView,
  CartMutationBase,
  CartRepository,
  CartView,
} from '../application/ports.js';
import { CartError, type CartOwner } from '../domain/cart.js';
import type { StoredCartDeliveryIntent } from '../domain/checkout.js';

const IDEMPOTENCY_SCOPE = 'CART_MUTATION';

export class PgCartRepository implements CartRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async findCart(owner: CartOwner): Promise<CartView | null> {
    const result = await this.pool.query<CartRow>(activeCartQuery(owner, false), [
      ...ownerValues(owner),
    ]);
    const row = result.rows[0];
    return row === undefined ? null : this.loadCart(this.pool, row.cart_id);
  }

  ensureCart(input: CartMutationBase) {
    return this.idempotent(input, async (transaction, now) => {
      await lockOwner(transaction, input.owner);
      const existing = await transaction.query<CartRow>(
        activeCartQuery(input.owner, true),
        ownerValues(input.owner),
      );
      if (existing.rows[0] !== undefined) return existing.rows[0].cart_id;
      const cartId = this.uuids.generate();
      const expiration =
        input.owner.kind === 'ANONYMOUS'
          ? expiresAt(now, await activeAnonymousInactivityMinutes(transaction))
          : null;
      await transaction.query(
        `INSERT INTO carts(cart_id,owner_account_id,anonymous_session_id,state,expires_at,
          merged_into_cart_id,version,created_at,updated_at)
         VALUES($1,$2,$3,'ACTIVE',$4,NULL,1,$5,$5)`,
        [
          cartId,
          input.owner.kind === 'ACCOUNT' ? input.owner.accountId : null,
          input.owner.kind === 'ANONYMOUS' ? input.owner.anonymousSessionId : null,
          expiration,
          now,
        ],
      );
      await this.audit(
        transaction,
        input.context,
        'CART_CREATED',
        cartId,
        input.idempotencyKey,
        now,
      );
      return cartId;
    });
  }

  addLine(input: Parameters<CartRepository['addLine']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      const cart = await lockOwnedActiveCart(transaction, input.owner);
      const candidate = await requiredAvailableCandidate(
        transaction,
        input.productId,
        input.preorderCampaignId,
        now,
      );
      const groupId = await findOrCreateCompatibleGroup(
        transaction,
        this.uuids,
        cart.cart_id,
        candidate,
        now,
      );
      const existing = await transaction.query<{ cart_line_id: string; quantity: string }>(
        `SELECT cart_line_id,quantity FROM cart_lines
          WHERE cart_group_id=$1 AND product_id=$2
            AND preorder_campaign_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE`,
        [groupId, input.productId, input.preorderCampaignId],
      );
      const line = existing.rows[0];
      if (line === undefined) {
        await transaction.query(
          `INSERT INTO cart_lines(cart_line_id,cart_group_id,product_id,preorder_campaign_id,
            quantity,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$6)`,
          [
            this.uuids.generate(),
            groupId,
            input.productId,
            input.preorderCampaignId,
            input.quantity,
            now,
          ],
        );
      } else {
        const quantity = safePositive(line.quantity, 'quantity') + input.quantity;
        if (!Number.isSafeInteger(quantity)) throw validation('CART_QUANTITY_INVALID');
        await transaction.query(
          `UPDATE cart_lines SET quantity=$2,updated_at=$3 WHERE cart_line_id=$1`,
          [line.cart_line_id, quantity, now],
        );
      }
      await touchCart(transaction, cart, now);
      await this.audit(
        transaction,
        input.context,
        'CART_LINE_ADDED',
        cart.cart_id,
        input.idempotencyKey,
        now,
      );
      return cart.cart_id;
    });
  }

  updateLine(input: Parameters<CartRepository['updateLine']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      const cart = await lockOwnedActiveCart(transaction, input.owner);
      const line = await requiredOwnedLine(transaction, cart.cart_id, input.cartLineId, true);
      if (line.group_state === 'CONFLICT') throw conflict('CART_CONFLICT_LINE_REQUIRES_RESOLUTION');
      await requiredAvailableCandidate(
        transaction,
        line.product_id,
        line.preorder_campaign_id,
        now,
      );
      await transaction.query(
        `UPDATE cart_lines SET quantity=$2,updated_at=$3 WHERE cart_line_id=$1`,
        [line.cart_line_id, input.quantity, now],
      );
      await touchCart(transaction, cart, now);
      await this.audit(
        transaction,
        input.context,
        'CART_LINE_UPDATED',
        cart.cart_id,
        input.idempotencyKey,
        now,
      );
      return cart.cart_id;
    });
  }

  removeLine(input: Parameters<CartRepository['removeLine']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      const cart = await lockOwnedActiveCart(transaction, input.owner);
      const line = await requiredOwnedLine(transaction, cart.cart_id, input.cartLineId, true);
      await transaction.query(`DELETE FROM cart_lines WHERE cart_line_id=$1`, [line.cart_line_id]);
      await removeEmptyConflictGroup(transaction, line.cart_group_id, now);
      await touchCart(transaction, cart, now);
      await this.audit(
        transaction,
        input.context,
        'CART_LINE_REMOVED',
        cart.cart_id,
        input.idempotencyKey,
        now,
      );
      return cart.cart_id;
    });
  }

  moveConflictLine(input: Parameters<CartRepository['moveConflictLine']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      const cart = await lockOwnedActiveCart(transaction, input.owner);
      const line = await requiredOwnedLine(transaction, cart.cart_id, input.cartLineId, true);
      if (line.group_type !== 'CONFLICT' || line.group_state !== 'CONFLICT') {
        throw conflict('CART_LINE_NOT_IN_CONFLICT');
      }
      const target = await requiredOwnedGroup(transaction, cart.cart_id, input.targetGroupId, true);
      if (target.state !== 'ACTIVE') throw conflict('CART_TARGET_GROUP_NOT_ACTIVE');
      const candidate = await requiredAvailableCandidate(
        transaction,
        line.product_id,
        line.preorder_campaign_id,
        now,
      );
      await assertGroupCompatible(transaction, target, candidate);
      await moveOrCombineLine(transaction, line, target.cart_group_id, now);
      await removeEmptyConflictGroup(transaction, line.cart_group_id, now);
      await touchCart(transaction, cart, now);
      await this.audit(
        transaction,
        input.context,
        'CART_CONFLICT_RESOLVED',
        cart.cart_id,
        input.idempotencyKey,
        now,
      );
      return cart.cart_id;
    });
  }

  createCompatibleGroup(input: Parameters<CartRepository['createCompatibleGroup']>[0]) {
    return this.idempotent(input, async (transaction, now) => {
      const cart = await lockOwnedActiveCart(transaction, input.owner);
      const line = await requiredOwnedLine(transaction, cart.cart_id, input.cartLineId, true);
      if (line.group_type !== 'CONFLICT' || line.group_state !== 'CONFLICT') {
        throw conflict('CART_LINE_NOT_IN_CONFLICT');
      }
      const candidate = await requiredAvailableCandidate(
        transaction,
        line.product_id,
        line.preorder_campaign_id,
        now,
      );
      if (await compatibleGroupExists(transaction, cart.cart_id, candidate)) {
        throw conflict('CART_COMPATIBLE_GROUP_ALREADY_EXISTS');
      }
      const targetId = this.uuids.generate();
      await insertCompatibleGroup(transaction, targetId, cart.cart_id, candidate, now);
      await transaction.query(
        `UPDATE cart_lines SET cart_group_id=$2,updated_at=$3 WHERE cart_line_id=$1`,
        [line.cart_line_id, targetId, now],
      );
      await removeEmptyConflictGroup(transaction, line.cart_group_id, now);
      await touchCart(transaction, cart, now);
      await this.audit(
        transaction,
        input.context,
        'CART_COMPATIBLE_GROUP_CREATED',
        cart.cart_id,
        input.idempotencyKey,
        now,
      );
      return cart.cart_id;
    });
  }

  merge(input: Parameters<CartRepository['merge']>[0]) {
    const base: CartMutationBase = {
      context: input.context,
      idempotencyKey: input.idempotencyKey,
      owner: { accountId: input.accountId, kind: 'ACCOUNT' },
      requestFingerprint: input.requestFingerprint,
    };
    return this.idempotent(base, async (transaction, now) => {
      const anonymousOwner: CartOwner = {
        anonymousSessionId: input.anonymousSessionId,
        kind: 'ANONYMOUS',
      };
      const accountOwner: CartOwner = { accountId: input.accountId, kind: 'ACCOUNT' };
      await lockBothOwners(transaction, anonymousOwner, accountOwner);
      const sourceResult = await transaction.query<CartRow>(
        `SELECT * FROM carts WHERE anonymous_session_id=$1
          ORDER BY created_at DESC,cart_id DESC LIMIT 1 FOR UPDATE`,
        [input.anonymousSessionId],
      );
      const source = sourceResult.rows[0];
      if (source === undefined) throw notFound('CART_NOT_FOUND');
      if (source.state === 'MERGED' && source.merged_into_cart_id !== null) {
        return source.merged_into_cart_id;
      }
      if (source.state !== 'ACTIVE') throw conflict('CART_NOT_ACTIVE');

      let destination = (
        await transaction.query<CartRow>(activeCartQuery(accountOwner, true), [input.accountId])
      ).rows[0];
      if (destination === undefined) {
        const destinationId = this.uuids.generate();
        await transaction.query(
          `INSERT INTO carts(cart_id,owner_account_id,anonymous_session_id,state,expires_at,
            merged_into_cart_id,version,created_at,updated_at)
           VALUES($1,$2,NULL,'ACTIVE',NULL,NULL,1,$3,$3)`,
          [destinationId, input.accountId, now],
        );
        destination = (
          await transaction.query<CartRow>(`SELECT * FROM carts WHERE cart_id=$1 FOR UPDATE`, [
            destinationId,
          ])
        ).rows[0];
      }
      if (destination === undefined) throw new Error('Destination cart was not created.');

      let conflictGroupId: string | null = null;
      const destinationLines = await transaction.query<OwnedLineRow>(
        `SELECT line.*,grp.cart_id,grp.group_type,grp.state AS group_state
           FROM cart_lines line JOIN cart_groups grp USING(cart_group_id)
          WHERE grp.cart_id=$1 ORDER BY line.created_at,line.cart_line_id FOR UPDATE OF line`,
        [destination.cart_id],
      );
      for (const line of destinationLines.rows) {
        if (line.group_state !== 'ACTIVE') continue;
        const candidate = await optionalAvailableCandidate(
          transaction,
          line.product_id,
          line.preorder_campaign_id,
          now,
        );
        if (candidate !== null) continue;
        conflictGroupId ??= await findOrCreateConflictGroup(
          transaction,
          this.uuids,
          destination.cart_id,
          now,
        );
        await moveOrCombineLine(transaction, line, conflictGroupId, now);
      }
      await removeEmptyMutableGroups(transaction, destination.cart_id, now);

      const lines = await transaction.query<OwnedLineRow>(
        `SELECT line.*,grp.cart_id,grp.group_type,grp.state AS group_state
           FROM cart_lines line JOIN cart_groups grp USING(cart_group_id)
          WHERE grp.cart_id=$1 ORDER BY line.created_at,line.cart_line_id FOR UPDATE OF line`,
        [source.cart_id],
      );
      for (const line of lines.rows) {
        const candidate = await optionalAvailableCandidate(
          transaction,
          line.product_id,
          line.preorder_campaign_id,
          now,
        );
        let targetId: string;
        if (line.group_type === 'CONFLICT' || candidate === null) {
          conflictGroupId ??= await findOrCreateConflictGroup(
            transaction,
            this.uuids,
            destination.cart_id,
            now,
          );
          targetId = conflictGroupId;
        } else {
          targetId = await findOrCreateCompatibleGroup(
            transaction,
            this.uuids,
            destination.cart_id,
            candidate,
            now,
          );
        }
        await moveOrCombineLine(transaction, line, targetId, now);
      }
      await removeEmptyMutableGroups(transaction, source.cart_id, now);
      await transaction.query(
        `UPDATE carts SET state='MERGED',expires_at=NULL,merged_into_cart_id=$2,
          version=version+1,updated_at=$3 WHERE cart_id=$1`,
        [source.cart_id, destination.cart_id, now],
      );
      await transaction.query(`UPDATE carts SET version=version+1,updated_at=$2 WHERE cart_id=$1`, [
        destination.cart_id,
        now,
      ]);
      await this.audit(
        transaction,
        input.context,
        'CART_MERGED',
        source.cart_id,
        input.idempotencyKey,
        now,
      );
      return destination.cart_id;
    });
  }

  async processExpiredAnonymousCarts(context: ExecutionContext, now: Date) {
    return this.#transactions.execute(async (transaction) => {
      const candidates = await transaction.query<{ cart_id: string }>(
        `SELECT cart_id FROM carts
          WHERE state='ACTIVE' AND owner_account_id IS NULL AND expires_at<=$1
          ORDER BY expires_at,cart_id FOR UPDATE SKIP LOCKED LIMIT 500`,
        [now],
      );
      let expired = 0;
      for (const candidate of candidates.rows) {
        const updated = await transaction.query(
          `UPDATE carts SET state='EXPIRED',version=version+1,updated_at=$2
            WHERE cart_id=$1 AND state='ACTIVE' AND owner_account_id IS NULL AND expires_at<=$2`,
          [candidate.cart_id, now],
        );
        if (updated.rowCount !== 1) continue;
        expired += 1;
        await this.audit(transaction, context, 'CART_EXPIRED', candidate.cart_id, null, now);
      }
      return { expired, scanned: candidates.rows.length };
    });
  }

  private async idempotent(
    input: CartMutationBase,
    operation: (transaction: PgTransaction, now: Date) => Promise<string>,
  ): Promise<{ readonly cart: CartView; readonly replayed: boolean }> {
    try {
      return await this.#transactions.execute(async (transaction) => {
        const now = this.clock.now();
        const recordId = this.uuids.generate();
        const inserted = await transaction.query(
          `INSERT INTO idempotency_records(idempotency_record_id,scope,idempotency_key,
            fingerprint,status,attempts,processing_started_at,created_at,updated_at)
           VALUES($1,$2,$3,$4,'PROCESSING',1,$5,$5,$5)
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
            throw conflict('CART_IDEMPOTENCY_CONFLICT');
          }
          if (row.status !== 'COMPLETED' || row.result_reference === null) {
            throw conflict('CART_IDEMPOTENCY_IN_PROGRESS');
          }
          return { cart: await this.loadCart(transaction, row.result_reference), replayed: true };
        }
        const cartId = await operation(transaction, now);
        await transaction.query(
          `UPDATE idempotency_records SET status='COMPLETED',result_reference=$2,
            source_type='CART',source_id=$2,completed_at=$3,updated_at=$3
            WHERE idempotency_record_id=$1`,
          [recordId, cartId, now],
        );
        return { cart: await this.loadCart(transaction, cartId), replayed: false };
      });
    } catch (error) {
      if (error instanceof CartError) throw error;
      throw mapPostgresError(error);
    }
  }

  private async loadCart(queryable: Queryable, cartId: string): Promise<CartView> {
    const cartResult = await queryable.query<CartRow>(`SELECT * FROM carts WHERE cart_id=$1`, [
      cartId,
    ]);
    const cart = cartResult.rows[0];
    if (cart === undefined) throw notFound('CART_NOT_FOUND');
    const groups = await queryable.query<GroupRow>(
      `SELECT * FROM cart_groups WHERE cart_id=$1 ORDER BY created_at,cart_group_id`,
      [cartId],
    );
    const lines = await queryable.query<LineViewRow>(
      `SELECT line.*,product.sku,product.name,product.sale_type,product.price_amount_clp,
              product.language,product.edition,product.condition
         FROM cart_lines line JOIN cart_groups grp USING(cart_group_id)
         JOIN products product USING(product_id)
        WHERE grp.cart_id=$1 ORDER BY line.created_at,line.cart_line_id`,
      [cartId],
    );
    const byGroup = new Map<string, CartLineView[]>();
    for (const line of lines.rows) {
      const item = mapLine(line);
      const current = byGroup.get(line.cart_group_id) ?? [];
      current.push(item);
      byGroup.set(line.cart_group_id, current);
    }
    return {
      cartId: cart.cart_id,
      createdAt: cart.created_at,
      expiresAt: cart.expires_at,
      groups: groups.rows.map((group) => mapGroup(group, byGroup.get(group.cart_group_id) ?? [])),
      mergedIntoCartId: cart.merged_into_cart_id,
      ownerKind: cart.owner_account_id === null ? 'ANONYMOUS' : 'ACCOUNT',
      state: cart.state,
      updatedAt: cart.updated_at,
      version: safePositive(cart.version, 'version'),
    };
  }

  private async audit(
    transaction: PgTransaction,
    context: ExecutionContext,
    action: string,
    cartId: string,
    idempotencyKey: string | null,
    now: Date,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO audit_entries(audit_entry_id,actor_id,actor_type,action,resource_type,
        resource_id,result,reason,correlation_id,causation_id,idempotency_key,occurred_at)
       VALUES($1,$2,$3,$4,'CART',$5,'SUCCESS',NULL,$6,$7,$8,$9)`,
      [
        this.uuids.generate(),
        context.actorId ?? null,
        context.actorType,
        action,
        cartId,
        context.correlationId,
        context.causationId ?? null,
        idempotencyKey,
        now,
      ],
    );
  }
}

interface Queryable {
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
}
interface IdempotencyRow extends QueryResultRow {
  readonly fingerprint: string;
  readonly result_reference: string | null;
  readonly status: string;
}
interface CartRow extends QueryResultRow {
  readonly anonymous_session_id: string | null;
  readonly cart_id: string;
  readonly created_at: Date;
  readonly expires_at: Date | null;
  readonly merged_into_cart_id: string | null;
  readonly owner_account_id: string | null;
  readonly state: CartView['state'];
  readonly updated_at: Date;
  readonly version: string;
}
interface GroupRow extends QueryResultRow {
  readonly cart_group_id: string;
  readonly cart_id: string;
  readonly checkout_version: string;
  readonly conflict_reason_codes: string[];
  readonly created_at: Date;
  readonly delivery_last_validated_at: Date | null;
  readonly delivery_mode: 'PICKUP' | 'SHIPPING' | null;
  readonly delivery_intent_schema_version: number | null;
  readonly delivery_validation_error_codes: string[];
  readonly delivery_validation_status: 'INVALID' | 'NOT_VALIDATED' | 'VALID';
  readonly group_type: CartGroupView['groupType'];
  readonly preorder_fulfillment_group_key: string | null;
  readonly pickup_branch_id: string | null;
  readonly requested_points: string | null;
  readonly selected_coupon_id: string | null;
  readonly shipping_additional_details: string | null;
  readonly shipping_address: string | null;
  readonly shipping_commune: string | null;
  readonly shipping_agency_destination: string | null;
  readonly shipping_carrier: 'CHILEXPRESS' | 'STARKEN' | null;
  readonly shipping_destination_type: 'CARRIER_AGENCY' | null;
  readonly shipping_included_in_order_total: boolean | null;
  readonly shipping_option_id: string | null;
  readonly shipping_payment_mode: 'FREIGHT_COLLECT' | null;
  readonly shipping_recipient_name: string | null;
  readonly state: CartGroupView['state'];
  readonly updated_at: Date;
}
interface OwnedLineRow extends QueryResultRow {
  readonly cart_group_id: string;
  readonly cart_id: string;
  readonly cart_line_id: string;
  readonly created_at: Date;
  readonly group_state: CartGroupView['state'];
  readonly group_type: CartGroupView['groupType'];
  readonly preorder_campaign_id: string | null;
  readonly product_id: string;
  readonly quantity: string;
  readonly updated_at: Date;
}
interface LineViewRow extends QueryResultRow {
  readonly cart_group_id: string;
  readonly cart_line_id: string;
  readonly condition: string | null;
  readonly created_at: Date;
  readonly edition: string | null;
  readonly language: string | null;
  readonly name: string;
  readonly preorder_campaign_id: string | null;
  readonly price_amount_clp: string;
  readonly product_id: string;
  readonly quantity: string;
  readonly sale_type: 'PREORDER' | 'REGULAR';
  readonly sku: string;
  readonly updated_at: Date;
}
interface Candidate {
  readonly fulfillmentGroupKey: string | null;
  readonly preorderCampaignId: string | null;
  readonly productId: string;
  readonly saleType: 'PREORDER' | 'REGULAR';
}

function activeCartQuery(owner: CartOwner, lock: boolean): string {
  return `SELECT * FROM carts WHERE state='ACTIVE' AND ${owner.kind === 'ACCOUNT' ? 'owner_account_id=$1' : 'anonymous_session_id=$1'}${lock ? ' FOR UPDATE' : ''}`;
}
function ownerValues(owner: CartOwner): readonly string[] {
  return [owner.kind === 'ACCOUNT' ? owner.accountId : owner.anonymousSessionId];
}
async function lockOwner(transaction: PgTransaction, owner: CartOwner): Promise<void> {
  const value =
    owner.kind === 'ACCOUNT' ? `ACCOUNT:${owner.accountId}` : `ANON:${owner.anonymousSessionId}`;
  await transaction.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
    `CART_OWNER:${value}`,
  ]);
}
async function lockBothOwners(
  transaction: PgTransaction,
  ...owners: readonly CartOwner[]
): Promise<void> {
  const ordered = [...owners].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  for (const owner of ordered) await lockOwner(transaction, owner);
}
async function lockOwnedActiveCart(transaction: PgTransaction, owner: CartOwner): Promise<CartRow> {
  await lockOwner(transaction, owner);
  const result = await transaction.query<CartRow>(activeCartQuery(owner, true), ownerValues(owner));
  const cart = result.rows[0];
  if (cart === undefined) throw notFound('CART_NOT_FOUND');
  return cart;
}
async function activeAnonymousInactivityMinutes(transaction: PgTransaction): Promise<number> {
  const result = await transaction.query<{ integer_value: string }>(
    `SELECT integer_value FROM system_configurations
      WHERE configuration_key='ANONYMOUS_CART_INACTIVITY_MINUTES'
        AND scope='GLOBAL' AND state='ACTIVE' FOR SHARE`,
  );
  const value = result.rows[0]?.integer_value;
  if (value === undefined) {
    throw new CartError(
      'CART_ANONYMOUS_INACTIVITY_CONFIGURATION_REQUIRED',
      'INFRASTRUCTURE',
      'Anonymous cart inactivity is not configured.',
    );
  }
  return safePositive(value, 'anonymous inactivity minutes');
}
function expiresAt(now: Date, minutes: number): Date {
  const value = new Date(now.getTime() + minutes * 60_000);
  if (!Number.isFinite(value.getTime())) throw validation('CART_EXPIRATION_INVALID');
  return value;
}
async function touchCart(transaction: PgTransaction, cart: CartRow, now: Date): Promise<void> {
  const expiration =
    cart.owner_account_id === null
      ? expiresAt(now, await activeAnonymousInactivityMinutes(transaction))
      : null;
  await transaction.query(
    `UPDATE carts SET expires_at=$2,version=version+1,updated_at=$3 WHERE cart_id=$1`,
    [cart.cart_id, expiration, now],
  );
}
async function requiredOwnedLine(
  transaction: PgTransaction,
  cartId: string,
  lineId: string,
  lock: boolean,
): Promise<OwnedLineRow> {
  const result = await transaction.query<OwnedLineRow>(
    `SELECT line.*,grp.cart_id,grp.group_type,grp.state AS group_state
       FROM cart_lines line JOIN cart_groups grp USING(cart_group_id)
      WHERE line.cart_line_id=$1 AND grp.cart_id=$2${lock ? ' FOR UPDATE OF line,grp' : ''}`,
    [lineId, cartId],
  );
  const line = result.rows[0];
  if (line === undefined) throw notFound('CART_LINE_NOT_FOUND');
  return line;
}
async function requiredOwnedGroup(
  transaction: PgTransaction,
  cartId: string,
  groupId: string,
  lock: boolean,
): Promise<GroupRow> {
  const result = await transaction.query<GroupRow>(
    `SELECT * FROM cart_groups WHERE cart_group_id=$1 AND cart_id=$2${lock ? ' FOR UPDATE' : ''}`,
    [groupId, cartId],
  );
  const group = result.rows[0];
  if (group === undefined) throw notFound('CART_GROUP_NOT_FOUND');
  return group;
}
async function optionalAvailableCandidate(
  transaction: PgTransaction,
  productId: string,
  campaignId: string | null,
  now: Date,
): Promise<Candidate | null> {
  const result = await transaction.query<{
    campaign_id: string | null;
    campaign_product_id: string | null;
    fulfillment_group_key: string | null;
    operational_state: string | null;
    preorder_publication_status: string | null;
    product_id: string;
    product_publication_status: string;
    sale_type: 'PREORDER' | 'REGULAR';
  }>(
    `SELECT product.product_id,product.sale_type,
            product.publication_status AS product_publication_status,
            campaign.preorder_campaign_id AS campaign_id,
            campaign.product_id AS campaign_product_id,campaign.fulfillment_group_key,
            campaign.operational_state,campaign.publication_status AS preorder_publication_status
       FROM products product
       LEFT JOIN preorder_campaigns campaign ON campaign.preorder_campaign_id=$2::uuid
      WHERE product.product_id=$1 FOR SHARE OF product`,
    [productId, campaignId],
  );
  const row = result.rows[0];
  if (row === undefined || row.product_publication_status !== 'PUBLISHED') return null;
  if (row.sale_type === 'REGULAR') {
    if (campaignId !== null) return null;
    const available = await transaction.query(
      `SELECT 1 FROM inventory_positions position JOIN branches branch USING(branch_id)
        WHERE position.product_id=$1 AND branch.state='ACTIVE'
          AND position.on_hand>position.reserved LIMIT 1`,
      [productId],
    );
    return available.rows.length === 0
      ? null
      : { fulfillmentGroupKey: null, preorderCampaignId: null, productId, saleType: 'REGULAR' };
  }
  if (
    campaignId === null ||
    row.campaign_id === null ||
    row.campaign_product_id !== productId ||
    row.operational_state !== 'OPEN' ||
    row.preorder_publication_status !== 'PUBLISHED'
  ) {
    return null;
  }
  const capacity = await transaction.query(
    `SELECT 1 FROM preorder_campaigns WHERE preorder_campaign_id=$1
      AND opens_at<=$2 AND closes_at>$2 AND temporarily_reserved+committed<capacity`,
    [campaignId, now],
  );
  return capacity.rows.length === 0
    ? null
    : {
        fulfillmentGroupKey: row.fulfillment_group_key,
        preorderCampaignId: campaignId,
        productId,
        saleType: 'PREORDER',
      };
}
async function requiredAvailableCandidate(
  transaction: PgTransaction,
  productId: string,
  campaignId: string | null,
  now: Date,
): Promise<Candidate> {
  const candidate = await optionalAvailableCandidate(transaction, productId, campaignId, now);
  if (candidate === null) throw conflict('CART_PRODUCT_NOT_AVAILABLE');
  return candidate;
}
async function compatibleGroupExists(
  transaction: PgTransaction,
  cartId: string,
  candidate: Candidate,
): Promise<boolean> {
  return (await findCompatibleGroup(transaction, cartId, candidate)) !== null;
}
async function findCompatibleGroup(
  transaction: PgTransaction,
  cartId: string,
  candidate: Candidate,
): Promise<string | null> {
  if (candidate.saleType === 'REGULAR') {
    return (
      (
        await transaction.query<{ cart_group_id: string }>(
          `SELECT cart_group_id FROM cart_groups
          WHERE cart_id=$1 AND group_type='REGULAR' AND state='ACTIVE' FOR UPDATE`,
          [cartId],
        )
      ).rows[0]?.cart_group_id ?? null
    );
  }
  if (candidate.fulfillmentGroupKey !== null) {
    return (
      (
        await transaction.query<{ cart_group_id: string }>(
          `SELECT cart_group_id FROM cart_groups
          WHERE cart_id=$1 AND group_type='PREORDER' AND state='ACTIVE'
            AND preorder_fulfillment_group_key=$2 FOR UPDATE`,
          [cartId, candidate.fulfillmentGroupKey],
        )
      ).rows[0]?.cart_group_id ?? null
    );
  }
  return (
    (
      await transaction.query<{ cart_group_id: string }>(
        `SELECT grp.cart_group_id FROM cart_groups grp
        JOIN cart_lines line USING(cart_group_id)
        WHERE grp.cart_id=$1 AND grp.group_type='PREORDER' AND grp.state='ACTIVE'
          AND grp.preorder_fulfillment_group_key IS NULL AND line.preorder_campaign_id=$2
        LIMIT 1 FOR UPDATE OF grp`,
        [cartId, candidate.preorderCampaignId],
      )
    ).rows[0]?.cart_group_id ?? null
  );
}
async function findOrCreateCompatibleGroup(
  transaction: PgTransaction,
  uuids: UuidGenerator,
  cartId: string,
  candidate: Candidate,
  now: Date,
): Promise<string> {
  const existing = await findCompatibleGroup(transaction, cartId, candidate);
  if (existing !== null) return existing;
  const id = uuids.generate();
  await insertCompatibleGroup(transaction, id, cartId, candidate, now);
  return id;
}
async function insertCompatibleGroup(
  transaction: PgTransaction,
  id: string,
  cartId: string,
  candidate: Candidate,
  now: Date,
): Promise<void> {
  await transaction.query(
    `INSERT INTO cart_groups(cart_group_id,cart_id,group_type,
      preorder_fulfillment_group_key,state,conflict_reason_codes,created_at,updated_at)
     VALUES($1,$2,$3,$4,'ACTIVE','{}',$5,$5)`,
    [id, cartId, candidate.saleType, candidate.fulfillmentGroupKey, now],
  );
}
async function findOrCreateConflictGroup(
  transaction: PgTransaction,
  uuids: UuidGenerator,
  cartId: string,
  now: Date,
): Promise<string> {
  const existing = await transaction.query<{ cart_group_id: string }>(
    `SELECT cart_group_id FROM cart_groups
      WHERE cart_id=$1 AND group_type='CONFLICT' AND state='CONFLICT'
      ORDER BY created_at,cart_group_id LIMIT 1 FOR UPDATE`,
    [cartId],
  );
  if (existing.rows[0] !== undefined) return existing.rows[0].cart_group_id;
  const id = uuids.generate();
  await transaction.query(
    `INSERT INTO cart_groups(cart_group_id,cart_id,group_type,
      preorder_fulfillment_group_key,state,conflict_reason_codes,created_at,updated_at)
     VALUES($1,$2,'CONFLICT',NULL,'CONFLICT',ARRAY['CART_GROUP_INCOMPATIBLE'],$3,$3)`,
    [id, cartId, now],
  );
  return id;
}
async function assertGroupCompatible(
  transaction: PgTransaction,
  group: GroupRow,
  candidate: Candidate,
): Promise<void> {
  if (group.group_type !== candidate.saleType) throw conflict('CART_GROUP_INCOMPATIBLE');
  if (
    candidate.saleType === 'PREORDER' &&
    group.preorder_fulfillment_group_key !== candidate.fulfillmentGroupKey
  ) {
    throw conflict('CART_GROUP_INCOMPATIBLE');
  }
  if (candidate.saleType === 'PREORDER' && candidate.fulfillmentGroupKey === null) {
    const incompatible = await transaction.query(
      `SELECT 1 FROM cart_lines WHERE cart_group_id=$1
        AND preorder_campaign_id IS DISTINCT FROM $2::uuid LIMIT 1`,
      [group.cart_group_id, candidate.preorderCampaignId],
    );
    if (incompatible.rows[0] !== undefined) throw conflict('CART_GROUP_INCOMPATIBLE');
  }
}
async function moveOrCombineLine(
  transaction: PgTransaction,
  line: OwnedLineRow,
  targetGroupId: string,
  now: Date,
): Promise<void> {
  const existing = await transaction.query<{ cart_line_id: string; quantity: string }>(
    `SELECT cart_line_id,quantity FROM cart_lines
      WHERE cart_group_id=$1 AND product_id=$2
        AND preorder_campaign_id IS NOT DISTINCT FROM $3::uuid FOR UPDATE`,
    [targetGroupId, line.product_id, line.preorder_campaign_id],
  );
  const target = existing.rows[0];
  if (target === undefined) {
    await transaction.query(
      `UPDATE cart_lines SET cart_group_id=$2,updated_at=$3 WHERE cart_line_id=$1`,
      [line.cart_line_id, targetGroupId, now],
    );
    return;
  }
  const quantity =
    safePositive(target.quantity, 'quantity') + safePositive(line.quantity, 'quantity');
  if (!Number.isSafeInteger(quantity)) throw validation('CART_QUANTITY_INVALID');
  await transaction.query(`UPDATE cart_lines SET quantity=$2,updated_at=$3 WHERE cart_line_id=$1`, [
    target.cart_line_id,
    quantity,
    now,
  ]);
  await transaction.query(`DELETE FROM cart_lines WHERE cart_line_id=$1`, [line.cart_line_id]);
}
async function removeEmptyConflictGroup(
  transaction: PgTransaction,
  groupId: string,
  now: Date,
): Promise<void> {
  await transaction.query(
    `UPDATE cart_groups SET state='REMOVED',updated_at=$2
      WHERE cart_group_id=$1 AND group_type='CONFLICT' AND state='CONFLICT'
        AND NOT EXISTS(SELECT 1 FROM cart_lines WHERE cart_group_id=$1)`,
    [groupId, now],
  );
}
async function removeEmptyMutableGroups(
  transaction: PgTransaction,
  cartId: string,
  now: Date,
): Promise<void> {
  await transaction.query(
    `UPDATE cart_groups SET state='REMOVED',updated_at=$2
      WHERE cart_id=$1 AND state IN ('ACTIVE','CONFLICT')
        AND NOT EXISTS(SELECT 1 FROM cart_lines line WHERE line.cart_group_id=cart_groups.cart_group_id)`,
    [cartId, now],
  );
}
function mapLine(row: LineViewRow): CartLineView {
  const quantity = safePositive(row.quantity, 'quantity');
  const unitPriceClp = safeNonnegative(row.price_amount_clp, 'price');
  const total = unitPriceClp * quantity;
  if (!Number.isSafeInteger(total)) throw new Error('Cart line total is outside supported range.');
  return {
    cartLineId: row.cart_line_id,
    condition: row.condition,
    createdAt: row.created_at,
    edition: row.edition,
    estimatedLineTotalClp: total,
    language: row.language,
    preorderCampaignId: row.preorder_campaign_id,
    productId: row.product_id,
    productName: row.name,
    quantity,
    saleType: row.sale_type,
    sku: row.sku,
    unitPriceClp,
    updatedAt: row.updated_at,
  };
}
function mapGroup(row: GroupRow, lines: readonly CartLineView[]): CartGroupView {
  return {
    cartGroupId: row.cart_group_id,
    checkoutVersion: safePositive(row.checkout_version, 'checkout version'),
    conflictReasonCodes: row.conflict_reason_codes,
    createdAt: row.created_at,
    deliveryIntent: mapDeliveryIntent(row),
    groupType: row.group_type,
    lines,
    preorderFulfillmentGroupKey: row.preorder_fulfillment_group_key,
    requestedPoints:
      row.requested_points === null ? null : safePositive(row.requested_points, 'requested points'),
    selectedCouponId: row.selected_coupon_id,
    state: row.state,
    updatedAt: row.updated_at,
  };
}
function mapDeliveryIntent(row: GroupRow): StoredCartDeliveryIntent | null {
  if (row.delivery_mode === null) return null;
  const validation = {
    lastValidatedAt: row.delivery_last_validated_at,
    validationErrorCodes: row.delivery_validation_error_codes,
    validationStatus: row.delivery_validation_status,
  };
  if (row.delivery_mode === 'PICKUP') {
    if (row.pickup_branch_id === null) throw new Error('Stored pickup intent is malformed.');
    return { ...validation, branchId: row.pickup_branch_id, mode: 'PICKUP' };
  }
  if (
    row.delivery_intent_schema_version !== 2 ||
    row.shipping_recipient_name === null ||
    row.shipping_commune === null ||
    row.shipping_payment_mode !== 'FREIGHT_COLLECT' ||
    row.shipping_destination_type !== 'CARRIER_AGENCY' ||
    !['CHILEXPRESS', 'STARKEN'].includes(row.shipping_carrier ?? '') ||
    row.shipping_agency_destination === null ||
    row.shipping_included_in_order_total !== false
  ) {
    throw new Error('Stored shipping intent is malformed.');
  }
  return {
    ...validation,
    agencyDestination: row.shipping_agency_destination,
    carrier: row.shipping_carrier as 'CHILEXPRESS' | 'STARKEN',
    destinationCommune: row.shipping_commune,
    destinationType: 'CARRIER_AGENCY',
    mode: 'SHIPPING',
    recipientName: row.shipping_recipient_name,
    shippingIncludedInOrderTotal: false,
    shippingPaymentMode: 'FREIGHT_COLLECT',
  };
}
function safeNonnegative(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Cart ${field} is invalid.`);
  return parsed;
}
function safePositive(value: string, field: string): number {
  const parsed = safeNonnegative(value, field);
  if (parsed === 0) throw new Error(`Cart ${field} must be positive.`);
  return parsed;
}
function validation(code: string): CartError {
  return new CartError(code, 'VALIDATION', 'Cart input is invalid.');
}
function conflict(code: string): CartError {
  return new CartError(code, 'CONFLICT', 'Cart operation conflicts with its current state.');
}
function notFound(code: string): CartError {
  return new CartError(code, 'NOT_FOUND', 'Cart resource was not found.');
}
function mapPostgresError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('code' in error)) return error;
  const code = String(error.code);
  if (code === '23503') return notFound('CART_REFERENCE_NOT_FOUND');
  if (code === '23505' || code === '23514' || code === '40001' || code === '40P01') {
    return conflict(code === '23505' ? 'CART_UNIQUE_CONFLICT' : 'CART_STATE_CONFLICT');
  }
  return error;
}
