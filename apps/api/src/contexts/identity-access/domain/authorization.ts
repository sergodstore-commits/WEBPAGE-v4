import type { AccountAuthorizationProjection, PersistedLoginChannel } from './identity.js';

export type ProtectedCapability =
  { readonly kind: 'ACCOUNT_SELF' | 'BUYER' } | { readonly kind: 'ADMIN' };

export interface AuthorizationEvidence {
  readonly account: AccountAuthorizationProjection;
  readonly applicationSession?: {
    readonly invalidated: boolean;
    readonly loginChannel: PersistedLoginChannel;
  };
}

export function isAuthorized(
  evidence: AuthorizationEvidence,
  capability: ProtectedCapability,
): boolean {
  if (evidence.account.status !== 'ACTIVE') return false;
  if (capability.kind === 'ACCOUNT_SELF') return true;
  if (capability.kind === 'BUYER') {
    return evidence.account.emailVerificationStatus === 'VERIFIED';
  }
  if (capability.kind === 'ADMIN') {
    return (
      evidence.account.role === 'ADMIN' &&
      evidence.applicationSession?.invalidated === false &&
      evidence.applicationSession.loginChannel === 'EMAIL_PASSWORD'
    );
  }
  return false;
}
