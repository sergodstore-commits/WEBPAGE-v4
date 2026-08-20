import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  catalogPublicCollectionListQuerySchema,
  catalogPublicFilterValuesQuerySchema,
  catalogPublicProductListQuerySchema,
  catalogPublicReferenceListQuerySchema,
} from '@sergod/contracts';
import { z } from 'zod';

import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  HttpRequestError,
  sendJson,
  sendPublicJson,
} from '../../../presentation/http/http-utils.js';
import { CatalogPublicQueryService } from '../application/catalog-public-query-service.js';
import { CatalogError } from '../domain/catalog.js';

type Operation =
  | 'LIST_GAMES'
  | 'LIST_CATEGORIES'
  | 'LIST_COLLECTIONS'
  | 'LIST_PRODUCTS'
  | 'PRODUCT_DETAIL'
  | 'LIST_FILTER_VALUES';

interface MatchedPublicCatalogRoute {
  readonly operation: Operation;
  readonly productId?: string;
}

interface CatalogPublicRequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class CatalogPublicHttpApi implements HttpRouteHandler {
  constructor(
    private readonly catalog: CatalogPublicQueryService,
    private readonly logger: CatalogPublicRequestLogger,
    private readonly rateLimiter = new CatalogPublicRateLimiter(120, 60_000),
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    const route = matchPublicCatalogRoute(request.method, url.pathname);
    if (route === null) return false;
    const correlationId = randomUUID();
    const startedAt = performance.now();
    response.setHeader('x-correlation-id', correlationId);
    try {
      const rateLimit = this.rateLimiter.consume(request);
      if (!rateLimit.allowed) {
        response.setHeader('retry-after', String(rateLimit.retryAfterSeconds));
        throw new HttpRequestError('RATE_LIMITED', 429, 'Public catalog rate limit exceeded.');
      }
      const body = await this.execute(route, url);
      this.logger.info(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          operation: `catalog_public.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Public catalog request completed.',
      );
      return sendPublicJson(request, response, body, correlationId);
    } catch (error) {
      const mapped = mapCatalogPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `catalog_public.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Public catalog request failed.',
      );
      return sendJson(
        response,
        mapped.status,
        { correlationId, error: { code: mapped.code, message: mapped.message } },
        correlationId,
      );
    }
  }

  private async execute(route: MatchedPublicCatalogRoute, url: URL): Promise<unknown> {
    if (route.operation === 'LIST_GAMES') {
      const query = catalogPublicReferenceListQuerySchema.parse(queryObject(url));
      return this.catalog.listGames({
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      });
    }
    if (route.operation === 'LIST_CATEGORIES') {
      const query = catalogPublicReferenceListQuerySchema.parse(queryObject(url));
      return this.catalog.listCategories({
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      });
    }
    if (route.operation === 'LIST_COLLECTIONS') {
      const query = catalogPublicCollectionListQuerySchema.parse(queryObject(url));
      return this.catalog.listCollections({
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.gameId === undefined ? {} : { gameId: query.gameId }),
      });
    }
    if (route.operation === 'LIST_PRODUCTS') {
      return this.catalog.listProducts(catalogPublicProductListQuerySchema.parse(queryObject(url)));
    }
    if (route.operation === 'LIST_FILTER_VALUES') {
      const query = catalogPublicFilterValuesQuerySchema.parse(queryObject(url));
      return this.catalog.listFilterValues({
        attribute: query.attribute,
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      });
    }
    assertNoQuery(url);
    const productId = z.uuid().parse(route.productId).toLowerCase();
    return { item: await this.catalog.getProduct(productId) };
  }
}

export class CatalogPublicRateLimiter {
  readonly #clients = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maximumRequests: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {
    if (
      !Number.isSafeInteger(maximumRequests) ||
      maximumRequests <= 0 ||
      !Number.isSafeInteger(windowMs) ||
      windowMs <= 0
    ) {
      throw new Error('Public catalog rate limit configuration is invalid.');
    }
  }

  consume(
    request: IncomingMessage,
  ): { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number } {
    const now = this.now();
    const rawKey = request.socket.remoteAddress ?? 'unknown';
    if (!this.#clients.has(rawKey) && this.#clients.size >= 10_000) {
      for (const [candidateKey, candidate] of this.#clients) {
        if (now >= candidate.resetAt) this.#clients.delete(candidateKey);
      }
    }
    const key = this.#clients.has(rawKey) || this.#clients.size < 10_000 ? rawKey : 'overflow';
    const current = this.#clients.get(key);
    if (current === undefined || now >= current.resetAt) {
      this.#clients.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true };
    }
    if (current.count >= this.maximumRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }
    current.count += 1;
    return { allowed: true };
  }
}

function matchPublicCatalogRoute(
  method: string | undefined,
  pathname: string,
): MatchedPublicCatalogRoute | null {
  if (!pathname.startsWith('/api/v1/catalog/')) return null;
  if (method !== 'GET') return null;
  if (pathname === '/api/v1/catalog/tcg-games') return { operation: 'LIST_GAMES' };
  if (pathname === '/api/v1/catalog/categories') return { operation: 'LIST_CATEGORIES' };
  if (pathname === '/api/v1/catalog/collections') return { operation: 'LIST_COLLECTIONS' };
  if (pathname === '/api/v1/catalog/products') return { operation: 'LIST_PRODUCTS' };
  if (pathname === '/api/v1/catalog/product-filter-values') {
    return { operation: 'LIST_FILTER_VALUES' };
  }
  const match = /^\/api\/v1\/catalog\/products\/([^/]+)$/u.exec(pathname);
  const productId = match?.[1];
  return productId === undefined ? null : { operation: 'PRODUCT_DETAIL', productId };
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

const messages: Readonly<Record<string, string>> = Object.freeze({
  CATALOG_ENTITY_NOT_FOUND: 'Catalog entity was not found.',
  CATALOG_RESOURCE_NOT_FOUND: 'Catalog resource was not found.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  INTERNAL_ERROR: 'The request could not be completed.',
  RATE_LIMITED: 'Too many public catalog requests.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  VALIDATION_FAILED: 'Request validation failed.',
});

export function mapCatalogPublicError(error: unknown) {
  if (error instanceof HttpRequestError) return publicError(error.httpStatus, error.code);
  if (error instanceof z.ZodError) return publicError(422, 'VALIDATION_FAILED');
  if (error instanceof CatalogError) {
    if (error.code === 'CATALOG_ENTITY_NOT_FOUND') return publicError(404, error.code);
    if (error.code === 'CATALOG_RESOURCE_NOT_FOUND') return publicError(404, error.code);
    if (error.category === 'VALIDATION') return publicError(422, 'VALIDATION_FAILED');
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
