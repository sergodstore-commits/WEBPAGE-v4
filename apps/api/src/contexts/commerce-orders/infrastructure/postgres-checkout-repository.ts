import type { AppliedPromotionSnapshotV1, PromotionPreview } from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { calculateEarn, calculateRedeem, LoyaltyError } from '../../loyalty/domain/loyalty.js';
import {
  evaluatePromotionSet,
  normalizeCouponCode,
  PromotionError,
} from '../../promotions/domain/promotions.js';
import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  CheckoutDeliveryReadPort,
  CheckoutLineView,
  CheckoutOrderCreationView,
  CheckoutMutationOperation,
  CheckoutRepository,
  CheckoutSummaryView,
} from '../application/checkout-ports.js';
import { CheckoutError, type StoredCartDeliveryIntent } from '../domain/checkout.js';
import { formatOrderPublicNumber } from '../domain/order.js';
import { confirmOrder } from './postgres-order-confirmation.js';

const IDEMPOTENCY_SCOPE = 'CHECKOUT_PROVISIONAL';

export class PgCheckoutRepository implements CheckoutRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
    private readonly delivery: CheckoutDeliveryReadPort,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async getSummary(accountId: string, cartGroupId: string): Promise<CheckoutSummaryView> {
    try {
      await assertEligibleAccount(this.pool, accountId);
      const group = await requireOwnedGroup(this.pool, accountId, cartGroupId, false);
      return await this.evaluate(this.pool, group, accountId, this.clock.now());
    } catch (error) {
      throw mapError(error);
    }
  }

  async mutate(input: {
    readonly accountId: string;
    readonly cartGroupId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly operation: CheckoutMutationOperation;
    readonly requestFingerprint: string;
  }): Promise<{ readonly replayed: boolean; readonly summary: CheckoutSummaryView }> {
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
          const replay = await transaction.query<ReplayRow>(
            `SELECT record.fingerprint,record.status,result.response_json
               FROM idempotency_records record
               LEFT JOIN checkout_provisional_idempotency_results result
                 ON result.idempotency_record_id=record.idempotency_record_id
              WHERE record.scope=$1 AND record.idempotency_key=$2 FOR UPDATE OF record`,
            [IDEMPOTENCY_SCOPE, input.idempotencyKey],
          );
          const row = replay.rows[0];
          if (row === undefined || row.fingerprint !== input.requestFingerprint) {
            throw conflict('CHECKOUT_IDEMPOTENCY_CONFLICT');
          }
          if (row.status !== 'COMPLETED' || row.response_json === null) {
            throw conflict('CHECKOUT_IDEMPOTENCY_IN_PROGRESS');
          }
          return { replayed: true, summary: hydrateSummary(row.response_json) };
        }

        await assertEligibleAccount(transaction, input.accountId);
        let group = await requireOwnedGroup(transaction, input.accountId, input.cartGroupId, true);
        await this.applyOperation(transaction, input.operation, group, input.accountId, now);
        group = await requireOwnedGroup(transaction, input.accountId, input.cartGroupId, true);
        const summary = await this.evaluate(transaction, group, input.accountId, now);
        await this.audit(
          transaction,
          input.context,
          operationAction(input.operation),
          input.cartGroupId,
          input.idempotencyKey,
          operationReason(input.operation),
          now,
        );
        await transaction.query(
          `UPDATE idempotency_records SET status='COMPLETED',result_reference=$2,
            source_type='CART_GROUP',source_id=$2,completed_at=$3,updated_at=$3
            WHERE idempotency_record_id=$1`,
          [recordId, input.cartGroupId, now],
        );
        await transaction.query(
          `INSERT INTO checkout_provisional_idempotency_results(
             idempotency_record_id,cart_group_id,response_json,created_at)
           VALUES($1,$2,$3,$4)`,
          [recordId, input.cartGroupId, JSON.stringify(summary), now],
        );
        return { replayed: false, summary };
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  async createOrder(input: {
    readonly accountId: string;
    readonly cartGroupId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly replayed: boolean; readonly order: CheckoutOrderCreationView }> {
    try {
      return await this.#transactions.execute(async (transaction) => {
        const now = this.clock.now();
        const replay = await transaction.query<CheckoutOrderReplayRow>(
          `SELECT result.request_fingerprint,result.order_id,orders.public_number,orders.state,
                  orders.total_amount_clp,orders.requires_external_payment,orders.expires_at
             FROM checkout_order_idempotency_results result
             JOIN orders USING(order_id)
            WHERE result.account_id=$1 AND result.idempotency_key=$2
            FOR UPDATE OF result`,
          [input.accountId, input.idempotencyKey],
        );
        const replayRow = replay.rows[0];
        if (replayRow !== undefined) {
          if (replayRow.request_fingerprint !== input.requestFingerprint) {
            throw conflict('CHECKOUT_IDEMPOTENCY_CONFLICT');
          }
          return { replayed: true, order: checkoutCreatedOrder(replayRow) };
        }

        await assertEligibleAccount(transaction, input.accountId);
        const group = await requireOwnedGroup(
          transaction,
          input.accountId,
          input.cartGroupId,
          true,
        );
        const alreadyOrdered = await transaction.query<{ order_id: string }>(
          `SELECT order_id FROM orders WHERE cart_group_id=$1 FOR UPDATE`,
          [group.cart_group_id],
        );
        if (alreadyOrdered.rows[0] !== undefined) {
          const concurrentReplay = await transaction.query<CheckoutOrderReplayRow>(
            `SELECT result.request_fingerprint,result.order_id,orders.public_number,orders.state,
                    orders.total_amount_clp,orders.requires_external_payment,orders.expires_at
               FROM checkout_order_idempotency_results result
               JOIN orders USING(order_id)
              WHERE result.account_id=$1 AND result.idempotency_key=$2`,
            [input.accountId, input.idempotencyKey],
          );
          const concurrentReplayRow = concurrentReplay.rows[0];
          if (
            concurrentReplayRow !== undefined &&
            concurrentReplayRow.request_fingerprint === input.requestFingerprint
          ) {
            return { replayed: true, order: checkoutCreatedOrder(concurrentReplayRow) };
          }
          throw conflict('CHECKOUT_ORDER_ALREADY_CREATED');
        }
        const summary = await this.evaluate(transaction, group, input.accountId, now);
        if (
          !summary.canCreateOrder ||
          summary.branchId === null ||
          summary.deliveryIntent === null
        ) {
          throw conflict(summary.validationErrorCodes[0] ?? 'CHECKOUT_NOT_READY');
        }

        let expiresAt = now;
        if (summary.requiresExternalPayment) {
          const duration = await transaction.query<{ integer_value: string | number }>(
            `SELECT integer_value FROM system_configurations
              WHERE configuration_key='PAYMENT_RESERVATION_DURATION_MINUTES'
                AND scope='GLOBAL' AND state='ACTIVE'`,
          );
          const durationMinutes = Number(duration.rows[0]?.integer_value);
          if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1) {
            throw new CheckoutError(
              'PAYMENT_RESERVATION_CONFIGURATION_REQUIRED',
              'INFRASTRUCTURE',
              'Payment reservation duration is not configured.',
            );
          }
          expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
        }
        const orderId = this.uuids.generate();
        const year = now.getUTCFullYear();
        await transaction.query(
          `INSERT INTO order_public_number_sequences(order_year,next_number)
           VALUES($1,1) ON CONFLICT(order_year) DO NOTHING`,
          [year],
        );
        const sequence = await transaction.query<{ allocated: string | number }>(
          `UPDATE order_public_number_sequences SET next_number=next_number+1
            WHERE order_year=$1 AND next_number <= 999999
            RETURNING next_number-1 allocated`,
          [year],
        );
        const allocated = Number(sequence.rows[0]?.allocated);
        const publicNumber = formatOrderPublicNumber(year, allocated);
        const pointsDiscountClp = summary.loyalty.pointsDiscountClp;
        const deliveryMode =
          summary.deliveryIntent.mode === 'PICKUP' ? 'PICKUP' : 'FREIGHT_COLLECT';

        await transaction.query(
          `INSERT INTO orders(order_id,public_number,account_id,cart_group_id,branch_id,order_type,state,
             delivery_mode,delivery_snapshot,merchandise_subtotal_clp,promotion_discount_clp,
             points_discount_clp,total_amount_clp,shipping_included_in_order_total,currency,
             checkout_version,applied_promotions_snapshot,coupon_snapshot,loyalty_snapshot,
             requires_external_payment,expires_at,created_at,updated_at,correlation_id)
           VALUES($1,$2,$3,$4,$5,$6,'PENDING_PAYMENT',$7,$8,$9,$10,$11,$12,false,'CLP',$13,$14,$15,$16,$17,$18,$19,$19,$20)`,
          [
            orderId,
            publicNumber,
            input.accountId,
            group.cart_group_id,
            summary.branchId,
            summary.groupType,
            deliveryMode,
            JSON.stringify(summary.deliveryIntent),
            summary.merchandiseSubtotalClp,
            summary.promotionDiscountClp,
            pointsDiscountClp,
            summary.totalAmountClp,
            summary.checkoutVersion,
            JSON.stringify(summary.appliedPromotions),
            summary.coupon === null ? null : JSON.stringify(summary.coupon),
            JSON.stringify(summary.loyalty),
            summary.requiresExternalPayment,
            expiresAt,
            now,
            input.context.correlationId,
          ],
        );

        await reservePromotions(
          transaction,
          orderId,
          input.accountId,
          summary.appliedPromotions,
          now,
          this.uuids,
        );

        for (const line of summary.lines) {
          const orderLineId = this.uuids.generate();
          await transaction.query(
            `INSERT INTO order_lines(order_line_id,order_id,product_id,preorder_campaign_id,sale_type,
               sku_snapshot,product_name_snapshot,language_snapshot,edition_snapshot,condition_snapshot,
               unit_price_clp,quantity,line_subtotal_clp,created_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              orderLineId,
              orderId,
              line.productId,
              line.preorderCampaignId,
              line.saleType,
              line.sku,
              line.productName,
              line.language,
              line.edition,
              line.condition,
              line.unitPriceClp,
              line.quantity,
              line.lineSubtotalClp,
              now,
            ],
          );
          if (line.saleType === 'REGULAR') {
            const reserved = await transaction.query<{ inventory_position_id: string }>(
              `UPDATE inventory_positions
                  SET reserved=reserved+$3,version=version+1,updated_at=$4
                WHERE product_id=$1 AND branch_id=$2 AND on_hand-reserved >= $3
                RETURNING inventory_position_id`,
              [line.productId, summary.branchId, line.quantity, now],
            );
            const positionId = reserved.rows[0]?.inventory_position_id;
            if (positionId === undefined) throw conflict('INVENTORY_INSUFFICIENT_AVAILABLE');
            const reservationId = this.uuids.generate();
            await transaction.query(
              `INSERT INTO order_inventory_reservations(order_inventory_reservation_id,order_id,
                 order_line_id,inventory_position_id,quantity,status,created_at)
               VALUES($1,$2,$3,$4,$5,'ACTIVE',$6)`,
              [reservationId, orderId, orderLineId, positionId, line.quantity, now],
            );
            await transaction.query(
              `INSERT INTO inventory_movements(movement_id,inventory_position_id,movement_type,quantity,
                 source_type,source_id,actor_id,reason,idempotency_key,correlation_id,occurred_at)
               VALUES($1,$2,'RESERVATION_CREATED',$3,'ORDER',$4,$5,'PENDING_PAYMENT',$6,$7,$8)`,
              [
                this.uuids.generate(),
                positionId,
                line.quantity,
                orderId,
                input.context.actorId ?? null,
                `order-reserve:${orderId}:${orderLineId}`,
                input.context.correlationId,
                now,
              ],
            );
          } else {
            if (line.preorderCampaignId === null) throw conflict('PREORDER_CAMPAIGN_NOT_AVAILABLE');
            const reserved = await transaction.query(
              `UPDATE preorder_campaigns
                  SET temporarily_reserved=temporarily_reserved+$2,updated_at=$3,version=version+1
                WHERE preorder_campaign_id=$1 AND operational_state='OPEN'
                  AND publication_status='PUBLISHED'
                  AND opens_at <= $3 AND closes_at > $3
                  AND capacity-temporarily_reserved-committed >= $2`,
              [line.preorderCampaignId, line.quantity, now],
            );
            if (reserved.rowCount !== 1) throw conflict('PREORDER_CAMPAIGN_NOT_AVAILABLE');
            await transaction.query(
              `INSERT INTO order_preorder_reservations(order_preorder_reservation_id,order_id,
                 order_line_id,preorder_campaign_id,quantity,status,created_at)
               VALUES($1,$2,$3,$4,$5,'ACTIVE',$6)`,
              [
                this.uuids.generate(),
                orderId,
                orderLineId,
                line.preorderCampaignId,
                line.quantity,
                now,
              ],
            );
          }
        }

        if (summary.loyalty.requestedPoints > 0) {
          if (summary.loyalty.configuration === null) {
            throw conflict('LOYALTY_CONFIGURATION_NOT_ACTIVE');
          }
          const loyalty = await transaction.query<{ loyalty_account_id: string }>(
            `UPDATE loyalty_accounts SET reserved_points=reserved_points+$2,
               version=version+1,updated_at=$3
             WHERE account_id=$1 AND balance-reserved_points >= $2
             RETURNING loyalty_account_id`,
            [input.accountId, summary.loyalty.requestedPoints, now],
          );
          const loyaltyAccountId = loyalty.rows[0]?.loyalty_account_id;
          if (loyaltyAccountId === undefined) {
            throw conflict('LOYALTY_AVAILABLE_POINTS_INSUFFICIENT');
          }
          await transaction.query(
            `INSERT INTO order_loyalty_reservations(order_loyalty_reservation_id,order_id,
               loyalty_account_id,points,status,configuration_snapshot,created_at)
             VALUES($1,$2,$3,$4,'ACTIVE',$5,$6)`,
            [
              this.uuids.generate(),
              orderId,
              loyaltyAccountId,
              summary.loyalty.requestedPoints,
              summary.loyalty.configuration,
              now,
            ],
          );
        }

        await transaction.query(
          `INSERT INTO order_state_history(order_state_history_id,order_id,from_state,to_state,reason,
             actor_id,correlation_id,occurred_at)
           VALUES($1,$2,NULL,'PENDING_PAYMENT','CHECKOUT_CONFIRMED',$3,$4,$5)`,
          [
            this.uuids.generate(),
            orderId,
            input.context.actorId ?? null,
            input.context.correlationId,
            now,
          ],
        );
        await transaction.query(
          `INSERT INTO notification_outbox(notification_id,event_type,recipient_account_id,
             recipient_email,payload,idempotency_key,status,next_attempt_at,created_at,updated_at)
           SELECT $1,'ORDER_CREATED',account.account_id,account.current_email,$2,$3,'PENDING',$4,$4,$4
             FROM user_accounts account WHERE account.account_id=$5
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            this.uuids.generate(),
            JSON.stringify({ orderPublicNumber: publicNumber }),
            `order:${orderId}:created`,
            now,
            input.accountId,
          ],
        );
        const finalState = summary.requiresExternalPayment ? 'PENDING_PAYMENT' : 'PAID';
        if (!summary.requiresExternalPayment) {
          await confirmOrder(transaction, {
            context: input.context,
            now,
            orderId,
            reason: 'ZERO_TOTAL_CONFIRMED',
            uuids: this.uuids,
          });
        }
        await transaction.query(
          `INSERT INTO checkout_order_idempotency_results(checkout_order_idempotency_result_id,
             account_id,cart_group_id,idempotency_key,request_fingerprint,order_id,created_at)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            this.uuids.generate(),
            input.accountId,
            group.cart_group_id,
            input.idempotencyKey,
            input.requestFingerprint,
            orderId,
            now,
          ],
        );
        await this.audit(
          transaction,
          input.context,
          'CHECKOUT_ORDER_CREATED',
          group.cart_group_id,
          input.idempotencyKey,
          'CHECKOUT_CONFIRMED',
          now,
        );
        return {
          replayed: false,
          order: {
            expiresAt: summary.requiresExternalPayment ? expiresAt : null,
            orderId,
            publicNumber,
            requiresExternalPayment: summary.requiresExternalPayment,
            state: finalState,
            totalAmountClp: summary.totalAmountClp,
          },
        };
      });
    } catch (error) {
      throw mapError(error);
    }
  }

  private async applyOperation(
    transaction: PgTransaction,
    operation: CheckoutMutationOperation,
    group: GroupRow,
    accountId: string,
    now: Date,
  ): Promise<void> {
    if (operation.kind === 'REPLACE_INTENT') {
      const validation = await this.validateDelivery(operation.intent);
      if (validation.errorCodes.length > 0)
        throw conflict(validation.errorCodes[0] ?? 'DELIVERY_INVALID');
      if (operation.intent.mode === 'PICKUP') {
        await transaction.query(
          `UPDATE cart_groups SET delivery_mode='PICKUP',delivery_intent_schema_version=2,
             pickup_branch_id=$2,
             shipping_recipient_name=NULL,shipping_address=NULL,shipping_commune=NULL,
             shipping_additional_details=NULL,shipping_option_id=NULL,
             shipping_payment_mode=NULL,shipping_destination_type=NULL,
             shipping_carrier=NULL,shipping_agency_destination=NULL,
             shipping_included_in_order_total=NULL,
             delivery_last_validated_at=$3,delivery_validation_status='VALID',
             delivery_validation_error_codes='{}',updated_at=$3
           WHERE cart_group_id=$1`,
          [group.cart_group_id, operation.intent.branchId, now],
        );
      } else {
        await transaction.query(
          `UPDATE cart_groups SET delivery_mode='SHIPPING',delivery_intent_schema_version=2,
             pickup_branch_id=NULL,shipping_recipient_name=$2,
             shipping_address=NULL,shipping_commune=$3,
             shipping_additional_details=NULL,shipping_option_id=NULL,
             shipping_payment_mode='FREIGHT_COLLECT',
             shipping_destination_type='CARRIER_AGENCY',shipping_carrier=$4,
             shipping_agency_destination=$5,shipping_included_in_order_total=false,
             delivery_last_validated_at=$6,delivery_validation_status='VALID',
             delivery_validation_error_codes='{}',updated_at=$7
           WHERE cart_group_id=$1`,
          [
            group.cart_group_id,
            operation.intent.recipientName,
            operation.intent.destinationCommune,
            operation.intent.carrier,
            operation.intent.agencyDestination,
            now,
            now,
          ],
        );
      }
      await touchCart(transaction, group.cart_id, now);
      return;
    }
    if (operation.kind === 'CLEAR_INTENT') {
      await transaction.query(
        `UPDATE cart_groups SET delivery_mode=NULL,delivery_intent_schema_version=NULL,
           pickup_branch_id=NULL,
           shipping_recipient_name=NULL,shipping_address=NULL,shipping_commune=NULL,
           shipping_additional_details=NULL,shipping_option_id=NULL,
           shipping_payment_mode=NULL,shipping_destination_type=NULL,
           shipping_carrier=NULL,shipping_agency_destination=NULL,
           shipping_included_in_order_total=NULL,
           delivery_last_validated_at=NULL,delivery_validation_status='NOT_VALIDATED',
           delivery_validation_error_codes='{}',updated_at=$2 WHERE cart_group_id=$1`,
        [group.cart_group_id, now],
      );
      await touchCart(transaction, group.cart_id, now);
      return;
    }
    if (operation.kind === 'CLEAR_COUPON') {
      await transaction.query(
        `UPDATE cart_groups SET selected_coupon_id=NULL,updated_at=$2 WHERE cart_group_id=$1`,
        [group.cart_group_id, now],
      );
      await touchCart(transaction, group.cart_id, now);
      return;
    }
    if (operation.kind === 'CLEAR_POINTS') {
      await transaction.query(
        `UPDATE cart_groups SET requested_points=NULL,updated_at=$2 WHERE cart_group_id=$1`,
        [group.cart_group_id, now],
      );
      await touchCart(transaction, group.cart_id, now);
      return;
    }
    if (operation.kind === 'REVALIDATE') {
      const intent = storedIntent(group);
      if (intent === null) return;
      const validation = await this.validateDelivery(intent);
      await transaction.query(
        `UPDATE cart_groups SET delivery_last_validated_at=$2,
           delivery_validation_status=$3,delivery_validation_error_codes=$4,updated_at=$2
         WHERE cart_group_id=$1`,
        [
          group.cart_group_id,
          now,
          validation.errorCodes.length === 0 ? 'VALID' : 'INVALID',
          validation.errorCodes,
        ],
      );
      await touchCart(transaction, group.cart_id, now);
      return;
    }

    const delivery = storedIntent(group);
    if (delivery === null) throw conflict('DELIVERY_INTENT_REQUIRED');
    const deliveryValidation = await this.validateDelivery(delivery);
    if (deliveryValidation.errorCodes.length > 0) {
      throw conflict(deliveryValidation.errorCodes[0] ?? 'DELIVERY_INVALID');
    }
    if (operation.kind === 'SELECT_COUPON') {
      const code = normalizeCouponCode(operation.code);
      const coupon = await transaction.query<{ coupon_id: string }>(
        `SELECT coupon.coupon_id FROM coupons coupon
          JOIN promotions promotion USING(promotion_id)
         WHERE coupon.normalized_code=$1 AND promotion.activation_mode='COUPON_REQUIRED'`,
        [code],
      );
      const couponId = coupon.rows[0]?.coupon_id;
      if (couponId === undefined) throw conflict('COUPON_INVALID');
      await transaction.query(
        `UPDATE cart_groups SET selected_coupon_id=$2,updated_at=$3 WHERE cart_group_id=$1`,
        [group.cart_group_id, couponId, now],
      );
      const selected = await requireOwnedGroup(transaction, accountId, group.cart_group_id, true);
      const summary = await this.evaluate(transaction, selected, accountId, now);
      const status = summary.coupon?.status;
      if (status === undefined) throw conflict('COUPON_INVALID');
      if (!['APPLIED', 'NOT_APPLIED'].includes(status)) {
        throw conflict(status === 'LIMIT_REACHED' ? 'COUPON_LIMIT_REACHED' : 'COUPON_NOT_ELIGIBLE');
      }
      await touchCart(transaction, group.cart_id, now);
      return;
    }
    await transaction.query(
      `UPDATE cart_groups SET requested_points=$2,updated_at=$3 WHERE cart_group_id=$1`,
      [group.cart_group_id, operation.points, now],
    );
    const selected = await requireOwnedGroup(transaction, accountId, group.cart_group_id, true);
    const summary = await this.evaluate(transaction, selected, accountId, now);
    const loyaltyError = summary.loyalty.validationErrorCodes[0];
    if (loyaltyError !== undefined) throw conflict(loyaltyError);
    await touchCart(transaction, group.cart_id, now);
  }

  private async evaluate(
    queryable: Queryable,
    group: GroupRow,
    accountId: string,
    now: Date,
  ): Promise<CheckoutSummaryView> {
    const persistedIntent = storedIntent(group);
    const delivery =
      persistedIntent === null
        ? {
            branchId: null,
            errorCodes: ['DELIVERY_INTENT_REQUIRED'] as readonly string[],
          }
        : await this.validateDelivery(persistedIntent);
    const effectiveIntent: StoredCartDeliveryIntent | null =
      persistedIntent === null
        ? null
        : {
            ...persistedIntent,
            lastValidatedAt: now,
            validationErrorCodes: delivery.errorCodes,
            validationStatus:
              delivery.errorCodes.length === 0 ? ('VALID' as const) : ('INVALID' as const),
          };
    const lines = await loadLines(queryable, group.cart_group_id, delivery.branchId, now);
    if (lines.length === 0) throw conflict('CHECKOUT_GROUP_EMPTY');
    const merchandiseSubtotalClp = safeSum(lines.map((line) => line.lineSubtotalClp));
    const promotions = await evaluatePromotions(
      queryable,
      accountId,
      delivery.branchId,
      group.selected_coupon_id,
      lines,
      now,
    );
    const loyalty = await evaluateLoyalty(
      queryable,
      accountId,
      delivery.branchId,
      group.requested_points === null ? 0 : safeNonnegative(group.requested_points),
      merchandiseSubtotalClp,
      promotions.discountClp,
      0,
    );
    const totalAmountClp = Math.max(
      0,
      merchandiseSubtotalClp - promotions.discountClp - loyalty.pointsDiscountClp,
    );
    const errors = unique([
      ...delivery.errorCodes,
      ...lines.flatMap((line) => line.availabilityErrorCodes),
      ...(promotions.coupon !== null &&
      !['APPLIED', 'NOT_APPLIED'].includes(promotions.coupon.status)
        ? ['COUPON_NOT_ELIGIBLE']
        : []),
      ...loyalty.validationErrorCodes,
    ]);
    return {
      appliedPromotions: promotions.snapshots,
      branchId: delivery.branchId,
      canCreateOrder: errors.length === 0,
      cartGroupId: group.cart_group_id,
      checkoutVersion: safePositive(group.checkout_version),
      coupon: promotions.coupon,
      deliveryIntent: effectiveIntent,
      groupType: group.group_type === 'PREORDER' ? 'PREORDER' : 'REGULAR',
      lines,
      loyalty,
      merchandiseSubtotalClp,
      orderTotalWithoutShippingClp: totalAmountClp,
      promotionDiscountClp: promotions.discountClp,
      recalculatedAt: now,
      requiresExternalPayment: totalAmountClp > 0,
      shippingCostAmountClp: 0,
      shippingIncludedInOrderTotal: false,
      shippingLabel: persistedIntent?.mode === 'SHIPPING' ? 'NO INCLUIDO — ENVÍO POR PAGAR' : null,
      shippingPaymentMode: persistedIntent?.mode === 'SHIPPING' ? 'FREIGHT_COLLECT' : null,
      totalAmountClp,
      validationErrorCodes: errors,
    };
  }

  private async audit(
    transaction: PgTransaction,
    context: ExecutionContext,
    action: string,
    groupId: string,
    idempotencyKey: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO audit_entries(audit_entry_id,actor_id,actor_type,action,resource_type,
         resource_id,result,reason,correlation_id,causation_id,idempotency_key,occurred_at)
       VALUES($1,$2,$3,$4,'CART_GROUP',$5,'SUCCESS',$6,$7,$8,$9,$10)`,
      [
        this.uuids.generate(),
        context.actorId ?? null,
        context.actorType,
        action,
        groupId,
        reason,
        context.correlationId,
        context.causationId ?? null,
        idempotencyKey,
        now,
      ],
    );
  }

  private async validateDelivery(
    intent:
      | StoredCartDeliveryIntent
      | Extract<CheckoutMutationOperation, { kind: 'REPLACE_INTENT' }>['intent'],
  ) {
    const provisional =
      intent.mode === 'PICKUP'
        ? { branchId: intent.branchId, mode: 'PICKUP' as const }
        : {
            agencyDestination: intent.agencyDestination,
            carrier: intent.carrier,
            destinationCommune: intent.destinationCommune,
            destinationType: 'CARRIER_AGENCY' as const,
            mode: 'SHIPPING' as const,
            recipientName: intent.recipientName,
            shippingIncludedInOrderTotal: false as const,
            shippingPaymentMode: 'FREIGHT_COLLECT' as const,
          };
    const validation = await this.delivery.validateProvisionalIntent(provisional);
    return {
      branchId: validation.branchId,
      errorCodes: validation.errorCodes,
    };
  }
}

