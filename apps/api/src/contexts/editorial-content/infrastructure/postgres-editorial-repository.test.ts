import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PgEditorialRepository } from './postgres-editorial-repository.js';

const now = new Date('2026-08-20T12:00:00Z');
const row = {
  body: 'Solo información editorial, sin brackets ni rondas.',
  created_at: now,
  editorial_entry_id: '0198a8be-6677-7000-8000-000000000010',
  excerpt: 'Evento de comunidad',
  metadata: {},
  published_at: now,
  slug: 'torneo-editorial',
  status: 'PUBLISHED',
  title: 'Torneo editorial',
  type: 'TOURNAMENT',
  updated_at: now,
};

describe('Postgres Editorial repository', () => {
  it('only exposes published content through the public slug lookup', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [row] });
    const repository = new PgEditorialRepository(
      { query } as unknown as Pool,
      { now: () => now },
      { generate: () => row.editorial_entry_id },
    );

    await expect(repository.getPublished('torneo-editorial')).resolves.toMatchObject({
      slug: 'torneo-editorial',
      status: 'PUBLISHED',
      type: 'TOURNAMENT',
    });
    expect(query.mock.calls[0]?.[0]).toContain("status='PUBLISHED'");
  });

  it('builds bounded filtered admin pages', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [row] });
    const repository = new PgEditorialRepository(
      { query } as unknown as Pool,
      { now: () => now },
      { generate: () => row.editorial_entry_id },
    );

    await expect(
      repository.list({
        limit: 10,
        publicOnly: false,
        status: 'PUBLISHED',
        type: 'TOURNAMENT',
      }),
    ).resolves.toMatchObject({ items: [{ slug: 'torneo-editorial' }], nextCursor: null });
    expect(query.mock.calls[0]?.[0]).toContain('status=$1');
    expect(query.mock.calls[0]?.[0]).toContain('type=$2');
    expect(query.mock.calls[0]?.[1]).toEqual(['PUBLISHED', 'TOURNAMENT', 11]);
  });
});
