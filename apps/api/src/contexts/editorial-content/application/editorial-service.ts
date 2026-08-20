import type { EditorialStatus, EditorialType, EditorialWrite } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

export interface EditorialEntryView {
  readonly body: string;
  readonly createdAt: Date;
  readonly editorialEntryId: string;
  readonly excerpt: string;
  readonly metadata: Record<string, unknown>;
  readonly publishedAt: Date | null;
  readonly slug: string;
  readonly status: EditorialStatus;
  readonly title: string;
  readonly type: EditorialType;
  readonly updatedAt: Date;
}

export interface EditorialRepository {
  create(context: ExecutionContext, input: EditorialWrite): Promise<EditorialEntryView>;
  getPublished(slug: string): Promise<EditorialEntryView>;
  list(input: {
    readonly cursor?: string | undefined;
    readonly limit: number;
    readonly publicOnly: boolean;
    readonly status?: EditorialStatus | undefined;
    readonly type?: EditorialType | undefined;
  }): Promise<{
    readonly items: readonly EditorialEntryView[];
    readonly nextCursor: string | null;
  }>;
  transition(
    context: ExecutionContext,
    entryId: string,
    status: EditorialStatus,
  ): Promise<EditorialEntryView>;
  update(
    context: ExecutionContext,
    entryId: string,
    input: EditorialWrite,
  ): Promise<EditorialEntryView>;
}

export class EditorialService {
  constructor(private readonly repository: EditorialRepository) {}
  async getPublished(slug: string) {
    return { item: serialize(await this.repository.getPublished(slug)) };
  }
  async listPublic(input: {
    readonly cursor?: string | undefined;
    readonly limit: number;
    readonly type?: EditorialType | undefined;
  }) {
    return serializePage(await this.repository.list({ ...input, publicOnly: true }));
  }
  async listAdmin(input: {
    readonly cursor?: string | undefined;
    readonly limit: number;
    readonly status?: EditorialStatus | undefined;
    readonly type?: EditorialType | undefined;
  }) {
    return serializePage(await this.repository.list({ ...input, publicOnly: false }));
  }
  async create(context: ExecutionContext, input: EditorialWrite) {
    return { item: serialize(await this.repository.create(context, input)) };
  }
  async update(context: ExecutionContext, entryId: string, input: EditorialWrite) {
    return { item: serialize(await this.repository.update(context, entryId, input)) };
  }
  async transition(context: ExecutionContext, entryId: string, status: EditorialStatus) {
    return { item: serialize(await this.repository.transition(context, entryId, status)) };
  }
}

function serializePage(page: {
  readonly items: readonly EditorialEntryView[];
  readonly nextCursor: string | null;
}) {
  return { ...page, items: page.items.map(serialize) };
}
function serialize(entry: EditorialEntryView) {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    updatedAt: entry.updatedAt.toISOString(),
  };
}
