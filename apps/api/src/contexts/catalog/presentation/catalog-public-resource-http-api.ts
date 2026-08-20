import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { catalogPublicResourceIdSchema } from '@sergod/contracts';

import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  HttpRequestError,
  requestMatchesIfNoneMatch,
  sendJson,
  setSecurityHeaders,
} from '../../../presentation/http/http-utils.js';
import type {
  CatalogPublicResourceDelivery,
  CatalogPublicResourceService,
} from '../application/catalog-public-resource-service.js';
import { CatalogError } from '../domain/catalog.js';
import { CatalogPublicRateLimiter, mapCatalogPublicError } from './catalog-public-http-api.js';

interface CatalogPublicResourceRequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class CatalogPublicResourceHttpApi implements HttpRouteHandler {
  constructor(
    private readonly catalog: CatalogPublicResourceService | null,
    private readonly logger: CatalogPublicResourceRequestLogger,
    private readonly rateLimiter: CatalogPublicRateLimiter,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    const resourceIdValue = matchPublicCatalogResourceRoute(request.method, url.pathname);
    if (resourceIdValue === null) return false;

    const correlationId = randomUUID();
    const startedAt = performance.now();
    response.setHeader('x-correlation-id', correlationId);
    let safeResourceId: string | undefined;
    try {
      if ([...url.searchParams].length !== 0) {
        throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
      }
      const rateLimit = this.rateLimiter.consume(request);
      if (!rateLimit.allowed) {
        response.setHeader('retry-after', String(rateLimit.retryAfterSeconds));
        throw new HttpRequestError('RATE_LIMITED', 429, 'Public catalog rate limit exceeded.');
      }

      const parsedId = catalogPublicResourceIdSchema.safeParse(resourceIdValue);
      if (!parsedId.success) throw resourceNotFound();
      safeResourceId = parsedId.data;
      if (this.catalog === null) {
        throw new CatalogError(
          'CATALOG_PUBLIC_RESOURCE_STORAGE_NOT_CONFIGURED',
          'INFRASTRUCTURE',
          'Public catalog resource storage is not configured.',
        );
      }

      const delivery = await this.catalog.prepare(safeResourceId);
      if (requestMatchesIfNoneMatch(request, delivery.etag)) {
        sendNotModified(response, delivery, correlationId);
      } else if (request.method === 'HEAD') {
        sendHead(response, delivery, correlationId);
      } else {
        const bytes = await delivery.loadValidatedBytes();
        sendContent(response, delivery, bytes, correlationId);
      }

      this.logger.info(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          operation: 'catalog_public.resource_content',
          request_id: correlationId,
          resource_id: safeResourceId,
          result: 'SUCCESS',
        },
        'Public catalog resource request completed.',
      );
      return true;
    } catch (error) {
      const mapped = mapCatalogPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: internalErrorCode(error),
          operation: 'catalog_public.resource_content',
          request_id: correlationId,
          ...(safeResourceId === undefined ? {} : { resource_id: safeResourceId }),
          result: 'FAILURE',
        },
        'Public catalog resource request failed.',
      );
      return sendJson(
        response,
        mapped.status,
        { correlationId, error: { code: mapped.code, message: mapped.message } },
        correlationId,
      );
    }
  }
}

function matchPublicCatalogResourceRoute(
  method: string | undefined,
  pathname: string,
): string | null {
  if (method !== 'GET' && method !== 'HEAD') return null;
  const match = /^\/api\/v1\/catalog\/resources\/([^/]+)\/content$/u.exec(pathname);
  return match?.[1] ?? null;
}

function sendNotModified(
  response: ServerResponse,
  delivery: CatalogPublicResourceDelivery,
  correlationId: string,
): void {
  setRevalidationHeaders(response, delivery, correlationId);
  response.statusCode = 304;
  response.end();
}

function sendHead(
  response: ServerResponse,
  delivery: CatalogPublicResourceDelivery,
  correlationId: string,
): void {
  setRepresentationHeaders(response, delivery, correlationId);
  response.statusCode = 200;
  response.end();
}

function sendContent(
  response: ServerResponse,
  delivery: CatalogPublicResourceDelivery,
  bytes: Uint8Array,
  correlationId: string,
): void {
  setRepresentationHeaders(response, delivery, correlationId);
  response.statusCode = 200;
  response.end(bytes);
}

function setRevalidationHeaders(
  response: ServerResponse,
  delivery: CatalogPublicResourceDelivery,
  correlationId: string,
): void {
  response.setHeader('cache-control', 'public, no-cache');
  response.setHeader('etag', delivery.etag);
  response.setHeader('x-correlation-id', correlationId);
  setSecurityHeaders(response);
}

function setRepresentationHeaders(
  response: ServerResponse,
  delivery: CatalogPublicResourceDelivery,
  correlationId: string,
): void {
  setRevalidationHeaders(response, delivery, correlationId);
  response.setHeader('content-disposition', 'inline');
  response.setHeader('content-length', String(delivery.byteSize));
  response.setHeader('content-type', delivery.mimeType);
}

function resourceNotFound(): CatalogError {
  return new CatalogError(
    'CATALOG_RESOURCE_NOT_FOUND',
    'NOT_FOUND',
    'Public catalog resource was not found.',
  );
}

function internalErrorCode(error: unknown): string {
  if (error instanceof CatalogError || error instanceof HttpRequestError) return error.code;
  return 'INTERNAL_ERROR';
}
