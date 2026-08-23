import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PgOrderRepository } from './postgres-order-repository.js';

describe('Postgres Order repository', () => {
  it('applies the account and order type filters to customer history', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const repository = new PgOrderRepository(
      { query } as unknown as Pool,
      { now: () => new Date('2026-08-23T12:00:00Z') },
      { generate: () => '0198a8be-6677-7000-8000-000000000001' },
    );

    await expect(
      repository.listForAccount({
        accountId: '0198a8be-6677-7000-8000-000000000002',
        limit: 25,
        orderType: 'PREORDER',
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(query.mock.calls[0]?.[0]).toContain('account_id=$1');
    expect(query.mock.calls[0]?.[0]).toContain('order_type=$2');
    expect(query.mock.calls[0]?.[1]).toEqual([
      '0198a8be-6677-7000-8000-000000000002',
      'PREORDER',
      26,
    ]);
  });
});
