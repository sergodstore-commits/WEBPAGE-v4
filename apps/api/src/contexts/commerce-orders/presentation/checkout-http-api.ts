import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  checkoutCouponSelectionSchema,
  checkoutDeliveryIntentSchema,
  checkoutEmptyMutationSchema,
  checkoutPointsSelectionSchema,
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
import { CheckoutService } from '../application/checkout-service.js';
import { CheckoutError } from '../domain/checkout.js';

type Operation =
  | 'CLEAR_COUPON'
  | 'CLEAR_INTENT'
  | 'CLEAR_POINTS'
  | 'CREATE_ORDER'
  | 'GET_INTENT'
  | 'GET_SUMMARY'
  | 'REPLACE_INTENT'
  | 'REVALIDATE'
  | 'SELECT_COUPON'
  | 'SELECT_POINTS';

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class CheckoutHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly checkout: CheckoutService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/api/v1/checkout')) return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    const route = matchRoute(request.method, url.pathname);
    if (route === null) return fail(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    const startedAt = performance.now();
    try {
      assertNoQuery(url);
      const authorized = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'BUYER' },
      });
      const mutation = !['GET_INTENT', 'GET_SUMMARY'].includes(route.operation);
      const idempotencyKey = mutation
        ? readIdempotencyKey(request, { maximumLength: 255, visibleAscii: true })
        : undefined;
      const context = {
        actorId: authorized.account.accountId,
        actorType: 'USER' as const,
        correlationId,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      };
      const result = await this.execute(route, request, context, authorized.account.accountId);
      this.logger.info(
        {
          actor_id: authorized.account.accountId,
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          operation: `checkout.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Checkout request completed.',
      );
      return sendJson(response, 200, result, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `checkout.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Checkout request failed.',
      );
      return fail(response, correlationId, mapped.status, mapped.code);
    }
  }

  private async execute(
    route: { readonly cartGroupId: string; readonly operation: Operation },
    request: IncomingMessage,
    context: {
      readonly actorId: string;
      readonly actorType: 'USER';
      readonly correlationId: string;
      readonly idempotencyKey?: string;
    },
    accountId: string,
  ): Promise<unknown> {
    const groupId = z.uuid().parse(route.cartGroupId).toLowerCase();
    if (route.operation === 'GET_SUMMARY') {
      assertNoBody(request);
      return this.checkout.getSummary(accountId, groupId);
    }
    if (route.operation === 'GET_INTENT') {
      assertNoBody(request);
      const summary = await this.checkout.getSummary(accountId, groupId);
      return {
        checkoutVersion: summary.item.checkoutVersion,
        item: summary.item.deliveryIntent,
      };
    }
    if (route.operation === 'REPLACE_INTENT') {
      return this.checkout.replaceIntent(
        context,
        accountId,
        groupId,
        checkoutDeliveryIntentSchema.parse(await json(request)),
      );
    }
    if (route.operation === 'SELECT_COUPON') {
      return this.checkout.selectCoupon(
        context,
        accountId,
        groupId,
        checkoutCouponSelectionSchema.parse(await json(request)),
      );
    }
    if (route.operation === 'SELECT_POINTS') {
      return this.checkout.selectPoints(
        context,
        accountId,
        groupId,
        checkoutPointsSelectionSchema.parse(await json(request)),
      );
    }
    if (route.operation === 'CREATE_ORDER') {
      checkoutEmptyMutationSchema.parse(await json(request));
      return this.checkout.createOrder(context, accountId, groupId);
    }
    if (route.operation === 'REVALIDATE') {
      checkoutEmptyMutationSchema.parse(await json(request));
      return this.checkout.revalidate(context, accountId, groupId);
    }
    assertNoBody(request);
    if (route.operation === 'CLEAR_INTENT') {
      return this.checkout.clearIntent(context, accountId, groupId);
    }
    if (route.operation === 'CLEAR_COUPON') {
      return this.checkout.clearCoupon(context, accountId, groupId);
    }
    return this.checkout.clearPoints(context, accountId, groupId);
  }
}

function matchRoute(
  method: string | undefined,
  pathname: string,
): { readonly cartGroupId: string; readonly operation: Operation } | null {
  const match =
    /^\/api\/v1\/checkout\/groups\/([^/]+)\/(summary|delivery-intent|coupon|points|revalidate|order)$/u.exec(
      pathname,
    );
  if (match?.[1] === undefined || match[2] === undefined) return null;
  const suffix = match[2];
  if (suffix === 'summary' && method === 'GET') {
    return { cartGroupId: match[1], operation: 'GET_SUMMARY' };
  }
  if (suffix === 'delivery-intent' && method === 'GET') {
    return { cartGroupId: match[1], operation: 'GET_INTENT' };
  }
  if (suffix === 'delivery-intent' && method === 'PUT') {
    return { cartGroupId: match[1], operation: 'REPLACE_INTENT' };
  }
  if (suffix === 'delivery-intent' && method === 'DELETE') {
    return { cartGroupId: match[1], operation: 'CLEAR_INTENT' };
  }
  if (suffix === 'coupon' && method === 'PUT') {
    return { cartGroupId: match[1], operation: 'SELECT_COUPON' };
  }
  if (suffix === 'coupon' && method === 'DELETE') {
    return { cartGroupId: match[1], operation: 'CLEAR_COUPON' };
  }
  if (suffix === 'points' && method === 'PUT') {
    return { cartGroupId: match[1], operation: 'SELECT_POINTS' };
  }
  if (suffix === 'points' && method === 'DELETE') {
    return { cartGroupId: match[1], operation: 'CLEAR_POINTS' };
  }
  if (suffix === 'revalidate' && method === 'POST') {
    return { cartGroupId: match[1], operation: 'REVALIDATE' };
  }
  if (suffix === 'order' && method === 'POST') {
    return { cartGroupId: match[1], operation: 'CREATE_ORDER' };
  }
  return null;
}

