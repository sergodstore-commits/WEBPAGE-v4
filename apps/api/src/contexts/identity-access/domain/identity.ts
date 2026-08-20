export const accountRoles = ['CLIENTE', 'ADMIN'] as const;
export const accountStatuses = ['ACTIVE', 'DEACTIVATED'] as const;
export const verificationStatuses = ['PENDING', 'VERIFIED'] as const;
export const loginChannels = ['EMAIL_PASSWORD'] as const;
export const persistedLoginChannels = ['EMAIL_PASSWORD', 'PHONE_PASSWORD'] as const;
export type AccountRole = (typeof accountRoles)[number];
export type AccountStatus = (typeof accountStatuses)[number];
export type VerificationStatus = (typeof verificationStatuses)[number];
export type LoginChannel = (typeof loginChannels)[number];
export type PersistedLoginChannel = (typeof persistedLoginChannels)[number];

export interface AccountAuthorizationProjection {
  readonly accountId: string;
  readonly emailVerificationStatus: VerificationStatus;
  readonly role: AccountRole;
  readonly status: AccountStatus;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  const normalized = phone.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new IdentityPolicyError('PHONE_INVALID', 'Phone must use E.164 format.');
  }
  return normalized;
}

export function assertPasswordConfirmation(password: string, confirmation: string): void {
  if (password !== confirmation) {
    throw new IdentityPolicyError('PASSWORD_CONFIRMATION_MISMATCH', 'Passwords do not match.');
  }
  if (password.length < 8) {
    throw new IdentityPolicyError(
      'PASSWORD_INVALID',
      'Password does not satisfy the minimum length.',
    );
  }
}

export function assertLoginAllowed(account: AccountAuthorizationProjection): void {
  if (account.status !== 'ACTIVE') {
    throw new IdentityPolicyError('ACCOUNT_DEACTIVATED', 'The account is not active.');
  }
  if (account.emailVerificationStatus !== 'VERIFIED') {
    throw new IdentityPolicyError('EMAIL_NOT_VERIFIED', 'Email is not verified.');
  }
}

export function assertPromotionAllowed(account: AccountAuthorizationProjection): void {
  if (
    account.status !== 'ACTIVE' ||
    account.role !== 'CLIENTE' ||
    account.emailVerificationStatus !== 'VERIFIED'
  ) {
    throw new IdentityPolicyError(
      'ACCOUNT_NOT_ELIGIBLE_FOR_ADMIN',
      'Only an active Client with verified email can be promoted.',
    );
  }
}

export function canUseBuyerCapabilities(account: AccountAuthorizationProjection): boolean {
  return account.status === 'ACTIVE' && account.emailVerificationStatus === 'VERIFIED';
}

export function canProcessAuthenticExternalEffect(input: {
  readonly authentic: boolean;
  readonly originatedWhileAccountActive: boolean;
}): boolean {
  return input.authentic && input.originatedWhileAccountActive;
}

export function assertBranchTimezoneChangeAllowed(input: {
  readonly currentTimezone: string;
  readonly hasCommercialOperations: boolean;
  readonly requestedTimezone: string;
}): void {
  if (input.hasCommercialOperations && input.currentTimezone !== input.requestedTimezone) {
    throw new IdentityPolicyError(
      'BRANCH_TIMEZONE_IMMUTABLE',
      'Branch timezone cannot change after the first commercial operation.',
    );
  }
}

export class IdentityPolicyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'IdentityPolicyError';
  }
}
