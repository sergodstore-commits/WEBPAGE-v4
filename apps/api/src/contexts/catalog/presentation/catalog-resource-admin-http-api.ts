import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  catalogResourceListQuerySchema,
  catalogResourceReplacementFieldsSchema,
  catalogResourceUploadFieldsSchema,
  reorderCatalogResourcesSchema,
  retireCatalogResourceSchema,
  selectCatalogPrimaryResourceSchema,
} from '@sergod/contracts';
import { z } from 'zod';

import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  HttpRequestError,
  readBearerToken,
  readIdempotencyKey,
  readJsonBody,
  sendJson,
} from '../../../presentation/http/http-utils.js';
import { readBoundedMultipart } from '../../../presentation/http/multipart.js';
import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import { CatalogResourceAdminService } from '../application/catalog-resource-admin-service.js';
import type { CatalogAssociatedResourceView } from '../application/ports.js';
import { CatalogError, type CatalogEntityType } from '../domain/catalog.js';

type OwnerSegment = 'categories' | 'collections' | 'products' | 'tcg-games';
type Operation = 'LIST' | 'PRIMARY' | 'REORDER' | 'REPLACE' | 'RETIRE' | 'UPLOAD';

interface MatchedResourceRoute {
  readonly entityId: string;
  readonly entityType: CatalogEntityType;
  readonly operation: Operation;
  readonly resourceId?: string;
  readonly segment: OwnerSegment;
}

interface CatalogResourceRequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class CatalogResourceAdminHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly catalog: CatalogResourceAdminService | null,
    private readonly logger: CatalogResourceRequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    const route = matchResourceRoute(request.method, url.pathname);
    if (route === null) return false;

    const correlationId = randomUUID();
    const startedAt = performance.now();
    response.setHeader('x-correlation-id', correlationId);
    try {
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      });
      if (this.catalog === null) {
        throw new CatalogError(
          'CATALOG_STORAGE_NOT_CONFIGURED',
          'INFRASTRUCTURE',
          'Catalog resource storage is not configured.',
        );
      }
      const idempotencyKey =
        route.operation === 'LIST'
          ? undefined
          : readIdempotencyKey(request, { maximumLength: 255, visibleAscii: true });
      const context = {
        actorId: authorization.account.accountId,
        actorType: 'USER' as const,
        correlationId,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      };
      const result = await this.execute(route, url, request, context, response);
      this.logger.info(
        {
          actor_id: context.actorId,
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          operation: `catalog_resource_admin.${route.segment}.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Catalog resource administration request completed.',
      );
      return sendJson(response, result.status, result.body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `catalog_resource_admin.${route.segment}.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Catalog resource administration request failed.',
      );
      return sendJson(
        response,
        mapped.status,
        { correlationId, error: { code: mapped.code, message: mapped.message } },
        correlationId,
      );
    }
  }

  private async execute(
    route: MatchedResourceRoute,
    url: URL,
    request: IncomingMessage,
    context: {
      readonly actorId: string;
      readonly actorType: 'USER';
      readonly correlationId: string;
      readonly idempotencyKey?: string;
    },
    response: ServerResponse,
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    const catalog = this.catalog;
    if (catalog === null) throw new Error('Catalog resource service was not configured.');
    const entityId = z.uuid().parse(route.entityId);
    if (route.operation === 'LIST') {
      const query = queryObject(url);
      const parsed = catalogResourceListQuerySchema.parse(query);
      const result = await catalog.list(context, {
        limit: parsed.limit,
        ...(parsed.cursor === undefined ? {} : { cursor: parsed.cursor }),
        entityId,
        entityType: route.entityType,
      });
      response.setHeader('etag', result.etag);
      return {
        body: { items: result.items.map(publicItem), nextCursor: result.nextCursor },
        status: 200,
      };
    }

    assertNoQuery(url);
    if (route.operation === 'UPLOAD') {
      const multipart = await readBoundedMultipart(request, ['altText', 'position']);
      const fields = catalogResourceUploadFieldsSchema.parse(multipart.fields);
      const result = await catalog.upload({
        ...fields,
        ...multipart.file,
        context,
        entityId,
        entityType: route.entityType,
      });
      return {
        body: { ...result, item: publicItem(result.item) },
        status: result.replayed ? 200 : 201,
      };
    }
    if (route.operation === 'REPLACE') {
      const multipart = await readBoundedMultipart(request, ['altText', 'reason']);
      const fields = catalogResourceReplacementFieldsSchema.parse(multipart.fields);
      const result = await catalog.replace({
        ...fields,
        ...multipart.file,
        context,
        entityId,
        entityType: route.entityType,
        resourceId: z.uuid().parse(requiredResourceId(route)),
      });
      return {
        body: { ...result, item: publicItem(result.item) },
        status: result.replayed ? 200 : 201,
      };
    }

    const body = await readJsonBody(request, { requireJsonContentType: true });
    if (route.operation === 'REORDER') {
      const expectedEtag = request.headers['if-match'];
      if (typeof expectedEtag !== 'string' || expectedEtag.trim() === '') {
        throw new HttpRequestError(
          'PRECONDITION_REQUIRED',
          428,
          'If-Match is required for catalog resource ordering.',
        );
      }
      const parsed = reorderCatalogResourcesSchema.parse(body);
      const result = await catalog.reorder({
        ...parsed,
        context,
        entityId,
        entityType: route.entityType,
        expectedEtag,
      });
      response.setHeader('etag', result.etag);
      return {
        body: { items: result.items.map(publicItem), replayed: result.replayed },
        status: 200,
      };
    }
    if (route.operation === 'PRIMARY') {
      const parsed = selectCatalogPrimaryResourceSchema.parse(body);
      const result = await catalog.selectPrimary({
        ...parsed,
        context,
        entityId,
        entityType: route.entityType,
      });
      return { body: { ...result, item: publicItem(result.item) }, status: 200 };
    }
    const parsed = retireCatalogResourceSchema.parse(body);
    const result = await catalog.retire({
      ...parsed,
      context,
      entityId,
      entityType: route.entityType,
      resourceId: z.uuid().parse(requiredResourceId(route)),
    });
    return { body: { ...result, item: publicItem(result.item) }, status: 200 };
  }
}

