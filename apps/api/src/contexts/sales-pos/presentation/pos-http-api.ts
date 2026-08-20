import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createPosSaleSchema,
  editExternalMoneyMethodSchema,
  externalMoneyMethodSchema,
  moneyMethodTransitionSchema,
  posBuyerSchema,
  posCompleteSchema,
  posCouponSchema,
  posLineSchema,
  posListQuerySchema,
  posLoyaltySchema,
  posSettlementSchema,
  updatePosLineSchema,
} from '@sergod/contracts';
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
import { PosError, PosService } from '../application/pos-service.js';
const uuid = z.uuid();
const q = (u: URL) => Object.fromEntries(u.searchParams);
export class PosHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly service: PosService,
  ) {}
  async handle(req: IncomingMessage, res: ServerResponse) {
    const u = new URL(req.url ?? '/', 'http://local');
    if (!u.pathname.startsWith('/api/v1/admin/pos')) return false;
    const correlationId = randomUUID();
    try {
      const a = await this.identity.authorize({
          accessToken: readBearerToken(req),
          capability: { kind: 'ADMIN' },
        }),
        read = req.method === 'GET',
        c = {
          actorType: 'USER' as const,
          actorId: a.account.accountId,
          correlationId,
          ...(read
            ? {}
            : {
                idempotencyKey: readIdempotencyKey(req, { maximumLength: 255, visibleAscii: true }),
              }),
        };
      let out: ReturnType<JSON['parse']>,
        status = 200;
      if (req.method === 'GET' && u.pathname === '/api/v1/admin/pos/products/by-sku') {
        out = await this.service.findSku(c, z.string().min(1).parse(u.searchParams.get('sku')));
      } else if (req.method === 'GET' && u.pathname === '/api/v1/admin/pos/sales') {
        out = await this.service.list(c, posListQuerySchema.parse(q(u)));
      } else if (
        req.method === 'GET' &&
        u.pathname === '/api/v1/admin/pos/external-money-methods'
      ) {
        out = await this.service.listMethods(c);
      } else if (req.method === 'GET' && u.pathname === '/api/v1/admin/pos/daily-summary') {
        out = await this.service.daily(
          c,
          uuid.parse(u.searchParams.get('branchId')),
          z.iso.date().parse(u.searchParams.get('date')),
        );
      } else {
        const body =
          req.method === 'DELETE' || req.method === 'GET'
            ? {}
            : await readJsonBody(req, { requireJsonContentType: true });
        let m;
        if (req.method === 'POST' && u.pathname === '/api/v1/admin/pos/sales') {
          out = await this.service.create(c, createPosSaleSchema.parse(body));
          status = out.replayed ? 200 : 201;
        } else if (
          (m = u.pathname.match(
            /^\/api\/v1\/admin\/pos\/external-money-methods\/([0-9a-f-]+)$/u,
          )) &&
          req.method === 'GET'
        ) {
          out = await this.service.getMethod(c, uuid.parse(m[1]));
        } else if (
          (m = u.pathname.match(
            /^\/api\/v1\/admin\/pos\/external-money-methods\/([0-9a-f-]+)$/u,
          )) &&
          req.method === 'PATCH'
        ) {
          out = await this.service.editMethod(
            c,
            uuid.parse(m[1]),
            editExternalMoneyMethodSchema.parse(body),
          );
        } else if (
          (m = u.pathname.match(
            /^\/api\/v1\/admin\/pos\/external-money-methods\/([0-9a-f-]+)$/u,
          )) &&
          req.method === 'DELETE'
        ) {
          out = await this.service.deleteMethod(c, uuid.parse(m[1]));
        } else if (
          req.method === 'POST' &&
          u.pathname === '/api/v1/admin/pos/external-money-methods'
        ) {
          out = await this.service.createMethod(c, externalMoneyMethodSchema.parse(body));
          status = out.replayed ? 200 : 201;
        } else if (
          (m = u.pathname.match(
            /^\/api\/v1\/admin\/pos\/external-money-methods\/([0-9a-f-]+)\/state-transitions$/u,
          )) &&
          req.method === 'POST'
        ) {
          const x = moneyMethodTransitionSchema.parse(body);
          out = await this.service.transitionMethod(c, uuid.parse(m[1]), x.nextState, x.reason);
        } else if (
          (m = u.pathname.match(/^\/api\/v1\/admin\/pos\/sales\/([0-9a-f-]+)$/u)) &&
          req.method === 'GET'
        ) {
          out = await this.service.get(c, uuid.parse(m[1]));
        } else if (
          (m = u.pathname.match(
            /^\/api\/v1\/admin\/pos\/sales\/([0-9a-f-]+)\/(lines|buyer|coupon|loyalty|prepare|return-to-draft|complete|discard)$/u,
          ))
        ) {
          const id = uuid.parse(m[1]);
          if (m[2] === 'lines') {
            out = await this.service.addLine(c, id, posLineSchema.parse(body));
            status = out.replayed ? 200 : 201;
          } else if (m[2] === 'buyer')
            out = await this.service.setBuyer(c, id, posBuyerSchema.parse(body));
          else if (m[2] === 'coupon')
            out = await this.service.setCoupon(c, id, posCouponSchema.parse(body).couponCode);
          else if (m[2] === 'loyalty')
            out = await this.service.setLoyalty(c, id, posLoyaltySchema.parse(body).points);
          else if (m[2] === 'prepare') {
            posCompleteSchema.parse(body);
            out = await this.service.prepare(c, id);
          } else if (m[2] === 'return-to-draft') {
            out = await this.service.returnToDraft(
              c,
              id,
              z
                .object({ reason: z.string().trim().min(1).max(500) })
                .strict()
                .parse(body).reason,
            );
          } else if (m[2] === 'complete') {
            out = await this.service.complete(
              c,
              id,
              Object.keys(body as object).length === 0 ? null : posSettlementSchema.parse(body),
            );
          } else
            out = await this.service.discard(
              c,
              id,
              z
                .object({ reason: z.string().trim().min(1) })
                .strict()
                .parse(body).reason,
            );
        } else if (
          (m = u.pathname.match(
            /^\/api\/v1\/admin\/pos\/sales\/([0-9a-f-]+)\/lines\/([0-9a-f-]+)$/u,
          )) &&
          ['DELETE', 'PATCH'].includes(req.method ?? '')
        ) {
          if (req.method === 'DELETE')
            out = await this.service.removeLine(c, uuid.parse(m[1]), uuid.parse(m[2]));
          else
            out = await this.service.updateLine(
              c,
              uuid.parse(m[1]),
              uuid.parse(m[2]),
              updatePosLineSchema.parse(body).quantity,
            );
        } else
          return sendJson(
            res,
            404,
            { correlationId, error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found.' } },
            correlationId,
          );
      }
      return sendJson(res, status, out, correlationId);
    } catch (e) {
      const status =
          e instanceof IdentityAccessError
            ? e.httpStatus === 401
              ? 401
              : e.httpStatus === 403
                ? 403
                : 503
            : e instanceof HttpRequestError
              ? e.httpStatus
              : e instanceof PosError
                ? e.status
                : isValidationError(e)
                  ? 422
                  : 500,
        code =
          e instanceof IdentityAccessError
            ? status === 401
              ? 'AUTHENTICATION_REQUIRED'
              : status === 403
                ? 'ACCESS_DENIED'
                : 'DEPENDENCY_UNAVAILABLE'
            : e instanceof HttpRequestError
              ? e.code
              : e instanceof PosError
                ? e.code
                : status === 422
                  ? 'VALIDATION_FAILED'
                  : 'INTERNAL_ERROR';
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

function isValidationError(error: unknown): boolean {
  return (
    error instanceof z.ZodError ||
    (typeof error === 'object' &&
      error !== null &&
      'issues' in error &&
      Array.isArray((error as { issues: unknown }).issues))
  );
}
