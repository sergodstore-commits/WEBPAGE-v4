import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  createPaymentAttemptSchema,
  paymentListQuerySchema,
  type PaymentProvider,
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
import { PaymentService } from '../application/payment-service.js';
import { PaymentError } from '../domain/payment.js';

type Route =
  | { readonly kind: 'CREATE'; readonly orderId: string }
  | { readonly kind: 'LIST_ORDER'; readonly orderId: string }
  | { readonly kind: 'GET_ACCOUNT'; readonly attemptId: string }
  | { readonly kind: 'LIST_ADMIN' }
  | { readonly kind: 'GET_ADMIN'; readonly attemptId: string }
  | { readonly kind: 'RECONCILE'; readonly attemptId: string }
  | {
      readonly kind: 'PROVIDER';
      readonly provider: PaymentProvider;
      readonly mode: 'CALLBACK' | 'RETURN';
    };

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class PaymentHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly payments: PaymentService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.includes('/payment')) return false;
    const route = match(request.method, url.pathname);
    if (route === null) return false;
    const correlationId = randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    try {
      const result = await this.execute(route, request, url, correlationId);
      this.logger.info(
        { correlation_id: correlationId, operation: `payments.${route.kind.toLowerCase()}` },
        'Payment request completed.',
      );
      return sendJson(response, route.kind === 'CREATE' ? 201 : 200, result, correlationId);
    } catch (error) {
      const mapped = mapError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          diagnostic: paymentDiagnostic(error),
          error: mapped.code,
          operation: 'payments',
        },
        'Payment request failed.',
      );
      return sendJson(
        response,
        mapped.status,
        { correlationId, error: { code: mapped.code, message: mapped.message } },
        correlationId,
      );
    }
  }

  private async execute(route: Route, request: IncomingMessage, url: URL, correlationId: string) {
    if (route.kind === 'PROVIDER') {
      const providerReturn = await providerToken(request, url, route.provider);
      return this.payments.processProviderResult(
        { actorType: 'SYSTEM', correlationId },
        route.provider,
        {
          mode: providerReturn.recovery ? 'RECONCILE' : route.mode,
          token: providerReturn.token,
        },
      );
    }
    const admin = ['GET_ADMIN', 'LIST_ADMIN', 'RECONCILE'].includes(route.kind);
    const authorization = await this.identity.authorize({
      accessToken: readBearerToken(request),
      capability: { kind: admin ? 'ADMIN' : 'BUYER' },
    });
    const accountId = authorization.account.accountId;
    if (route.kind === 'CREATE') {
      noQuery(url);
      const key = readIdempotencyKey(request, { maximumLength: 255, visibleAscii: true });
      const body = createPaymentAttemptSchema.parse(
        await readJsonBody(request, { requireJsonContentType: true }),
      );
      return this.payments.createAttempt(
        { actorId: accountId, actorType: 'USER', correlationId, idempotencyKey: key },
        accountId,
        uuid(route.orderId),
        body,
      );
    }
    if (route.kind === 'LIST_ORDER') {
      noBody(request);
      noQuery(url);
      return this.payments.listForOrder(accountId, uuid(route.orderId));
    }
    if (route.kind === 'GET_ACCOUNT') {
      noBody(request);
      noQuery(url);
      return this.payments.getForAccount(accountId, uuid(route.attemptId));
    }
    if (route.kind === 'GET_ADMIN') {
      noBody(request);
      noQuery(url);
      return this.payments.getForAdmin(uuid(route.attemptId));
    }
    if (route.kind === 'LIST_ADMIN') {
      noBody(request);
      const query = paymentListQuerySchema.parse(Object.fromEntries(url.searchParams));
      return this.payments.listForAdmin({
        limit: query.limit,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        ...(query.orderId === undefined ? {} : { orderId: query.orderId }),
        ...(query.provider === undefined ? {} : { provider: query.provider }),
        ...(query.status === undefined ? {} : { status: query.status }),
      });
    }
    noBody(request);
    noQuery(url);
    return this.payments.reconcile(
      { actorId: accountId, actorType: 'USER', correlationId },
      uuid(route.attemptId),
    );
  }
}

function paymentDiagnostic(error: unknown): string | undefined {
  let current = error;
  let diagnostic: string | undefined;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current instanceof PaymentError) diagnostic = current.message;
    else {
      const code = safeNetworkCode(current);
      if (code !== undefined) diagnostic = `Provider network error ${code}.`;
      else if (['AbortError', 'TimeoutError', 'TypeError'].includes(current.name))
        diagnostic = 'Provider network request failed.';
      else break;
    }
    current = current.cause;
  }
  return diagnostic;
}

