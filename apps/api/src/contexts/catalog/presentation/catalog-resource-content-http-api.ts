import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';

import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  readBearerToken,
  sendJson,
  setSecurityHeaders,
} from '../../../presentation/http/http-utils.js';
import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { IdentityAccessError } from '../../identity-access/application/identity-access-service.js';
import type { CatalogPublicResourceService } from '../application/catalog-public-resource-service.js';
import { CatalogError, type CatalogEntityType } from '../domain/catalog.js';

export class CatalogResourceContentHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly resources: CatalogPublicResourceService | null,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    const match =
      /^\/api\/v1\/admin\/catalog\/(tcg-games|categories|collections|products)\/([^/]+)\/resources\/([^/]+)\/content$/u.exec(
        url.pathname,
      );
    if (
      request.method !== 'GET' ||
      match?.[1] === undefined ||
      match[2] === undefined ||
      match[3] === undefined
    )
      return false;
    const correlationId = randomUUID();
    try {
      if ([...url.searchParams].length > 0)
        throw new CatalogError('VALIDATION_FAILED', 'VALIDATION', 'Query is not accepted.');
      await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      });
      if (this.resources === null)
        throw new CatalogError(
          'CATALOG_STORAGE_NOT_CONFIGURED',
          'INFRASTRUCTURE',
          'Catalog image storage is not configured.',
        );
      const delivery = await this.resources.prepareCatalogAdmin(
        ownerType(match[1]),
        z.uuid().parse(match[2]),
        z.uuid().parse(match[3]),
      );
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

function ownerType(segment: string): CatalogEntityType {
  if (segment === 'tcg-games') return 'TCG_GAME';
  if (segment === 'categories') return 'CATEGORY';
  if (segment === 'collections') return 'COLLECTION';
  return 'PRODUCT';
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
      status: error.category === 'NOT_FOUND' ? 404 : error.category === 'VALIDATION' ? 422 : 503,
    };
  if (error instanceof z.ZodError)
    return { code: 'CATALOG_RESOURCE_NOT_FOUND', message: 'Resource was not found.', status: 404 };
  return { code: 'INTERNAL_ERROR', message: 'Request could not be completed.', status: 500 };
}
