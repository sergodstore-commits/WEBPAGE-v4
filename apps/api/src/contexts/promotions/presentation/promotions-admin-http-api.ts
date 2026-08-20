import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  couponListQuerySchema,
  couponTransitionSchema,
  createCouponSchema,
  createPromotionSchema,
  editPromotionSchema,
  promotionListQuerySchema,
  promotionPreviewSchema,
  promotionTransitionSchema,
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
import { PromotionsAdminService } from '../application/promotions-admin-service.js';
import { PromotionError } from '../domain/promotions.js';

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

type Route = {
  readonly id?: string;
  readonly kind: 'COUPON' | 'PROMOTION' | 'PREVIEW';
  readonly operation: 'CREATE' | 'DETAIL' | 'EDIT' | 'LIST' | 'PREVIEW' | 'TRANSITION';
};

export class PromotionsAdminHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly promotions: PromotionsAdminService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (
      !url.pathname.startsWith('/api/v1/admin/promotions') &&
      !url.pathname.startsWith('/api/v1/admin/coupons')
    )
      return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const route = matchRoute(request.method, url.pathname);
    if (route === null) return this.fail(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    const startedAt = performance.now();
    try {
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ADMIN' },
      });
      const mutation = !['LIST', 'DETAIL', 'PREVIEW'].includes(route.operation);
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
          operation: `promotions_admin.${route.kind.toLowerCase()}.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Promotions administration request completed.',
      );
      return sendJson(response, result.status, result.body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `promotions_admin.${route.kind.toLowerCase()}.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Promotions administration request failed.',
      );
      return this.fail(response, correlationId, mapped.status, mapped.code);
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
    if (route.operation === 'LIST') {
      const query = queryObject(url);
      return route.kind === 'PROMOTION'
        ? {
            body: await this.promotions.listPromotions(
              context,
              promotionListQuerySchema.parse(query),
            ),
            status: 200,
          }
        : {
            body: await this.promotions.listCoupons(context, couponListQuerySchema.parse(query)),
            status: 200,
          };
    }
    assertNoQuery(url);
    if (route.operation === 'DETAIL') {
      const id = parseId(route.id);
      return {
        body: {
          item:
            route.kind === 'PROMOTION'
              ? await this.promotions.getPromotion(context, id)
              : await this.promotions.getCoupon(context, id),
        },
        status: 200,
      };
    }
    const body = await readJsonBody(request, { requireJsonContentType: true });
    if (route.operation === 'PREVIEW')
      return {
        body: await this.promotions.preview(context, promotionPreviewSchema.parse(body)),
        status: 200,
      };
    if (route.operation === 'CREATE') {
      const result =
        route.kind === 'PROMOTION'
          ? await this.promotions.createPromotion(context, createPromotionSchema.parse(body))
          : await this.promotions.createCoupon(context, createCouponSchema.parse(body));
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    const id = parseId(route.id);
    if (route.operation === 'EDIT')
      return {
        body: await this.promotions.editPromotion(context, id, editPromotionSchema.parse(body)),
        status: 200,
      };
    const result =
      route.kind === 'PROMOTION'
        ? await this.promotions.transitionPromotion(
            context,
            id,
            promotionTransitionSchema.parse(body).nextState,
          )
        : await this.promotions.transitionCoupon(
            context,
            id,
            couponTransitionSchema.parse(body).nextState,
          );
    return { body: result, status: 200 };
  }

  private fail(
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
}

function matchRoute(method: string | undefined, pathname: string): Route | null {
  if (pathname === '/api/v1/admin/promotions/preview')
    return method === 'POST' ? { kind: 'PREVIEW', operation: 'PREVIEW' } : null;
  for (const [segment, kind] of [
    ['promotions', 'PROMOTION'],
    ['coupons', 'COUPON'],
  ] as const) {
    const base = `/api/v1/admin/${segment}`;
    if (pathname === base) {
      if (method === 'GET') return { kind, operation: 'LIST' };
      if (method === 'POST') return { kind, operation: 'CREATE' };
      return null;
    }
    const transition = new RegExp(`^${base}/([^/]+)/state-transitions$`, 'u').exec(pathname);
    if (transition !== null)
      return method === 'POST'
        ? { id: requiredPart(transition[1]), kind, operation: 'TRANSITION' }
        : null;
    const detail = new RegExp(`^${base}/([^/]+)$`, 'u').exec(pathname);
    if (detail !== null) {
      if (method === 'GET') return { id: requiredPart(detail[1]), kind, operation: 'DETAIL' };
      if (method === 'PATCH' && kind === 'PROMOTION')
        return { id: requiredPart(detail[1]), kind, operation: 'EDIT' };
    }
  }
  return null;
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
function assertNoQuery(url: URL) {
  if ([...url.searchParams].length > 0)
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
}
function parseId(value: string | undefined): string {
  return z.uuid().parse(value);
}
function requiredPart(value: string | undefined): string {
  if (value === undefined) throw new Error('Matched route has no identifier.');
  return value;
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  COUPON_NOT_FOUND: 'Coupon was not found.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  IDEMPOTENCY_KEY_CONFLICT: 'Idempotency-Key was already used with different data.',
  IDEMPOTENCY_KEY_REQUIRED: 'A valid Idempotency-Key is required.',
  INTERNAL_ERROR: 'The request could not be completed.',
  PROMOTION_NOT_FOUND: 'Promotion was not found.',
  PROMOTIONS_REFERENCE_NOT_FOUND: 'A promotion reference was not found.',
  REQUEST_TOO_LARGE: 'Request is too large.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  STATE_CONFLICT: 'The requested state conflicts with promotion requirements.',
  UNIQUE_CONFLICT: 'A promotion or coupon value must be unique.',
  VALIDATION_FAILED: 'Request validation failed.',
});
function mapPublicError(error: unknown) {
  if (error instanceof HttpRequestError) return publicError(error.httpStatus, error.code);
  if (error instanceof z.ZodError) return publicError(422, 'VALIDATION_FAILED');
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401) return publicError(401, 'AUTHENTICATION_REQUIRED');
    if (error.httpStatus === 403) return publicError(403, 'ACCESS_DENIED');
    return publicError(
      error.httpStatus >= 500 ? 503 : 403,
      error.httpStatus >= 500 ? 'DEPENDENCY_UNAVAILABLE' : 'ACCESS_DENIED',
    );
  }
  if (error instanceof PromotionError) {
    if (error.code === 'PROMOTIONS_ACCESS_DENIED') return publicError(403, 'ACCESS_DENIED');
    if (error.category === 'NOT_FOUND') return publicError(404, error.code);
    if (error.code.includes('IDEMPOTENCY')) return publicError(409, 'IDEMPOTENCY_KEY_CONFLICT');
    if (error.code === 'PROMOTIONS_UNIQUE_CONFLICT') return publicError(409, 'UNIQUE_CONFLICT');
    if (error.category === 'VALIDATION') return publicError(422, 'VALIDATION_FAILED');
    if (error.category === 'CONFLICT') return publicError(409, 'STATE_CONFLICT');
    if (error.category === 'INFRASTRUCTURE') return publicError(503, 'DEPENDENCY_UNAVAILABLE');
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String(error.code).startsWith('08')
  )
    return publicError(503, 'DEPENDENCY_UNAVAILABLE');
  return publicError(500, 'INTERNAL_ERROR');
}
function publicError(status: number, code: string) {
  return { code, status };
}