async function assertEligibleAccount(queryable: Queryable, accountId: string): Promise<void> {
  const result = await queryable.query<AccountRow>(
    `SELECT role,status,email_verification_status FROM user_accounts WHERE account_id=$1`,
    [accountId],
  );
  const account = result.rows[0];
  if (account === undefined) throw notFound('CHECKOUT_ACCOUNT_NOT_FOUND');
  if (account.status !== 'ACTIVE') throw conflict('CHECKOUT_ACCOUNT_INACTIVE');
  if (!['CLIENTE', 'ADMIN'].includes(account.role)) throw conflict('CHECKOUT_ROLE_NOT_ALLOWED');
  if (account.email_verification_status !== 'VERIFIED') {
    throw conflict('CHECKOUT_EMAIL_NOT_VERIFIED');
  }
}

async function requireOwnedGroup(
  queryable: Queryable,
  accountId: string,
  groupId: string,
  lock: boolean,
): Promise<GroupRow> {
  const result = await queryable.query<GroupRow>(
    `SELECT grp.* FROM cart_groups grp JOIN carts cart USING(cart_id)
      WHERE grp.cart_group_id=$1 AND cart.owner_account_id=$2${lock ? ' FOR UPDATE OF grp,cart' : ''}`,
    [groupId, accountId],
  );
  const group = result.rows[0];
  if (group === undefined) throw notFound('CHECKOUT_GROUP_NOT_FOUND');
  const cart = await queryable.query<{ state: string }>(
    `SELECT state FROM carts WHERE cart_id=$1`,
    [group.cart_id],
  );
  if (cart.rows[0]?.state !== 'ACTIVE') throw conflict('CHECKOUT_CART_NOT_ACTIVE');
  if (group.state !== 'ACTIVE' || !['REGULAR', 'PREORDER'].includes(group.group_type)) {
    throw conflict('CHECKOUT_GROUP_NOT_ACTIVE');
  }
  return group;
}

