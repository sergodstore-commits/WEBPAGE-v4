import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PgAuditRepository } from './postgres-audit-repository.js';

describe('Postgres Audit repository', () => {
  it('builds bounded filtered pages without exposing diagnostic context', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PgAuditRepository({ query } as unknown as Pool);

    await expect(
      repository.list({ limit: 25, resourceType: 'ORDER', result: 'FAILURE' }),
    ).resolves.toEqual({ hasMore: false, items: [] });
    expect(query.mock.calls[0]?.[0]).toContain('resource_type=$1');
    expect(query.mock.calls[0]?.[0]).toContain('result=$2');
    expect(query.mock.calls[0]?.[0]).not.toContain('diagnostic_context');
    expect(query.mock.calls[0]?.[1]).toEqual(['ORDER', 'FAILURE', 26]);
  });
});