function matchResourceRoute(
  method: string | undefined,
  pathname: string,
): MatchedResourceRoute | null {
  const base = '/api/v1/admin/catalog';
  for (const segment of ['tcg-games', 'categories', 'collections', 'products'] as const) {
    const prefix = `${base}/${segment}/`;
    if (!pathname.startsWith(prefix)) continue;
    const parts = pathname.slice(prefix.length).split('/');
    if (parts.length === 2 && parts[1] === 'resources') {
      if (method === 'GET') return matched(segment, parts[0], 'LIST');
      if (method === 'POST') return matched(segment, parts[0], 'UPLOAD');
    }
    if (parts.length === 3 && parts[1] === 'resources') {
      if (parts[2] === 'order' && method === 'PATCH') return matched(segment, parts[0], 'REORDER');
      if (parts[2] === 'primary' && method === 'PUT') return matched(segment, parts[0], 'PRIMARY');
    }
    if (parts.length === 4 && parts[1] === 'resources') {
      if (parts[3] === 'replacements' && method === 'POST') {
        return matched(segment, parts[0], 'REPLACE', parts[2]);
      }
      if (parts[3] === 'retirements' && method === 'POST') {
        return matched(segment, parts[0], 'RETIRE', parts[2]);
      }
    }
  }
  return null;
}

function matched(
  segment: OwnerSegment,
  entityId: string | undefined,
  operation: Operation,
  resourceId?: string,
): MatchedResourceRoute {
  return {
    entityId: entityId ?? '',
    entityType: ownerType(segment),
    operation,
    ...(resourceId === undefined ? {} : { resourceId }),
    segment,
  };
}

function ownerType(segment: OwnerSegment): CatalogEntityType {
  if (segment === 'tcg-games') return 'TCG_GAME';
  if (segment === 'categories') return 'CATEGORY';
  if (segment === 'collections') return 'COLLECTION';
  return 'PRODUCT';
}

function requiredResourceId(route: MatchedResourceRoute): string {
  if (route.resourceId === undefined) throw new Error('Resource route identifier is missing.');
  return route.resourceId;
}