async function loadLines(
  queryable: Queryable,
  groupId: string,
  branchId: string | null,
  now: Date,
): Promise<CheckoutLineView[]> {
  const result = await queryable.query<LineRow>(
    `SELECT line.cart_line_id,line.product_id,line.preorder_campaign_id,line.quantity,
        product.sku,product.name,product.sale_type,product.price_amount_clp,
        product.language,product.edition,product.condition,product.publication_status product_status,
        game.publication_status game_status,category.publication_status category_status,
        collection.publication_status collection_status,
        EXISTS(SELECT 1 FROM product_media media JOIN resource_assets asset USING(resource_id)
          WHERE media.product_id=product.product_id AND media.is_primary AND asset.state='ACTIVE') has_primary_resource,
        position.on_hand,position.reserved,
        campaign.product_id campaign_product_id,campaign.branch_id campaign_branch_id,
        campaign.operational_state,campaign.publication_status campaign_publication_status,
        campaign.capacity,campaign.temporarily_reserved,campaign.committed,
        campaign.opens_at,campaign.closes_at
       FROM cart_lines line
       JOIN products product USING(product_id)
       JOIN tcg_games game ON game.game_id=product.game_id
       JOIN categories category ON category.category_id=product.category_id
       LEFT JOIN collections collection ON collection.collection_id=product.collection_id
       LEFT JOIN inventory_positions position
         ON position.product_id=product.product_id AND position.branch_id=$2
       LEFT JOIN preorder_campaigns campaign
         ON campaign.preorder_campaign_id=line.preorder_campaign_id
      WHERE line.cart_group_id=$1 ORDER BY line.created_at,line.cart_line_id`,
    [groupId, branchId],
  );
  return result.rows.map((row) => {
    const quantity = safePositive(row.quantity);
    const unitPriceClp = safeNonnegative(row.price_amount_clp);
    const errors: string[] = [];
    if (
      row.product_status !== 'PUBLISHED' ||
      row.game_status !== 'PUBLISHED' ||
      row.category_status !== 'PUBLISHED' ||
      (row.collection_status !== null && row.collection_status !== 'PUBLISHED') ||
      !row.has_primary_resource
    ) {
      errors.push('CHECKOUT_PRODUCT_NOT_AVAILABLE');
    }
    if (branchId === null) errors.push('DELIVERY_INTENT_REQUIRED');
    else if (row.sale_type === 'REGULAR') {
      const available = safeNonnegative(row.on_hand) - safeNonnegative(row.reserved);
      if (available < quantity) errors.push('INVENTORY_INSUFFICIENT_AVAILABLE');
    } else if (
      row.preorder_campaign_id === null ||
      row.campaign_product_id !== row.product_id ||
      row.campaign_branch_id !== branchId ||
      row.operational_state !== 'OPEN' ||
      row.campaign_publication_status !== 'PUBLISHED' ||
      row.opens_at === null ||
      row.closes_at === null ||
      now < row.opens_at ||
      now >= row.closes_at ||
      safeNonnegative(row.capacity) -
        safeNonnegative(row.temporarily_reserved) -
        safeNonnegative(row.committed) <
        quantity
    ) {
      errors.push('PREORDER_CAMPAIGN_NOT_AVAILABLE');
    }
    const lineSubtotalClp = safeProduct(unitPriceClp, quantity);
    return {
      availabilityErrorCodes: unique(errors),
      available: errors.length === 0,
      cartLineId: row.cart_line_id,
      condition: row.condition,
      edition: row.edition,
      language: row.language,
      lineSubtotalClp,
      preorderCampaignId: row.preorder_campaign_id,
      productId: row.product_id,
      productName: row.name,
      quantity,
      saleType: row.sale_type,
      sku: row.sku,
      unitPriceClp,
    };
  });
}

