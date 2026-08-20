import { describe, expect, it } from 'vitest';

import { isAuthorized } from './authorization.js';
import {
  assertBranchTimezoneChangeAllowed,
  assertLoginAllowed,
  assertPromotionAllowed,
  canProcessAuthenticExternalEffect,
  canUseBuyerCapabilities,
  normalizeEmail,
  normalizePhone,
  type AccountAuthorizationProjection,
} from './identity.js';

const verifiedClient: AccountAuthorizationProjection = {
  accountId: 'account-1',
  emailVerificationStatus: 'VERIFIED',
  role: 'CLIENTE',
  status: 'ACTIVE',
};

describe('IdentityAccess domain policies', () => {
  it('normalizes email and validates an optional E.164 profile phone', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com');
    expect(normalizePhone('+56911111111')).toBe('+56911111111');
    expect(() => normalizePhone('091111111')).toThrow('E.164');
  });

  it('requires verified email for every login', () => {
    expect(() => assertLoginAllowed(verifiedClient)).not.toThrow();
    expect(() =>
      assertLoginAllowed({ ...verifiedClient, emailVerificationStatus: 'PENDING' }),
    ).toThrow('Email is not verified');
  });

  it('allows active verified Clients to be promoted without phone evidence', () => {
    expect(() => assertPromotionAllowed(verifiedClient)).not.toThrow();
    expect(() =>
      assertPromotionAllowed({ ...verifiedClient, emailVerificationStatus: 'PENDING' }),
    ).toThrow('verified email');
  });

  it('requires verified email for buyer capabilities', () => {
    expect(canUseBuyerCapabilities(verifiedClient)).toBe(true);
    expect(canUseBuyerCapabilities({ ...verifiedClient, emailVerificationStatus: 'PENDING' })).toBe(
      false,
    );
  });

  it('requires a current email ApplicationSession for Admin capabilities', () => {
    const admin = { ...verifiedClient, role: 'ADMIN' as const };
    expect(
      isAuthorized(
        {
          account: admin,
          applicationSession: { invalidated: false, loginChannel: 'EMAIL_PASSWORD' },
        },
        { kind: 'ADMIN' },
      ),
    ).toBe(true);
    expect(
      isAuthorized(
        {
          account: admin,
          applicationSession: { invalidated: true, loginChannel: 'PHONE_PASSWORD' },
        },
        { kind: 'ADMIN' },
      ),
    ).toBe(false);
  });

  it('blocks private actions after deactivation while preserving authentic external effects', () => {
    const deactivated = { ...verifiedClient, status: 'DEACTIVATED' as const };
    expect(canUseBuyerCapabilities(deactivated)).toBe(false);
    expect(
      canProcessAuthenticExternalEffect({ authentic: true, originatedWhileAccountActive: true }),
    ).toBe(true);
  });

  it('makes Branch timezone immutable after the first commercial operation', () => {
    expect(() =>
      assertBranchTimezoneChangeAllowed({
        currentTimezone: 'America/Santiago',
        hasCommercialOperations: true,
        requestedTimezone: 'UTC',
      }),
    ).toThrow('cannot change');
  });
});
