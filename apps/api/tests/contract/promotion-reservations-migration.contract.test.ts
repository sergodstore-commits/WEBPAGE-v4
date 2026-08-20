import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('promotion reservations prospective migration', () => {
  it('adds a reserved lifecycle and enforces limits under locked promotion and coupon rows', async () => {
    const sql = await readFile(
      'supabase/migrations/20260820120000_promotion_reservations_hardening.sql',
      'utf8',
    );

    expect(sql).toContain("status IN ('RESERVED','COMMITTED','RELEASED')");
    expect(sql).toContain("OLD.status='RESERVED' AND NEW.status='COMMITTED'");
    expect(sql).toContain("OLD.status='RESERVED' AND NEW.status='RELEASED'");
    expect(sql).toContain('FROM public.promotions');
    expect(sql).toContain('FROM public.coupons');
    expect(sql.match(/FOR UPDATE/gu)).toHaveLength(2);
    expect(sql).toContain("status IN ('RESERVED','COMMITTED')");
    expect(sql).toContain('promotion_usages_limits_enforced');
  });

  it('ships a reversible local mirror without changing protected migration files', async () => {
    const mirror = await readFile(
      'apps/api/migrations/020_promotion_reservations_hardening.cjs',
      'utf8',
    );

    expect(mirror).toContain('20260820120000_promotion_reservations_hardening.sql');
    expect(mirror).toContain('DROP TRIGGER promotion_usages_protected');
    expect(mirror).toContain('CREATE TRIGGER promotion_usages_protected');
    expect(mirror).toContain("status IN ('COMMITTED','RELEASED')");
  });
});
