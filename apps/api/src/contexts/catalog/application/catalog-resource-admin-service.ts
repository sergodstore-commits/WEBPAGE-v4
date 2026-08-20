import { createHash, timingSafeEqual } from 'node:crypto';

import type { ExecutionContext } from '@sergod/foundation';

import {
  CatalogError,
  normalizeCatalogRequiredText,
  normalizeSafeFilename,
  type CatalogEntityType,
} from '../domain/catalog.js';
import { CatalogService } from './catalog-service.js';
import type {
  CatalogAdminAuthorizer,
  CatalogAssociatedResourceView,
  CatalogRepository,
} from './ports.js';

export class CatalogResourceAdminService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly authorizer: CatalogAdminAuthorizer,
    private readonly catalog: CatalogService,
  ) {}

  async list(
    context: ExecutionContext,
    input: {
      readonly cursor?: string;
      readonly entityId: string;
      readonly entityType: CatalogEntityType;
      readonly limit: number;
    },
  ) {
    await this.authorize(context);
    const cursor =
      input.cursor === undefined
        ? undefined
        : decodeCursor(input.cursor, input.entityType, input.entityId);
    const page = await this.repository.listAssociatedResources({
      entityId: input.entityId,
      entityType: input.entityType,
      limit: input.limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const last = page.items.at(-1);
    return {
      etag: page.etag,
      items: page.items,
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor(input.entityType, input.entityId, last.position, last.resourceId)
          : null,
    };
  }

  async upload(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly originalFilename: string;
    readonly position: number;
  }) {
    const idempotencyKey = requiredIdempotencyKey(input.context);
    const normalized = normalizeBinaryInput(input);
    const requestFingerprint = mutationFingerprint('POST', input, {
      altText: normalized.altText,
      contentSha256: sha256(input.bytes),
      declaredMimeType: normalized.declaredMimeType,
      originalFilename: normalized.originalFilename,
      position: input.position,
    });
    const result = await this.catalog.ingestAndAttachCatalogImage({
      ...input,
      ...normalized,
      context: { ...input.context, idempotencyKey },
      requestFingerprint,
    });
    return {
      item: await this.requiredResource(input, result.resourceId),
      replayed: result.replayed,
    };
  }

  async reorder(input: {
    readonly context: ExecutionContext;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly expectedEtag: string;
    readonly orderedResourceIds: readonly string[];
  }) {
    await this.authorizeMutation(input.context);
    const result = await this.repository.reorderAssociatedResources({
      ...input,
      idempotencyKey: requiredIdempotencyKey(input.context),
      requestFingerprint: mutationFingerprint('PUT', input, {
        expectedEtag: input.expectedEtag,
        orderedResourceIds: input.orderedResourceIds,
      }),
    });
    const page = await this.repository.listAssociatedResources({
      entityId: input.entityId,
      entityType: input.entityType,
      limit: 100,
    });
    return { etag: page.etag, items: page.items, replayed: result.replayed };
  }

  async selectPrimary(input: {
    readonly context: ExecutionContext;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly resourceId: string;
  }) {
    await this.authorizeMutation(input.context);
    const result = await this.repository.selectPrimaryResource({
      ...input,
      idempotencyKey: requiredIdempotencyKey(input.context),
      requestFingerprint: mutationFingerprint('PUT', input, { resourceId: input.resourceId }),
    });
    return {
      item: await this.requiredResource(input, result.resourceId),
      replayed: result.replayed,
    };
  }

  async replace(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly originalFilename: string;
    readonly reason: string;
    readonly resourceId: string;
  }) {
    const idempotencyKey = requiredIdempotencyKey(input.context);
    const normalized = normalizeBinaryInput(input);
    const reason = normalizeCatalogRequiredText(input.reason, 'CATALOG_RESOURCE_REASON_REQUIRED');
    const requestFingerprint = mutationFingerprint('POST_REPLACEMENT', input, {
      altText: normalized.altText,
      contentSha256: sha256(input.bytes),
      declaredMimeType: normalized.declaredMimeType,
      originalFilename: normalized.originalFilename,
      reason,
      resourceId: input.resourceId,
    });
    const result = await this.catalog.replaceAssociatedCatalogImage({
      ...input,
      ...normalized,
      context: { ...input.context, idempotencyKey },
      reason,
      replacedResourceId: input.resourceId,
      requestFingerprint,
    });
    return {
      item: await this.requiredResource(input, result.resourceId),
      replayed: result.replayed,
    };
  }

  async retire(input: {
    readonly context: ExecutionContext;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly reason: string;
    readonly resourceId: string;
  }) {
    await this.authorizeMutation(input.context);
    const reason = normalizeCatalogRequiredText(input.reason, 'CATALOG_RESOURCE_REASON_REQUIRED');
    const result = await this.repository.retireAssociatedResource({
      ...input,
      idempotencyKey: requiredIdempotencyKey(input.context),
      reason,
      requestFingerprint: mutationFingerprint('DELETE', input, {
        reason,
        resourceId: input.resourceId,
      }),
    });
    return {
      item: await this.requiredResource(input, result.resourceId),
      replayed: result.replayed,
    };
  }

  private async requiredResource(
    input: { readonly entityId: string; readonly entityType: CatalogEntityType },
    resourceId: string,
  ): Promise<CatalogAssociatedResourceView> {
    const resource = await this.repository.findAssociatedResource(
      input.entityType,
      input.entityId,
      resourceId,
    );
    if (resource === null) {
      throw new CatalogError(
        'CATALOG_RESOURCE_NOT_FOUND',
        'NOT_FOUND',
        'Associated resource was not found.',
      );
    }
    return resource;
  }

  private async authorize(context: ExecutionContext): Promise<void> {
    if (context.actorType !== 'USER' || context.actorId === undefined) {
      throw new CatalogError(
        'CATALOG_ADMIN_REQUIRED',
        'VALIDATION',
        'Catalog administrator is required.',
      );
    }
    await this.authorizer.assertCanManageCatalog(context);
  }

  private async authorizeMutation(context: ExecutionContext): Promise<void> {
    await this.authorize(context);
    requiredIdempotencyKey(context);
  }
}