async function evaluatePromotions(
  queryable: Queryable,
  accountId: string,
  branchId: string | null,
  selectedCouponId: string | null,
  lines: readonly CheckoutLineView[],
  now: Date,
): Promise<{
  readonly coupon: CheckoutSummaryView['coupon'];
  readonly discountClp: number;
  readonly snapshots: readonly AppliedPromotionSnapshotV1[];
}> {
  if (branchId === null) return { coupon: null, discountClp: 0, snapshots: [] };
  const branch = await queryable.query<{ timezone: string }>(
    `SELECT timezone FROM branches WHERE branch_id=$1`,
    [branchId],
  );
  const timezone = branch.rows[0]?.timezone;
  if (timezone === undefined) return { coupon: null, discountClp: 0, snapshots: [] };
  const promotions = await queryable.query<PromotionRow>(
    `SELECT * FROM promotions
      WHERE channel IN ('ECOMMERCE','BOTH') AND (branch_id IS NULL OR branch_id=$1)
      ORDER BY promotion_id FOR UPDATE`,
    [branchId],
  );
  const selectedCoupon =
    selectedCouponId === null
      ? null
      : ((
          await queryable.query<CouponRow>(`SELECT * FROM coupons WHERE coupon_id=$1 FOR UPDATE`, [
            selectedCouponId,
          ])
        ).rows[0] ?? null);
  const metadataRows = await queryable.query<{
    category_id: string;
    game_id: string;
    product_id: string;
  }>(`SELECT product_id,category_id,game_id FROM products WHERE product_id=ANY($1::uuid[])`, [
    lines.map((line) => line.productId),
  ]);
  const lineMetadata = new Map(
    metadataRows.rows.map((row) => [
      row.product_id,
      { category: row.category_id, game: row.game_id },
    ]),
  );
  const previews: PromotionPreview[] = [];
  for (const promotion of promotions.rows) {
    if (
      promotion.activation_mode === 'COUPON_REQUIRED' &&
      selectedCoupon?.promotion_id !== promotion.promotion_id
    ) {
      continue;
    }
    const targets = await queryable.query<PromotionTargetRow>(
      `SELECT * FROM promotion_targets WHERE promotion_id=$1 ORDER BY position,side`,
      [promotion.promotion_id],
    );
    const schedules = await queryable.query<PromotionScheduleRow>(
      `SELECT * FROM promotion_weekly_schedules WHERE promotion_id=$1 ORDER BY position`,
      [promotion.promotion_id],
    );
    const promotionCounters = await usageCounters(
      queryable,
      'promotion_id',
      promotion.promotion_id,
    );
    const promotionAccountCounters = await usageCounters(
      queryable,
      'promotion_id',
      promotion.promotion_id,
      accountId,
    );
    const couponCounters =
      selectedCoupon === null
        ? emptyCounters()
        : await usageCounters(queryable, 'coupon_id', selectedCoupon.coupon_id);
    const couponAccountCounters =
      selectedCoupon === null
        ? emptyCounters()
        : await usageCounters(queryable, 'coupon_id', selectedCoupon.coupon_id, accountId);
    previews.push({
      accountId,
      branchId,
      channel: 'ECOMMERCE',
      coupon:
        selectedCoupon === null || selectedCoupon.promotion_id !== promotion.promotion_id
          ? null
          : {
              counters: couponCounters,
              couponId: selectedCoupon.coupon_id,
              endsAt: selectedCoupon.ends_at?.toISOString() ?? null,
              globalLimit: nullableNumber(selectedCoupon.global_limit),
              normalizedCode: selectedCoupon.normalized_code,
              perAccountCounters: couponAccountCounters,
              perAccountLimit: nullableNumber(selectedCoupon.per_account_limit),
              promotionId: selectedCoupon.promotion_id,
              startsAt: selectedCoupon.starts_at?.toISOString() ?? null,
              state: selectedCoupon.state,
            },
      couponCode:
        selectedCoupon?.promotion_id === promotion.promotion_id
          ? selectedCoupon.normalized_code
          : null,
      evaluatedAt: now.toISOString(),
      excludedLineIds: [],
      lines: lines.map((line) => ({
        categoryId: requirePromotionReference(line.productId, 'category', lineMetadata),
        gameId: requirePromotionReference(line.productId, 'game', lineMetadata),
        lineId: line.cartLineId,
        productId: line.productId,
        quantity: line.quantity,
        unitPriceClp: line.unitPriceClp,
      })),
      orderPromotionExcluded: false,
      promotion: {
        activationMode: promotion.activation_mode,
        benefit: promotionBenefit(promotion),
        branchId: promotion.branch_id,
        channel: promotion.channel,
        createdAt: promotion.created_at.toISOString(),
        counters: promotionCounters,
        endsAt: promotion.ends_at.toISOString(),
        globalLimit: nullableNumber(promotion.global_limit),
        minimumEligibleAmountClp: nullableNumber(promotion.minimum_eligible_amount_clp),
        minimumEligibleQuantity: nullableNumber(promotion.minimum_eligible_quantity),
        name: promotion.name,
        perAccountCounters: promotionAccountCounters,
        perAccountLimit: nullableNumber(promotion.per_account_limit),
        priority: Number(promotion.priority),
        promotionId: promotion.promotion_id,
        schedules: schedules.rows.map((row) => ({
          dayOfWeek: Number(row.day_of_week),
          endMinuteLocal: Number(row.end_minute_local),
          position: Number(row.position),
          startMinuteLocal: Number(row.start_minute_local),
        })),
        scope: promotion.scope,
        startsAt: promotion.starts_at.toISOString(),
        state: promotion.state,
        targets: targets.rows.map((row) => ({
          categoryId: row.category_id,
          gameId: row.game_id,
          kind: row.target_kind,
          position: Number(row.position),
          productId: row.product_id,
          side: row.side,
        })),
        updatedAt: promotion.updated_at.toISOString(),
      },
      timezone,
    });
  }
  let evaluated;
  try {
    evaluated = evaluatePromotionSet(previews);
  } catch (error) {
    if (error instanceof PromotionError) throw conflict(error.code);
    throw error;
  }
  let coupon: CheckoutSummaryView['coupon'] = null;
  if (selectedCoupon !== null) {
    const evaluatedStatus =
      evaluated.couponStatuses[selectedCoupon.promotion_id] ??
      couponOutsidePromotionStatus(selectedCoupon, now);
    const status = evaluatedStatus === 'NOT_PROVIDED' ? 'NOT_ELIGIBLE' : evaluatedStatus;
    coupon = {
      couponId: selectedCoupon.coupon_id,
      normalizedCode: selectedCoupon.normalized_code,
      status,
    };
  }
  return {
    coupon,
    discountClp: evaluated.totalDiscountAmountClp,
    snapshots: evaluated.snapshots,
  };
}

