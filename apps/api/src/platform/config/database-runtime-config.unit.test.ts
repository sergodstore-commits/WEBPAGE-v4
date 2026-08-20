import { describe, expect, it } from 'vitest';

import { loadDatabaseRuntimeConfig } from './database-runtime-config.js';

describe('database runtime configuration', () => {
  it('allows the anonymous catalog to remain disabled without a database', () => {
    expect(loadDatabaseRuntimeConfig({})).toBeNull();
  });

  it('loads only a valid private database URL', () => {
    expect(
      loadDatabaseRuntimeConfig({ DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test' }),
    ).toEqual({ databaseUrl: 'postgresql://test:test@127.0.0.1:5432/test' });
    expect(() => loadDatabaseRuntimeConfig({ DATABASE_URL: 'not-a-url' })).toThrow();
  });
});
