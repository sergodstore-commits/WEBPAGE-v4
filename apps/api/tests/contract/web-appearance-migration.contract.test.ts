import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Web appearance configuration migration contract', () => {
  it('keeps application and Supabase SQL byte-equivalent', async () => {
    const application = require('../../migrations/023_web_appearance_configuration.cjs') as {
      upSql: string;
    };
    expect(application.upSql).toBe(
      await readFile(
        resolve('supabase/migrations/20260912090000_web_appearance_configuration.sql'),
        'utf8',
      ),
    );
  });

  it('adds only the bounded global text configuration and preserves the closed registry', () => {
    const sql = (
      require('../../migrations/023_web_appearance_configuration.cjs') as { upSql: string }
    ).upSql;
    expect(sql).toContain("configuration_key = 'WEB_APPEARANCE_LAYOUT'");
    expect(sql).toContain("value_type = 'TEXT'");
    expect(sql).toContain('char_length(text_value) BETWEEN 1 AND 65536');
    expect(sql).not.toMatch(/INSERT INTO public\.system_configurations/iu);
    expect(sql).not.toMatch(/GRANT .* (anon|authenticated)/iu);
  });
});