function queryObject(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in query) {
      throw new HttpRequestError('VALIDATION_FAILED', 422, 'Duplicate query parameter.');
    }
    query[key] = value;
  }
  return query;
}

function assertNoQuery(url: URL): void {
  if ([...url.searchParams].length !== 0) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
  }
}

function publicItem(item: CatalogAssociatedResourceView) {
  return {
    ...item,
    retiredAt: item.retiredAt?.toISOString() ?? null,
    uploadedAt: item.uploadedAt.toISOString(),
    validatedAt: item.validatedAt.toISOString(),
  };
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  CATALOG_ENTITY_NOT_FOUND: 'Catalog entity was not found.',
  CATALOG_IDEMPOTENCY_CONFLICT: 'Idempotency-Key was already used with different data.',
  CATALOG_RESOURCE_NOT_FOUND: 'Catalog resource was not found.',
  CATALOG_UNIQUE_CONFLICT: 'A catalog value must be unique.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  IDEMPOTENCY_KEY_REQUIRED: 'A valid Idempotency-Key is required.',
  INTERNAL_ERROR: 'The request could not be completed.',
  INVALID_JSON: 'Request body must be valid JSON.',
  INVALID_MULTIPART: 'Request body must be valid multipart.',
  PRECONDITION_FAILED: 'The catalog resource representation changed.',
  PRECONDITION_REQUIRED: 'If-Match is required.',
  REQUEST_TOO_LARGE: 'Request is too large.',
  STATE_CONFLICT: 'The requested state conflicts with catalog requirements.',
  UNSUPPORTED_MEDIA_TYPE: 'The request media type is not supported.',
  VALIDATION_FAILED: 'Request validation failed.',
});

function mapPublicError(error: unknown) {
  if (error instanceof HttpRequestError) return publicError(error.httpStatus, error.code);
  if (error instanceof z.ZodError) return publicError(422, 'VALIDATION_FAILED');
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401) return publicError(401, 'AUTHENTICATION_REQUIRED');
    if (error.httpStatus === 403) return publicError(403, 'ACCESS_DENIED');
    if (error.httpStatus >= 500) return publicError(503, 'DEPENDENCY_UNAVAILABLE');
    return publicError(403, 'ACCESS_DENIED');
  }
  if (error instanceof CatalogError) {
    if (error.code === 'CATALOG_ACCESS_DENIED' || error.code === 'CATALOG_ADMIN_REQUIRED') {
      return publicError(403, 'ACCESS_DENIED');
    }
    if (error.code === 'CATALOG_ENTITY_NOT_FOUND') return publicError(404, error.code);
    if (error.code === 'CATALOG_RESOURCE_NOT_FOUND') return publicError(404, error.code);
    if (error.code === 'CATALOG_UNIQUE_CONFLICT') return publicError(409, error.code);
    if (
      error.code === 'CATALOG_IDEMPOTENCY_CONFLICT' ||
      error.code === 'CATALOG_IDEMPOTENCY_IN_PROGRESS'
    ) {
      return publicError(409, 'CATALOG_IDEMPOTENCY_CONFLICT');
    }
    if (error.code === 'CATALOG_RESOURCE_PRECONDITION_FAILED') {
      return publicError(412, 'PRECONDITION_FAILED');
    }
    if (error.code === 'CATALOG_IDEMPOTENCY_KEY_REQUIRED') {
      return publicError(422, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    if (error.category === 'VALIDATION') return publicError(422, 'VALIDATION_FAILED');
    if (error.category === 'CONFLICT') return publicError(409, 'STATE_CONFLICT');
    if (error.category === 'INFRASTRUCTURE') return publicError(503, 'DEPENDENCY_UNAVAILABLE');
  }
  if (isDependencyFailure(error)) return publicError(503, 'DEPENDENCY_UNAVAILABLE');
  return publicError(500, 'INTERNAL_ERROR');
}

function publicError(status: number, code: string) {
  return { code, message: messages[code] ?? messages.INTERNAL_ERROR, status };
}

function isDependencyFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = String(error.code);
  return (
    code.startsWith('08') ||
    [
      '28P01',
      '53300',
      '53400',
      '57P01',
      '57P02',
      '57P03',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
    ].includes(code)
  );
}
