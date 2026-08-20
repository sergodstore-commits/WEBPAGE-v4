import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Phase 9B checkout migration contract', () => {
  it('keeps application and timestamped Supabase SQL byte-equivalent', async () => {
    const application = require('../../migrations/014_checkout_provisional.cjs') as {
      upSql: string;
    };
    expect(application.upSql).toBe(
      await readFile(
        resolve('supabase/migrations/20260813055343_phase_9b_checkout_provisional.sql'),
        'utf8',
      ),
    );
  });

  it('persists the canonical value object and provisional selections inside CartGroup', () => {
    const sql = (require('../../migrations/014_checkout_provisional.cjs') as { upSql: string })
      .upSql;
    for (const field of [
      'selected_coupon_id',
      'requested_points',
      'delivery_mode',
      'pickup_branch_id',
      'shipping_recipient_name',
      'shipping_address',
      'shipping_commune',
      'shipping_additional_details',
      'shipping_option_id',
      'delivery_last_validated_at',
      'delivery_validation_status',
      'delivery_validation_error_codes',
      'checkout_version',
    ]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain('cart_groups_delivery_intent_shape_ck');
    expect(sql).toContain('sergod_protect_cart_checkout_provisional');
  });

  it('keeps replay data private and does not anticipate Phase 9C commerce', () => {
    const sql = (require('../../migrations/014_checkout_provisional.cjs') as { upSql: string })
      .upSql;
    expect(sql).toContain(
      'ALTER TABLE checkout_provisional_idempotency_results ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain('REVOKE ALL ON checkout_provisional_idempotency_results FROM PUBLIC');
    expect(sql).toContain('REVOKE ALL ON checkout_provisional_idempotency_results FROM anon');
    expect(sql).toContain(
      'REVOKE ALL ON checkout_provisional_idempotency_results FROM authenticated',
    );
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION sergod_protect_cart_checkout_provisional() FROM PUBLIC',
    );
    expect(sql).not.toMatch(/GRANT .* TO (anon|authenticated)/iu);
    expect(sql).not.toMatch(
      /CREATE TABLE\s+(orders|order_lines|payment_attempts|loyalty_reservations|stock_reservations)/iu,
    );
    expect(sql).not.toMatch(/CREATE POLICY/iu);
  });
});
