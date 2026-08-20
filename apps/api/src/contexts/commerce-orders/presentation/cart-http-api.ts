import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  cartAddLineSchema,
  cartCreateCompatibleGroupSchema,
  cartEmptyMutationSchema,
  cartMoveConflictLineSchema,
  cartUpdateLineSchema,
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
import { CartService } from '../application/cart-service.js';
import type { CartOwner } from '../domain/cart.js';
import { CartError } from '../domain/cart.js';

const COOKIE_NAME = 'sergod_cart_session';
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

type Operation =
  | 'ADD_LINE'
  | 'CREATE_CART'
  | 'CREATE_COMPATIBLE_GROUP'
  | 'GET_CART'
  | 'MERGE_CART'
  | 'MOVE_CONFLICT_LINE'
  | 'REMOVE_LINE'
  | 'UPDATE_LINE';

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class CartHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly cart: CartService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/api/v1/cart')) return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const route = matchRoute(request.method, url.pathname);
    if (route === null) return fail(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    const startedAt = performance.now();
    try {
      assertNoQuery(url);
      const resolved = await this.resolveOwner(request, route.operation);
      const mutation = route.operation !== 'GET_CART';
      const idempotencyKey = mutation
        ? readIdempotencyKey(request, { maximumLength: 255, visibleAscii: true })
        : undefined;
      const context = {
        ...(resolved.owner.kind === 'ACCOUNT' ? { actorId: resolved.owner.accountId } : {}),
        actorType: 'USER' as const,
        correlationId,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      };
      const result = await this.execute(route, request, context, resolved.owner);
      if (resolved.newSessionToken !== null) setSessionCookie(response, resolved.newSessionToken);
      if (route.operation === 'MERGE_CART') clearSessionCookie(response);
      this.logger.info(
        {
          actor_id: context.actorId,
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          operation: `cart.${route.operation.toLowerCase()}`,
          owner_kind: resolved.owner.kind,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Cart request completed.',
      );
      return sendJson(response, result.status, result.body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `cart.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Cart request failed.',
      );
      return fail(response, correlationId, mapped.status, mapped.code);
    }
  }

  private async resolveOwner(
    request: IncomingMessage,
    operation: Operation,
  ): Promise<{
    readonly newSessionToken: string | null;
    readonly owner: CartOwner;
  }> {
    if (request.headers.authorization !== undefined) {
      const authorized = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ACCOUNT_SELF' },
      });
      return {
        newSessionToken: null,
        owner: { accountId: authorized.account.accountId, kind: 'ACCOUNT' },
      };
    }
    const existingToken = readSessionCookie(request);
    if (existingToken !== null) {
      return {
        newSessionToken: null,
        owner: { anonymousSessionId: hashSession(existingToken), kind: 'ANONYMOUS' },
      };
    }
    if (operation !== 'CREATE_CART') {
      throw new HttpRequestError('CART_SESSION_REQUIRED', 401, 'Cart session is required.');
    }
    const token = randomBytes(32).toString('base64url');
    return {
      newSessionToken: token,
      owner: { anonymousSessionId: hashSession(token), kind: 'ANONYMOUS' },
    };
  }

  private async execute(
    route: { readonly cartLineId?: string; readonly operation: Operation },
    request: IncomingMessage,
    context: {
      readonly actorId?: string;
      readonly actorType: 'USER';
      readonly correlationId: string;
      readonly idempotencyKey?: string;
    },
    owner: CartOwner,
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    if (route.operation === 'GET_CART') {
      return { body: await this.cart.getCurrent(owner), status: 200 };
    }
    if (route.operation === 'CREATE_CART') {
      cartEmptyMutationSchema.parse(await json(request));
      const result = await this.cart.createCurrent(context, owner);
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    if (route.operation === 'MERGE_CART') {
      if (owner.kind !== 'ACCOUNT')
        throw new HttpRequestError('AUTHENTICATION_REQUIRED', 401, 'Authentication is required.');
      cartEmptyMutationSchema.parse(await json(request));
      const token = readSessionCookie(request);
      if (token === null)
        throw new HttpRequestError('CART_SESSION_REQUIRED', 401, 'Cart session is required.');
      const result = await this.cart.merge(context, owner.accountId, hashSession(token));
      return { body: result, status: 200 };
    }
    if (route.operation === 'ADD_LINE') {
      const result = await this.cart.addLine(
        context,
        owner,
        cartAddLineSchema.parse(await json(request)),
      );
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    const lineId = z.uuid().parse(required(route.cartLineId)).toLowerCase();
    if (route.operation === 'UPDATE_LINE') {
      return {
        body: await this.cart.updateLine(
          context,
          owner,
          lineId,
          cartUpdateLineSchema.parse(await json(request)),
        ),
        status: 200,
      };
    }
    if (route.operation === 'REMOVE_LINE') {
      assertNoBody(request);
      return { body: await this.cart.removeLine(context, owner, lineId), status: 200 };
    }
    if (route.operation === 'MOVE_CONFLICT_LINE') {
      return {
        body: await this.cart.moveConflictLine(
          context,
          owner,
          lineId,
          cartMoveConflictLineSchema.parse(await json(request)),
        ),
        status: 200,
      };
    }
    cartCreateCompatibleGroupSchema.parse(await json(request));
    return {
      body: await this.cart.createCompatibleGroup(context, owner, lineId),
      status: 200,
    };
  }
}

function matchRoute(
  method: string | undefined,
  pathname: string,
): { readonly cartLineId?: string; readonly operation: Operation } | null {
  if (pathname === '/api/v1/cart' && method === 'GET') return { operation: 'GET_CART' };
  if (pathname === '/api/v1/cart' && method === 'POST') return { operation: 'CREATE_CART' };
  if (pathname === '/api/v1/cart/lines' && method === 'POST') return { operation: 'ADD_LINE' };
  if (pathname === '/api/v1/cart/merge' && method === 'POST') return { operation: 'MERGE_CART' };
  const line = /^\/api\/v1\/cart\/lines\/([^/]+)$/u.exec(pathname);
  if (line?.[1] !== undefined && method === 'PUT')
    return { cartLineId: line[1], operation: 'UPDATE_LINE' };
  if (line?.[1] !== undefined && method === 'DELETE')
    return { cartLineId: line[1], operation: 'REMOVE_LINE' };
  const conflict = /^\/api\/v1\/cart\/conflicts\/([^/]+)\/(move|compatible-group)$/u.exec(pathname);
  if (conflict?.[1] !== undefined && method === 'POST') {
    return {
      cartLineId: conflict[1],
      operation: conflict[2] === 'move' ? 'MOVE_CONFLICT_LINE' : 'CREATE_COMPATIBLE_GROUP',
    };
  }
  return null;
}

function readSessionCookie(request: IncomingMessage): string | null {
  const headers = request.headers.cookie;
  if (headers === undefined) return null;
  if (headers.length > 4096)
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Cookie header is invalid.');
  let token: string | null = null;
  for (const part of headers.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== COOKIE_NAME) continue;
    if (token !== null)
      throw new HttpRequestError('VALIDATION_FAILED', 422, 'Cart cookie is duplicated.');
    const value = part.slice(separator + 1).trim();
    if (!SESSION_TOKEN_PATTERN.test(value))
      throw new HttpRequestError('CART_SESSION_REQUIRED', 401, 'Cart session is invalid.');
    token = value;
  }
  return token;
}

function setSessionCookie(response: ServerResponse, token: string): void {
  response.setHeader(
    'set-cookie',
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
}
function clearSessionCookie(response: ServerResponse): void {
  response.setHeader(
    'set-cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
}
function hashSession(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
async function json(request: IncomingMessage): Promise<unknown> {
  return readJsonBody(request, { requireJsonContentType: true });
}
function assertNoQuery(url: URL): void {
  if ([...url.searchParams].length !== 0)
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
}
function assertNoBody(request: IncomingMessage): void {
  const length = request.headers['content-length'];
  if (
    (length !== undefined && length !== '0') ||
    request.headers['transfer-encoding'] !== undefined
  ) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Request body is not accepted.');
  }
}
function required(value: string | undefined): string {
  if (value === undefined) throw new Error('Matched cart identifier is missing.');
  return value;
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  CART_GROUP_NOT_FOUND: 'Cart group was not found.',
  CART_LINE_NOT_FOUND: 'Cart line was not found.',
  CART_NOT_FOUND: 'Cart was not found.',
  CART_REFERENCE_NOT_FOUND: 'A referenced cart resource was not found.',
  CART_SESSION_REQUIRED: 'A valid cart session is required.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  IDEMPOTENCY_KEY_CONFLICT: 'Idempotency-Key was already used with different data.',
  IDEMPOTENCY_KEY_REQUIRED: 'A valid Idempotency-Key is required.',
  INTERNAL_ERROR: 'The request could not be completed.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  STATE_CONFLICT: 'The requested operation conflicts with cart requirements.',
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
function mapPublicError(error: unknown) {
  if (error instanceof HttpRequestError) return { code: error.code, status: error.httpStatus };
  if (error instanceof z.ZodError) return { code: 'VALIDATION_FAILED', status: 422 };
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401) return { code: 'AUTHENTICATION_REQUIRED', status: 401 };
    if (error.httpStatus === 403) return { code: 'ACCESS_DENIED', status: 403 };
    return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  }
  if (error instanceof CartError) {
    if (error.code.includes('IDEMPOTENCY'))
      return { code: 'IDEMPOTENCY_KEY_CONFLICT', status: 409 };
    if (error.category === 'NOT_FOUND') {
      return { code: error.code, status: 404 };
    }
    if (error.category === 'VALIDATION') return { code: 'VALIDATION_FAILED', status: 422 };
    if (error.category === 'CONFLICT') return { code: 'STATE_CONFLICT', status: 409 };
    if (error.category === 'INFRASTRUCTURE') return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  }
  if (isDependencyFailure(error)) return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  return { code: 'INTERNAL_ERROR', status: 500 };
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
