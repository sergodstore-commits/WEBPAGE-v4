import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  catalogListQuerySchema,
  collectionListQuerySchema,
  createCategorySchema,
  createCollectionSchema,
  createProductSchema,
  createTcgGameSchema,
  editCategorySchema,
  editCollectionSchema,
  editProductSchema,
  editTcgGameSchema,
  parentPublicationTransitionSchema,
  productListQuerySchema,
  productPublicationTransitionSchema,
} from '@sergod/contracts';
import { z } from 'zod';

import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import {
  HttpRequestError,
  readBearerToken,
  readIdempotencyKey,
  readJsonBody,
  sendJson,
} from '../../../presentation/http/http-utils.js';
import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import { CatalogEntityAdminService } from '../application/catalog-entity-admin-service.js';
import { CatalogError, type CatalogEntityType } from '../domain/catalog.js';

interface CatalogRequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

type EntityKind = 'categories' | 'collections' | 'products' | 'tcg-games';

interface MatchedRoute {
  readonly entityId?: string;
  readonly kind: EntityKind;
  readonly operation: 'CREATE' | 'DETAIL' | 'EDIT' | 'LIST' | 'TRANSITION';
}

export class CatalogAdminHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly catalog: CatalogEntityAdminService,
    private readonly logger: CatalogRequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/api/v1/admin/catalog')) return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const route = matchRoute(request.method, url.pathname);
    if (route === null) {
      return this.fail(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    }

    const startedAt = performance.now();
    try {
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      });
      const idempotencyKey =
        route.operation === 'LIST' || route.operation === 'DETAIL'
          ? undefined
          : readIdempotencyKey(request, { maximumLength: 255, visibleAscii: true });
      const context = {
        actorId: authorization.account.accountId,
        actorType: 'USER' as const,
        correlationId,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      };
      const result = await this.execute(route, url, request, context);
      this.logger.info(
        {
          actor_id: context.actorId,
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          operation: `catalog_admin.${route.kind}.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Catalog administration request completed.',
      );
      return sendJson(response, result.status, result.body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `catalog_admin.${route.kind}.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Catalog administration request failed.',
      );
      return this.fail(response, correlationId, mapped.status, mapped.code, mapped.message);
    }
  }

  private async execute(
    route: MatchedRoute,
    url: URL,
    request: IncomingMessage,
    context: {
      readonly actorId: string;
      readonly actorType: 'USER';
      readonly correlationId: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    if (route.operation === 'LIST') {
      const query = queryObject(url);
      if (route.kind === 'tcg-games') {
        return {
          body: await this.catalog.listGames(context, catalogListQuerySchema.parse(query)),
          status: 200,
        };
      }
      if (route.kind === 'categories') {
        return {
          body: await this.catalog.listCategories(context, catalogListQuerySchema.parse(query)),
          status: 200,
        };
      }
      if (route.kind === 'collections') {
        return {
          body: await this.catalog.listCollections(context, collectionListQuerySchema.parse(query)),
          status: 200,
        };
      }
      return {
        body: await this.catalog.listProducts(context, productListQuerySchema.parse(query)),
        status: 200,
      };
    }

    assertNoQuery(url);
    if (route.operation === 'DETAIL') {
      const id = parseId(route.entityId);
      return { body: { item: await this.detail(context, route.kind, id) }, status: 200 };
    }

    const body = await readJsonBody(request, { requireJsonContentType: true });
    if (route.operation === 'CREATE') {
      const result = await this.create(context, route.kind, body);
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    const id = parseId(route.entityId);
    if (route.operation === 'EDIT') {
      return { body: await this.edit(context, route.kind, id, body), status: 200 };
    }
    return { body: await this.transition(context, route.kind, id, body), status: 200 };
  }

  private detail(
    context: Parameters<CatalogEntityAdminService['getGame']>[0],
    kind: EntityKind,
    id: string,
  ) {
    if (kind === 'tcg-games') return this.catalog.getGame(context, id);
    if (kind === 'categories') return this.catalog.getCategory(context, id);
    if (kind === 'collections') return this.catalog.getCollection(context, id);
    return this.catalog.getProduct(context, id);
  }

  private create(
    context: Parameters<CatalogEntityAdminService['createGame']>[0],
    kind: EntityKind,
    body: unknown,
  ) {
    if (kind === 'tcg-games')
      return this.catalog.createGame(context, createTcgGameSchema.parse(body));
    if (kind === 'categories')
      return this.catalog.createCategory(context, createCategorySchema.parse(body));
    if (kind === 'collections')
      return this.catalog.createCollection(context, createCollectionSchema.parse(body));
    return this.catalog.createProduct(context, createProductSchema.parse(body));
  }

  private edit(
    context: Parameters<CatalogEntityAdminService['editGame']>[0],
    kind: EntityKind,
    id: string,
    body: unknown,
  ) {
    if (kind === 'tcg-games')
      return this.catalog.editGame(context, id, editTcgGameSchema.parse(body));
    if (kind === 'categories')
      return this.catalog.editCategory(context, id, editCategorySchema.parse(body));
    if (kind === 'collections')
      return this.catalog.editCollection(context, id, editCollectionSchema.parse(body));
    return this.catalog.editProduct(context, id, editProductSchema.parse(body));
  }

  private transition(
    context: Parameters<CatalogEntityAdminService['transitionProduct']>[0],
    kind: EntityKind,
    id: string,
    body: unknown,
  ) {
    if (kind === 'products') {
      return this.catalog.transitionProduct(
        context,
        id,
        productPublicationTransitionSchema.parse(body),
      );
    }
    return this.catalog.transitionParent(
      context,
      entityType(kind),
      id,
      parentPublicationTransitionSchema.parse(body),
    );
  }

  private fail(
    response: ServerResponse,
    correlationId: string,
    status: number,
    code: string,
    message = publicMessages[code] ?? 'The request could not be completed.',
  ): true {
    return sendJson(response, status, { correlationId, error: { code, message } }, correlationId);
  }
}

function matchRoute(method: string | undefined, pathname: string): MatchedRoute | null {
  const base = '/api/v1/admin/catalog';
  for (const kind of ['tcg-games', 'categories', 'collections', 'products'] as const) {
    if (pathname === `${base}/${kind}`) {
      if (method === 'GET') return { kind, operation: 'LIST' };
      if (method === 'POST') return { kind, operation: 'CREATE' };
      return null;
    }
    const transition = new RegExp(`^${base}/${kind}/([^/]+)/publication-transitions$`, 'u').exec(
      pathname,
    );
    if (transition !== null) {
      return method === 'POST'
        ? { entityId: requiredRoutePart(transition[1]), kind, operation: 'TRANSITION' }
        : null;
    }
    const detail = new RegExp(`^${base}/${kind}/([^/]+)$`, 'u').exec(pathname);
    if (detail !== null) {
      if (method === 'GET') {
        return { entityId: requiredRoutePart(detail[1]), kind, operation: 'DETAIL' };
      }
      if (method === 'PATCH') {
        return { entityId: requiredRoutePart(detail[1]), kind, operation: 'EDIT' };
      }
      return null;
    }
  }
  return null;
}

function queryObject(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in query)
      throw new HttpRequestError('VALIDATION_FAILED', 422, 'Duplicate query parameter.');
    query[key] = value;
  }
  return query;
}