async function reservePromotions(
  transaction: PgTransaction,
  orderId: string,
  accountId: string,
  snapshots: readonly AppliedPromotionSnapshotV1[],
  now: Date,
  uuids: UuidGenerator,
): Promise<void> {
  for (const snapshot of snapshots) {
    if (snapshot.totalDiscountAmountClp === 0) continue;
    await transaction.query(
      `INSERT INTO promotion_usages(promotion_usage_id,promotion_id,coupon_id,account_id,
         channel,source_type,source_id,status,discount_amount_clp,applied_promotion_snapshot,
         claimed_lines_snapshot,qualifying_units_snapshot,benefited_units_snapshot,
         committed_at,released_at,occurred_at,idempotency_key)
       VALUES($1,$2,$3,$4,'ECOMMERCE','ORDER',$5,'RESERVED',$6,$7,$8,$9,$10,NULL,NULL,$11,$12)`,
      [
        uuids.generate(),
        snapshot.promotionId,
        snapshot.couponId,
        accountId,
        orderId,
        snapshot.totalDiscountAmountClp,
        snapshot,
        JSON.stringify(snapshot.claimedUnits),
        JSON.stringify(snapshot.qualifyingUnits),
        JSON.stringify(snapshot.benefitedUnits),
        now,
        `order:${orderId}:promotion:${snapshot.promotionId}`,
      ],
    );
  }
}

