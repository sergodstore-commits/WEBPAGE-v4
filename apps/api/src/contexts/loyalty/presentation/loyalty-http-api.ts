import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  activeLoyaltyConfigurationQuerySchema,
  createLoyaltyConfigurationSchema,
  editLoyaltyConfigurationSchema,
  loyaltyAdminCorrectionSchema,
  loyaltyConfigurationListQuerySchema,
  loyaltyConfigurationTransitionSchema,
  loyaltyMovementListQuerySchema,
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
import { LoyaltyService } from '../application/loyalty-service.js';
import { LoyaltyError } from '../domain/loyalty.js';

type Route =
  | { readonly admin: false; readonly operation: 'GET_OWN_ACCOUNT' | 'LIST_OWN_MOVEMENTS' }
  | {
      readonly admin: true;
      readonly operation:
        'LIST_CONFIGURATIONS' | 'GET_ACTIVE_CONFIGURATION' | 'CREATE_CONFIGURATION';
    }
  | {
      readonly admin: true;
      readonly id: string;
      readonly operation:
        | 'GET_CONFIGURATION'
        | 'EDIT_CONFIGURATION'
        | 'ACTIVATE_CONFIGURATION'
        | 'GET_ADMIN_ACCOUNT'
        | 'LIST_ADMIN_MOVEMENTS'
        | 'ADMIN_CORRECTION';
    };

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class LoyaltyHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly loyalty: LoyaltyService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (
      !url.pathname.startsWith('/api/v1/loyalty') &&
      !url.pathname.startsWith('/api/v1/admin/loyalty')
    )
      return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const route = matchRoute(request.method, url.pathname);
    if (route === null) return sendError(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    const startedAt = performance.now();
    try {
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: route.admin ? 'ADMIN' : 'ACCOUNT_SELF' },
      });
      const mutation = isMutation(route.operation);
      const idempotencyKey = mutation
        ? readIdempotencyKey(request, { maximumLength: 255, visibleAscii: true })
        : undefined;
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
          operation: `loyalty.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Loyalty request completed.',
      );
      return sendJson(response, result.status, result.body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `loyalty.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Loyalty request failed.',
      );
      return sendError(response, correlationId, mapped.status, mapped.code);
    }
  }

  private async execute(
    route: Route,
    url: URL,
    request: IncomingMessage,
    context: {
      readonly actorId: string;
      readonly actorType: 'USER';
      readonly correlationId: string;
      readonly idempotencyKey?: string;
    },
  ): Promise<{ readonly body: unknown; readonly status: number }> {
    if (route.operation === 'GET_OWN_ACCOUNT') {
      assertNoQuery(url);
      return { body: { item: await this.loyalty.getOwnAccount(context) }, status: 200 };
    }
    if (route.operation === 'LIST_OWN_MOVEMENTS') {
      const query = loyaltyMovementListQuerySchema.parse(queryObject(url));
      return { body: await this.loyalty.listOwnMovements(context, query), status: 200 };
    }
    if (route.operation === 'LIST_CONFIGURATIONS') {
      const query = loyaltyConfigurationListQuerySchema.parse(queryObject(url));
      return { body: await this.loyalty.listConfigurations(context, query), status: 200 };
    }
    if (route.operation === 'GET_ACTIVE_CONFIGURATION') {
      const query = activeLoyaltyConfigurationQuerySchema.parse(queryObject(url));
      return {
        body: { item: await this.loyalty.getActiveConfiguration(context, query.branchId) },
        status: 200,
      };
    }
    if (route.operation === 'CREATE_CONFIGURATION') {
      assertNoQuery(url);
      const result = await this.loyalty.createConfiguration(
        context,
        createLoyaltyConfigurationSchema.parse(await json(request)),
      );
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    if (!('id' in route)) {
      throw new HttpRequestError('VALIDATION_FAILED', 422, 'Route is invalid.');
    }
    const id = z.uuid().parse(route.id).toLowerCase();
    if (route.operation === 'GET_CONFIGURATION') {
      assertNoQuery(url);
      return { body: { item: await this.loyalty.getConfiguration(context, id) }, status: 200 };
    }
    if (route.operation === 'EDIT_CONFIGURATION') {
      assertNoQuery(url);
      const result = await this.loyalty.editConfiguration(
        context,
        id,
        editLoyaltyConfigurationSchema.parse(await json(request)),
      );
      return { body: result, status: 200 };
    }
    if (route.operation === 'ACTIVATE_CONFIGURATION') {
      assertNoQuery(url);
      loyaltyConfigurationTransitionSchema.parse(await json(request));
      return { body: await this.loyalty.activateConfiguration(context, id), status: 200 };
    }
    if (route.operation === 'GET_ADMIN_ACCOUNT') {
      assertNoQuery(url);
      return { body: { item: await this.loyalty.getAdminAccount(context, id) }, status: 200 };
    }
    if (route.operation === 'LIST_ADMIN_MOVEMENTS') {
      const query = loyaltyMovementListQuerySchema.parse(queryObject(url));
      return { body: await this.loyalty.listAdminMovements(context, id, query), status: 200 };
    }
    assertNoQuery(url);
    const result = await this.loyalty.correctAccount(
      context,
      id,
      loyaltyAdminCorrectionSchema.parse(await json(request)),
    );
    return { body: result, status: result.replayed ? 200 : 201 };
  }
}

