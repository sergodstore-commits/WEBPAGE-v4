import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Preorders migration contract', () => {
  it('keeps application and timestamped Supabase migrations byte-equivalent', async () => {
    const application = require('../../migrations/009_preorders_base.cjs') as { upSql: string };
    const supabase = await readFile(
      resolve('supabase/migrations/20260810214318_phase_7_preorders_base.sql'),
      'utf8',
    );
    expect(application.upSql).toBe(supabase);
  });

  it('contains only Phase 7-owned structures and protected inventory extensions', () => {
    const { upSql } = require('../../migrations/009_preorders_base.cjs') as { upSql: string };
    for (const table of [
      'preorder_campaigns',
      'preorder_campaign_state_history',
      'preorder_receipts',
      'preorder_stock_pools',
      'preorder_stock_lot_balances',
      'preorder_stock_pool_ledger',
      'preorder_stock_transfers',
    ])
      expect(upSql).toContain(`CREATE TABLE ${table}`);
    expect(upSql).toContain('preorder_campaigns_no_overlapping_windows');
    expect(upSql).toContain('preorder evidence is immutable');
    expect(upSql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(upSql).not.toMatch(/CREATE POLICY/iu);
    expect(upSql).not.toMatch(
      /CREATE TABLE (orders|order_lines|pos_sales|pos_sale_lines|return_lines|preorder_commitments|preorder_allocations|stock_reservations)/iu,
    );
  });
});
