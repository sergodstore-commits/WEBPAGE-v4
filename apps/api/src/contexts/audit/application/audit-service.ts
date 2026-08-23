export interface AuditEntryView {
  readonly action: string;
  readonly actorId: string | null;
  readonly actorType: 'EXTERNAL_SERVICE' | 'SYSTEM' | 'USER';
  readonly auditEntryId: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
  readonly reason: string | null;
  readonly resourceId: string | null;
  readonly resourceType: string | null;
  readonly result: 'FAILURE' | 'SUCCESS';
}

export interface AuditRepository {
  list(input: {
    readonly action?: string;
    readonly cursor?: { readonly auditEntryId: string; readonly occurredAt: Date };
    readonly limit: number;
    readonly resourceType?: string;
    readonly result?: 'FAILURE' | 'SUCCESS';
  }): Promise<{ readonly hasMore: boolean; readonly items: readonly AuditEntryView[] }>;
}

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async list(input: {
    readonly action?: string;
    readonly cursor?: string;
    readonly limit: number;
    readonly resourceType?: string;
    readonly result?: 'FAILURE' | 'SUCCESS';
  }) {
    const page = await this.repository.list({
      limit: input.limit,
      ...(input.action === undefined ? {} : { action: input.action }),
      ...(input.cursor === undefined ? {} : { cursor: decodeCursor(input.cursor) }),
      ...(input.resourceType === undefined ? {} : { resourceType: input.resourceType }),
      ...(input.result === undefined ? {} : { result: input.result }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map((entry) => ({
        ...entry,
        occurredAt: entry.occurredAt.toISOString(),
      })),
      nextCursor:
        page.hasMore && last !== undefined
          ? Buffer.from(
              JSON.stringify({
                auditEntryId: last.auditEntryId,
                occurredAt: last.occurredAt.toISOString(),
              }),
            ).toString('base64url')
          : null,
    };
  }
}

export class AuditCursorError extends Error {
  constructor() {
    super('Audit cursor is invalid.');
    this.name = 'AuditCursorError';
  }
}

function decodeCursor(value: string): { readonly auditEntryId: string; readonly occurredAt: Date } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      typeof parsed.auditEntryId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        parsed.auditEntryId,
      ) ||
      typeof parsed.occurredAt !== 'string'
    ) {
      throw new AuditCursorError();
    }
    const occurredAt = new Date(parsed.occurredAt);
    if (Number.isNaN(occurredAt.valueOf())) throw new AuditCursorError();
    return { auditEntryId: parsed.auditEntryId, occurredAt };
  } catch {
    throw new AuditCursorError();
  }
}
