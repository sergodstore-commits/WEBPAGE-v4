import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { homeCarouselUploadSchema } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';
import { z } from 'zod';

import type { HttpRouteHandler } from '../../presentation/http/create-server.js';
import {
  HttpRequestError,
  readBearerToken,
  readIdempotencyKey,
  readJsonBody,
  sendJson,
  setSecurityHeaders,
} from '../../presentation/http/http-utils.js';
import { readBoundedMultipart } from '../../presentation/http/multipart.js';
import { CatalogError } from '../catalog/domain/catalog.js';
import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../identity-access/application/identity-access-service.js';
import type { HomeCarouselService } from './home-carousel-service.js';

export class HomeCarouselHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly service: HomeCarouselService,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    const route = /^\/api\/v1\/(admin\/)?home-carousel(?:\/([^/]+)(\/content)?)?$/u.exec(
      url.pathname,
    );
    if (!route || !['GET', 'POST', 'PUT'].includes(request.method ?? '')) return false;
    const admin = Boolean(route[1]);
    const id = route[2];
    const content = Boolean(route[3]);
    if (
      (!admin && request.method !== 'GET') ||
      (request.method === 'POST' && id) ||
      (request.method === 'PUT' && (!id || content)) ||
      (request.method === 'GET' && id && !content)
    )
      return false;
    const correlationId = randomUUID();
    try {
      if ([...url.searchParams].length)
        throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query is not accepted.');
      let context: ExecutionContext | undefined;
      if (admin) {
        const { account } = await this.identity.authorize({
          accessToken: readBearerToken(request),
          capability: { kind: 'ADMIN' },
        });
        context = {
          actorId: account.accountId,
          actorType: 'USER',
          correlationId,
          ...(request.method === 'GET'
            ? {}
            : {
                idempotencyKey: readIdempotencyKey(request, {
                  maximumLength: 255,
                  visibleAscii: true,
                }),
              }),
        };
      }
      if (content) {
        const delivery = await this.service.prepare(z.uuid().parse(id), context);
        const bytes = await delivery.loadValidatedBytes();
        setSecurityHeaders(response);
        response.statusCode = 200;
        response.setHeader('cache-control', 'private, no-store');
        response.setHeader('content-type', delivery.mimeType);
        response.setHeader('content-length', String(delivery.byteSize));
        response.setHeader('content-disposition', 'inline');
        response.setHeader('x-correlation-id', correlationId);
        response.end(bytes);
        return true;
      }
      let result;
      if (request.method === 'GET')
        result = context ? await this.service.listAdmin(context) : await this.service.listPublic();
      else if (context && request.method === 'POST') {
        const multipart = await readBoundedMultipart(request, ['altText', 'linkPath', 'active']);
        result = await this.service.upload(context, {
          ...homeCarouselUploadSchema.parse(multipart.fields),
          ...multipart.file,
        });
      } else if (context && request.method === 'PUT') {
        const input = await readJsonBody(request, { requireJsonContentType: true });
        result =
          id === 'order'
            ? await this.service.reorder(context, input)
            : await this.service.update(context, z.uuid().parse(id), input);
      } else return false;
      return sendJson(response, 200, result, correlationId);
    } catch (error) {
      const mapped = mapError(error);
      return sendJson(response, mapped.status, { correlationId, error: mapped }, correlationId);
    }
  }
}

function mapError(error: unknown) {
  if (error instanceof IdentityAccessError)
    return {
      status: error.httpStatus === 401 ? 401 : 403,
      code: error.httpStatus === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
      message: 'Access is not available.',
    };
  if (error instanceof HttpRequestError)
    return { status: error.httpStatus, code: error.code, message: error.message };
  if (error instanceof z.ZodError)
    return {
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Revisa la descripción, el vínculo interno y el estado de la imagen.',
    };
  if (error instanceof CatalogError)
    return {
      status:
        error.category === 'NOT_FOUND'
          ? 404
          : error.category === 'CONFLICT'
            ? 409
            : error.category === 'VALIDATION'
              ? 422
              : 503,
      code: error.code,
      message: error.message,
    };
  return { status: 500, code: 'INTERNAL_ERROR', message: 'No fue posible completar la operación.' };
}