function requirePromotionReference(
  productId: string,
  kind: 'category' | 'game',
  cache: ReadonlyMap<string, { category: string; game: string }>,
): string {
  const value = cache.get(productId)?.[kind];
  if (value === undefined) throw new Error('Promotion product metadata is unavailable.');
  return value;
}

async function usageCounters(
  queryable: Queryable,
  column: 'coupon_id' | 'promotion_id',
  id: string,
  accountId?: string,
) {
  const result = await queryable.query<UsageCounterRow>(
    `SELECT
       count(*) FILTER (WHERE status='COMMITTED')::int committed,
       count(*) FILTER (WHERE status='RELEASED')::int released,
       count(*) FILTER (WHERE status='RESERVED')::int reserved
     FROM promotion_usages WHERE ${column}=$1${accountId === undefined ? '' : ' AND account_id=$2'}`,
    accountId === undefined ? [id] : [id, accountId],
  );
  const row = result.rows[0];
  return {
    committed: Number(row?.committed ?? 0),
    released: Number(row?.released ?? 0),
    reserved: Number(row?.reserved ?? 0),
  };
}

async function evaluateLoyalty(
  queryable: Queryable,
  accountId: string,
  branchId: string | null,
  requestedPoints: number,
  merchandiseSubtotalClp: number,
  promotionDiscountClp: number,
  shippingFeeClp: number,
): Promise<CheckoutSummaryView['loyalty']> {
  const account = await queryable.query<LoyaltyAccountRow>(
    `SELECT balance,reserved_points FROM loyalty_accounts WHERE account_id=$1`,
    [accountId],
  );
  const loyaltyAccount = account.rows[0];
  if (loyaltyAccount === undefined) throw conflict('LOYALTY_ACCOUNT_NOT_FOUND');
  const available =
    safeInteger(loyaltyAccount.balance) - safeNonnegative(loyaltyAccount.reserved_points);
  if (branchId === null) {
    return {
      availablePoints: available,
      configuration: null,
      configured: false,
      loyaltyEligibleAmountClp: 0,
      maxRedeemablePoints: 0,
      pointsDiscountClp: 0,
      pointsEarned: 0,
      requestedPoints,
      validationErrorCodes: requestedPoints > 0 ? ['DELIVERY_INTENT_REQUIRED'] : [],
    };
  }
  const result = await queryable.query<LoyaltyConfigurationRow>(
    `SELECT * FROM loyalty_configurations WHERE branch_id=$1 AND state='ACTIVE'`,
    [branchId],
  );
  const configuration = result.rows[0];
  if (configuration === undefined) {
    return {
      availablePoints: available,
      configuration: null,
      configured: false,
      loyaltyEligibleAmountClp: 0,
      maxRedeemablePoints: 0,
      pointsDiscountClp: 0,
      pointsEarned: 0,
      requestedPoints,
      validationErrorCodes: requestedPoints > 0 ? ['LOYALTY_CONFIGURATION_NOT_ACTIVE'] : [],
    };
  }
  const configurationSnapshot = {
    branchId: configuration.branch_id,
    earnClpPerPoint: safePositive(configuration.earn_clp_per_point),
    loyaltyConfigurationId: configuration.loyalty_configuration_id,
    maximumRedeemBasisPoints:
      configuration.maximum_redeem_basis_points === null
        ? null
        : Number(configuration.maximum_redeem_basis_points),
    minimumRedeemPoints: safeNonnegative(configuration.minimum_redeem_points),
    redeemClpPerPoint: safePositive(configuration.redeem_clp_per_point),
    snapshot_contract: 'LoyaltyConfigurationSnapshot.v1' as const,
    snapshot_schema_version: 1 as const,
    versionNumber: safePositive(configuration.version_number),
  };
  try {
    const calculated = calculateRedeem({
      balance: safeInteger(loyaltyAccount.balance),
      maximumRedeemBasisPoints:
        configuration.maximum_redeem_basis_points === null
          ? null
          : Number(configuration.maximum_redeem_basis_points),
      merchandiseSubtotalClp,
      minimumRedeemPoints: safeNonnegative(configuration.minimum_redeem_points),
      promotionDiscountClp,
      redeemClpPerPoint: safePositive(configuration.redeem_clp_per_point),
      requestedPoints,
      reservedPoints: safeNonnegative(loyaltyAccount.reserved_points),
      shippingFeeClp,
    });
    const earned = calculateEarn({
      accountLinked: true,
      earnClpPerPoint: configurationSnapshot.earnClpPerPoint,
      merchandiseSubtotalClp,
      pointsDiscountClp: calculated.pointsDiscountClp,
      promotionDiscountClp,
      shippingFeeClp,
    });
    return {
      ...calculated,
      configuration: configurationSnapshot,
      configured: true,
      ...earned,
      requestedPoints,
      validationErrorCodes: [],
    };
  } catch (error) {
    if (error instanceof LoyaltyError) {
      const allowed = calculateRedeem({
        balance: safeInteger(loyaltyAccount.balance),
        maximumRedeemBasisPoints:
          configuration.maximum_redeem_basis_points === null
            ? null
            : Number(configuration.maximum_redeem_basis_points),
        merchandiseSubtotalClp,
        minimumRedeemPoints: safeNonnegative(configuration.minimum_redeem_points),
        promotionDiscountClp,
        redeemClpPerPoint: safePositive(configuration.redeem_clp_per_point),
        requestedPoints: 0,
        reservedPoints: safeNonnegative(loyaltyAccount.reserved_points),
        shippingFeeClp,
      });
      return {
        ...allowed,
        configuration: configurationSnapshot,
        configured: true,
        ...calculateEarn({
          accountLinked: true,
          earnClpPerPoint: configurationSnapshot.earnClpPerPoint,
          merchandiseSubtotalClp,
          pointsDiscountClp: 0,
          promotionDiscountClp,
          shippingFeeClp,
        }),
        pointsDiscountClp: 0,
        requestedPoints,
        validationErrorCodes: [error.code],
      };
    }
    throw error;
  }
}

