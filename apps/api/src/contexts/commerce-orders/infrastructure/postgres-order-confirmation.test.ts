import { describe, expect, it, vi } from 'vitest';

import type { PgTransaction } from '../../../platform/persistence/postgres.js';
import { confirmOrder } from './postgres-order-confirmation.js';

const orderId = '0198a8be-6677-7000-8000-000000000010';
const accountId = '0198a8be-6677-7000-8000-000000000001';
const promotionId = '0198a8be-6677-7000-8000-000000000020';
const loyaltyConfigurationId = '0198a8be-6677-7000-8000-000000000030';
const now = new Date('2026-08-20T12:00:00Z');

function input() {
  let sequence = 0;
  return {
    context: {
      actorId: accountId,
      actorType: 'USER' as const,
      correlationId: '0198a8be-6677-7000-8000-000000000099',
    },
    now,
    orderId,
    reason: 'ZERO_TOTAL_CONFIRMED' as const,
    uuids: { generate: () => `0198a8be-6677-7000-8000-${String(++sequence).padStart(12, '0')}` },
  };
}

function order(state = 'PENDING_PAYMENT') {
  return {
    account_id: accountId,
    applied_promotions_snapshot: [
      {
        activationMode: 'AUTOMATIC',
        allocations: [{ discountAmountClp: 1000, lineId: 'line-1', unitIndexes: [1] }],
        benefit: { amountClp: 1000, type: 'FIXED_AMOUNT_DISCOUNT' },
        benefitedUnits: ['line-1:1'],
        branchId: null,
        channel: 'ECOMMERCE',
        claimedUnits: ['line-1:1'],
        couponCode: null,
        couponId: null,
        endsAt: '2026-08-31T23:59:59Z',
        globalLimit: null,
        minimumEligibleAmountClp: null,
        minimumEligibleQuantity: null,
        perAccountLimit: null,
        priority: 10,
        promotionId,
        promotionVersion: '2026-08-20T10:00:00Z',
        qualifyingUnits: ['line-1:1'],
        schedules: [],
        scope: 'ORDER',
        snapshot_contract: 'AppliedPromotionSnapshot.v1',
        snapshot_schema_version: 1,
        startsAt: '2026-08-01T00:00:00Z',
        targets: [
          {
            categoryId: null,
            gameId: null,
            kind: 'ALL_PRODUCTS',
            position: 1,
            productId: null,
            side: 'BENEFITED',
          },
        ],
        totalDiscountAmountClp: 1000,
      },
    ],
    delivery_mode: 'PICKUP',
    delivery_snapshot: { contactPhone: '+56911111111', mode: 'PICKUP', recipientName: 'Buyer' },
    loyalty_snapshot: {
      configuration: {
        earnClpPerPoint: 1000,
        loyaltyConfigurationId,
        redeemClpPerPoint: 10,
      },
      loyaltyEligibleAmountClp: 4000,
      pointsEarned: 4,
      requestedPoints: 100,
    },
    order_id: orderId,
    public_number: 'SG-2026-1',
    state,
  };
}

describe('Postgres Order confirmation', () => {
  it('commits promotions and loyalty exactly in the Order confirmation transaction', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes('FROM orders WHERE order_id')) return { rowCount: 1, rows: [order()] };
      if (sql.includes('FROM order_inventory_reservations')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM order_preorder_reservations')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM loyalty_accounts')) {
        return {
          rowCount: 1,
          rows: [{ balance: 500, loyalty_account_id: 'loyalty-account-1', reserved_points: 100 }],
        };
      }
      if (sql.includes('FROM order_loyalty_reservations')) {
        return {
          rowCount: 1,
          rows: [{ order_loyalty_reservation_id: 'reservation-1', points: 100, status: 'ACTIVE' }],
        };
      }
      return { rowCount: 1, rows: [] };
    });

    await expect(confirmOrder({ query } as unknown as PgTransaction, input())).resolves.toBe(
      'CONFIRMED',
    );

    expect(
      statements.filter(
        (sql) => sql.includes('UPDATE promotion_usages') && sql.includes("SET status='COMMITTED'"),
      ),
    ).toHaveLength(1);
    expect(statements.filter((sql) => sql.includes('INSERT INTO loyalty_movements'))).toHaveLength(
      2,
    );
    expect(statements.some((sql) => sql.includes("SET state='PAID'"))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO order_state_history'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO order_fulfillments'))).toBe(true);
  });

  it('is a no-op replay after the Order is already PAID', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [order('PAID')] });
    await expect(confirmOrder({ query } as unknown as PgTransaction, input())).resolves.toBe(
      'REPLAYED',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('refuses confirmation when the snapshotted promotion has no active reservation', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM orders WHERE order_id')) return { rowCount: 1, rows: [order()] };
      if (sql.includes('UPDATE promotion_usages')) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    });

    await expect(
      confirmOrder({ query } as unknown as PgTransaction, input()),
    ).rejects.toMatchObject({ code: 'ORDER_PROMOTION_RESERVATION_NOT_ACTIVE' });
  });
});
