import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Regular inventory migration contract', () => {
  it('keeps application and timestamped Supabase migrations semantically equivalent', async () => {
    const application = require('../../migrations/006_inventory_regular_base.cjs') as {
      upSql: string;
    };
    const supabase = await readFile(
      resolve('supabase/migrations/20260808165442_inventory_regular_base.sql'),
      'utf8',
    );
    expect(normalize(application.upSql)).toBe(normalize(supabase));
  });

  it('contains the required constraints, private access, backfill and no invented threshold value', () => {
    const { upSql } = require('../../migrations/006_inventory_regular_base.cjs') as {
      upSql: string;
    };
    expect(upSql).toMatch(/CREATE TABLE inventory_positions/u);
    expect(upSql).toMatch(/CHECK \(reserved >= 0 AND reserved <= on_hand\)/u);
    expect(upSql).toMatch(/UNIQUE \(product_id, branch_id\)/u);
    expect(upSql).toMatch(/CREATE TABLE inventory_movements/u);
    expect(upSql).toMatch(/ON CONFLICT \(product_id, branch_id\) DO NOTHING/u);
    expect(upSql).toMatch(/ENABLE ROW LEVEL SECURITY/u);
    expect(upSql).toMatch(/REVOKE ALL ON TABLE/u);
    expect(upSql).not.toMatch(/DEFAULT_LOW_STOCK_THRESHOLD[^;]+VALUES/isu);
    expect(upSql).not.toMatch(/CREATE POLICY/iu);
  });
});

function normalize(value: string): string {
  return value.replaceAll('public.', '').replace(/\s+/gu, ' ').trim();
}