function requiredIdempotencyKey(context: ExecutionContext): string {
  const value = context.idempotencyKey?.trim();
  if (value === undefined || !/^[\x21-\x7e]{1,255}$/u.test(value)) {
    throw new CatalogError(
      'CATALOG_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'A valid Idempotency-Key is required.',
    );
  }
  return value;
}

function mutationFingerprint(
  method: string,
  target: { readonly entityId: string; readonly entityType: CatalogEntityType },
  body: unknown,
): string {
  return sha256(
    Buffer.from(
      stableJson({ body, entityId: target.entityId, entityType: target.entityType, method }),
    ),
  );
}

function normalizeBinaryInput(input: {
  readonly altText: string;
  readonly declaredMimeType: string;
  readonly originalFilename: string;
}) {
  return {
    altText: normalizeCatalogRequiredText(input.altText, 'CATALOG_RESOURCE_ALT_TEXT_REQUIRED'),
    declaredMimeType: input.declaredMimeType.trim().toLowerCase(),
    originalFilename: normalizeSafeFilename(input.originalFilename),
  };
}

function encodeCursor(
  entityType: CatalogEntityType,
  entityId: string,
  position: number,
  resourceId: string,
): string {
  const payload = Buffer.from(
    stableJson({ entityId, entityType, position, resourceId, version: 1 }),
    'utf8',
  ).toString('base64url');
  const checksum = createHash('sha256')
    .update(`sergod-catalog-resource-cursor-v1\0${payload}`)
    .digest('base64url');
  return `${payload}.${checksum}`;
}

function decodeCursor(value: string, entityType: CatalogEntityType, entityId: string) {
  try {
    const [payload, checksum, extra] = value.split('.');
    if (payload === undefined || checksum === undefined || extra !== undefined) throw new Error();
    const expected = createHash('sha256')
      .update(`sergod-catalog-resource-cursor-v1\0${payload}`)
      .digest();
    const actual = Buffer.from(checksum, 'base64url');
    if (
      actual.toString('base64url') !== checksum ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new Error();
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      parsed.version !== 1 ||
      parsed.entityType !== entityType ||
      parsed.entityId !== entityId ||
      !Number.isSafeInteger(parsed.position) ||
      Number(parsed.position) <= 0 ||
      typeof parsed.resourceId !== 'string'
    ) {
      throw new Error();
    }
    return { position: Number(parsed.position), resourceId: parsed.resourceId };
  } catch {
    throw new CatalogError(
      'CATALOG_RESOURCE_CURSOR_INVALID',
      'VALIDATION',
      'Catalog resource cursor is invalid.',
    );
  }
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`;
}
