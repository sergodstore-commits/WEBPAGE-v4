import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { z } from 'zod';
import { accountTournamentIdentifiersSchema } from '@sergod/contracts';
import type { Clock } from '@sergod/foundation';

import {
  IdentityAccessError,
  IdentityAccessService,
} from '../application/identity-access-service.js';
import { IdentityPolicyError } from '../domain/identity.js';
import { PgIdentityAccessRepository } from '../infrastructure/postgres-identity-access-repository.js';
import {
  HttpRequestError,
  readBearerToken,
  readIdempotencyKey,
  readJsonBody,
  sendJson as send,
} from '../../../presentation/http/http-utils.js';

interface IdentityRequestLogger {
  error(bindings: Record<string, unknown>, message: string): void;
}

const silentIdentityLogger: IdentityRequestLogger = { error: () => undefined };

const credentialsSchema = z
  .object({
    email: z.email(),
    password: z.string().min(1).max(1024),
  })
  .strict();
const registrationSchema = z
  .object({
    acceptedLegalVersionIds: z.array(z.uuid()).max(32),
    email: z.email(),
    password: z.string().min(8).max(1024),
    passwordConfirmation: z.string().min(8).max(1024),
    phone: z.string().min(8).max(16).nullable().optional(),
  })
  .strict();
const verificationRequestSchema = z
  .object({
    email: z.email(),
  })
  .strict();
const emailChangeSchema = z
  .object({
    email: z.email(),
    refreshToken: z.string().min(1).max(8192),
  })
  .strict();
const phoneSchema = z.object({ phone: z.string().min(8).max(16).nullable() }).strict();
const passwordChangeSchema = z.object({
  newPassword: z.string().min(8).max(1024),
  newPasswordConfirmation: z.string().min(8).max(1024),
});
const recoveryRequestSchema = z.object({ email: z.email() }).strict();
const recoveryCompleteSchema = z
  .object({
    newPassword: z.string().min(8).max(1024),
    newPasswordConfirmation: z.string().min(8).max(1024),
  })
  .strict();
const stateSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const branchSchema = z.object({
  internalAddress: z.string().trim().min(1).max(1000),
  name: z.string().trim().min(1).max(200),
  timezone: z.string().trim().min(1).max(100),
});
const legalDocumentSchema = z.object({
  key: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
  publicTitle: z.string().trim().min(1).max(300),
  purpose: z.string().trim().min(1).max(1000).optional(),
  requiredForRegistration: z.boolean(),
});
const legalVersionSchema = z.object({
  contentLocation: z.url(),
  title: z.string().trim().min(1).max(300),
  versionLabel: z.string().trim().min(1).max(100),
});

export class IdentityHttpApi {
  readonly #rateLimiter = new AuthenticationRateLimiter(10, 60_000);

  constructor(
    private readonly service: IdentityAccessService,
    private readonly repository: PgIdentityAccessRepository,
    private readonly clock: Clock,
    private readonly contactChangeTtlMs: number,
    private readonly callbackUrls: {
      readonly emailChange: string;
      readonly recovery: string;
      readonly registration: string;
    },
    private readonly logger: IdentityRequestLogger = silentIdentityLogger,
  ) {}

