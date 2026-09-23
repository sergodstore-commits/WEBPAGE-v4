import type { ExecutionContext } from '@sergod/foundation';
import type { AccountTournamentIdentifiers } from '@sergod/contracts';

import type { AccountAuthorizationProjection, LoginChannel } from '../domain/identity.js';
import type { AuthorizationEvidence, ProtectedCapability } from '../domain/authorization.js';

export interface ProviderIdentity {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly providerUserId: string;
}

export interface ProviderSession {
  readonly accessToken: string;
  readonly authSessionId: string;
  readonly expiresAt: number | null;
  readonly providerUserId: string;
  readonly refreshToken: string;
}

export interface IdentityProvider {
  createRegistrationIdentity(input: {
    readonly email: string;
    readonly emailRedirectTo: string;
    readonly idempotencyKeyHash: string;
    readonly password: string;
  }): Promise<ProviderIdentity>;
  deleteUnlinkedIdentity(providerUserId: string): Promise<void>;
  getIdentity(providerUserId: string): Promise<ProviderIdentity>;
  invalidateSession(accessToken: string): Promise<void>;
  invalidateUserSessions(accessToken: string): Promise<void>;
  login(input: { readonly email: string; readonly password: string }): Promise<ProviderSession>;
  requestEmailChange(input: {
    readonly accessToken: string;
    readonly email: string;
    readonly emailRedirectTo: string;
    readonly refreshToken: string;
  }): Promise<void>;
  requestPasswordRecovery(input: {
    readonly email: string;
    readonly redirectTo: string;
  }): Promise<void>;
  resendEmailVerification(input: {
    readonly email: string;
    readonly emailRedirectTo: string;
  }): Promise<void>;
  updatePassword(input: { readonly accessToken: string; readonly password: string }): Promise<void>;
  validateEmailCallback(accessToken: string): Promise<ProviderIdentity>;
  validateAccessToken(accessToken: string): Promise<{
    readonly authSessionId: string;
    readonly providerUserId: string;
  }>;
}

export interface IdentityAccountView extends AccountAuthorizationProjection {
  readonly currentEmail: string;
  readonly currentPhone: string | null;
}

export interface IdentityAccessRepository {
  claimExternalIdentityReconciliations(input: {
    readonly leaseMs: number;
    readonly limit: number;
  }): Promise<readonly { readonly providerUserId: string; readonly reconciliationId: string }[]>;
  createExternalIdentityReconciliation(input: {
    readonly context: ExecutionContext;
    readonly providerUserId: string;
  }): Promise<void>;
  findAccountByProviderUserId(providerUserId: string): Promise<IdentityAccountView | null>;
  findAuthorizationEvidence(input: {
    readonly authSessionId: string;
    readonly providerUserId: string;
  }): Promise<AuthorizationEvidence | null>;
  invalidateApplicationSessions(input: {
    readonly accountId: string;
    readonly reason: string;
  }): Promise<void>;
  invalidateApplicationSession(input: {
    readonly authSessionId: string;
    readonly reason: string;
  }): Promise<void>;
  failExternalIdentityReconciliation(input: {
    readonly baseBackoffMs: number;
    readonly errorCode: string;
    readonly maxAttempts: number;
    readonly reconciliationId: string;
  }): Promise<void>;
  cancelContactChange(input: {
    readonly contactChangeId: string;
    readonly reason: string;
  }): Promise<void>;
  markEmailVerified(input: {
    readonly context: ExecutionContext;
    readonly providerUserId: string;
    readonly verifiedEmail: string;
  }): Promise<'EMAIL_CHANGE_CONFIRMED' | 'EMAIL_CHANGE_PENDING' | 'REGISTRATION_CONFIRMED'>;
  provisionFirstAdmin(input: {
    readonly context: ExecutionContext;
    readonly diagnosticContext: unknown;
    readonly environmentIdentifier: string;
    readonly executionSource: 'DEPLOYMENT_COMMAND' | 'DEPLOYMENT_JOB';
    readonly idempotencyKey: string;
    readonly identity: ProviderIdentity;
  }): Promise<{ readonly accountId: string; readonly replayed: boolean }>;
  recordBootstrapFailure(input: {
    readonly context: ExecutionContext;
    readonly reason: string;
  }): Promise<void>;
  recordApplicationSession(input: {
    readonly accountId: string;
    readonly authSessionId: string;
    readonly channel: LoginChannel;
    readonly now: Date;
  }): Promise<void>;
  resolveExternalIdentityReconciliation(reconciliationId: string): Promise<void>;
  registerClient(input: {
    readonly acceptedLegalVersionIds: readonly string[];
    readonly context: ExecutionContext;
    readonly evidenceContext: unknown;
    readonly idempotencyKey: string;
    readonly identity: ProviderIdentity;
    readonly phone: string | null;
    readonly registrationSetFingerprint: string;
  }): Promise<{ readonly accountId: string; readonly replayed: boolean }>;
  reserveContactChange(input: {
    readonly accountId: string;
    readonly context: ExecutionContext;
    readonly expiresAt: Date;
    readonly newValue: string;
  }): Promise<string>;
  updateOptionalPhone(input: {
    readonly accountId: string;
    readonly context: ExecutionContext;
    readonly phone: string | null;
  }): Promise<void>;
  getTournamentIdentifiers(accountId: string): Promise<AccountTournamentIdentifiers>;
  updateTournamentIdentifiers(input: {
    readonly accountId: string;
    readonly context: ExecutionContext;
    readonly identifiers: AccountTournamentIdentifiers;
  }): Promise<AccountTournamentIdentifiers>;
  requireAuthorization(input: {
    readonly authSessionId: string;
    readonly capability: ProtectedCapability;
    readonly providerUserId: string;
  }): Promise<AuthorizationEvidence>;
}

export interface AdditionalFactorPort {
  readonly configured: boolean;
  challenge(): Promise<never>;
}
