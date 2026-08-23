import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { IdentityAccessError } from '../../identity-access/application/identity-access-service.js';
import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  HttpRequestError,
  readBearerToken,
  sendJson,
} from '../../../presentation/http/http-utils.js';
import { AuditCursorError, AuditService } from '../application/audit-service.js';

const querySchema = z
  .object({
    action: z.string().trim().min(1).max(255).optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    resourceType: z.string().trim().min(1).max(255).optional(),
    result: z.enum(['FAILURE', 'SUCCESS']).optional(),
  })
  .strict();

export class AuditHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (url.pathname !== '/api/v1/admin/audit-entries') return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    if (request.method !== 'GET') {
      return sendJson(
        response,
        404,
        { correlationId, error: { code: 'ROUTE_NOT_FOUND', message: 'Route was not found.' } },
        correlationId,
      );
    }
    try {
      await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      });
      const query = querySchema.parse(queryObject(url));
      return sendJson(
        response,
        200,
        await this.audit.list({
          limit: query.limit,
          ...(query.action === undefined ? {} : { action: query.action }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(query.resourceType === undefined ? {} : { resourceType: query.resourceType }),
          ...(query.result === undefined ? {} : { result: query.result }),
        }),
        correlationId,
      );
    } catch (error) {
      const mapped = publicError(error);
      return sendJson(
        response,
        mapped.status,
        { correlationId, error: { code: mapped.code, message: mapped.message } },
        correlationId,
      );
    }
  }
}

function queryObject(url: URL): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in result)
      throw new HttpRequestError('VALIDATION_FAILED', 422, 'Duplicate query parameter.');
    result[key] = value;
  }
  return result;
}

function publicError(error: unknown) {
  if (error instanceof HttpRequestError)
    return { code: error.code, message: error.message, status: error.httpStatus };
  if (error instanceof z.ZodError)
    return { code: 'VALIDATION_FAILED', message: 'Request validation failed.', status: 422 };
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401)
      return {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required.',
        status: 401,
      };
    if (error.httpStatus === 403)
      return { code: 'ACCESS_DENIED', message: 'Access is not available.', status: 403 };
    return {
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'A required dependency is unavailable.',
      status: 503,
    };
    if (error instanceof AuditCursorError)
      return { code: 'VALIDATION_FAILED', message: 'Request validation failed.', status: 422 };
  }
  return { code: 'INTERNAL_ERROR', message: 'The request could not be completed.', status: 500 };
}
