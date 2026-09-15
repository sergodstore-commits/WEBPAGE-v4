import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  editorialListQuerySchema,
  editorialImageUploadFieldsSchema,
  editorialStatusSchema,
  editorialWriteSchema,
  type EditorialStatus,
} from '@sergod/contracts';
import { z } from 'zod';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { IdentityAccessError } from '../../identity-access/application/identity-access-service.js';
import { CatalogError } from '../../catalog/domain/catalog.js';
import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  HttpRequestError,
  readBearerToken,
  readIdempotencyKey,
  readJsonBody,
  sendJson,
  sendPublicJson,
} from '../../../presentation/http/http-utils.js';
import { readBoundedMultipart } from '../../../presentation/http/multipart.js';
import type { EditorialMediaService } from '../application/editorial-media-service.js';
import { EditorialService } from '../application/editorial-service.js';
import { EditorialError } from '../infrastructure/postgres-editorial-repository.js';

type Route =
  | { readonly kind: 'PUBLIC_LIST' }
  | { readonly kind: 'PUBLIC_GET'; readonly slug: string }
  | { readonly kind: 'ADMIN_LIST' }
  | { readonly kind: 'ADMIN_CREATE' }
  | { readonly kind: 'ADMIN_UPDATE'; readonly entryId: string }
  | { readonly kind: 'ADMIN_MEDIA_UPLOAD'; readonly entryId: string }
  | {
      readonly kind: 'ADMIN_TRANSITION';
      readonly entryId: string;
      readonly status: EditorialStatus;
    };

export class EditorialHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly editorial: EditorialService,
    private readonly media: EditorialMediaService | null = null,
  ) {}
  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    const route = match(request.method, url.pathname);
    if (route === null) return false;
    const correlationId = randomUUID();
    try {
      const result = route.kind.startsWith('PUBLIC')
        ? await publicExecute(route, request, url, this.editorial)
        : await this.adminExecute(route, request, url, correlationId);
      const status =
        route.kind === 'ADMIN_CREATE' ||
        (route.kind === 'ADMIN_MEDIA_UPLOAD' &&
          typeof result === 'object' &&
          result !== null &&
          'replayed' in result &&
          result.replayed === false)
          ? 201
          : 200;
      return route.kind.startsWith('PUBLIC')
        ? sendPublicJson(request, response, result, correlationId)
        : sendJson(response, status, result, correlationId);
    } catch (error) {
      const mapped = mapError(error);
      return sendJson(response, mapped.status, { correlationId, error: mapped }, correlationId);
    }
  }
  private async adminExecute(
    route: Route,
    request: IncomingMessage,
    url: URL,
    correlationId: string,
  ) {
    const account = (
      await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      })
    ).account;
    const idempotencyKey =
      route.kind === 'ADMIN_MEDIA_UPLOAD'
        ? readIdempotencyKey(request, { maximumLength: 255, visibleAscii: true })
        : undefined;
    const context = {
      actorId: account.accountId,
      actorType: 'USER' as const,
      correlationId,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    };
    if (route.kind === 'ADMIN_LIST') {
      noBody(request);
      const query = editorialListQuerySchema.parse(Object.fromEntries(url.searchParams));
      return this.editorial.listAdmin(compactQuery(query));
    }
    noQuery(url);
    if (route.kind === 'ADMIN_MEDIA_UPLOAD') {
      if (this.media === null)
        throw new HttpRequestError(
          'EDITORIAL_STORAGE_NOT_CONFIGURED',
          503,
          'Editorial image storage is not configured.',
        );
      const multipart = await readBoundedMultipart(request, ['altText', 'placement', 'width']);
      return this.media.upload({
        ...editorialImageUploadFieldsSchema.parse(multipart.fields),
        ...multipart.file,
        context,
        editorialEntryId: uuid(route.entryId),
      });
    }
    if (route.kind === 'ADMIN_CREATE') {
      return this.editorial.create(context, editorialWriteSchema.parse(await json(request)));
    }
    if (route.kind === 'ADMIN_UPDATE') {
      return this.editorial.update(
        context,
        uuid(route.entryId),
        editorialWriteSchema.parse(await json(request)),
      );
    }
    noBody(request);
    if (route.kind === 'ADMIN_TRANSITION') {
      return this.editorial.transition(context, uuid(route.entryId), route.status);
    }
    throw new HttpRequestError('ROUTE_NOT_FOUND', 404, 'Route was not found.');
  }
}

