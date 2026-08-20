import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Loyalty migration contract', () => {
  it('keeps application and timestamped Supabase migrations semantically equivalent', async () => {
    const application = require('../../migrations/008_loyalty_foundation.cjs') as { upSql: string };
    const supabase = await readFile(
      resolve('supabase/migrations/20260809162204_phase_6_loyalty.sql'),
      'utf8',
    );
    expect(normalize(application.upSql)).toBe(normalize(supabase));
  });

  it('contains only Phase 6-owned persisted structures with default deny and immutable ledger', () => {
    const { upSql } = require('../../migrations/008_loyalty_foundation.cjs') as { upSql: string };
    for (const table of ['loyalty_accounts', 'loyalty_configurations', 'loyalty_movements'])
      expect(upSql).toContain(`CREATE TABLE ${table}`);
    expect(upSql).toMatch(/ON CONFLICT \(account_id\) DO NOTHING/u);
    expect(upSql).toMatch(/maximum_redeem_basis_points BETWEEN 1 AND 10000/u);
    expect(upSql).toMatch(/WHERE state='ACTIVE'/u);
    expect(upSql).toMatch(/ledger is immutable/u);
    expect(upSql).toMatch(/ENABLE ROW LEVEL SECURITY/u);
    expect(upSql).not.toMatch(/CREATE POLICY/iu);
    expect(upSql).not.toMatch(
      /CREATE TABLE loyalty_reservations|CREATE TABLE loyalty_effect_progress|CREATE TABLE orders|CREATE TABLE pos_sales/iu,
    );
  });
});

function normalize(value: string): string {
  return value.replaceAll('public.', '').replace(/\s+/gu, ' ').trim();
}