function assertNoQuery(url: URL): void {
  if ([...url.searchParams].length !== 0) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
  }
}

function parseId(value: string | undefined): string {
  return z.uuid().parse(value);
}

function requiredRoutePart(value: string | undefined): string {
  if (value === undefined) throw new Error('Matched catalog route did not include its identifier.');
  return value;
}

function entityType(kind: Exclude<EntityKind, 'products'>): Exclude<CatalogEntityType, 'PRODUCT'> {
  if (kind === 'tcg-games') return 'TCG_GAME';
  if (kind === 'categories') return 'CATEGORY';
  return 'COLLECTION';
}

const publicMessages: Readonly<Record<string, string>> = Object.freeze({
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  CATALOG_ENTITY_NOT_FOUND: 'Catalog entity was not found.',
  CATALOG_IDEMPOTENCY_CONFLICT: 'Idempotency-Key was already used with different data.',
  CATALOG_PUBLISHED_DESCENDANTS: 'Published descendants require an explicit valid strategy.',
  CATALOG_REFERENCE_NOT_FOUND: 'A catalog reference was not found.',
  CATALOG_STATE_TRANSITION_INVALID: 'The catalog publication transition is not valid.',
  CATALOG_UNIQUE_CONFLICT: 'A catalog value must be unique.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  IDEMPOTENCY_KEY_REQUIRED: 'A valid Idempotency-Key is required.',
  INTERNAL_ERROR: 'The request could not be completed.',
  INVALID_JSON: 'Request body must be valid JSON.',
  REQUEST_TOO_LARGE: 'Request is too large.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  STATE_CONFLICT: 'The requested state conflicts with catalog requirements.',
  VALIDATION_FAILED: 'Request validation failed.',
});

function mapPublicError(error: unknown): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
} {
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
    if (error.code === 'CATALOG_REFERENCE_NOT_FOUND') return publicError(404, error.code);
    if (error.code === 'CATALOG_UNIQUE_CONFLICT') return publicError(409, error.code);
    if (error.code === 'CATALOG_STATE_TRANSITION_INVALID') return publicError(409, error.code);
    if (error.code === 'CATALOG_PUBLISHED_DESCENDANTS') return publicError(409, error.code);
    if (
      error.code === 'CATALOG_IDEMPOTENCY_CONFLICT' ||
      error.code === 'CATALOG_IDEMPOTENCY_IN_PROGRESS'
    ) {
      return publicError(409, 'CATALOG_IDEMPOTENCY_CONFLICT');
    }
    if (error.code === 'CATALOG_IDEMPOTENCY_KEY_REQUIRED')
      return publicError(422, 'IDEMPOTENCY_KEY_REQUIRED');
    if (error.category === 'VALIDATION') return publicError(422, 'VALIDATION_FAILED');
    if (error.category === 'INFRASTRUCTURE') return publicError(503, 'DEPENDENCY_UNAVAILABLE');
    if (error.category === 'CONFLICT') return publicError(409, 'STATE_CONFLICT');
  }
  if (isDependencyFailure(error)) return publicError(503, 'DEPENDENCY_UNAVAILABLE');
  return publicError(500, 'INTERNAL_ERROR');
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

function publicError(status: number, code: string) {
  return { code, message: publicMessages[code] ?? 'The request could not be completed.', status };
}
