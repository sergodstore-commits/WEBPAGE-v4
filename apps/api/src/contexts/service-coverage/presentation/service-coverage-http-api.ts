import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { publicServiceInfoSchema, serviceInfoTransitionSchema } from '@sergod/contracts';
import { z } from 'zod';
import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  readBearerToken,
  HttpRequestError,
  readIdempotencyKey,
  readJsonBody,
  sendJson,
} from '../../../presentation/http/http-utils.js';
import {
  ServiceCoverageError,
  ServiceCoverageService,
} from '../application/service-coverage-service.js';

interface ServiceCoverageRequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
}

export class ServiceCoverageHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly service: ServiceCoverageService,
    private readonly logger: ServiceCoverageRequestLogger,
  ) {}
  async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://local');
    const publicStoreRequest =
      req.method === 'GET' && url.pathname === '/api/v1/service-coverage/store';
    if (!publicStoreRequest && !url.pathname.startsWith('/api/v1/admin/service-coverage'))
      return false;
    const correlationId = randomUUID();
    const startedAt = performance.now();
    try {
      if (publicStoreRequest)
        return sendJson(res, 200, await this.service.publicStore(), correlationId);
      const auth = await this.identity.authorize({
        accessToken: readBearerToken(req),
        capability: { kind: 'ADMIN' },
      });
      const c = {
        actorType: 'USER' as const,
        actorId: auth.account.accountId,
        correlationId,
        ...(req.method === 'GET'
          ? {}
          : {
              idempotencyKey: readIdempotencyKey(req, { maximumLength: 255, visibleAscii: true }),
            }),
      };
      if (req.method === 'GET' && url.pathname === '/api/v1/admin/service-coverage')
        return sendJson(res, 200, await this.service.list(), correlationId);
      const body =
        req.method === 'DELETE' ? {} : await readJsonBody(req, { requireJsonContentType: true });
      let result: unknown;
      let created = false;
      if (
        req.method === 'POST' &&
        url.pathname === '/api/v1/admin/service-coverage/public-service-info'
      ) {
        result = await this.service.saveInfo(c, publicServiceInfoSchema.parse(body));
        created = true;
      } else {
        const m = url.pathname.match(
          /^\/api\/v1\/admin\/service-coverage\/public-service-info\/([0-9a-f-]+)\/state-transitions$/u,
        );
        if (req.method !== 'POST' || !m)
          return sendJson(
            res,
            404,
            { correlationId, error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found.' } },
            correlationId,
          );
        const sourceId = z.uuid().parse(m[1]);
        const x = serviceInfoTransitionSchema.parse(body);
        result = await this.service.transitionInfo(c, sourceId, x.nextState, x.reason);
      }
      return sendJson(
        res,
        created && (result as ReturnType<JSON['parse']>).replayed !== true ? 201 : 200,
        result,
        correlationId,
      );
    } catch (e) {
      const status =
        e instanceof IdentityAccessError
          ? e.httpStatus === 401
            ? 401
            : e.httpStatus === 403
              ? 403
              : e.httpStatus === 503
                ? 503
                : 500
          : e instanceof HttpRequestError
            ? e.httpStatus
            : e instanceof ServiceCoverageError
              ? e.status
              : isValidationError(e)
                ? 422
                : 500;
      const code =
        e instanceof IdentityAccessError
          ? status === 401
            ? 'AUTHENTICATION_REQUIRED'
            : status === 403
              ? 'ACCESS_DENIED'
              : status === 503
                ? 'DEPENDENCY_UNAVAILABLE'
                : 'INTERNAL_ERROR'
          : e instanceof HttpRequestError
            ? e.code
            : e instanceof ServiceCoverageError
              ? e.code
              : status === 422
                ? 'VALIDATION_FAILED'
                : 'INTERNAL_ERROR';
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error_code: safeTechnicalErrorCode(e),
          operation: 'service_coverage.request',
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Service coverage request failed.',
      );
      return sendJson(
        res,
        status,
        {
          correlationId,
          error: {
            code,
            message:
              status >= 500
                ? 'Unexpected error.'
                : e instanceof IdentityAccessError && status === 401
                  ? 'Authentication is required.'
                  : e instanceof IdentityAccessError && status === 403
                    ? 'Access is not available.'
                    : e instanceof Error
                      ? e.message
                      : 'Request failed.',
          },
        },
        correlationId,
      );
    }
  }
}

function safeTechnicalErrorCode(error: unknown): string {
  const candidate =
    error instanceof IdentityAccessError ||
    error instanceof HttpRequestError ||
    error instanceof ServiceCoverageError
      ? error.code
      : isValidationError(error)
        ? 'VALIDATION_FAILED'
        : 'UNEXPECTED_ERROR';
  return /^[A-Z][A-Z0-9_]{1,63}$/u.test(candidate) ? candidate : 'UNEXPECTED_ERROR';
}

function isValidationError(error: unknown): boolean {
  return (
    error instanceof z.ZodError ||
    (typeof error === 'object' &&
      error !== null &&
      'issues' in error &&
      Array.isArray((error as { issues: unknown }).issues))
  );
}
