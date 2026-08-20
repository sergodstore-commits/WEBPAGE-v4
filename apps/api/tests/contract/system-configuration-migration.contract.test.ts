import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('SystemConfiguration administration migration contract', () => {
  it('keeps application and timestamped Supabase SQL byte-equivalent', async () => {
    const application = require('../../migrations/013_system_configuration_administration.cjs') as {
      upSql: string;
    };
    expect(application.upSql).toBe(
      await readFile(
        resolve('supabase/migrations/20260812025910_system_configuration_administration.sql'),
        'utf8',
      ),
    );
  });

  it('closes the key registry and protects lifecycle without exposing table access', () => {
    const sql = (
      require('../../migrations/013_system_configuration_administration.cjs') as { upSql: string }
    ).upSql;
    expect(sql).toContain('system_configurations_registered_value_ck');
    expect(sql).toContain("configuration_key = 'ANONYMOUS_CART_INACTIVITY_MINUTES'");
    expect(sql).toContain('sergod_protect_system_configuration');
    expect(sql).toContain("OLD.state IN ('ACTIVE', 'RETIRED')");
    expect(sql).toContain('REVOKE EXECUTE');
    expect(sql).not.toMatch(/INSERT INTO public\.system_configurations/iu);
    expect(sql).not.toMatch(/GRANT .* (anon|authenticated)/iu);
  });
});