function storedIntent(group: GroupRow): StoredCartDeliveryIntent | null {
  if (group.delivery_mode === null) return null;
  const shared = {
    lastValidatedAt: group.delivery_last_validated_at,
    validationErrorCodes: group.delivery_validation_error_codes,
    validationStatus: group.delivery_validation_status,
  };
  if (group.delivery_mode === 'PICKUP') {
    if (group.pickup_branch_id === null) throw new Error('Stored pickup intent is malformed.');
    return { ...shared, branchId: group.pickup_branch_id, mode: 'PICKUP' };
  }
  if (
    group.delivery_intent_schema_version !== 2 ||
    group.shipping_recipient_name === null ||
    group.shipping_commune === null ||
    group.shipping_payment_mode !== 'FREIGHT_COLLECT' ||
    group.shipping_destination_type !== 'CARRIER_AGENCY' ||
    !['CHILEXPRESS', 'STARKEN'].includes(group.shipping_carrier ?? '') ||
    group.shipping_agency_destination === null ||
    group.shipping_included_in_order_total !== false
  ) {
    throw new Error('Stored shipping intent is malformed.');
  }
  return {
    ...shared,
    agencyDestination: group.shipping_agency_destination,
    carrier: group.shipping_carrier as 'CHILEXPRESS' | 'STARKEN',
    destinationCommune: group.shipping_commune,
    destinationType: 'CARRIER_AGENCY',
    mode: 'SHIPPING',
    recipientName: group.shipping_recipient_name,
    shippingIncludedInOrderTotal: false,
    shippingPaymentMode: 'FREIGHT_COLLECT',
  };
}

function promotionBenefit(row: PromotionRow) {
  if (row.benefit_type === 'PERCENTAGE_DISCOUNT') {
    return { basisPoints: Number(row.percentage_basis_points), type: row.benefit_type } as const;
  }
  if (row.benefit_type === 'FIXED_AMOUNT_DISCOUNT') {
    return { amountClp: Number(row.fixed_amount_clp), type: row.benefit_type } as const;
  }
  if (row.benefit_type === 'FIXED_PRICE') {
    return { priceClp: Number(row.fixed_price_clp), type: row.benefit_type } as const;
  }
  return {
    buyQuantity: Number(row.buy_x_quantity),
    getQuantity: Number(row.get_y_quantity),
    type: 'BUY_X_GET_Y' as const,
  };
}

function couponOutsidePromotionStatus(coupon: CouponRow, now: Date) {
  if (coupon.state === 'EXPIRED') return 'NOT_CURRENT' as const;
  if (coupon.state !== 'ACTIVE') return 'NOT_ELIGIBLE' as const;
  if (
    (coupon.starts_at !== null && now < coupon.starts_at) ||
    (coupon.ends_at !== null && now >= coupon.ends_at)
  ) {
    return 'NOT_CURRENT' as const;
  }
  return 'NOT_ELIGIBLE' as const;
}

function emptyCounters() {
  return { committed: 0, released: 0, reserved: 0 };
}

async function touchCart(transaction: PgTransaction, cartId: string, now: Date): Promise<void> {
  await transaction.query(
    `UPDATE carts SET version=version+1,updated_at=$2 WHERE cart_id=$1 AND state='ACTIVE'`,
    [cartId, now],
  );
}

function operationAction(operation: CheckoutMutationOperation): string {
  return `CHECKOUT_${operation.kind}`;
}

function operationReason(operation: CheckoutMutationOperation): string {
  if (operation.kind === 'REPLACE_INTENT') return `${operation.intent.mode}_SELECTED`;
  return operation.kind;
}

