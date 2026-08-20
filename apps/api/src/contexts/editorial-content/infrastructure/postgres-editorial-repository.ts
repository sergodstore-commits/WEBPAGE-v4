import type { EditorialStatus, EditorialType, EditorialWrite } from '@sergod/contracts';
import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import type { EditorialEntryView, EditorialRepository } from '../application/editorial-service.js';

export class EditorialError extends Error {
  constructor(
    readonly code: string,
    readonly status: 404 | 409,
  ) {
    super('Editorial operation could not be completed.');
    this.name = 'EditorialError';
  }
}

export class PgEditorialRepository implements EditorialRepository {
  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
  ) {}
  async create(context: ExecutionContext, input: EditorialWrite) {
    const now = this.clock.now();
    const result = await this.pool.query<Row>(
      `INSERT INTO editorial_entries(editorial_entry_id,type,status,slug,title,excerpt,body,metadata,
         created_by,updated_by,created_at,updated_at)
       VALUES($1,$2,'DRAFT',$3,$4,$5,$6,$7,$8,$8,$9,$9) RETURNING *`,
      [
        this.uuids.generate(),
        input.type,
        input.slug,
        input.title,
        input.excerpt,
        input.body,
        JSON.stringify(input.metadata),
        requiredActor(context),
        now,
      ],
    );
    return map(required(result.rows[0]));
  }
  async getPublished(slug: string) {
    const result = await this.pool.query<Row>(
      `SELECT * FROM editorial_entries WHERE slug=$1 AND status='PUBLISHED'`,
      [slug],
    );
    return map(required(result.rows[0]));
  }
  async list(input: {
    readonly cursor?: string | undefined;
    readonly limit: number;
    readonly publicOnly: boolean;
    readonly status?: EditorialStatus | undefined;
    readonly type?: EditorialType | undefined;
  }) {
    const values: unknown[] = [];
    const conditions = input.publicOnly ? ["status='PUBLISHED'"] : [];
    if (!input.publicOnly && input.status !== undefined) {
      values.push(input.status);
      conditions.push(`status=$${values.length}`);
    }
    if (input.type !== undefined) {
      values.push(input.type);
      conditions.push(`type=$${values.length}`);
    }
    if (input.cursor !== undefined) {
      values.push(input.cursor);
      conditions.push(`editorial_entry_id < $${values.length}::uuid`);
    }
    values.push(input.limit + 1);
    const result = await this.pool.query<Row>(
      `SELECT * FROM editorial_entries ${conditions.length === 0 ? '' : `WHERE ${conditions.join(' AND ')}`}
       ORDER BY editorial_entry_id DESC LIMIT $${values.length}`,
      values,
    );
    const page = result.rows.slice(0, input.limit);
    return {
      items: page.map(map),
      nextCursor:
        result.rows.length > input.limit ? (page.at(-1)?.editorial_entry_id ?? null) : null,
    };
  }
  async transition(context: ExecutionContext, entryId: string, status: EditorialStatus) {
    const now = this.clock.now();
    const result = await this.pool.query<Row>(
      `UPDATE editorial_entries SET status=$2,published_at=CASE WHEN $2='PUBLISHED'
         THEN COALESCE(published_at,$3) ELSE published_at END,updated_by=$4,updated_at=$3,version=version+1
       WHERE editorial_entry_id=$1 RETURNING *`,
      [entryId, status, now, requiredActor(context)],
    );
    return map(required(result.rows[0]));
  }
  async update(context: ExecutionContext, entryId: string, input: EditorialWrite) {
    const result = await this.pool.query<Row>(
      `UPDATE editorial_entries SET type=$2,slug=$3,title=$4,excerpt=$5,body=$6,metadata=$7,
         updated_by=$8,updated_at=$9,version=version+1 WHERE editorial_entry_id=$1 RETURNING *`,
      [
        entryId,
        input.type,
        input.slug,
        input.title,
        input.excerpt,
        input.body,
        JSON.stringify(input.metadata),
        requiredActor(context),
        this.clock.now(),
      ],
    );
    return map(required(result.rows[0]));
  }
}

function required(row: Row | undefined): Row {
  if (row === undefined) throw new EditorialError('EDITORIAL_NOT_FOUND', 404);
  return row;
}
function requiredActor(context: ExecutionContext): string {
  if (context.actorId === undefined) throw new EditorialError('ACCESS_DENIED', 409);
  return context.actorId;
}
function map(row: Row): EditorialEntryView {
  return {
    body: row.body,
    createdAt: row.created_at,
    editorialEntryId: row.editorial_entry_id,
    excerpt: row.excerpt,
    metadata: row.metadata,
    publishedAt: row.published_at,
    slug: row.slug,
    status: row.status,
    title: row.title,
    type: row.type,
    updatedAt: row.updated_at,
  };
}
interface Row extends QueryResultRow {
  readonly body: string;
  readonly created_at: Date;
  readonly editorial_entry_id: string;
  readonly excerpt: string;
  readonly metadata: Record<string, unknown>;
  readonly published_at: Date | null;
  readonly slug: string;
  readonly status: EditorialStatus;
  readonly title: string;
  readonly type: EditorialType;
  readonly updated_at: Date;
}