function matchRoute(method: string | undefined, pathname: string): Route | null {
  if (pathname === '/api/v1/loyalty/account' && method === 'GET')
    return { admin: false, operation: 'GET_OWN_ACCOUNT' };
  if (pathname === '/api/v1/loyalty/movements' && method === 'GET')
    return { admin: false, operation: 'LIST_OWN_MOVEMENTS' };
  if (pathname === '/api/v1/admin/loyalty/configurations') {
    if (method === 'GET') return { admin: true, operation: 'LIST_CONFIGURATIONS' };
    if (method === 'POST') return { admin: true, operation: 'CREATE_CONFIGURATION' };
  }
  if (pathname === '/api/v1/admin/loyalty/configurations/active' && method === 'GET')
    return { admin: true, operation: 'GET_ACTIVE_CONFIGURATION' };
  const configuration =
    /^\/api\/v1\/admin\/loyalty\/configurations\/([^/]+)(?:\/(state-transitions))?$/u.exec(
      pathname,
    );
  if (configuration?.[1] !== undefined) {
    if (configuration[2] === 'state-transitions' && method === 'POST')
      return { admin: true, id: configuration[1], operation: 'ACTIVATE_CONFIGURATION' };
    if (configuration[2] === undefined && method === 'GET')
      return { admin: true, id: configuration[1], operation: 'GET_CONFIGURATION' };
    if (configuration[2] === undefined && method === 'PATCH')
      return { admin: true, id: configuration[1], operation: 'EDIT_CONFIGURATION' };
  }
  const account =
    /^\/api\/v1\/admin\/loyalty\/accounts\/([^/]+)(?:\/(movements|corrections))?$/u.exec(pathname);
  if (account?.[1] !== undefined) {
    if (account[2] === undefined && method === 'GET')
      return { admin: true, id: account[1], operation: 'GET_ADMIN_ACCOUNT' };
    if (account[2] === 'movements' && method === 'GET')
      return { admin: true, id: account[1], operation: 'LIST_ADMIN_MOVEMENTS' };
    if (account[2] === 'corrections' && method === 'POST')
      return { admin: true, id: account[1], operation: 'ADMIN_CORRECTION' };
  }
  return null;
}

function isMutation(operation: Route['operation']): boolean {
  return [
    'CREATE_CONFIGURATION',
    'EDIT_CONFIGURATION',
    'ACTIVATE_CONFIGURATION',
    'ADMIN_CORRECTION',
  ].includes(operation);
}
async function json(request: IncomingMessage): Promise<unknown> {
  return readJsonBody(request, { requireJsonContentType: true });
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
  if ([...url.searchParams].length !== 0)
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  IDEMPOTENCY_KEY_CONFLICT: 'Idempotency-Key was already used with different data.',
  IDEMPOTENCY_KEY_REQUIRED: 'A valid Idempotency-Key is required.',
  INTERNAL_ERROR: 'The request could not be completed.',
  LOYALTY_ACCOUNT_NOT_FOUND: 'Loyalty account was not found.',
  LOYALTY_CONFIGURATION_NOT_FOUND: 'Loyalty configuration was not found.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  STATE_CONFLICT: 'The requested operation conflicts with loyalty requirements.',
  VALIDATION_FAILED: 'Request validation failed.',
});
function sendError(
  response: ServerResponse,
  correlationId: string,
  status: number,
  code: string,
): true {
  return sendJson(
    response,
    status,
    { correlationId, error: { code, message: messages[code] ?? messages.INTERNAL_ERROR } },
    correlationId,
  );
}
function mapPublicError(error: unknown) {
  if (error instanceof HttpRequestError)
    return publicError(
      error.httpStatus,
      error.code === 'IDEMPOTENCY_KEY_REQUIRED' ? 'IDEMPOTENCY_KEY_REQUIRED' : error.code,
    );
  if (error instanceof z.ZodError) return publicError(422, 'VALIDATION_FAILED');
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401) return publicError(401, 'AUTHENTICATION_REQUIRED');
    if (error.httpStatus === 403) return publicError(403, 'ACCESS_DENIED');
    if (error.httpStatus >= 500) return publicError(503, 'DEPENDENCY_UNAVAILABLE');
    return publicError(403, 'ACCESS_DENIED');
  }
  if (error instanceof LoyaltyError) {
    if (error.code === 'LOYALTY_ACCESS_DENIED') return publicError(403, 'ACCESS_DENIED');
    if (
      error.code === 'LOYALTY_ACCOUNT_NOT_FOUND' ||
      error.code === 'LOYALTY_CONFIGURATION_NOT_FOUND'
    )
      return publicError(404, error.code);
    if (error.code === 'LOYALTY_IDEMPOTENCY_KEY_REQUIRED')
      return publicError(422, 'IDEMPOTENCY_KEY_REQUIRED');
    if (error.code.includes('IDEMPOTENCY')) return publicError(409, 'IDEMPOTENCY_KEY_CONFLICT');
    if (error.category === 'VALIDATION') return publicError(422, 'VALIDATION_FAILED');
    if (error.category === 'CONFLICT') return publicError(409, 'STATE_CONFLICT');
    if (error.category === 'INFRASTRUCTURE') return publicError(503, 'DEPENDENCY_UNAVAILABLE');
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
  return { code, status };
}
