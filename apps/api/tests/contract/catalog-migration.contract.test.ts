import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Catalog migration contract', () => {
  it('keeps the application and timestamped Supabase SQL semantically identical', async () => {
    const application = require('../../migrations/004_catalog_foundation.cjs') as {
      upSql: string;
    };
    const supabase = await readFile(
      resolve('supabase/migrations/20260801051248_phase_3a_catalog_foundation.sql'),
      'utf8',
    );
    expect(normalize(application.upSql)).toBe(normalize(supabase));
  });
});

function normalize(value: string): string {
  return value.replace(/\r\n/gu, '\n').trim();
}
