import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { fulfillmentStatusSchema, fulfillmentTransitionSchema } from '@sergod/contracts';
import { z } from 'zod';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { IdentityAccessError } from '../../identity-access/application/identity-access-service.js';
import type { HttpRouteHandler } from '../../../presentation/http/create-server.js';
import {
  HttpRequestError,
  readBearerToken,
  readJsonBody,
  sendJson,
} from '../../../presentation/http/http-utils.js';
import { FulfillmentService } from '../application/fulfillment-service.js';
import { FulfillmentError } from '../domain/fulfillment.js';

type Route =
  | { readonly kind: 'ACCOUNT'; readonly orderId: string }
  | { readonly kind: 'ADMIN_GET'; readonly fulfillmentId: string }
  | { readonly kind: 'ADMIN_LIST' }
  | { readonly kind: 'ADMIN_TRANSITION'; readonly fulfillmentId: string };

export class FulfillmentHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly fulfillment: FulfillmentService,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.includes('/fulfillment')) return false;
    const route = match(request.method, url.pathname);
    if (route === null) return false;
    const correlationId = randomUUID();
    try {
      const admin = route.kind.startsWith('ADMIN');
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: admin ? 'ADMIN' : 'BUYER' },
      });
      const result = await execute(
        route,
        request,
        url,
        this.fulfillment,
        authorization.account.accountId,
        correlationId,
      );
      return sendJson(response, 200, result, correlationId);
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

async function execute(
  route: Route,
  request: IncomingMessage,
  url: URL,
  service: FulfillmentService,
  accountId: string,
  correlationId: string,
) {
  if (route.kind === 'ACCOUNT') {
    noBody(request);
    noQuery(url);
    return service.getForAccount(accountId, uuid(route.orderId));
  }
  if (route.kind === 'ADMIN_GET') {
    noBody(request);
    noQuery(url);
    return service.getForAdmin(uuid(route.fulfillmentId));
  }
  if (route.kind === 'ADMIN_LIST') {
    noBody(request);
    const query = z
      .object({
        cursor: z.uuid().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        status: fulfillmentStatusSchema.optional(),
      })
      .strict()
      .parse(Object.fromEntries(url.searchParams));
    return service.listForAdmin({
      limit: query.limit,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
      ...(query.status === undefined ? {} : { status: query.status }),
    });
  }
  noQuery(url);
  const body = fulfillmentTransitionSchema.parse(
    await readJsonBody(request, { requireJsonContentType: true }),
  );
  return service.transition(
    { actorId: accountId, actorType: 'USER', correlationId },
    uuid(route.fulfillmentId),
    {
      toStatus: body.toStatus,
      ...(body.carrier === undefined ? {} : { carrier: body.carrier }),
      ...(body.trackingCode === undefined ? {} : { trackingCode: body.trackingCode }),
    },
  );
}

function match(method: string | undefined, pathname: string): Route | null {
  if (pathname === '/api/v1/admin/fulfillments' && method === 'GET') return { kind: 'ADMIN_LIST' };
  const transition = /^\/api\/v1\/admin\/fulfillments\/([^/]+)\/transitions$/u.exec(pathname);
  if (transition?.[1] !== undefined && method === 'POST') {
    return { fulfillmentId: transition[1], kind: 'ADMIN_TRANSITION' };
  }
  const admin = /^\/api\/v1\/admin\/fulfillments\/([^/]+)$/u.exec(pathname);
  if (admin?.[1] !== undefined && method === 'GET')
    return { fulfillmentId: admin[1], kind: 'ADMIN_GET' };
  const account = /^\/api\/v1\/orders\/([^/]+)\/fulfillment$/u.exec(pathname);
  if (account?.[1] !== undefined && method === 'GET')
    return { kind: 'ACCOUNT', orderId: account[1] };
  return null;
}
function uuid(value: string): string {
  return z.uuid().parse(value).toLowerCase();
}
function noQuery(url: URL): void {
  if ([...url.searchParams].length > 0)
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query is not accepted.');
}
function noBody(request: IncomingMessage): void {
  if (
    request.headers['transfer-encoding'] !== undefined ||
    ![undefined, '0'].includes(request.headers['content-length'])
  ) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Body is not accepted.');
  }
}
function mapError(error: unknown) {
  if (error instanceof HttpRequestError)
    return { code: error.code, message: error.message, status: error.httpStatus };
  if (error instanceof z.ZodError)
    return { code: 'VALIDATION_FAILED', message: 'Request validation failed.', status: 422 };
  if (error instanceof IdentityAccessError) {
    return error.httpStatus === 401
      ? { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.', status: 401 }
      : { code: 'ACCESS_DENIED', message: 'Access is not available.', status: 403 };
  }
  if (error instanceof FulfillmentError) {
    const status =
      error.category === 'NOT_FOUND'
        ? 404
        : error.category === 'CONFLICT'
          ? 409
          : error.category === 'VALIDATION'
            ? 422
            : 503;
    return { code: error.code, message: 'Fulfillment request could not be completed.', status };
  }
  return { code: 'INTERNAL_ERROR', message: 'Request could not be completed.', status: 500 };
}
