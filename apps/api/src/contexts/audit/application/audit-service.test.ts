import { describe, expect, it, vi } from 'vitest';

import { AuditCursorError, AuditService } from './audit-service.js';

describe('Audit service', () => {
  it('creates and consumes a chronological composite cursor', async () => {
    const entry = {
      action: 'ORDER_PAID',
      actorId: null,
      actorType: 'SYSTEM' as const,
      auditEntryId: '0198a8be-6677-7000-8000-000000000001',
      correlationId: '0198a8be-6677-7000-8000-000000000002',
      occurredAt: new Date('2026-08-23T12:00:00Z'),
      reason: null,
      resourceId: null,
      resourceType: 'ORDER',
      result: 'SUCCESS' as const,
    };
    const list = vi
      .fn()
      .mockResolvedValueOnce({ hasMore: true, items: [entry] })
      .mockResolvedValueOnce({ hasMore: false, items: [] });
    const service = new AuditService({ list });
    const first = await service.list({ limit: 1 });
    expect(first.nextCursor).not.toBeNull();
    await service.list({ cursor: first.nextCursor ?? '', limit: 1 });
    expect(list.mock.calls[1]?.[0]).toMatchObject({
      cursor: { auditEntryId: entry.auditEntryId, occurredAt: entry.occurredAt },
    });
  });

  it('rejects malformed cursors', async () => {
    const service = new AuditService({ list: vi.fn() });
    await expect(service.list({ cursor: 'not-a-cursor', limit: 25 })).rejects.toBeInstanceOf(
      AuditCursorError,
    );
  });
});