async function json(request: IncomingMessage): Promise<unknown> {
  return readJsonBody(request, { requireJsonContentType: true });
}
function assertNoQuery(url: URL): void {
  if ([...url.searchParams].length !== 0) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
  }
}
function assertNoBody(request: IncomingMessage): void {
  const length = request.headers['content-length'];
  if (
    (length !== undefined && length !== '0') ||
    request.headers['transfer-encoding'] !== undefined
  ) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Request body is not accepted.');
  }
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  CHECKOUT_ACCOUNT_INACTIVE: 'The account is not eligible for checkout.',
  CHECKOUT_EMAIL_NOT_VERIFIED: 'The account is not eligible for checkout.',
  CHECKOUT_GROUP_EMPTY: 'The selected cart group is empty.',
  CHECKOUT_GROUP_NOT_ACTIVE: 'The selected cart group is not eligible for checkout.',
  CHECKOUT_GROUP_NOT_FOUND: 'The selected cart group was not found.',
  CHECKOUT_IDEMPOTENCY_CONFLICT: 'Idempotency-Key was already used with different data.',
  CHECKOUT_ORDER_ALREADY_CREATED: 'An order already exists for this cart group.',
  CHECKOUT_NOT_READY: 'Checkout is not ready to create an order.',
  CHECKOUT_ROLE_NOT_ALLOWED: 'The account is not eligible for checkout.',
  COUPON_INVALID: 'The coupon is invalid or unavailable.',
  COUPON_LIMIT_REACHED: 'The coupon limit has been reached.',
  COUPON_NOT_ELIGIBLE: 'The coupon is not eligible for this checkout.',
  DELIVERY_INTENT_REQUIRED: 'A delivery intent is required.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  INTERNAL_ERROR: 'The request could not be completed.',
  LOYALTY_AVAILABLE_POINTS_INSUFFICIENT: 'Available points are insufficient.',
  LOYALTY_CONFIGURATION_NOT_ACTIVE: 'Loyalty is not active for this checkout.',
  LOYALTY_DEBT_BLOCKS_REDEEM: 'Points cannot be redeemed while the account has loyalty debt.',
  LOYALTY_MINIMUM_REDEEM_NOT_MET: 'The requested points are below the current minimum.',
  LOYALTY_REDEEM_LIMIT_EXCEEDED: 'The requested points exceed the current maximum.',
  PICKUP_BRANCH_NOT_ACTIVE: 'Pickup is not available for the selected branch.',
  PICKUP_INFORMATION_NOT_PUBLISHED: 'Pickup information is unavailable.',
  PAYMENT_RESERVATION_CONFIGURATION_REQUIRED: 'Payment reservation is temporarily unavailable.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  SHIPPING_BRANCH_NOT_ACTIVE: 'Shipping is not available for the selected branch.',
  STATE_CONFLICT: 'The requested operation conflicts with checkout requirements.',
  VALIDATION_FAILED: 'Request validation failed.',
});

function fail(response: ServerResponse, correlationId: string, status: number, code: string): true {
  return sendJson(
    response,
    status,
    { correlationId, error: { code, message: messages[code] ?? messages.INTERNAL_ERROR } },
    correlationId,
  );
}

function mapPublicError(error: unknown): { readonly code: string; readonly status: number } {
  if (error instanceof HttpRequestError) return { code: error.code, status: error.httpStatus };
  if (error instanceof z.ZodError) return { code: 'VALIDATION_FAILED', status: 422 };
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401) return { code: 'AUTHENTICATION_REQUIRED', status: 401 };
    if (error.httpStatus === 403) return { code: 'ACCESS_DENIED', status: 403 };
    return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  }
  if (error instanceof CheckoutError) {
    if (error.category === 'NOT_FOUND') return { code: error.code, status: 404 };
    if (error.category === 'VALIDATION') return { code: 'VALIDATION_FAILED', status: 422 };
    if (error.category === 'CONFLICT') {
      return {
        code: messages[error.code] === undefined ? 'STATE_CONFLICT' : error.code,
        status: 409,
      };
    }
    return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
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
