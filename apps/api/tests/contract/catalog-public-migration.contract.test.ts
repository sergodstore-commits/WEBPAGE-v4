import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Public catalog migration contract', () => {
  it('keeps application and timestamped Supabase SQL equivalent', async () => {
    const application = require('../../migrations/005_catalog_public_read_indexes.cjs') as {
      downSql: string;
      upSql: string;
    };
    const supabase = await readFile(
      resolve('supabase/migrations/20260802002322_phase_3f_public_catalog_indexes.sql'),
      'utf8',
    );
    expect(normalize(application.upSql)).toBe(normalize(supabase));
    expect(application.downSql).toMatch(/DROP FUNCTION public\.sergod_catalog_search_normalize/u);
  });

  it('contains only technical search and index changes without data or public access mutations', () => {
    const { upSql } = require('../../migrations/005_catalog_public_read_indexes.cjs') as {
      upSql: string;
    };
    expect(upSql).toMatch(/CREATE EXTENSION IF NOT EXISTS unaccent/u);
    expect(upSql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm/u);
    expect(upSql).toMatch(/SET search_path = ''/u);
    expect(upSql).toMatch(/products_public_newest_order_idx/u);
    expect(upSql).toMatch(/products_public_search_idx/u);
    expect(upSql).toMatch(/product.*language_filter_idx/isu);
    expect(upSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP TABLE|CREATE TABLE)\b/iu);
    expect(upSql).not.toMatch(/GRANT\s+.+\s+TO\s+(?:anon|authenticated)/iu);
    expect(upSql).not.toMatch(/CREATE\s+POLICY/iu);
    expect(upSql).not.toMatch(/secure_storage_key|availability|stock|slug\s+text/iu);
  });
});

function normalize(value: string): string {
  return value.replace(/\r\n/gu, '\n').trim();
}
