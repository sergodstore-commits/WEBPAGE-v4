import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';

import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  readBearerToken,
  sendJson,
  setSecurityHeaders,
} from '../../../presentation/http/http-utils.js';
import { CatalogError } from '../../catalog/domain/catalog.js';
import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { IdentityAccessError } from '../../identity-access/application/identity-access-service.js';
import type { EditorialMediaService } from '../application/editorial-media-service.js';

export class EditorialResourceHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly media: EditorialMediaService | null,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    const match = /^\/api\/v1\/admin\/content\/([^/]+)\/resources\/([^/]+)\/content$/u.exec(
      url.pathname,
    );
    if (request.method !== 'GET' || match?.[1] === undefined || match[2] === undefined)
      return false;
    const correlationId = randomUUID();
    try {
      if ([...url.searchParams].length > 0)
        throw new CatalogError('VALIDATION_FAILED', 'VALIDATION', 'Query is not accepted.');
      await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      });
      if (this.media === null)
        throw new CatalogError(
          'EDITORIAL_STORAGE_NOT_CONFIGURED',
          'INFRASTRUCTURE',
          'Editorial image storage is not configured.',
        );
      const delivery = await this.media.prepare(z.uuid().parse(match[1]), z.uuid().parse(match[2]));
      const bytes = await delivery.loadValidatedBytes();
      response.statusCode = 200;
      response.setHeader('cache-control', 'private, no-store');
      response.setHeader('content-disposition', 'inline');
      response.setHeader('content-length', String(delivery.byteSize));
      response.setHeader('content-type', delivery.mimeType);
      response.setHeader('x-correlation-id', correlationId);
      setSecurityHeaders(response);
      response.end(bytes);
      return true;
    } catch (error) {
      const mapped = mapError(error);
      return sendJson(
        response,
        mapped.status,
        { correlationId, error: { code: mapped.code, message: mapped.message } },
        correlationId,
      );
    }
  }
}

function mapError(error: unknown) {
  if (error instanceof IdentityAccessError)
    return {
      code: error.httpStatus === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
      message: 'Access is not available.',
      status: error.httpStatus === 401 ? 401 : 403,
    };
  if (error instanceof CatalogError)
    return {
      code: error.code,
      message: error.message,
      status:
        error.category === 'NOT_FOUND'
          ? 404
          : error.category === 'VALIDATION'
            ? 422
            : error.category === 'CONFLICT'
              ? 409
              : 503,
    };
  if (error instanceof z.ZodError)
    return {
      code: 'EDITORIAL_RESOURCE_NOT_FOUND',
      message: 'Resource was not found.',
      status: 404,
    };
  return { code: 'INTERNAL_ERROR', message: 'Request could not be completed.', status: 500 };
}
