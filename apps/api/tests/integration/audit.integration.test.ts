import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditService } from '../../src/contexts/audit/application/audit-service.js';
import { PgAuditRepository } from '../../src/contexts/audit/infrastructure/postgres-audit-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const action = 'ACCEPTANCE_ADMIN_AUDIT_LIST';
let pool: Pool;

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
}

beforeAll(async () => {
  const url = await databaseUrl();
  await runner({
    checkOrder: true,
    databaseUrl: url,
    dir: resolve('apps/api/migrations'),
    direction: 'up',
    ignorePattern: 'README\\.md',
    migrationsTable: 'pg_migrations',
    schema: 'public',
    singleTransaction: true,
  });
  pool = createPostgresPool(url, { max: 4 });
});
beforeEach(async () => {
  await pool.query('DELETE FROM audit_entries WHERE action=$1', [action]);
});
afterAll(async () => {
  await pool.query('DELETE FROM audit_entries WHERE action=$1', [action]);
  await pool.end();
});

describe('Audit PostgreSQL integration', () => {
  it('paginates chronologically with a stable composite cursor', async () => {
    for (const occurredAt of [
      '2026-08-23T10:00:00Z',
      '2026-08-23T11:00:00Z',
      '2026-08-23T12:00:00Z',
    ]) {
      await pool.query(
        `INSERT INTO audit_entries(audit_entry_id,actor_type,action,result,correlation_id,occurred_at) VALUES($1,'SYSTEM',$2,'SUCCESS',$3,$4)`,
        [crypto.randomUUID(), action, crypto.randomUUID(), occurredAt],
      );
    }
    const service = new AuditService(new PgAuditRepository(pool));
    const first = await service.list({ action, limit: 2 });
    expect(first.items.map((item) => item.occurredAt)).toEqual([
      '2026-08-23T12:00:00.000Z',
      '2026-08-23T11:00:00.000Z',
    ]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.list({ action, cursor: first.nextCursor ?? '', limit: 2 });
    expect(second.items.map((item) => item.occurredAt)).toEqual(['2026-08-23T10:00:00.000Z']);
    expect(second.nextCursor).toBeNull();
  });
});
