import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  createPreorderCampaignSchema,
  editPreorderCampaignSchema,
  preorderCampaignListQuerySchema,
  preorderOperationalTransitionSchema,
  preorderPublicationTransitionSchema,
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
import { PreordersAdminService } from '../application/preorders-admin-service.js';
import { PreorderError } from '../domain/preorders.js';

type Operation =
  | 'CREATE_CAMPAIGN'
  | 'EDIT_CAMPAIGN'
  | 'GET_CAMPAIGN'
  | 'LIST_CAMPAIGNS'
  | 'TRANSITION_OPERATIONAL'
  | 'TRANSITION_PUBLICATION';

interface Route {
  readonly campaignId?: string;
  readonly operation: Operation;
}
interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class PreordersAdminHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly preorders: PreordersAdminService,
    private readonly logger: RequestLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/api/v1/admin/preorders')) return false;
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
      const readOnly = route.operation.startsWith('GET_') || route.operation.startsWith('LIST_');
      const idempotencyKey = readOnly
        ? undefined
        : readIdempotencyKey(request, { maximumLength: 255, visibleAscii: true });
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
          operation: `preorders_admin.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'SUCCESS',
        },
        'Preorder administration request completed.',
      );
      return sendJson(response, result.status, result.body, correlationId);
    } catch (error) {
      const mapped = mapPublicError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          operation: `preorders_admin.${route.operation.toLowerCase()}`,
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Preorder administration request failed.',
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
    if (route.operation === 'LIST_CAMPAIGNS') {
      const query = preorderCampaignListQuerySchema.parse(queryObject(url));
      return {
        body: await this.preorders.listCampaigns(context, {
          limit: query.limit,
          ...(query.branchId === undefined ? {} : { branchId: query.branchId }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          ...(query.operationalState === undefined
            ? {}
            : { operationalState: query.operationalState }),
          ...(query.productId === undefined ? {} : { productId: query.productId }),
          ...(query.publicationStatus === undefined
            ? {}
            : { publicationStatus: query.publicationStatus }),
        }),
        status: 200,
      };
    }
    if (route.operation === 'CREATE_CAMPAIGN') {
      assertNoQuery(url);
      const result = await this.preorders.createCampaign(
        context,
        createPreorderCampaignSchema.parse(await json(request)),
      );
      return { body: result, status: result.replayed ? 200 : 201 };
    }
    const campaignId =
      route.campaignId === undefined ? undefined : z.uuid().parse(route.campaignId).toLowerCase();
    if (route.operation === 'GET_CAMPAIGN') {
      assertNoQuery(url);
      return {
        body: { item: await this.preorders.getCampaign(context, required(campaignId)) },
        status: 200,
      };
    }

    assertNoQuery(url);
    const body = await json(request);
    if (route.operation === 'EDIT_CAMPAIGN') {
      const result = await this.preorders.editCampaign(
        context,
        required(campaignId),
        editPreorderCampaignSchema.parse(body),
      );
      return { body: result, status: 200 };
    }
    if (route.operation === 'TRANSITION_OPERATIONAL') {
      const result = await this.preorders.transitionOperational(
        context,
        required(campaignId),
        preorderOperationalTransitionSchema.parse(body),
      );
      return { body: result, status: 200 };
    }
    if (route.operation === 'TRANSITION_PUBLICATION') {
      const result = await this.preorders.transitionPublication(
        context,
        required(campaignId),
        preorderPublicationTransitionSchema.parse(body),
      );
      return { body: result, status: 200 };
    }
    throw new Error('Unsupported preorder administration route.');
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
  if (pathname === '/api/v1/admin/preorders/campaigns') {
    if (method === 'GET') return { operation: 'LIST_CAMPAIGNS' };
    if (method === 'POST') return { operation: 'CREATE_CAMPAIGN' };
  }
  const campaign =
    /^\/api\/v1\/admin\/preorders\/campaigns\/([^/]+)(?:\/(operational-transitions|publication-transitions))?$/u.exec(
      pathname,
    );
  if (campaign !== null && campaign[1] !== undefined) {
    const suffix = campaign[2];
    if (suffix === undefined && method === 'GET')
      return { campaignId: campaign[1], operation: 'GET_CAMPAIGN' };
    if (suffix === undefined && method === 'PATCH')
      return { campaignId: campaign[1], operation: 'EDIT_CAMPAIGN' };
    if (suffix === 'operational-transitions' && method === 'POST')
      return { campaignId: campaign[1], operation: 'TRANSITION_OPERATIONAL' };
    if (suffix === 'publication-transitions' && method === 'POST')
      return { campaignId: campaign[1], operation: 'TRANSITION_PUBLICATION' };
  }
  return null;
}

async function json(request: IncomingMessage): Promise<unknown> {
  return readJsonBody(request, { requireJsonContentType: true });
}
function queryObject(url: URL): Record<string, string> {
  const entries = [...url.searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Duplicate query parameter.');
  return Object.fromEntries(entries);
}
function assertNoQuery(url: URL): void {
  if ([...url.searchParams].length > 0)
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Query parameters are not accepted.');
}
function required(value: string | undefined): string {
  if (value === undefined) throw new Error('Matched route identifier is missing.');
  return value;
}

const messages: Readonly<Record<string, string>> = Object.freeze({
  ACCESS_DENIED: 'Access is not available.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
  IDEMPOTENCY_KEY_CONFLICT: 'Idempotency-Key was already used with different data.',
  IDEMPOTENCY_KEY_REQUIRED: 'A valid Idempotency-Key is required.',
  INTERNAL_ERROR: 'The request could not be completed.',
  PREORDER_CAMPAIGN_NOT_FOUND: 'Preorder campaign was not found.',
  PREORDER_STATE_CONFLICT: 'The requested operation conflicts with preorder requirements.',
  REQUEST_TOO_LARGE: 'Request is too large.',
  ROUTE_NOT_FOUND: 'Route was not found.',
  VALIDATION_FAILED: 'Request validation failed.',
});

function mapPublicError(error: unknown) {
  if (error instanceof HttpRequestError) return { code: error.code, status: error.httpStatus };
  if (error instanceof z.ZodError) return { code: 'VALIDATION_FAILED', status: 422 };
  if (error instanceof IdentityAccessError) {
    if (error.httpStatus === 401) return { code: 'AUTHENTICATION_REQUIRED', status: 401 };
    if (error.httpStatus === 403) return { code: 'ACCESS_DENIED', status: 403 };
    return {
      code: error.httpStatus >= 500 ? 'DEPENDENCY_UNAVAILABLE' : 'ACCESS_DENIED',
      status: error.httpStatus >= 500 ? 503 : 403,
    };
  }
  if (error instanceof PreorderError) {
    if (error.code === 'PREORDERS_ACCESS_DENIED') return { code: 'ACCESS_DENIED', status: 403 };
    if (error.category === 'NOT_FOUND') return { code: error.code, status: 404 };
    if (error.code.includes('IDEMPOTENCY'))
      return { code: 'IDEMPOTENCY_KEY_CONFLICT', status: 409 };
    if (error.category === 'VALIDATION') return { code: 'VALIDATION_FAILED', status: 422 };
    if (error.category === 'CONFLICT') return { code: 'PREORDER_STATE_CONFLICT', status: 409 };
    if (error.category === 'INFRASTRUCTURE') return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String(error.code).startsWith('08')
  )
    return { code: 'DEPENDENCY_UNAVAILABLE', status: 503 };
  return { code: 'INTERNAL_ERROR', status: 500 };
}
