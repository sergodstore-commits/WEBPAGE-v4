import type { OrderState } from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type { OrderRepository, OrderView } from '../application/order-ports.js';
import { OrderError } from '../domain/order.js';

export class PgOrderRepository implements OrderRepository {
  private readonly transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {
    this.transactions = new PgTransactionExecutor(pool);
  }

  getForAccount(accountId: string, orderId: string): Promise<OrderView> {
    return loadOrder(this.pool, orderId, accountId);
  }

  getForAdmin(orderId: string): Promise<OrderView> {
    return loadOrder(this.pool, orderId);
  }

  listForAccount(input: {
    readonly accountId: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly state?: OrderState;
  }) {
    return this.list({ ...input, admin: false });
  }

  listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly state?: OrderState;
  }) {
    return this.list({ ...input, admin: true });
  }

  async expirePending(input: {
    readonly context: ExecutionContext;
    readonly limit: number;
  }): Promise<{ readonly expired: number }> {
    const now = this.clock.now();
    return this.transactions.execute(async (transaction) => {
      const due = await transaction.query<{ order_id: string }>(
        `SELECT order_id FROM orders
          WHERE state='PENDING_PAYMENT' AND expires_at <= $1
          ORDER BY expires_at,order_id
          FOR UPDATE SKIP LOCKED LIMIT $2`,
        [now, input.limit],
      );
      for (const row of due.rows) {
        const regular = await transaction.query<ReservationRow>(
          `SELECT reservation.order_inventory_reservation_id reservation_id,
                  reservation.inventory_position_id source_id,reservation.quantity
             FROM order_inventory_reservations reservation
            WHERE reservation.order_id=$1 AND reservation.status='ACTIVE'
            FOR UPDATE`,
          [row.order_id],
        );
        for (const reservation of regular.rows) {
          const released = await transaction.query(
            `UPDATE inventory_positions
                SET reserved=reserved-$2,version=version+1,updated_at=$3
              WHERE inventory_position_id=$1 AND reserved >= $2`,
            [reservation.source_id, reservation.quantity, now],
          );
          if (released.rowCount !== 1) {
            throw new OrderError(
              'ORDER_RESERVATION_INVARIANT_BROKEN',
              'INFRASTRUCTURE',
              'Inventory reservation could not be released.',
            );
          }
          await transaction.query(
            `UPDATE order_inventory_reservations
                SET status='RELEASED',released_at=$2
              WHERE order_inventory_reservation_id=$1`,
            [reservation.reservation_id, now],
          );
          await transaction.query(
            `INSERT INTO inventory_movements(movement_id,inventory_position_id,movement_type,quantity,
               source_type,source_id,actor_id,reason,idempotency_key,correlation_id,occurred_at)
             VALUES($1,$2,'RESERVATION_RELEASED',$3,'ORDER',$4,$5,'PAYMENT_RESERVATION_EXPIRED',$6,$7,$8)
             ON CONFLICT(inventory_position_id,idempotency_key) DO NOTHING`,
            [
              this.uuids.generate(),
              reservation.source_id,
              reservation.quantity,
              row.order_id,
              input.context.actorId ?? null,
              `order-expire:${row.order_id}:${reservation.reservation_id}`,
              input.context.correlationId,
              now,
            ],
          );
        }
        const preorder = await transaction.query<ReservationRow>(
          `SELECT reservation.order_preorder_reservation_id reservation_id,
                  reservation.preorder_campaign_id source_id,reservation.quantity
             FROM order_preorder_reservations reservation
            WHERE reservation.order_id=$1 AND reservation.status='ACTIVE'
            FOR UPDATE`,
          [row.order_id],
        );
        for (const reservation of preorder.rows) {
          const released = await transaction.query(
            `UPDATE preorder_campaigns
                SET temporarily_reserved=temporarily_reserved-$2,updated_at=$3,version=version+1
              WHERE preorder_campaign_id=$1 AND temporarily_reserved >= $2`,
            [reservation.source_id, reservation.quantity, now],
          );
          if (released.rowCount !== 1) {
            throw new OrderError(
              'ORDER_PREORDER_RESERVATION_INVARIANT_BROKEN',
              'INFRASTRUCTURE',
              'Preorder reservation could not be released.',
            );
          }
          await transaction.query(
            `UPDATE order_preorder_reservations
                SET status='RELEASED',released_at=$2
              WHERE order_preorder_reservation_id=$1`,
            [reservation.reservation_id, now],
          );
        }
        await transaction.query(
          `UPDATE orders SET state='CANCELLED',cancelled_at=$2,updated_at=$2,version=version+1
            WHERE order_id=$1 AND state='PENDING_PAYMENT'`,
          [row.order_id, now],
        );
        await transaction.query(
          `INSERT INTO order_state_history(order_state_history_id,order_id,from_state,to_state,reason,
             actor_id,correlation_id,occurred_at)
           VALUES($1,$2,'PENDING_PAYMENT','CANCELLED','PAYMENT_RESERVATION_EXPIRED',$3,$4,$5)`,
          [
            this.uuids.generate(),
            row.order_id,
            input.context.actorId ?? null,
            input.context.correlationId,
            now,
          ],
        );
      }
      return { expired: due.rowCount ?? 0 };
    });
  }

  private async list(input: {
    readonly accountId?: string;
    readonly admin: boolean;
    readonly cursor?: string;
    readonly limit: number;
    readonly state?: OrderState;
  }): Promise<{ readonly items: readonly OrderView[]; readonly nextCursor: string | null }> {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (!input.admin) {
      values.push(input.accountId);
      conditions.push(`account_id=$${values.length}`);
    }
    if (input.state !== undefined) {
      values.push(input.state);
      conditions.push(`state=$${values.length}`);
    }
    if (input.cursor !== undefined) {
      values.push(input.cursor);
      conditions.push(`order_id < $${values.length}::uuid`);
    }
    values.push(input.limit + 1);
    const where = conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`;
    const ids = await this.pool.query<{ order_id: string }>(
      `SELECT order_id FROM orders ${where} ORDER BY order_id DESC LIMIT $${values.length}`,
      values,
    );
    const page = ids.rows.slice(0, input.limit);
    const items = await Promise.all(
      page.map((row) =>
        loadOrder(this.pool, row.order_id, input.admin ? undefined : input.accountId),
      ),
    );
    return {
      items,
      nextCursor: ids.rows.length > input.limit ? (page.at(-1)?.order_id ?? null) : null,
    };
  }
}

async function loadOrder(pool: Pool, orderId: string, accountId?: string): Promise<OrderView> {
  const order = await pool.query<OrderRow>(
    `SELECT * FROM orders WHERE order_id=$1${accountId === undefined ? '' : ' AND account_id=$2'}`,
    accountId === undefined ? [orderId] : [orderId, accountId],
  );
  const row = order.rows[0];
  if (row === undefined)
    throw new OrderError('ORDER_NOT_FOUND', 'NOT_FOUND', 'Order was not found.');
  const lines = await pool.query<OrderLineRow>(
    `SELECT * FROM order_lines WHERE order_id=$1 ORDER BY created_at,order_line_id`,
    [orderId],
  );
  return {
    accountId: row.account_id,
    branchId: row.branch_id,
    cartGroupId: row.cart_group_id,
    checkoutVersion: Number(row.checkout_version),
    createdAt: row.created_at,
    currency: 'CLP',
    deliveryMode: row.delivery_mode,
    deliverySnapshot: row.delivery_snapshot,
    expiresAt: row.expires_at,
    lines: lines.rows.map((line) => ({
      condition: line.condition_snapshot,
      edition: line.edition_snapshot,
      language: line.language_snapshot,
      lineSubtotalClp: Number(line.line_subtotal_clp),
      orderLineId: line.order_line_id,
      preorderCampaignId: line.preorder_campaign_id,
      productId: line.product_id,
      productName: line.product_name_snapshot,
      quantity: Number(line.quantity),
      saleType: line.sale_type,
      sku: line.sku_snapshot,
      unitPriceClp: Number(line.unit_price_clp),
    })),
    merchandiseSubtotalClp: Number(row.merchandise_subtotal_clp),
    orderId: row.order_id,
    orderType: row.order_type,
    pointsDiscountClp: Number(row.points_discount_clp),
    promotionDiscountClp: Number(row.promotion_discount_clp),
    publicNumber: row.public_number,
    requiresExternalPayment: row.requires_external_payment,
    shippingIncludedInOrderTotal: false,
    state: row.state,
    totalAmountClp: Number(row.total_amount_clp),
    updatedAt: row.updated_at,
  };
}

interface ReservationRow extends QueryResultRow {
  reservation_id: string;
  source_id: string;
  quantity: string | number;
}
interface OrderRow extends QueryResultRow {
  order_id: string;
  public_number: string;
  account_id: string;
  cart_group_id: string;
  branch_id: string;
  order_type: 'PREORDER' | 'REGULAR';
  state: OrderState;
  delivery_mode: 'FREIGHT_COLLECT' | 'PICKUP';
  delivery_snapshot: Record<string, unknown>;
  merchandise_subtotal_clp: string | number;
  promotion_discount_clp: string | number;
  points_discount_clp: string | number;
  total_amount_clp: string | number;
  checkout_version: string | number;
  requires_external_payment: boolean;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
interface OrderLineRow extends QueryResultRow {
  order_line_id: string;
  product_id: string;
  preorder_campaign_id: string | null;
  sale_type: 'PREORDER' | 'REGULAR';
  sku_snapshot: string;
  product_name_snapshot: string;
  language_snapshot: string | null;
  edition_snapshot: string | null;
  condition_snapshot: string | null;
  unit_price_clp: string | number;
  quantity: string | number;
  line_subtotal_clp: string | number;
}