async function publicExecute(
  route: Route,
  request: IncomingMessage,
  url: URL,
  service: EditorialService,
) {
  noBody(request);
  if (route.kind === 'PUBLIC_LIST') {
    const query = editorialListQuerySchema
      .omit({ status: true })
      .parse(Object.fromEntries(url.searchParams));
    return service.listPublic(compactQuery(query));
  }
  if (route.kind === 'PUBLIC_GET') {
    noQuery(url);
    return service.getPublished(route.slug);
  }
  throw new HttpRequestError('ROUTE_NOT_FOUND', 404, 'Route was not found.');
}

function match(method: string | undefined, pathname: string): Route | null {
  if (pathname === '/api/v1/content' && method === 'GET') return { kind: 'PUBLIC_LIST' };
  const publicItem = /^\/api\/v1\/content\/([a-z0-9-]+)$/u.exec(pathname);
  if (publicItem?.[1] !== undefined && method === 'GET')
    return { kind: 'PUBLIC_GET', slug: publicItem[1] };
  if (pathname === '/api/v1/admin/content' && method === 'GET') return { kind: 'ADMIN_LIST' };
  if (pathname === '/api/v1/admin/content' && method === 'POST') return { kind: 'ADMIN_CREATE' };
  const mediaUpload = /^\/api\/v1\/admin\/content\/([^/]+)\/resources$/u.exec(pathname);
  if (mediaUpload?.[1] !== undefined && method === 'POST')
    return { entryId: mediaUpload[1], kind: 'ADMIN_MEDIA_UPLOAD' };
  const transition = /^\/api\/v1\/admin\/content\/([^/]+)\/(publish|archive|draft)$/u.exec(
    pathname,
  );
  if (transition?.[1] !== undefined && transition[2] !== undefined && method === 'POST') {
    const statusByAction = {
      archive: 'ARCHIVED',
      draft: 'DRAFT',
      publish: 'PUBLISHED',
    } as const;
    return {
      entryId: transition[1],
      kind: 'ADMIN_TRANSITION',
      status: editorialStatusSchema.parse(
        statusByAction[transition[2] as keyof typeof statusByAction],
      ),
    };
  }
  const update = /^\/api\/v1\/admin\/content\/([^/]+)$/u.exec(pathname);
  if (update?.[1] !== undefined && method === 'PUT')
    return { entryId: update[1], kind: 'ADMIN_UPDATE' };
  return null;
}
function compactQuery(query: {
  readonly cursor?: string | undefined;
  readonly limit: number;
  readonly status?: EditorialStatus | undefined;
  readonly type?: Parameters<EditorialService['listPublic']>[0]['type'];
}) {
  return {
    limit: query.limit,
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.status === undefined ? {} : { status: query.status }),
    ...(query.type === undefined ? {} : { type: query.type }),
  };
}
function uuid(value: string) {
  return z.uuid().parse(value).toLowerCase();
}
function json(request: IncomingMessage) {
  return readJsonBody(request, { requireJsonContentType: true });
}
function noQuery(url: URL) {
  if ([...url.searchParams].length > 0)
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query is not accepted.');
}
function noBody(request: IncomingMessage) {
  if (
    request.headers['transfer-encoding'] !== undefined ||
    ![undefined, '0'].includes(request.headers['content-length'])
  )
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Body is not accepted.');
}
function mapError(error: unknown) {
  if (error instanceof HttpRequestError)
    return { code: error.code, message: error.message, status: error.httpStatus };
  if (error instanceof z.ZodError)
    return { code: 'VALIDATION_FAILED', message: 'Request validation failed.', status: 422 };
  if (error instanceof IdentityAccessError)
    return {
      code: error.httpStatus === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
      message: 'Access is not available.',
      status: error.httpStatus === 401 ? 401 : 403,
    };
  if (error instanceof EditorialError)
    return { code: error.code, message: error.message, status: error.status };
  if (error instanceof CatalogError) {
    if (error.category === 'VALIDATION')
      return { code: 'VALIDATION_FAILED', message: error.message, status: 422 };
    if (error.category === 'CONFLICT')
      return { code: 'STATE_CONFLICT', message: error.message, status: 409 };
    if (error.category === 'NOT_FOUND')
      return { code: 'EDITORIAL_RESOURCE_NOT_FOUND', message: error.message, status: 404 };
    if (error.category === 'INFRASTRUCTURE')
      return {
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Image storage is unavailable.',
        status: 503,
      };
  }
  return { code: 'INTERNAL_ERROR', message: 'Request could not be completed.', status: 500 };
}
