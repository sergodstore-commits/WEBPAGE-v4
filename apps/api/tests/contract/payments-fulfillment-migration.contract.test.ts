import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('payments and fulfillment prospective migration', () => {
  it('keeps providers behind Payments and enforces one active/successful attempt', async () => {
    const sql = await readFile(
      'supabase/migrations/20260820070000_payments_fulfillment.sql',
      'utf8',
    );
    expect(sql).toContain("provider IN ('FLOW','WEBPAY')");
    expect(sql).toContain('payment_attempts_one_active_per_order_idx');
    expect(sql).toContain('payment_attempts_one_success_per_order_idx');
    expect(sql).toContain("currency='CLP'");
  });

  it('models freight collect without a shipping charge or required street address', async () => {
    const sql = await readFile(
      'supabase/migrations/20260820070000_payments_fulfillment.sql',
      'utf8',
    );
    expect(sql).toContain("method IN ('PICKUP','FREIGHT_COLLECT')");
    expect(sql).not.toContain('shipping_fee');
    expect(sql).not.toContain('street_address');
  });

  it('adds prospective idempotency for Order promotion and loyalty consumption', async () => {
    const sql = await readFile(
      'supabase/migrations/20260820100000_order_confirmation_notifications.sql',
      'utf8',
    );
    expect(sql).toContain("source_type IN ('POS_SALE','ORDER')");
    expect(sql).toContain("channel IN ('POS','ECOMMERCE')");
    expect(sql).toContain('promotion_usages_idempotency_idx');
    expect(sql).toContain('loyalty_movements_idempotency_idx');
    expect(sql).toContain('CREATE TABLE public.order_loyalty_reservations');
    expect(sql).toContain("status IN ('ACTIVE','CONSUMED','RELEASED')");
  });
});
