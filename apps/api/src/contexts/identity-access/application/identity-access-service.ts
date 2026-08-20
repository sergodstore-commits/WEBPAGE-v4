import { createHash } from 'node:crypto';

import { metadataRegistry } from '@sergod/contracts';
import type { Clock, ExecutionContext } from '@sergod/foundation';

import type { ProtectedCapability } from '../domain/authorization.js';
import {
  assertLoginAllowed,
  assertPasswordConfirmation,
  normalizeEmail,
  normalizePhone,
} from '../domain/identity.js';
import type {
  AdditionalFactorPort,
  IdentityAccessRepository,
  IdentityProvider,
  ProviderSession,
} from './ports.js';

export class IdentityAccessService {
  constructor(
    private readonly repository: IdentityAccessRepository,
    private readonly provider: IdentityProvider,
    private readonly clock: Clock,
    private readonly additionalFactor: AdditionalFactorPort,
  ) {}

  async provisionFirstAdmin(input: {
    readonly authProviderUserId: string;
    readonly commandVersion: string;
    readonly context: ExecutionContext;
    readonly deploymentId: string;
    readonly environmentIdentifier: string;
    readonly executionSource: 'DEPLOYMENT_COMMAND' | 'DEPLOYMENT_JOB';
    readonly idempotencyKey: string;
  }): Promise<{ readonly accountId: string; readonly replayed: boolean }> {
    try {
      const identity = await this.provider.getIdentity(input.authProviderUserId);
      if (!identity.emailVerified) {
        throw new IdentityAccessError(
          'BOOTSTRAP_EMAIL_NOT_VERIFIED',
          409,
          'Bootstrap requires verified email.',
        );
      }
      const diagnosticContext = metadataRegistry.validate('BootstrapDiagnosticContext.v1', {
        command_version: input.commandVersion,
        deployment_id: input.deploymentId,
        error_code: 'NONE',
        failure_stage: 'COMPLETED',
        metadata_contract: 'BootstrapDiagnosticContext.v1',
        metadata_schema_version: 1,
      });
      return await this.repository.provisionFirstAdmin({
        context: input.context,
        diagnosticContext,
        environmentIdentifier: input.environmentIdentifier,
        executionSource: input.executionSource,
        idempotencyKey: input.idempotencyKey,
        identity,
      });
    } catch (error) {
      await this.repository.recordBootstrapFailure({
        context: input.context,
        reason: error instanceof IdentityAccessError ? error.code : 'BOOTSTRAP_FAILED',
      });
      throw error;
    }
  }

  async registerClient(input: {
    readonly acceptedLegalVersionIds: readonly string[];
    readonly context: ExecutionContext;
    readonly email: string;
    readonly emailRedirectTo: string;
    readonly evidence: {
      readonly captureChannel: string;
      readonly ipPrefixHash: string;
      readonly sessionId: string;
      readonly userAgentHash: string;
    };
    readonly idempotencyKey: string;
    readonly password: string;
    readonly passwordConfirmation: string;
    readonly phone?: string | null;
  }): Promise<{ readonly accountId: string; readonly replayed: boolean }> {
    assertPasswordConfirmation(input.password, input.passwordConfirmation);
    const email = normalizeEmail(input.email);
    const phone = normalizeOptionalPhone(input.phone);
    const legalIds = [...new Set(input.acceptedLegalVersionIds)].sort();
    if (legalIds.length !== input.acceptedLegalVersionIds.length) {
      throw new IdentityAccessError(
        'LEGAL_SET_INVALID',
        409,
        'Legal version identifiers must be unique.',
      );
    }
    const registrationSetFingerprint = sha256(JSON.stringify(legalIds));
    const evidenceContext = metadataRegistry.validate('LegalEvidenceContext.v1', {
      capture_channel: input.evidence.captureChannel,
      ip_prefix_hash: input.evidence.ipPrefixHash,
      metadata_contract: 'LegalEvidenceContext.v1',
      metadata_schema_version: 1,
      session_id: input.evidence.sessionId,
      user_agent_hash: input.evidence.userAgentHash,
    });
    const idempotencyKeyHash = sha256(input.idempotencyKey);
    const identity = await this.provider.createRegistrationIdentity({
      email,
      emailRedirectTo: input.emailRedirectTo,
      idempotencyKeyHash,
      password: input.password,
    });
    let result: { readonly accountId: string; readonly replayed: boolean };
    try {
      result = await this.repository.registerClient({
        acceptedLegalVersionIds: legalIds,
        context: input.context,
        evidenceContext,
        idempotencyKey: input.idempotencyKey,
        identity,
        phone,
        registrationSetFingerprint,
      });
    } catch (error) {
      try {
        await this.provider.deleteUnlinkedIdentity(identity.providerUserId);
      } catch {
        await this.repository.createExternalIdentityReconciliation({
          context: input.context,
          providerUserId: identity.providerUserId,
        });
      }
      throw error;
    }
    return result;
  }

