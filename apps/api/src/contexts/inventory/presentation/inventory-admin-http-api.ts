import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  inventoryAdjustmentSchema,
  inventoryMovementListQuerySchema,
  inventoryStockEntrySchema,
  inventoryThresholdOverrideSchema,
} from '@sergod/contracts';
import { z } from 'zod';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { IdentityAccessError } from '../../identity-access/application/identity-access-service.js';
import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  HttpRequestError,
  readBearerToken,
  readIdempotencyKey,
  readJsonBody,
  sendJson,
} from '../../../presentation/http/http-utils.js';
import { InventoryAdminService } from '../application/inventory-admin-service.js';
import { InventoryError } from '../domain/inventory.js';

type Operation = 'ADJUST' | 'GET_POSITION' | 'LIST_MOVEMENTS' | 'SET_THRESHOLD' | 'STOCK_ENTRY';

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class InventoryAdminHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly inventory: InventoryAdminService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/api/v1/admin/inventory')) return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const route = matchRoute(request.method, url.pathname);
    if (route === null) return this.fail(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    const startedAt = performance.now();
    try {
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      });
      const readOnly = route.operation === 'GET_POSITION' || route.operation === 'LIST_MOVEMENTS';
      const idempotencyKey = readOnly
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
          operation: `inventory_admin.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Inventory administration request completed.',
      );
      return sendJson(response, result.status, result.body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `inventory_admin.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Inventory administration request failed.',
      );
      return this.fail(response, correlationId, mapped.status, mapped.code, mapped.message);
    }
  }

  private async execute(
    route: { readonly operation: Operation; readonly productId: string },
    url: URL,
    request: IncomingMessage,
    context: {
      readonly actorId: string;
      readonly actorType: 'USER';
      readonly correlationId: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    const productId = z.uuid().parse(route.productId).toLowerCase();
    if (route.operation === 'GET_POSITION') {
      assertNoQuery(url);
      return { body: { item: await this.inventory.getPosition(context, productId) }, status: 200 };
    }
    if (route.operation === 'LIST_MOVEMENTS') {
      const query = inventoryMovementListQuerySchema.parse(queryObject(url));
      return {
        body: await this.inventory.listMovements(context, productId, {
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        }),
        status: 200,
      };
    }
    assertNoQuery(url);
    const body = await readJsonBody(request, { requireJsonContentType: true });
    if (route.operation === 'STOCK_ENTRY') {
      const result = await this.inventory.registerStockEntry(
        context,
        productId,
        inventoryStockEntrySchema.parse(body),
      );
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    if (route.operation === 'ADJUST') {
      const result = await this.inventory.adjust(
        context,
        productId,
        inventoryAdjustmentSchema.parse(body),
      );
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    return {
      body: await this.inventory.setThresholdOverride(
        context,
        productId,
        inventoryThresholdOverrideSchema.parse(body),
      ),
      status: 200,
    };
  }

  private fail(
    response: ServerResponse,
    correlationId: string,
    status: number,
    code: string,
    message = messages[code] ?? messages.INTERNAL_ERROR,
  ): true {
    return sendJson(response, status, { correlationId, error: { code, message } }, correlationId);
  }
}

function matchRoute(
  method: string | undefined,
  pathname: string,
): { readonly operation: Operation; readonly productId: string } | null {
  const match =
    /^\/api\/v1\/admin\/inventory\/products\/([^/]+)(?:\/(movements|stock-entries|adjustments|low-stock-threshold-override))?$/u.exec(
      pathname,
    );
  if (match === null || match[1] === undefined) return null;
  const suffix = match[2];
  if (suffix === undefined && method === 'GET') {
    return { operation: 'GET_POSITION', productId: match[1] };
  }
  if (suffix === 'movements' && method === 'GET') {
    return { operation: 'LIST_MOVEMENTS', productId: match[1] };
  }
  if (suffix === 'stock-entries' && method === 'POST') {
    return { operation: 'STOCK_ENTRY', productId: match[1] };
  }
  if (suffix === 'adjustments' && method === 'POST') {
    return { operation: 'ADJUST', productId: match[1] };
  }
  if (suffix === 'low-stock-threshold-override' && method === 'PUT') {
    return { operation: 'SET_THRESHOLD', productId: match[1] };
  }
  return null;
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
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  IDEMPOTENCY_KEY_CONFLICT: 'Idempotency-Key was already used with different data.',
  IDEMPOTENCY_KEY_REQUIRED: 'A valid Idempotency-Key is required.',
  INTERNAL_ERROR: 'The request could not be completed.',
  INVENTORY_POSITION_NOT_FOUND: 'Inventory position was not found.',
  INVENTORY_CONFIGURATION_REQUIRED:
    'Configure the global low-stock threshold before operating inventory.',
  REQUEST_TOO_LARGE: 'Request is too large.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  STATE_CONFLICT: 'The requested operation conflicts with inventory requirements.',
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
  if (error instanceof InventoryError) {
    if (error.code === 'INVENTORY_ACCESS_DENIED') return publicError(403, 'ACCESS_DENIED');
    if (error.code === 'INVENTORY_POSITION_NOT_FOUND') return publicError(404, error.code);
    if (error.code === 'INVENTORY_DEFAULT_THRESHOLD_REQUIRED')
      return publicError(409, 'INVENTORY_CONFIGURATION_REQUIRED');
    if (error.code.includes('IDEMPOTENCY')) return publicError(409, 'IDEMPOTENCY_KEY_CONFLICT');
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
  return { code, message: messages[code] ?? messages.INTERNAL_ERROR, status };
}
