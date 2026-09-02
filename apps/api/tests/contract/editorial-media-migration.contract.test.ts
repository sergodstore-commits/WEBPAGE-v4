import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('Editorial media migration contract', () => {
  it('keeps the application and Supabase migrations equivalent and restrictive', async () => {
    const application = require('../../migrations/022_editorial_media.cjs') as { upSql: string };
    const supabase = await readFile(
      resolve('supabase/migrations/20260902010000_editorial_media.sql'),
      'utf8',
    );
    expect(normalize(application.upSql)).toBe(normalize(supabase));
    expect(supabase).toContain('ENABLE ROW LEVEL SECURITY');
    expect(supabase).toContain("resource.resource_class IN ('CONTENT_IMAGE', 'COMIC_PAGE')");
    expect(supabase).toContain('editorial media ownership is immutable');
  });
});

function normalize(value: string): string {
  return value.replace(/\r\n/gu, '\n').trim();
}