  async login(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<ProviderSession> {
    const session = await this.provider.login({
      email: normalizeEmail(input.email),
      password: input.password,
    });
    const account = await this.repository.findAccountByProviderUserId(session.providerUserId);
    if (account === null) {
      await this.provider.invalidateSession(session.accessToken);
      throw new IdentityAccessError(
        'ACCOUNT_NOT_LINKED',
        403,
        'Identity is not linked to an account.',
      );
    }
    try {
      assertLoginAllowed(account);
    } catch (error) {
      await this.provider.invalidateSession(session.accessToken);
      throw error;
    }
    await this.repository.recordApplicationSession({
      accountId: account.accountId,
      authSessionId: session.authSessionId,
      channel: 'EMAIL_PASSWORD',
      now: this.clock.now(),
    });
    return session;
  }

  async completeEmailCallback(input: {
    readonly accessToken: string;
    readonly context: ExecutionContext;
  }): Promise<'EMAIL_CHANGE_CONFIRMED' | 'EMAIL_CHANGE_PENDING' | 'REGISTRATION_CONFIRMED'> {
    const identity = await this.provider.validateEmailCallback(input.accessToken);
    if (!identity.emailVerified) {
      throw new IdentityAccessError('EMAIL_NOT_VERIFIED', 409, 'Email is not verified.');
    }
    const result = await this.repository.markEmailVerified({
      context: input.context,
      providerUserId: identity.providerUserId,
      verifiedEmail: normalizeEmail(identity.email),
    });
    const account = await this.repository.findAccountByProviderUserId(identity.providerUserId);
    if (account !== null && result !== 'EMAIL_CHANGE_PENDING') {
      await this.repository.invalidateApplicationSessions({
        accountId: account.accountId,
        reason: 'EMAIL_CONFIRMED_OR_CHANGED',
      });
    }
    await this.provider.invalidateUserSessions(input.accessToken);
    return result;
  }

  async resendEmailVerification(input: {
    readonly email: string;
    readonly emailRedirectTo: string;
  }): Promise<void> {
    await this.provider.resendEmailVerification({
      email: normalizeEmail(input.email),
      emailRedirectTo: input.emailRedirectTo,
    });
  }

  async requestEmailChange(input: {
    readonly accessToken: string;
    readonly context: ExecutionContext;
    readonly emailRedirectTo: string;
    readonly expiresAt: Date;
    readonly newEmail: string;
    readonly refreshToken: string;
  }): Promise<void> {
    const authorized = await this.authorize({
      accessToken: input.accessToken,
      capability: { kind: 'ACCOUNT_SELF' },
    });
    const normalized = normalizeEmail(input.newEmail);
    const contactChangeId = await this.repository.reserveContactChange({
      accountId: authorized.account.accountId,
      context: input.context,
      expiresAt: input.expiresAt,
      newValue: normalized,
    });
    try {
      await this.provider.requestEmailChange({
        accessToken: input.accessToken,
        email: normalized,
        emailRedirectTo: input.emailRedirectTo,
        refreshToken: input.refreshToken,
      });
    } catch (error) {
      await this.repository.cancelContactChange({
        contactChangeId,
        reason: 'IDENTITY_PROVIDER_ERROR',
      });
      throw error;
    }
  }

  async updateOptionalPhone(input: {
    readonly accessToken: string;
    readonly context: ExecutionContext;
    readonly phone: string | null;
  }): Promise<void> {
    const authorized = await this.authorize({
      accessToken: input.accessToken,
      capability: { kind: 'ACCOUNT_SELF' },
    });
    await this.repository.updateOptionalPhone({
      accountId: authorized.account.accountId,
      context: input.context,
      phone: normalizeOptionalPhone(input.phone),
    });
  }

  async logout(accessToken: string): Promise<void> {
    const trusted = await this.provider.validateAccessToken(accessToken);
    await this.provider.invalidateSession(accessToken);
    await this.repository.invalidateApplicationSession({
      authSessionId: trusted.authSessionId,
      reason: 'USER_LOGOUT',
    });
  }

  async reconcileExternalIdentities(input: {
    readonly baseBackoffMs: number;
    readonly leaseMs: number;
    readonly limit: number;
    readonly maxAttempts: number;
  }): Promise<{ readonly failed: number; readonly resolved: number }> {
    const claims = await this.repository.claimExternalIdentityReconciliations(input);
    let failed = 0;
    let resolved = 0;
    for (const claim of claims) {
      try {
        await this.provider.deleteUnlinkedIdentity(claim.providerUserId);
        await this.repository.resolveExternalIdentityReconciliation(claim.reconciliationId);
        resolved += 1;
      } catch {
        await this.repository.failExternalIdentityReconciliation({
          baseBackoffMs: input.baseBackoffMs,
          errorCode: 'IDENTITY_PROVIDER_ERROR',
          maxAttempts: input.maxAttempts,
          reconciliationId: claim.reconciliationId,
        });
        failed += 1;
      }
    }
    return { failed, resolved };
  }

  async requestPasswordRecovery(input: {
    readonly email: string;
    readonly redirectTo: string;
  }): Promise<void> {
    await this.provider.requestPasswordRecovery({
      email: normalizeEmail(input.email),
      redirectTo: input.redirectTo,
    });
  }

  async completePasswordRecovery(input: {
    readonly accessToken: string;
    readonly newPassword: string;
    readonly newPasswordConfirmation: string;
  }): Promise<void> {
    assertPasswordConfirmation(input.newPassword, input.newPasswordConfirmation);
    const trusted = await this.provider.validateAccessToken(input.accessToken);
    await this.provider.updatePassword({
      accessToken: input.accessToken,
      password: input.newPassword,
    });
    await this.provider.invalidateUserSessions(input.accessToken);
    const account = await this.repository.findAccountByProviderUserId(trusted.providerUserId);
    if (account !== null) {
      await this.repository.invalidateApplicationSessions({
        accountId: account.accountId,
        reason: 'PASSWORD_RECOVERY',
      });
    }
  }

  async changePassword(input: {
    readonly accessToken: string;
    readonly accountId: string;
    readonly newPassword: string;
    readonly newPasswordConfirmation: string;
    readonly providerUserId: string;
  }): Promise<void> {
    assertPasswordConfirmation(input.newPassword, input.newPasswordConfirmation);
    await this.provider.updatePassword({
      accessToken: input.accessToken,
      password: input.newPassword,
    });
    await this.provider.invalidateUserSessions(input.accessToken);
    await this.repository.invalidateApplicationSessions({
      accountId: input.accountId,
      reason: 'PASSWORD_CHANGED',
    });
  }

  async authorize(input: {
    readonly accessToken: string;
    readonly capability: ProtectedCapability;
  }) {
    const trusted = await this.provider.validateAccessToken(input.accessToken);
    const evidence = await this.repository.requireAuthorization({
      authSessionId: trusted.authSessionId,
      capability: input.capability,
      providerUserId: trusted.providerUserId,
    });
    return { ...evidence, providerUserId: trusted.providerUserId };
  }

  assertMfaDisabled(): void {
    if (this.additionalFactor.configured) {
      throw new IdentityAccessError(
        'MFA_REQUIRES_APPROVED_ENABLEMENT',
        409,
        'MFA cannot be enabled in V1.',
      );
    }
  }
}

export class IdentityAccessError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'IdentityAccessError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeOptionalPhone(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined || phone.trim() === '') return null;
  return normalizePhone(phone);
}
