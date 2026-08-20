import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { accountDeliveryPreferencesSchema } from '@sergod/contracts';
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
import type { AccountDeliveryPreferencesService } from '../application/account-delivery-preferences-service.js';

export class AccountDeliveryPreferencesHttpApi implements HttpRouteHandler {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly preferences: AccountDeliveryPreferencesService,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (url.pathname !== '/api/v1/account/delivery-preferences') return false;
    const correlationId = randomUUID();
    try {
      if ([...url.searchParams].length > 0 || !['GET', 'PUT'].includes(request.method ?? '')) {
        return sendJson(
          response,
          404,
          { correlationId, error: { code: 'ROUTE_NOT_FOUND' } },
          correlationId,
        );
      }
      const authorization = await this.identity.authorize({
        accessToken: readBearerToken(request),
        capability: { kind: 'ACCOUNT_SELF' },
      });
      if (request.method === 'GET') {
        assertNoBody(request);
        return sendJson(
          response,
          200,
          await this.preferences.get(authorization.account.accountId),
          correlationId,
        );
      }
      const body = accountDeliveryPreferencesSchema.parse(
        await readJsonBody(request, { requireJsonContentType: true }),
      );
      return sendJson(
        response,
        200,
        await this.preferences.save(authorization.account.accountId, body),
        correlationId,
      );
    } catch (error) {
      const mapped = mapError(error);
      return sendJson(
        response,
        mapped.status,
        { correlationId, error: { code: mapped.code } },
        correlationId,
      );
    }
  }
}

function assertNoBody(request: IncomingMessage): void {
  if (
    request.headers['transfer-encoding'] !== undefined ||
    ![undefined, '0'].includes(request.headers['content-length'])
  ) {
    throw new HttpRequestError('VALIDATION_FAILED', 422, 'Body is not accepted.');
  }
}
function mapError(error: unknown) {
  if (error instanceof IdentityAccessError) {
    return {
      code: error.httpStatus === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
      status: error.httpStatus,
    };
  }
  if (error instanceof HttpRequestError) return { code: error.code, status: error.httpStatus };
  if (error instanceof z.ZodError) return { code: 'VALIDATION_FAILED', status: 422 };
  return { code: 'INTERNAL_ERROR', status: 500 };
}
