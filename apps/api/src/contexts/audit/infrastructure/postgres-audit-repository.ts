import type { Pool, QueryResultRow } from 'pg';

import type { AuditEntryView, AuditRepository } from '../application/audit-service.js';

export class PgAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  async list(input: Parameters<AuditRepository['list']>[0]) {
    const values: unknown[] = [];
    const conditions: string[] = [];
    if (input.action !== undefined) {
      values.push(input.action);
      conditions.push(`action=$${values.length}`);
    }
    if (input.resourceType !== undefined) {
      values.push(input.resourceType);
      conditions.push(`resource_type=$${values.length}`);
    }
    if (input.result !== undefined) {
      values.push(input.result);
      conditions.push(`result=$${values.length}`);
    }
    if (input.cursor !== undefined) {
      values.push(input.cursor.occurredAt, input.cursor.auditEntryId);
      conditions.push(
        `(occurred_at,audit_entry_id) < ($${values.length - 1},$${values.length}::uuid)`,
      );
    }
    values.push(input.limit + 1);
    const result = await this.pool.query<Row>(
      `SELECT audit_entry_id,actor_id,actor_type,action,resource_type,resource_id,result,reason,
              correlation_id,occurred_at
         FROM audit_entries ${conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`}
        ORDER BY occurred_at DESC,audit_entry_id DESC LIMIT $${values.length}`,
      values,
    );
    const page = result.rows.slice(0, input.limit);
    return {
      hasMore: result.rows.length > input.limit,
      items: page.map(map),
    };
  }
}

interface Row extends QueryResultRow {
  readonly action: string;
  readonly actor_id: string | null;
  readonly actor_type: 'EXTERNAL_SERVICE' | 'SYSTEM' | 'USER';
  readonly audit_entry_id: string;
  readonly correlation_id: string;
  readonly occurred_at: Date;
  readonly reason: string | null;
  readonly resource_id: string | null;
  readonly resource_type: string | null;
  readonly result: 'FAILURE' | 'SUCCESS';
}

function map(row: Row): AuditEntryView {
  return {
    action: row.action,
    actorId: row.actor_id,
    actorType: row.actor_type,
    auditEntryId: row.audit_entry_id,
    correlationId: row.correlation_id,
    occurredAt: row.occurred_at,
    reason: row.reason,
    resourceId: row.resource_id,
    resourceType: row.resource_type,
    result: row.result,
  };
}
