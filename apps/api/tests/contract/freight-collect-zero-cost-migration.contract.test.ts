import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('freight collect zero-cost prospective migration', () => {
  it('aligns the database constraint and completion guard with the canonical numeric zero', async () => {
    const sql = await readFile(
      'supabase/migrations/20260820123000_freight_collect_zero_cost_hardening.sql',
      'utf8',
    );
    expect(sql).toContain("shippingCostAmountClp'='0'::jsonb");
    expect(sql).toContain("shippingCostAmountClp'<>'0'::jsonb");
    expect(sql).not.toContain("shippingCostAmountClp'='null'::jsonb");
    expect(sql).toContain('shipping_fee_amount_clp IS NULL');
    expect(sql).toContain('orderTotalWithoutShippingClp');
  });
});
