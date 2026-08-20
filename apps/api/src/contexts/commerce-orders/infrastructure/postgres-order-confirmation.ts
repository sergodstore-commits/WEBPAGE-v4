import { appliedPromotionSnapshotSchema } from '@sergod/contracts';
import type { ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { QueryResultRow } from 'pg';

import type { PgTransaction } from '../../../platform/persistence/postgres.js';
import { PaymentError } from '../domain/payment.js';

export async function confirmOrder(
  transaction: PgTransaction,
  input: {
    readonly context: ExecutionContext;
    readonly now: Date;
    readonly orderId: string;
    readonly reason: 'PAYMENT_VERIFIED' | 'ZERO_TOTAL_CONFIRMED';
    readonly uuids: UuidGenerator;
  },
): Promise<'CONFIRMED' | 'LATE_REVIEW' | 'REPLAYED'> {
  const result = await transaction.query<OrderConfirmationRow>(
    `SELECT order_id,account_id,public_number,state,delivery_mode,delivery_snapshot,
            merchandise_subtotal_clp,promotion_discount_clp,points_discount_clp,
            applied_promotions_snapshot,loyalty_snapshot
       FROM orders WHERE order_id=$1 FOR UPDATE`,
    [input.orderId],
  );
  const order = result.rows[0];
  if (order === undefined) throw notFound('ORDER_NOT_FOUND');
  if (order.state === 'PAID') return 'REPLAYED';
  if (order.state !== 'PENDING_PAYMENT') {
    await transaction.query(
      `INSERT INTO order_state_history(order_state_history_id,order_id,from_state,to_state,reason,
         actor_id,correlation_id,occurred_at)
       VALUES($1,$2,$3,$3,'LATE_PAYMENT_REQUIRES_REVIEW',$4,$5,$6)`,
      [
        input.uuids.generate(),
        input.orderId,
        order.state,
        input.context.actorId ?? null,
        input.context.correlationId,
        input.now,
      ],
    );
    return 'LATE_REVIEW';
  }

  await consumeInventory(transaction, order.order_id, input);
  await commitPreorders(transaction, order.order_id, input);
  await commitPromotions(transaction, order, input);
  await commitLoyalty(transaction, order, input);

  await transaction.query(
    `UPDATE orders SET state='PAID',paid_at=$2,expires_at=NULL,updated_at=$2,version=version+1
      WHERE order_id=$1 AND state='PENDING_PAYMENT'`,
    [order.order_id, input.now],
  );
  await transaction.query(
    `INSERT INTO order_state_history(order_state_history_id,order_id,from_state,to_state,reason,
       actor_id,correlation_id,occurred_at)
     VALUES($1,$2,'PENDING_PAYMENT','PAID',$3,$4,$5,$6)`,
    [
      input.uuids.generate(),
      order.order_id,
      input.reason,
      input.context.actorId ?? null,
      input.context.correlationId,
      input.now,
    ],
  );
  const snapshot = order.delivery_snapshot;
  await transaction.query(
    `INSERT INTO order_fulfillments(fulfillment_id,order_id,method,status,recipient_name,
       recipient_phone,carrier,commune,agency,created_at,updated_at)
     VALUES($1,$2,$3,'PENDING',$4,$5,$6,$7,$8,$9,$9)
     ON CONFLICT(order_id) DO NOTHING`,
    [
      input.uuids.generate(),
      order.order_id,
      order.delivery_mode,
      text(snapshot.recipientName),
      text(snapshot.contactPhone),
      text(snapshot.carrier),
      text(snapshot.destinationCommune),
      text(snapshot.agencyDestination),
      input.now,
    ],
  );
  return 'CONFIRMED';
}

async function consumeInventory(
  transaction: PgTransaction,
  orderId: string,
  input: ConfirmationInput,
): Promise<void> {
  const reservations = await transaction.query<ReservationRow>(
    `SELECT order_inventory_reservation_id reservation_id,inventory_position_id source_id,quantity
       FROM order_inventory_reservations WHERE order_id=$1 AND status='ACTIVE' FOR UPDATE`,
    [orderId],
  );
  for (const reservation of reservations.rows) {
    const consumed = await transaction.query(
      `UPDATE inventory_positions SET on_hand=on_hand-$2,reserved=reserved-$2,
         version=version+1,updated_at=$3 WHERE inventory_position_id=$1
         AND on_hand >= $2 AND reserved >= $2`,
      [reservation.source_id, reservation.quantity, input.now],
    );
    if (consumed.rowCount !== 1) throw infrastructure('ORDER_RESERVATION_INVARIANT_BROKEN');
    await transaction.query(
      `UPDATE order_inventory_reservations SET status='CONSUMED',consumed_at=$2
        WHERE order_inventory_reservation_id=$1`,
      [reservation.reservation_id, input.now],
    );
  }
}

async function commitPreorders(
  transaction: PgTransaction,
  orderId: string,
  input: ConfirmationInput,
): Promise<void> {
  const reservations = await transaction.query<ReservationRow>(
    `SELECT order_preorder_reservation_id reservation_id,preorder_campaign_id source_id,quantity
       FROM order_preorder_reservations WHERE order_id=$1 AND status='ACTIVE' FOR UPDATE`,
    [orderId],
  );
  for (const reservation of reservations.rows) {
    const committed = await transaction.query(
      `UPDATE preorder_campaigns SET temporarily_reserved=temporarily_reserved-$2,
         committed=committed+$2,version=version+1,updated_at=$3
       WHERE preorder_campaign_id=$1 AND temporarily_reserved >= $2`,
      [reservation.source_id, reservation.quantity, input.now],
    );
    if (committed.rowCount !== 1) {
      throw infrastructure('ORDER_PREORDER_RESERVATION_INVARIANT_BROKEN');
    }
    await transaction.query(
      `UPDATE order_preorder_reservations SET status='COMMITTED',committed_at=$2
        WHERE order_preorder_reservation_id=$1`,
      [reservation.reservation_id, input.now],
    );
  }
}

async function commitPromotions(
  transaction: PgTransaction,
  order: OrderConfirmationRow,
  input: ConfirmationInput,
): Promise<void> {
  const snapshots = appliedPromotionSnapshotSchema.array().parse(order.applied_promotions_snapshot);
  for (const snapshot of snapshots) {
    if (snapshot.totalDiscountAmountClp === 0) continue;
    await transaction.query(
      `INSERT INTO promotion_usages(promotion_usage_id,promotion_id,coupon_id,account_id,
         channel,source_type,source_id,status,discount_amount_clp,applied_promotion_snapshot,
         claimed_lines_snapshot,qualifying_units_snapshot,benefited_units_snapshot,
         committed_at,released_at,occurred_at,idempotency_key)
       VALUES($1,$2,$3,$4,'ECOMMERCE','ORDER',$5,'COMMITTED',$6,$7,$8,$9,$10,$11,NULL,$11,$12)
       ON CONFLICT(promotion_id,source_type,source_id) DO NOTHING`,
      [
        input.uuids.generate(),
        snapshot.promotionId,
        snapshot.couponId,
        order.account_id,
        order.order_id,
        snapshot.totalDiscountAmountClp,
        snapshot,
        JSON.stringify(snapshot.claimedUnits),
        JSON.stringify(snapshot.qualifyingUnits),
        JSON.stringify(snapshot.benefitedUnits),
        input.now,
        `order:${order.order_id}:promotion:${snapshot.promotionId}`,
      ],
    );
  }
}

async function commitLoyalty(
  transaction: PgTransaction,
  order: OrderConfirmationRow,
  input: ConfirmationInput,
): Promise<void> {
  const loyalty = parseLoyaltySnapshot(order.loyalty_snapshot);
  if (loyalty.configuration === null) return;
  const accountResult = await transaction.query<LoyaltyAccountRow>(
    `SELECT loyalty_account_id,balance,reserved_points FROM loyalty_accounts
      WHERE account_id=$1 FOR UPDATE`,
    [order.account_id],
  );
  const account = accountResult.rows[0];
  if (account === undefined) throw infrastructure('LOYALTY_ACCOUNT_NOT_FOUND');
  const reservationResult = await transaction.query<LoyaltyReservationRow>(
    `SELECT order_loyalty_reservation_id,points,status FROM order_loyalty_reservations
      WHERE order_id=$1 FOR UPDATE`,
    [order.order_id],
  );
  const reservation = reservationResult.rows[0];
  if (loyalty.requestedPoints > 0) {
    if (reservation === undefined || reservation.status !== 'ACTIVE') {
      throw infrastructure('ORDER_LOYALTY_RESERVATION_NOT_ACTIVE');
    }
    if (
      Number(reservation.points) !== loyalty.requestedPoints ||
      Number(account.reserved_points) < loyalty.requestedPoints ||
      Number(account.balance) < loyalty.requestedPoints
    ) {
      throw infrastructure('ORDER_LOYALTY_RESERVATION_INVARIANT_BROKEN');
    }
  }
  let balance = Number(account.balance);
  if (loyalty.requestedPoints > 0) {
    balance -= loyalty.requestedPoints;
    await transaction.query(
      `INSERT INTO loyalty_movements(movement_id,loyalty_account_id,type,points_signed,
         source_type,source_id,actor_id,reason,balance_after,idempotency_key,
         loyalty_configuration_id,redeem_clp_per_point_snapshot,
         loyalty_eligible_amount_snapshot,occurred_at)
       VALUES($1,$2,'REDEEM',$3,'ORDER',$4,$5,NULL,$6,$7,$8,$9,$10,$11)`,
      [
        input.uuids.generate(),
        account.loyalty_account_id,
        -loyalty.requestedPoints,
        order.order_id,
        input.context.actorId ?? null,
        balance,
        `order:${order.order_id}:loyalty:redeem`,
        loyalty.configuration.loyaltyConfigurationId,
        loyalty.configuration.redeemClpPerPoint,
        loyalty.loyaltyEligibleAmountClp,
        input.now,
      ],
    );
    await transaction.query(
      `UPDATE order_loyalty_reservations SET status='CONSUMED',consumed_at=$2
        WHERE order_loyalty_reservation_id=$1 AND status='ACTIVE'`,
      [reservation?.order_loyalty_reservation_id, input.now],
    );
  }
  if (loyalty.pointsEarned > 0) {
    balance += loyalty.pointsEarned;
    await transaction.query(
      `INSERT INTO loyalty_movements(movement_id,loyalty_account_id,type,points_signed,
         source_type,source_id,actor_id,reason,balance_after,idempotency_key,
         loyalty_configuration_id,earn_clp_per_point_snapshot,
         loyalty_eligible_amount_snapshot,occurred_at)
       VALUES($1,$2,'EARN',$3,'ORDER',$4,$5,NULL,$6,$7,$8,$9,$10,$11)`,
      [
        input.uuids.generate(),
        account.loyalty_account_id,
        loyalty.pointsEarned,
        order.order_id,
        input.context.actorId ?? null,
        balance,
        `order:${order.order_id}:loyalty:earn`,
        loyalty.configuration.loyaltyConfigurationId,
        loyalty.configuration.earnClpPerPoint,
        loyalty.loyaltyEligibleAmountClp,
        input.now,
      ],
    );
  }
  const updated = await transaction.query(
    `UPDATE loyalty_accounts SET balance=$2,reserved_points=reserved_points-$3,
       version=version+1,updated_at=$4 WHERE loyalty_account_id=$1 AND reserved_points >= $3`,
    [account.loyalty_account_id, balance, loyalty.requestedPoints, input.now],
  );
  if (updated.rowCount !== 1) throw infrastructure('ORDER_LOYALTY_ACCOUNT_INVARIANT_BROKEN');
}

function parseLoyaltySnapshot(value: unknown): LoyaltySnapshot {
  if (typeof value !== 'object' || value === null) throw infrastructure('LOYALTY_SNAPSHOT_INVALID');
  const raw = value as Record<string, unknown>;
  const configuration = raw.configuration;
  if (configuration === null) {
    return {
      configuration: null,
      loyaltyEligibleAmountClp: integer(raw.loyaltyEligibleAmountClp),
      pointsEarned: integer(raw.pointsEarned),
      requestedPoints: integer(raw.requestedPoints),
    };
  }
  if (typeof configuration !== 'object') throw infrastructure('LOYALTY_SNAPSHOT_INVALID');
  const config = configuration as Record<string, unknown>;
  return {
    configuration: {
      earnClpPerPoint: positive(config.earnClpPerPoint),
      loyaltyConfigurationId: string(config.loyaltyConfigurationId),
      redeemClpPerPoint: positive(config.redeemClpPerPoint),
    },
    loyaltyEligibleAmountClp: integer(raw.loyaltyEligibleAmountClp),
    pointsEarned: integer(raw.pointsEarned),
    requestedPoints: integer(raw.requestedPoints),
  };
}

type ConfirmationInput = Parameters<typeof confirmOrder>[1];
interface ReservationRow extends QueryResultRow {
  readonly quantity: number | string;
  readonly reservation_id: string;
  readonly source_id: string;
}
interface OrderConfirmationRow extends QueryResultRow {
  readonly account_id: string;
  readonly applied_promotions_snapshot: unknown;
  readonly delivery_mode: 'FREIGHT_COLLECT' | 'PICKUP';
  readonly delivery_snapshot: Record<string, unknown>;
  readonly loyalty_snapshot: unknown;
  readonly merchandise_subtotal_clp: number | string;
  readonly order_id: string;
  readonly points_discount_clp: number | string;
  readonly promotion_discount_clp: number | string;
  readonly public_number: string;
  readonly state: string;
}
interface LoyaltyAccountRow extends QueryResultRow {
  readonly balance: number | string;
  readonly loyalty_account_id: string;
  readonly reserved_points: number | string;
}
interface LoyaltyReservationRow extends QueryResultRow {
  readonly order_loyalty_reservation_id: string;
  readonly points: number | string;
  readonly status: 'ACTIVE' | 'CONSUMED' | 'RELEASED';
}
interface LoyaltySnapshot {
  readonly configuration: null | {
    readonly earnClpPerPoint: number;
    readonly loyaltyConfigurationId: string;
    readonly redeemClpPerPoint: number;
  };
  readonly loyaltyEligibleAmountClp: number;
  readonly pointsEarned: number;
  readonly requestedPoints: number;
}

function integer(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw infrastructure('LOYALTY_SNAPSHOT_INVALID');
  return parsed;
}
function positive(value: unknown): number {
  const parsed = integer(value);
  if (parsed === 0) throw infrastructure('LOYALTY_SNAPSHOT_INVALID');
  return parsed;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw infrastructure('LOYALTY_SNAPSHOT_INVALID');
  }
  return value;
}
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
function notFound(code: string) {
  return new PaymentError(code, 'NOT_FOUND', 'Order was not found.');
}
function infrastructure(code: string) {
  return new PaymentError(code, 'INFRASTRUCTURE', 'Order confirmation invariant failed.');
}
