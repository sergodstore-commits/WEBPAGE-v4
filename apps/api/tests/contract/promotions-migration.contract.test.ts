import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Promotions migration contract', () => {
  it('keeps application and timestamped Supabase migrations semantically equivalent', async () => {
    const application = require('../../migrations/007_promotions_coupons.cjs') as { upSql: string };
    const supabase = await readFile(
      resolve('supabase/migrations/20260809064304_promotions_coupons.sql'),
      'utf8',
    );
    expect(normalize(application.upSql)).toBe(normalize(supabase));
  });

  it('contains only Phase 5-owned structures and default-deny security', () => {
    const { upSql } = require('../../migrations/007_promotions_coupons.cjs') as { upSql: string };
    for (const table of [
      'promotions',
      'promotion_targets',
      'promotion_eligible_accounts',
      'promotion_weekly_schedules',
      'coupons',
    ])
      expect(upSql).toContain(`CREATE TABLE ${table}`);
    expect(upSql).toMatch(/percentage_basis_points BETWEEN 1 AND 10000/u);
    expect(upSql).toMatch(/num_nonnulls\(product_id, category_id, game_id\)/u);
    expect(upSql).toMatch(/UNIQUE \(promotion_id, side, position\)/u);
    expect(upSql).toMatch(/normalized_code text NOT NULL UNIQUE/u);
    expect(upSql).toMatch(/SET search_path = ''/u);
    expect(upSql).toMatch(/ENABLE ROW LEVEL SECURITY/u);
    expect(upSql).toMatch(/REVOKE ALL ON TABLE/u);
    expect(upSql).not.toMatch(/CREATE POLICY/iu);
    expect(upSql).not.toMatch(/promotion_usages|order_lines|pos_sale/iu);
  });
});

function normalize(value: string): string {
  return value.replaceAll('public.', '').replace(/\s+/gu, ' ').trim();
}
