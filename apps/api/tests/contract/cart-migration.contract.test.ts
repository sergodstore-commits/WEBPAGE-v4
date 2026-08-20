import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Phase 9A cart migration contract', () => {
  it('keeps application and timestamped Supabase SQL byte-equivalent', async () => {
    const application = require('../../migrations/012_cart_foundation.cjs') as { upSql: string };
    expect(application.upSql).toBe(
      await readFile(
        resolve('supabase/migrations/20260811183924_phase_9a_cart_foundation.sql'),
        'utf8',
      ),
    );
  });

  it('contains only cart ownership structures with private default-deny access', () => {
    const sql = (require('../../migrations/012_cart_foundation.cjs') as { upSql: string }).upSql;
    for (const table of ['carts', 'cart_groups', 'cart_lines']) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(sql).toContain('REVOKE ALL ON carts,cart_groups,cart_lines FROM PUBLIC');
    expect(sql).not.toMatch(/CREATE POLICY/iu);
    expect(sql).not.toMatch(
      /CREATE TABLE (orders|order_lines|payment_attempts|stock_reservations)/iu,
    );
  });

  it('enforces ownership, final states, grouping and positive quantities in PostgreSQL', () => {
    const sql = (require('../../migrations/012_cart_foundation.cjs') as { upSql: string }).upSql;
    expect(sql).toContain('num_nonnulls(owner_account_id, anonymous_session_id) = 1');
    expect(sql).toContain('carts_active_account_idx');
    expect(sql).toContain('carts_active_anonymous_idx');
    expect(sql).toContain('cart_groups_active_regular_idx');
    expect(sql).toContain('quantity bigint NOT NULL CHECK (quantity>0)');
    expect(sql).toContain('sergod_protect_cart_lifecycle');
    expect(sql).toContain('sergod_validate_cart_line');
  });
});