function safeNetworkCode(error: Error): string | undefined {
  if (!('code' in error) || typeof error.code !== 'string') return undefined;
  return new Set([
    'EACCES',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENETUNREACH',
    'ENOTFOUND',
    'ETIMEDOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
  ]).has(error.code)
    ? error.code
    : undefined;
}

function match(method: string | undefined, pathname: string): Route | null {
  if (pathname === '/api/v1/admin/payment-attempts' && method === 'GET')
    return { kind: 'LIST_ADMIN' };
  const reconcile = /^\/api\/v1\/admin\/payment-attempts\/([^/]+)\/reconcile$/u.exec(pathname);
  if (reconcile?.[1] !== undefined && method === 'POST')
    return { attemptId: reconcile[1], kind: 'RECONCILE' };
  const admin = /^\/api\/v1\/admin\/payment-attempts\/([^/]+)$/u.exec(pathname);
  if (admin?.[1] !== undefined && method === 'GET')
    return { attemptId: admin[1], kind: 'GET_ADMIN' };
  const order = /^\/api\/v1\/orders\/([^/]+)\/payment-attempts$/u.exec(pathname);
  if (order?.[1] !== undefined && method === 'POST') return { kind: 'CREATE', orderId: order[1] };
  if (order?.[1] !== undefined && method === 'GET')
    return { kind: 'LIST_ORDER', orderId: order[1] };
  const account = /^\/api\/v1\/payment-attempts\/([^/]+)$/u.exec(pathname);
  if (account?.[1] !== undefined && method === 'GET')
    return { attemptId: account[1], kind: 'GET_ACCOUNT' };
  if (pathname === '/api/v1/payments/flow/confirmation' && method === 'POST') {
    return { kind: 'PROVIDER', mode: 'CALLBACK', provider: 'FLOW' };
  }
  if (pathname === '/api/v1/payments/flow/return' && ['GET', 'POST'].includes(method ?? '')) {
    return { kind: 'PROVIDER', mode: 'RETURN', provider: 'FLOW' };
  }
  if (pathname === '/api/v1/payments/webpay/return' && ['GET', 'POST'].includes(method ?? '')) {
    return { kind: 'PROVIDER', mode: 'RETURN', provider: 'WEBPAY' };
  }
  return null;
}

async function providerToken(request: IncomingMessage, url: URL, provider: PaymentProvider) {
  const queryToken = url.searchParams.get(provider === 'FLOW' ? 'token' : 'token_ws');
  if (queryToken !== null && queryToken.trim() !== '') {
    return { recovery: false, token: queryToken };
  }
  if (provider === 'WEBPAY') {
    const recoveryToken = url.searchParams.get('TBK_TOKEN');
    if (recoveryToken !== null && recoveryToken.trim() !== '') {
      return { recovery: true, token: recoveryToken };
    }
  }
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.toLowerCase();
  if (request.method !== 'POST' || contentType !== 'application/x-www-form-urlencoded') {
    throw new HttpRequestError(
      'PAYMENT_PROVIDER_TOKEN_REQUIRED',
      422,
      'Provider token is required.',
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 8192) throw new HttpRequestError('REQUEST_TOO_LARGE', 413, 'Request is too large.');
    chunks.push(buffer);
  }
  const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  const token = form.get(provider === 'FLOW' ? 'token' : 'token_ws');
  if (token !== null && token.trim() !== '') return { recovery: false, token };
  if (provider === 'WEBPAY') {
    const recoveryToken = form.get('TBK_TOKEN');
    if (recoveryToken !== null && recoveryToken.trim() !== '') {
      return { recovery: true, token: recoveryToken };
    }
  }
  throw new HttpRequestError('PAYMENT_PROVIDER_TOKEN_REQUIRED', 422, 'Provider token is required.');
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
  if (error instanceof PaymentError) {
    const status =
      error.category === 'NOT_FOUND'
        ? 404
        : error.category === 'CONFLICT'
          ? 409
          : error.category === 'VALIDATION'
            ? 422
            : 503;
    return { code: error.code, message: 'Payment request could not be completed.', status };
  }
  return { code: 'INTERNAL_ERROR', message: 'Request could not be completed.', status: 500 };
}
