import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
describe('Phase 3 prerequisite and Phase 8 migration contracts', () => {
  it.each([
    [
      '010_service_info_shipping_evidence.cjs',
      '20260811025159_phase_3_service_info_shipping_evidence.sql',
    ],
    ['011_pseudo_pos.cjs', '20260811025344_phase_8_pseudo_pos.sql'],
    [
      '015_r6_nationwide_freight_collect.cjs',
      '20260813223544_phase_r6_nationwide_freight_collect.sql',
    ],
  ])('keeps %s byte-equivalent', async (wrapper, file) => {
    expect((require(`../../migrations/${wrapper}`) as { upSql: string }).upSql).toBe(
      await readFile(resolve('supabase/migrations', file), 'utf8'),
    );
  });
  it('adds current freight collect without rewriting historical DeliverySnapshot.v1 facts', () => {
    const sql = (
      require('../../migrations/015_r6_nationwide_freight_collect.cjs') as { upSql: string }
    ).upSql;
    for (const value of [
      'FREIGHT_COLLECT',
      'CARRIER_AGENCY',
      'CHILEXPRESS',
      'STARKEN',
      'shipping_agency_destination',
      'shipping_included_in_order_total',
      'DELIVERY_INTENT_REQUIRES_R6_UPDATE',
    ])
      expect(sql).toContain(value);
    expect(sql).toContain('ALTER COLUMN shipping_fee_amount_clp DROP NOT NULL');
    expect(sql).toContain("snapshot_contract'='DeliverySnapshot.v2'");
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION sergod_protect_cart_checkout_provisional() FROM PUBLIC',
    );
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION sergod_validate_pos_completion() FROM authenticated',
    );
    expect(sql).not.toMatch(/GRANT .* TO (anon|authenticated)/iu);
    expect(sql).not.toMatch(/CREATE POLICY|SECURITY DEFINER/iu);
    expect(sql).not.toMatch(/CREATE TABLE\s+(orders|order_lines|payment_attempts)/iu);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE/iu);
  });
  it('uses separate ownership, RLS and source-bound references', () => {
    const sql = (require('../../migrations/011_pseudo_pos.cjs') as { upSql: string }).upSql;
    for (const table of [
      'pos_sales',
      'pos_sale_lines',
      'pos_sale_settlements',
      'promotion_usages',
      'loyalty_effect_progress',
      'preorder_commitments',
      'preorder_allocations',
      'stock_reservations',
    ])
      expect(sql).toContain(`CREATE TABLE ${table}`);
    expect(sql).toContain("source_type text NOT NULL CHECK (source_type='POS_SALE')");
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).not.toMatch(/card_number|cvv|payment_attempt/iu);
    expect(sql).not.toMatch(/CREATE POLICY/iu);
  });
});