  async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
    const url = new URL(request.url ?? '/', 'http://local.invalid');
    if (!url.pathname.startsWith('/api/v1/')) return false;
    const correlationId = randomUUID();
    const startedAt = performance.now();
    try {
      if (
        request.method === 'GET' &&
        url.pathname === '/api/v1/identity/registration/legal-documents'
      ) {
        return send(response, 200, { documents: await this.repository.listPublicLegalVersions() });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/identity/registrations') {
        this.#rateLimiter.assertAllowed(clientKey(request));
        const body = registrationSchema.parse(await readJsonBody(request));
        const idempotencyKey = readIdempotencyKey(request);
        const result = await this.service.registerClient({
          ...body,
          phone: body.phone ?? null,
          emailRedirectTo: this.callbackUrls.registration,
          context: {
            actorType: 'SYSTEM',
            correlationId,
            idempotencyKey,
          },
          evidence: {
            captureChannel: 'WEB_REGISTRATION',
            ipPrefixHash: hash(clientKey(request)),
            sessionId: correlationId,
            userAgentHash: hash(request.headers['user-agent'] ?? 'unknown'),
          },
          idempotencyKey,
        });
        return send(response, result.replayed ? 200 : 201, result);
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/identity/sessions') {
        this.#rateLimiter.assertAllowed(clientKey(request));
        const raw = await readJsonBody(request);
        rejectPhoneAuthentication(raw);
        const session = await this.service.login(credentialsSchema.parse(raw));
        return send(response, 201, {
          accessToken: session.accessToken,
          expiresAt: session.expiresAt,
          refreshToken: session.refreshToken,
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/identity/email-callbacks') {
        this.#rateLimiter.assertAllowed(clientKey(request));
        const status = await this.service.completeEmailCallback({
          accessToken: readBearerToken(request),
          context: { actorType: 'SYSTEM', correlationId: randomUUID() },
        });
        return send(response, 200, { status });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/identity/verification-requests') {
        this.#rateLimiter.assertAllowed(clientKey(request));
        const raw = await readJsonBody(request);
        rejectPhoneAuthentication(raw);
        const body = verificationRequestSchema.parse(raw);
        await this.service.resendEmailVerification({
          email: body.email,
          emailRedirectTo: this.callbackUrls.registration,
        });
        return send(response, 202, { status: 'accepted' });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/identity/recovery-requests') {
        this.#rateLimiter.assertAllowed(clientKey(request));
        const raw = await readJsonBody(request);
        rejectPhoneAuthentication(raw);
        const body = recoveryRequestSchema.parse(raw);
        await this.service.requestPasswordRecovery({
          email: body.email,
          redirectTo: this.callbackUrls.recovery,
        });
        return send(response, 202, { status: 'accepted' });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/identity/recoveries') {
        this.#rateLimiter.assertAllowed(clientKey(request));
        const raw = await readJsonBody(request);
        rejectPhoneAuthentication(raw);
        await this.service.completePasswordRecovery({
          ...recoveryCompleteSchema.parse(raw),
          accessToken: readBearerToken(request),
        });
        return send(response, 204);
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/account') {
        const token = readBearerToken(request);
        const authorized = await this.service.authorize({
          accessToken: token,
          capability: { kind: 'ACCOUNT_SELF' },
        });
        const account = await this.repository.findAccountByProviderUserId(
          authorized.providerUserId,
        );
        return send(response, 200, { account });
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/account/email-changes') {
        const accessToken = readBearerToken(request);
        const body = emailChangeSchema.parse(await readJsonBody(request));
        await this.service.requestEmailChange({
          accessToken,
          context: { actorType: 'USER', correlationId: randomUUID() },
          emailRedirectTo: this.callbackUrls.emailChange,
          expiresAt: new Date(this.clock.now().getTime() + this.contactChangeTtlMs),
          newEmail: body.email,
          refreshToken: body.refreshToken,
        });
        return send(response, 202, { status: 'verification_required' });
      }
      if (url.pathname === '/api/v1/account/tournament-identifiers') {
        if (request.method === 'GET') {
          return send(response, 200, {
            item: await this.service.getTournamentIdentifiers(readBearerToken(request)),
          });
        }
        if (request.method === 'PUT') {
          const item = await this.service.updateTournamentIdentifiers({
            accessToken: readBearerToken(request),
            context: { actorType: 'USER', correlationId },
            identifiers: accountTournamentIdentifiersSchema.parse(await readJsonBody(request)),
          });
          return send(response, 200, { item });
        }
      }
      if (request.method === 'PUT' && url.pathname === '/api/v1/account/phone') {
        await this.service.updateOptionalPhone({
          accessToken: readBearerToken(request),
          context: { actorType: 'USER', correlationId: randomUUID() },
          phone: phoneSchema.parse(await readJsonBody(request)).phone,
        });
        return send(response, 204);
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/account/password') {
        const accessToken = readBearerToken(request);
        const body = passwordChangeSchema.parse(await readJsonBody(request));
        const authorized = await this.service.authorize({
          accessToken,
          capability: { kind: 'ACCOUNT_SELF' },
        });
        await this.service.changePassword({
          accessToken,
          accountId: authorized.account.accountId,
          newPassword: body.newPassword,
          newPasswordConfirmation: body.newPasswordConfirmation,
          providerUserId: authorized.providerUserId,
        });
        return send(response, 204);
      }
      if (request.method === 'DELETE' && url.pathname === '/api/v1/identity/session') {
        await this.service.logout(readBearerToken(request));
        return send(response, 204);
      }

      if (url.pathname.startsWith('/api/v1/admin/')) {
        const token = readBearerToken(request);
        const authorized = await this.service.authorize({
          accessToken: token,
          capability: { kind: 'ADMIN' },
        });
        const actorId = authorized.account.accountId;
        const context = { actorId, actorType: 'USER' as const, correlationId: randomUUID() };
        if (request.method === 'GET' && url.pathname === '/api/v1/admin/accounts') {
          return send(response, 200, { accounts: await this.repository.listAccounts() });
        }
        const stateMatch =
          /^\/api\/v1\/admin\/accounts\/([0-9a-f-]+)\/(deactivate|reactivate)$/.exec(url.pathname);
        if (request.method === 'POST' && stateMatch !== null) {
          const body = stateSchema.parse(await readJsonBody(request));
          await this.repository.changeAccountState({
            accountId: requiredMatch(stateMatch[1]),
            actorAccountId: actorId,
            context,
            reason: body.reason,
            targetStatus: stateMatch[2] === 'deactivate' ? 'DEACTIVATED' : 'ACTIVE',
          });
          return send(response, 204);
        }
        const promotionMatch = /^\/api\/v1\/admin\/accounts\/([0-9a-f-]+)\/promote$/.exec(
          url.pathname,
        );
        if (request.method === 'POST' && promotionMatch !== null) {
          const body = stateSchema.parse(await readJsonBody(request));
          await this.repository.promoteToAdmin({
            accountId: requiredMatch(promotionMatch[1]),
            actorAccountId: actorId,
            context,
            reason: body.reason,
          });
          return send(response, 204);
        }
        if (request.method === 'POST' && url.pathname === '/api/v1/admin/branches/initialize') {
          const idempotencyKey = readIdempotencyKey(request);
          const result = await this.repository.initializeFirstBranch({
            ...branchSchema.parse(await readJsonBody(request)),
            actorAccountId: actorId,
            context: { ...context, idempotencyKey },
            idempotencyKey,
          });
          return send(response, result.replayed ? 200 : 201, result);
        }
        if (request.method === 'POST' && url.pathname === '/api/v1/admin/legal-documents') {
          const body = legalDocumentSchema.parse(await readJsonBody(request));
          const legalDocumentId = await this.repository.createLegalDocument({
            actorAccountId: actorId,
            context,
            key: body.key,
            publicTitle: body.publicTitle,
            requiredForRegistration: body.requiredForRegistration,
            ...(body.purpose === undefined ? {} : { purpose: body.purpose }),
          });
          return send(response, 201, { legalDocumentId });
        }
        const versionCreate = /^\/api\/v1\/admin\/legal-documents\/([0-9a-f-]+)\/versions$/.exec(
          url.pathname,
        );
        if (request.method === 'POST' && versionCreate !== null) {
          const legalVersionId = await this.repository.createLegalVersion({
            ...legalVersionSchema.parse(await readJsonBody(request)),
            actorAccountId: actorId,
            context,
            legalDocumentId: requiredMatch(versionCreate[1]),
          });
          return send(response, 201, { legalVersionId });
        }
        const activateVersion = /^\/api\/v1\/admin\/legal-versions\/([0-9a-f-]+)\/activate$/.exec(
          url.pathname,
        );
        if (request.method === 'POST' && activateVersion !== null) {
          await this.repository.activateLegalVersion({
            actorAccountId: actorId,
            context,
            legalVersionId: requiredMatch(activateVersion[1]),
          });
          return send(response, 204);
        }
        const activateDocument = /^\/api\/v1\/admin\/legal-documents\/([0-9a-f-]+)\/activate$/.exec(
          url.pathname,
        );
        if (request.method === 'POST' && activateDocument !== null) {
          await this.repository.activateLegalDocument({
            actorAccountId: actorId,
            context,
            legalDocumentId: requiredMatch(activateDocument[1]),
          });
          return send(response, 204);
        }
      }
      return send(response, 404, { error: { code: 'ROUTE_NOT_FOUND' } });
    } catch (error) {
      this.logger.error(
        {
          correlation_id: correlationId,
          duration_ms: Math.round(performance.now() - startedAt),
          error_code: safeTechnicalErrorCode(error),
          error_kind: error instanceof Error ? error.name : 'UnknownError',
          operation: 'identity.request',
          request_id: correlationId,
          result: 'FAILURE',
        },
        'Identity request failed.',
      );
      return handleError(response, error);
    }
  }
}

function safeTechnicalErrorCode(error: unknown): string {
  const candidate =
    error instanceof IdentityAccessError || error instanceof HttpRequestError
      ? error.code
      : typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'UNEXPECTED_ERROR';
  return /^[A-Z0-9_]{2,64}$/u.test(candidate) ? candidate : 'UNEXPECTED_ERROR';
}

function handleError(response: ServerResponse, error: unknown): true {
  if (error instanceof HttpRequestError) {
    return send(response, error.httpStatus, {
      error: { code: error.code, message: error.message },
    });
  }
  if (error instanceof IdentityAccessError) {
    return send(response, error.httpStatus, {
      error: { code: error.code, message: error.message },
    });
  }
  if (error instanceof IdentityPolicyError) {
    return send(response, 409, { error: { code: error.code, message: error.message } });
  }
  if (error instanceof z.ZodError) {
    return send(response, 422, { error: { code: 'VALIDATION_FAILED' } });
  }
  return send(response, 500, { error: { code: 'INTERNAL_ERROR' } });
}

function clientKey(request: IncomingMessage): string {
  return request.socket.remoteAddress ?? 'unknown';
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function requiredMatch(value: string | undefined): string {
  if (value === undefined) throw new IdentityAccessError('ROUTE_INVALID', 404, 'Route is invalid.');
  return value;
}

function rejectPhoneAuthentication(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  const candidate = value as Record<string, unknown>;
  if (
    'phone' in candidate ||
    candidate.channel === 'PHONE_PASSWORD' ||
    candidate.contactType === 'PHONE'
  ) {
    throw new IdentityAccessError(
      'PHONE_AUTHENTICATION_NOT_SUPPORTED',
      422,
      'Phone authentication is not supported.',
    );
  }
}

class AuthenticationRateLimiter {
  readonly #buckets = new Map<string, { count: number; startsAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  assertAllowed(key: string): void {
    const now = Date.now();
    const current = this.#buckets.get(key);
    if (current === undefined || now - current.startsAt >= this.windowMs) {
      this.#buckets.set(key, { count: 1, startsAt: now });
      return;
    }
    current.count += 1;
    if (current.count > this.limit) {
      throw new IdentityAccessError('RATE_LIMITED', 429, 'Too many authentication requests.');
    }
  }
}
