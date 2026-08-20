import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { orderListQuerySchema } from '@sergod/contracts';
import { z } from 'zod';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { IdentityAccessError } from '../../identity-access/application/identity-access-service.js';
import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import { HttpRequestError, readBearerToken, sendJson } from '../../../presentation/http/http-utils.js';
import { OrderService } from '../application/order-service.js';
import { OrderError } from '../domain/order.js';

type Route =
  | { readonly audience: 'ACCOUNT'; readonly operation: 'LIST' }
  | { readonly audience: 'ACCOUNT'; readonly operation: 'GET'; readonly orderId: string }
  | { readonly audience: 'ADMIN'; readonly operation: 'LIST' }
  | { readonly audience: 'ADMIN'; readonly operation: 'GET'; readonly orderId: string };

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class OrderHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly orders: OrderService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/api/v1/orders') && !url.pathname.startsWith('/api/v1/admin/orders')) {
      return false;
    }
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const route = matchRoute(request.method, url.pathname);
    if (route === null) return fail(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    const startedAt = performance.now();
    try {
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: route.audience === 'ADMIN' ? 'ADMIN' : 'BUYER' },
      });
      assertNoBody(request);
      const body = await this.execute(route, url, authorization.account.accountId);
      this.logger.info(
        {
          actor_id: authorization.account.accountId,
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          operation: `orders.${route.audience.toLowerCase()}.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Order request completed.',
      );
      return sendJson(response, 200, body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `orders.${route.audience.toLowerCase()}.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Order request failed.',
      );
      return fail(response, correlationId, mapped.status, mapped.code);
    }
  }

  private async execute(route: Route, url: URL, accountId: string): Promise<unknown> {
    if (route.operation === 'LIST') {
      const query = orderListQuerySchema.parse(queryObject(url));
      const input = {
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor.toLowerCase() }),
        ...(query.state === undefined ? {} : { state: query.state }),
      };
      return route.audience === 'ADMIN'
        ? this.orders.listForAdmin(input)
        : this.orders.listForAccount(accountId, input);
    }
    assertNoQuery(url);
    const orderId = z.uuid().parse(route.orderId).toLowerCase();
    return route.audience === 'ADMIN'
      ? this.orders.getForAdmin(orderId)
      : this.orders.getForAccount(accountId, orderId);
  }
}

function matchRoute(method: string | undefined, pathname: string): Route | null {
  if (method !== 'GET') return null;
  if (pathname === '/api/v1/orders') return { audience: 'ACCOUNT', operation: 'LIST' };
  if (pathname === '/api/v1/admin/orders') return { audience: 'ADMIN', operation: 'LIST' };
  const account = /^\/api\/v1\/orders\/([^/]+)$/u.exec(pathname);
  if (account?.[1] !== undefined) return { audience: 'ACCOUNT', operation: 'GET', orderId: account[1] };
  const admin = /^\/api\/v1\/admin\/orders\/([^/]+)$/u.exec(pathname);
  if (admin?.[1] !== undefined) return { audience: 'ADMIN', operation: 'GET', orderId: admin[1] };
  return null;
}

function queryObject(url: URL): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (result[key] !== undefined) throw new HttpRequestError('VALIDATION_FAILED', 422, 'Duplicate query parameter.');
    result[key] = value;
  }
  return result;
}
function assertNoQuery(url: URL): void {
  if ([...url.searchParams].length !== 0) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
  }
}
function assertNoBody(request: IncomingMessage): void {
  const length = request.headers['content-length'];
  if ((length !== undefined && length !== '0') || request.headers['transfer-encoding'] !== undefined) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Request body is not accepted.');
  }
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  INTERNAL_ERROR: 'The request could not be completed.',
  ORDER_NOT_FOUND: 'Order was not found.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  VALIDATION_FAILED: 'Request validation failed.',
});

function fail(response: ServerResponse, correlationId: string, status: number, code: string): true {
  return sendJson(
    response,
    status,
    { correlationId, error: { code, message: messages[code] ?? messages.INTERNAL_ERROR } },
    correlationId,
  );
}
function mapPublicError(error: unknown): { readonly code: string; readonly status: number } {
  if (error instanceof HttpRequestError) return { code: error.code, status: error.httpStatus };
  if (error instanceof z.ZodError) return { code: 'VALIDATION_FAILED', status: 422 };
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401) return { code: 'AUTHENTICATION_REQUIRED', status: 401 };
    if (error.httpStatus === 403) return { code: 'ACCESS_DENIED', status: 403 };
    return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  }
  if (error instanceof OrderError) {
    if (error.category === 'NOT_FOUND') return { code: error.code, status: 404 };
    if (error.category === 'VALIDATION') return { code: 'VALIDATION_FAILED', status: 422 };
    if (error.category === 'CONFLICT') return { code: error.code, status: 409 };
    return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  }
  return { code: 'INTERNAL_ERROR', status: 500 };
}