function hydrateSummary(value: unknown): CheckoutSummaryView {
  if (typeof value !== 'object' || value === null)
    throw new Error('Stored checkout replay is invalid.');
  const raw = value as Record<string, unknown>;
  const recalculatedAt = new Date(String(raw.recalculatedAt));
  if (!Number.isFinite(recalculatedAt.getTime()))
    throw new Error('Stored checkout replay time is invalid.');
  const delivery = raw.deliveryIntent;
  const hydratedDelivery =
    typeof delivery === 'object' && delivery !== null
      ? {
          ...(delivery as StoredCartDeliveryIntent),
          lastValidatedAt:
            (delivery as { lastValidatedAt?: unknown }).lastValidatedAt == null
              ? null
              : new Date(String((delivery as { lastValidatedAt: unknown }).lastValidatedAt)),
        }
      : null;
  return {
    ...(raw as unknown as CheckoutSummaryView),
    deliveryIntent: hydratedDelivery,
    recalculatedAt,
  };
}

function safeInteger(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('Checkout integer is outside the safe range.');
  return parsed;
}
function safeNonnegative(value: string | number | null): number {
  if (value === null) return 0;
  const parsed = safeInteger(value);
  if (parsed < 0) throw new Error('Checkout value must be nonnegative.');
  return parsed;
}
function safePositive(value: string | number): number {
  const parsed = safeNonnegative(value);
  if (parsed === 0) throw new Error('Checkout value must be positive.');
  return parsed;
}
function safeProduct(left: number, right: number): number {
  const result = BigInt(left) * BigInt(right);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw conflict('CHECKOUT_AMOUNT_TOO_LARGE');
  return Number(result);
}
function safeSum(values: readonly number[]): number {
  const result = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw conflict('CHECKOUT_AMOUNT_TOO_LARGE');
  return Number(result);
}
function nullableNumber(value: string | null): number | null {
  return value === null ? null : safePositive(value);
}
function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
function conflict(code: string): CheckoutError {
  return new CheckoutError(code, 'CONFLICT', 'Checkout requirements conflict with the request.');
}
function notFound(code: string): CheckoutError {
  return new CheckoutError(code, 'NOT_FOUND', 'Checkout resource was not found.');
}
function mapError(error: unknown): unknown {
  if (error instanceof CheckoutError) return error;
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String(error.code);
    if (code === '23503') return notFound('CHECKOUT_REFERENCE_NOT_FOUND');
    if (['23505', '23514', '40001', '40P01'].includes(code)) {
      return conflict('CHECKOUT_STATE_CONFLICT');
    }
  }
  return error;
}

interface CheckoutOrderReplayRow extends QueryResultRow {
  request_fingerprint: string;
  order_id: string;
  public_number: string;
  state: import('@sergod/contracts').OrderState;
  total_amount_clp: string | number;
  requires_external_payment: boolean;
  expires_at: Date | null;
}

function checkoutCreatedOrder(row: CheckoutOrderReplayRow): CheckoutOrderCreationView {
  return {
    expiresAt: row.expires_at,
    orderId: row.order_id,
    publicNumber: row.public_number,
    requiresExternalPayment: row.requires_external_payment,
    state: row.state,
    totalAmountClp: safeNonnegative(row.total_amount_clp),
  };
}

interface Queryable {
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ readonly rows: Row[] }>;
}
interface AccountRow extends QueryResultRow {
  readonly email_verification_status: string;
  readonly role: string;
  readonly status: string;
}
interface ReplayRow extends QueryResultRow {
  readonly fingerprint: string;
  readonly response_json: unknown | null;
  readonly status: string;
}
interface GroupRow extends QueryResultRow {
  readonly cart_group_id: string;
  readonly cart_id: string;
  readonly checkout_version: string;
  readonly delivery_last_validated_at: Date | null;
  readonly delivery_mode: 'PICKUP' | 'SHIPPING' | null;
  readonly delivery_intent_schema_version: number | null;
  readonly delivery_validation_error_codes: string[];
  readonly delivery_validation_status: 'INVALID' | 'NOT_VALIDATED' | 'VALID';
  readonly group_type: 'CONFLICT' | 'PREORDER' | 'REGULAR';
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
  readonly state: string;
}
interface LineRow extends QueryResultRow {
  readonly campaign_branch_id: string | null;
  readonly campaign_product_id: string | null;
  readonly campaign_publication_status: string | null;
  readonly capacity: string | null;
  readonly cart_line_id: string;
  readonly category_status: string;
  readonly closes_at: Date | null;
  readonly collection_status: string | null;
  readonly committed: string | null;
  readonly condition: string | null;
  readonly edition: string | null;
  readonly game_status: string;
  readonly has_primary_resource: boolean;
  readonly language: string | null;
  readonly name: string;
  readonly on_hand: string | null;
  readonly opens_at: Date | null;
  readonly operational_state: string | null;
  readonly preorder_campaign_id: string | null;
  readonly price_amount_clp: string;
  readonly product_id: string;
  readonly product_status: string;
  readonly quantity: string;
  readonly reserved: string | null;
  readonly sale_type: 'PREORDER' | 'REGULAR';
  readonly sku: string;
  readonly temporarily_reserved: string | null;
}
interface CouponRow extends QueryResultRow {
  readonly coupon_id: string;
  readonly ends_at: Date | null;
  readonly global_limit: string | null;
  readonly normalized_code: string;
  readonly per_account_limit: string | null;
  readonly promotion_id: string;
  readonly starts_at: Date | null;
  readonly state: 'ACTIVE' | 'CANCELLED' | 'DRAFT' | 'EXPIRED' | 'SUSPENDED';
}
interface PromotionRow extends QueryResultRow {
  readonly activation_mode: 'AUTOMATIC' | 'COUPON_REQUIRED';
  readonly benefit_type:
    'BUY_X_GET_Y' | 'FIXED_AMOUNT_DISCOUNT' | 'FIXED_PRICE' | 'PERCENTAGE_DISCOUNT';
  readonly branch_id: string | null;
  readonly buy_x_quantity: string | null;
  readonly channel: 'BOTH' | 'ECOMMERCE' | 'POS';
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
  readonly scope: 'LINE' | 'ORDER';
  readonly starts_at: Date;
  readonly state: 'ACTIVE' | 'CANCELLED' | 'DRAFT' | 'EXPIRED' | 'SCHEDULED' | 'SUSPENDED';
  readonly updated_at: Date;
}
interface PromotionTargetRow extends QueryResultRow {
  readonly category_id: string | null;
  readonly game_id: string | null;
  readonly position: number;
  readonly product_id: string | null;
  readonly side: 'BENEFITED' | 'QUALIFYING' | 'REWARD';
  readonly target_kind: 'ALL_PRODUCTS' | 'CATEGORY' | 'PRODUCT' | 'TCG_GAME';
}
interface PromotionScheduleRow extends QueryResultRow {
  readonly day_of_week: number;
  readonly end_minute_local: number;
  readonly position: number;
  readonly start_minute_local: number;
}
interface UsageCounterRow extends QueryResultRow {
  readonly committed: number;
  readonly released: number;
  readonly reserved: number;
}
interface LoyaltyAccountRow extends QueryResultRow {
  readonly balance: string;
  readonly reserved_points: string;
}
interface LoyaltyConfigurationRow extends QueryResultRow {
  readonly branch_id: string;
  readonly earn_clp_per_point: string;
  readonly loyalty_configuration_id: string;
  readonly maximum_redeem_basis_points: number | null;
  readonly minimum_redeem_points: string;
  readonly redeem_clp_per_point: string;
  readonly version_number: string;
}
