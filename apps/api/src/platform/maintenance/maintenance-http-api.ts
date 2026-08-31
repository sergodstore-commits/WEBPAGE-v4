import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Clock, UuidGenerator } from '@sergod/foundation';

import type { HttpRouteHandler } from '../../presentation/http/create-server.js';
import { HttpRequestError, readBearerToken, sendJson } from '../../presentation/http/http-utils.js';

export const maintenanceJobNames = [
  'promotion-lifecycle',
  'preorder-lifecycle',
  'cart-expiration',
  'order-expiration',
] as const;

export type MaintenanceJobName = (typeof maintenanceJobNames)[number];

export interface MaintenanceJobInput {
  readonly correlationId: string;
  readonly scheduledFor: Date;
}

export interface MaintenanceJobResult {
  readonly kind: string;
  readonly [key: string]: unknown;
}

type MaintenanceJobRunner = (input: MaintenanceJobInput) => Promise<MaintenanceJobResult>;

interface RequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export class MaintenanceHttpApi implements HttpRouteHandler {
  private readonly expectedTokenHash: Buffer;

  constructor(
    token: string,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
    private readonly jobs: Readonly<Record<MaintenanceJobName, MaintenanceJobRunner>>,
    private readonly logger: RequestLogger,
  ) {
    this.expectedTokenHash = hash(token);
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/internal/jobs/')) return false;

    const correlationId = this.uuids.generate();
    response.setHeader('x-correlation-id', correlationId);
    const jobName = matchJob(url.pathname);
    if (jobName === null) return sendError(response, correlationId, 404, 'ROUTE_NOT_FOUND');
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST');
      return sendError(response, correlationId, 405, 'METHOD_NOT_ALLOWED');
    }
    if ([...url.searchParams].length !== 0) {
      return sendError(response, correlationId, 422, 'VALIDATION_FAILED');
    }

    const startedAt = performance.now();
    try {
      this.assertAuthorized(request);
      const scheduledFor = floorToMinute(this.clock.now());
      const result = await this.jobs[jobName]({ correlationId, scheduledFor });
      this.logger.info(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          job: jobName,
          operation: 'maintenance.run',
          request_id: correlationId,
          result: result.kind,
          scheduled_for: scheduledFor.toISOString(),
        },
        'Maintenance job request completed.',
      );
      return sendJson(response, 200, { correlationId, job: jobName, result }, correlationId);
    } catch (error) {
      const mapped = mapError(error);
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error: mapped.code,
          job: jobName,
          operation: 'maintenance.run',
          request_id: correlationId,
          result: 'FAILURE',
          technical_error_code: safeTechnicalErrorCode(error),
        },
        'Maintenance job request failed.',
      );
      return sendError(response, correlationId, mapped.status, mapped.code);
    }
  }

  private assertAuthorized(request: IncomingMessage): void {
    const actual = hash(readBearerToken(request));
    if (!timingSafeEqual(actual, this.expectedTokenHash)) {
      throw new HttpRequestError('AUTHENTICATION_REQUIRED', 401, 'Authentication is required.');
    }
  }
}

function hash(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function matchJob(pathname: string): MaintenanceJobName | null {
  const match = /^\/internal\/jobs\/([^/]+)$/u.exec(pathname);
  const candidate = match?.[1];
  return maintenanceJobNames.find((name) => name === candidate) ?? null;
}

function floorToMinute(value: Date): Date {
  const result = new Date(value);
  result.setUTCSeconds(0, 0);
  return result;
}

function mapError(error: unknown): { readonly code: string; readonly status: number } {
  if (error instanceof HttpRequestError) {
    return { code: error.code, status: error.httpStatus };
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

function safeTechnicalErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'UNCLASSIFIED';
  const code = String(error.code);
  return /^[A-Z0-9_]{1,64}$/u.test(code) ? code : 'UNCLASSIFIED';
}

function sendError(
  response: ServerResponse,
  correlationId: string,
  status: number,
  code: string,
): true {
  const messages: Readonly<Record<string, string>> = {
    AUTHENTICATION_REQUIRED: 'Authentication is required.',
    DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable.',
    INTERNAL_ERROR: 'The request could not be completed.',
    METHOD_NOT_ALLOWED: 'The request method is not allowed.',
    ROUTE_NOT_FOUND: 'Route was not found.',
    VALIDATION_FAILED: 'Request validation failed.',
  };
  return sendJson(
    response,
    status,
    { correlationId, error: { code, message: messages[code] ?? messages.INTERNAL_ERROR } },
    correlationId,
  );
}
