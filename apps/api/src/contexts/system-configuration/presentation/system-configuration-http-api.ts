import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  activeSystemConfigurationQuerySchema,
  createSystemConfigurationSchema,
  editSystemConfigurationSchema,
  systemConfigurationListQuerySchema,
  systemConfigurationTransitionSchema,
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
import { SystemConfigurationService } from '../application/system-configuration-service.js';
import { SystemConfigurationError } from '../domain/system-configuration.js';

type Route =
  | { readonly operation: 'LIST_DEFINITIONS' | 'LIST_VERSIONS' | 'GET_ACTIVE' | 'CREATE_VERSION' }
  | {
      readonly id: string;
      readonly operation: 'GET_VERSION' | 'EDIT_DRAFT' | 'TRANSITION';
    };

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class SystemConfigurationHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly configurations: SystemConfigurationService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/api/v1/admin/system-configurations')) return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const route = matchRoute(request.method, url.pathname);
    if (route === null) return sendError(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    const startedAt = performance.now();
    try {
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      });
      const mutation = ['CREATE_VERSION', 'EDIT_DRAFT', 'TRANSITION'].includes(route.operation);
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
          operation: `system_configuration.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'System configuration request completed.',
      );
      return sendJson(response, result.status, result.body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `system_configuration.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'System configuration request failed.',
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
    if (route.operation === 'LIST_DEFINITIONS') {
      assertNoQuery(url);
      return { body: await this.configurations.listDefinitions(context), status: 200 };
    }
    if (route.operation === 'LIST_VERSIONS') {
      const query = systemConfigurationListQuerySchema.parse(queryObject(url));
      return {
        body: await this.configurations.listVersions(context, {
          limit: query.limit,
          ...(query.configurationKey === undefined
            ? {}
            : { configurationKey: query.configurationKey }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(query.state === undefined ? {} : { state: query.state }),
        }),
        status: 200,
      };
    }
    if (route.operation === 'GET_ACTIVE') {
      const query = activeSystemConfigurationQuerySchema.parse(queryObject(url));
      return {
        body: { item: await this.configurations.getActive(context, query.configurationKey) },
        status: 200,
      };
    }
    if (route.operation === 'CREATE_VERSION') {
      assertNoQuery(url);
      const result = await this.configurations.createVersion(
        context,
        createSystemConfigurationSchema.parse(await json(request)),
      );
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    if (!('id' in route)) {
      throw new HttpRequestError('VALIDATION_FAILED', 422, 'Route is invalid.');
    }
    const id = z.uuid().parse(route.id).toLowerCase();
    if (route.operation === 'GET_VERSION') {
      assertNoQuery(url);
      return { body: { item: await this.configurations.getVersion(context, id) }, status: 200 };
    }
    if (route.operation === 'EDIT_DRAFT') {
      assertNoQuery(url);
      const result = await this.configurations.editDraft(
        context,
        id,
        editSystemConfigurationSchema.parse(await json(request)),
      );
      return { body: result, status: 200 };
    }
    assertNoQuery(url);
    return {
      body: await this.configurations.transition(
        context,
        id,
        systemConfigurationTransitionSchema.parse(await json(request)),
      ),
      status: 200,
    };
  }
}

function matchRoute(method: string | undefined, pathname: string): Route | null {
  if (pathname === '/api/v1/admin/system-configurations/definitions' && method === 'GET') {
    return { operation: 'LIST_DEFINITIONS' };
  }
  if (pathname === '/api/v1/admin/system-configurations/active' && method === 'GET') {
    return { operation: 'GET_ACTIVE' };
  }
  if (pathname === '/api/v1/admin/system-configurations') {
    if (method === 'GET') return { operation: 'LIST_VERSIONS' };
    if (method === 'POST') return { operation: 'CREATE_VERSION' };
  }
  const match =
    /^\/api\/v1\/admin\/system-configurations\/([^/]+)(?:\/(state-transitions))?$/u.exec(pathname);
  if (match?.[1] === undefined) return null;
  if (match[2] === 'state-transitions' && method === 'POST') {
    return { id: match[1], operation: 'TRANSITION' };
  }
  if (match[2] === undefined && method === 'GET') {
    return { id: match[1], operation: 'GET_VERSION' };
  }
  if (match[2] === undefined && method === 'PATCH') {
    return { id: match[1], operation: 'EDIT_DRAFT' };
  }
  return null;
}

async function json(request: IncomingMessage): Promise<unknown> {
  return readJsonBody(request, { requireJsonContentType: true });
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
  ROUTE_NOT_FOUND: 'Route was not found.',
  STATE_CONFLICT: 'The requested operation conflicts with configuration requirements.',
  SYSTEM_CONFIGURATION_NOT_FOUND: 'System configuration was not found.',
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
  if (error instanceof HttpRequestError) return { code: error.code, status: error.httpStatus };
  if (error instanceof z.ZodError) return { code: 'VALIDATION_FAILED', status: 422 };
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401) return { code: 'AUTHENTICATION_REQUIRED', status: 401 };
    if (error.httpStatus === 403) return { code: 'ACCESS_DENIED', status: 403 };
    return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  }
  if (error instanceof SystemConfigurationError) {
    if (error.code.includes('IDEMPOTENCY')) {
      return {
        code: error.code.includes('REQUIRED')
          ? 'IDEMPOTENCY_KEY_REQUIRED'
          : 'IDEMPOTENCY_KEY_CONFLICT',
        status: error.code.includes('REQUIRED') ? 422 : 409,
      };
    }
    if (error.code === 'SYSTEM_CONFIGURATION_ACCESS_DENIED') {
      return { code: 'ACCESS_DENIED', status: 403 };
    }
    if (error.category === 'NOT_FOUND') {
      return { code: 'SYSTEM_CONFIGURATION_NOT_FOUND', status: 404 };
    }
    if (error.category === 'VALIDATION') return { code: 'VALIDATION_FAILED', status: 422 };
    if (error.category === 'CONFLICT') return { code: 'STATE_CONFLICT', status: 409 };
    if (error.category === 'INFRASTRUCTURE') {
      return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
    }
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
