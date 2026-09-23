import { FixedClock } from '@sergod/foundation';
import { describe, expect, it, vi } from 'vitest';

import { IdentityAccessService } from '../../src/contexts/identity-access/application/identity-access-service.js';
import type {
  IdentityAccessRepository,
  IdentityProvider,
} from '../../src/contexts/identity-access/application/ports.js';

const providerIdentity = {
  email: 'client@example.test',
  emailVerified: true,
  providerUserId: '0198a8be-6677-7000-8000-000000000010',
} as const;
const providerSession = {
  accessToken: 'access-token',
  authSessionId: '0198a8be-6677-7000-8000-000000000011',
  expiresAt: 1_800_000_000,
  providerUserId: providerIdentity.providerUserId,
  refreshToken: 'refresh-token',
} as const;
const account = {
  accountId: '0198a8be-6677-7000-8000-000000000012',
  currentEmail: providerIdentity.email,
  currentPhone: null,
  emailVerificationStatus: 'VERIFIED',
  role: 'CLIENTE',
  status: 'ACTIVE',
} as const;

function doubles() {
  const provider: IdentityProvider = {
    createRegistrationIdentity: vi.fn(async () => providerIdentity),
    deleteUnlinkedIdentity: vi.fn(async () => undefined),
    getIdentity: vi.fn(async () => providerIdentity),
    invalidateSession: vi.fn(async () => undefined),
    invalidateUserSessions: vi.fn(async () => undefined),
    login: vi.fn(async () => providerSession),
    requestEmailChange: vi.fn(async () => undefined),
    requestPasswordRecovery: vi.fn(async () => undefined),
    resendEmailVerification: vi.fn(async () => undefined),
    updatePassword: vi.fn(async () => undefined),
    validateAccessToken: vi.fn(async () => ({
      authSessionId: providerSession.authSessionId,
      providerUserId: providerIdentity.providerUserId,
    })),
    validateEmailCallback: vi.fn(async () => providerIdentity),
  };
  const repository: IdentityAccessRepository = {
    cancelContactChange: vi.fn(async () => undefined),
    claimExternalIdentityReconciliations: vi.fn(async () => []),
    createExternalIdentityReconciliation: vi.fn(async () => undefined),
    failExternalIdentityReconciliation: vi.fn(async () => undefined),
    findAccountByProviderUserId: vi.fn(async () => account),
    findAuthorizationEvidence: vi.fn(async () => null),
    invalidateApplicationSession: vi.fn(async () => undefined),
    invalidateApplicationSessions: vi.fn(async () => undefined),
    markEmailVerified: vi.fn(async () => 'REGISTRATION_CONFIRMED' as const),
    provisionFirstAdmin: vi.fn(async () => ({ accountId: account.accountId, replayed: false })),
    recordApplicationSession: vi.fn(async () => undefined),
    recordBootstrapFailure: vi.fn(async () => undefined),
    registerClient: vi.fn(async () => ({ accountId: account.accountId, replayed: false })),
    requireAuthorization: vi.fn(async () => ({ account })),
    reserveContactChange: vi.fn(async () => 'contact-change-id'),
    resolveExternalIdentityReconciliation: vi.fn(async () => undefined),
    updateOptionalPhone: vi.fn(async () => undefined),
    getTournamentIdentifiers: vi.fn(async () => ({ konamiId: null, kluCode: null })),
    updateTournamentIdentifiers: vi.fn(async () => ({ konamiId: null, kluCode: null })),
  };
  return { provider, repository };
}

function service(doublesValue = doubles()) {
  return {
    ...doublesValue,
    service: new IdentityAccessService(
      doublesValue.repository,
      doublesValue.provider,
      new FixedClock(new Date('2026-07-31T12:00:00.000Z')),
      { configured: false, challenge: () => Promise.reject(new Error('disabled')) },
    ),
  };
}

function registration(phone: string | null = null) {
  return {
    acceptedLegalVersionIds: ['0198a8be-6677-7000-8000-000000000020'],
    context: {
      actorType: 'SYSTEM' as const,
      correlationId: '0198a8be-6677-7000-8000-000000000021',
    },
    email: providerIdentity.email,
    emailRedirectTo: 'http://localhost:5173/auth/callback/confirm',
    evidence: {
      captureChannel: 'WEB_REGISTRATION',
      ipPrefixHash: 'hash-ip',
      sessionId: 'browser-session',
      userAgentHash: 'hash-agent',
    },
    idempotencyKey: 'registration-1',
    password: 'correct-password',
    passwordConfirmation: 'correct-password',
    phone,
  };
}

describe('IdentityAccess application flows', () => {
  it('bootstraps the first Admin with verified email and no phone requirement', async () => {
    const subject = service();
    await subject.service.provisionFirstAdmin({
      authProviderUserId: providerIdentity.providerUserId,
      commandVersion: '1',
      context: {
        actorType: 'SYSTEM',
        correlationId: '0198a8be-6677-7000-8000-000000000021',
      },
      deploymentId: 'deployment-1',
      environmentIdentifier: 'test',
      executionSource: 'DEPLOYMENT_COMMAND',
      idempotencyKey: 'bootstrap-1',
    });
    expect(subject.repository.provisionFirstAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ identity: providerIdentity }),
    );
  });

  it('creates only EMAIL_PASSWORD ApplicationSessions after verified email login', async () => {
    const subject = service();
    await expect(
      subject.service.login({ email: providerIdentity.email, password: 'correct-password' }),
    ).resolves.toEqual(providerSession);
    expect(subject.repository.recordApplicationSession).toHaveBeenCalledWith({
      accountId: account.accountId,
      authSessionId: providerSession.authSessionId,
      channel: 'EMAIL_PASSWORD',
      now: new Date('2026-07-31T12:00:00.000Z'),
    });
  });

  it('creates no ApplicationSession while email remains pending', async () => {
    const subject = service();
    vi.mocked(subject.repository.findAccountByProviderUserId).mockResolvedValue({
      ...account,
      emailVerificationStatus: 'PENDING',
    });
    await expect(
      subject.service.login({ email: account.currentEmail, password: 'correct-password' }),
    ).rejects.toThrow('Email is not verified');
    expect(subject.repository.recordApplicationSession).not.toHaveBeenCalled();
  });

  it('registers without phone and sends the approved email callback to Supabase', async () => {
    const subject = service();
    await subject.service.registerClient(registration());
    expect(subject.provider.createRegistrationIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        email: providerIdentity.email,
        emailRedirectTo: 'http://localhost:5173/auth/callback/confirm',
      }),
    );
    expect(subject.repository.registerClient).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null }),
    );
  });

  it('compensates an external identity when the local legal transaction fails', async () => {
    const subject = service();
    vi.mocked(subject.repository.registerClient).mockRejectedValue(new Error('LEGAL_SET_CHANGED'));
    await expect(subject.service.registerClient(registration('+56911111111'))).rejects.toThrow(
      'LEGAL_SET_CHANGED',
    );
    expect(subject.provider.deleteUnlinkedIdentity).toHaveBeenCalledWith(
      providerIdentity.providerUserId,
    );
  });

  it('confirms email through a trusted callback without creating an ApplicationSession', async () => {
    const subject = service();
    await subject.service.completeEmailCallback({
      accessToken: providerSession.accessToken,
      context: { actorType: 'SYSTEM', correlationId: '0198a8be-6677-7000-8000-000000000021' },
    });
    expect(subject.repository.markEmailVerified).toHaveBeenCalled();
    expect(subject.repository.recordApplicationSession).not.toHaveBeenCalled();
  });

  it('changes the internal account from PENDING to VERIFIED before allowing login', async () => {
    const subject = service();
    let verificationStatus: 'PENDING' | 'VERIFIED' = 'PENDING';
    vi.mocked(subject.repository.findAccountByProviderUserId).mockImplementation(async () => ({
      ...account,
      emailVerificationStatus: verificationStatus,
    }));
    vi.mocked(subject.repository.markEmailVerified).mockImplementation(async () => {
      verificationStatus = 'VERIFIED';
      return 'REGISTRATION_CONFIRMED';
    });

    await expect(
      subject.service.login({ email: account.currentEmail, password: 'correct-password' }),
    ).rejects.toThrow('Email is not verified');

    await expect(
      subject.service.completeEmailCallback({
        accessToken: providerSession.accessToken,
        context: { actorType: 'SYSTEM', correlationId: '0198a8be-6677-7000-8000-000000000021' },
      }),
    ).resolves.toBe('REGISTRATION_CONFIRMED');
    expect(verificationStatus).toBe('VERIFIED');

    await expect(
      subject.service.login({ email: account.currentEmail, password: 'correct-password' }),
    ).resolves.toEqual(providerSession);
    expect(subject.repository.recordApplicationSession).toHaveBeenCalledTimes(1);
  });

  it('reserves a safe email change before asking Supabase to send confirmation', async () => {
    const subject = service();
    await subject.service.requestEmailChange({
      accessToken: providerSession.accessToken,
      context: {
        actorType: 'USER',
        correlationId: '0198a8be-6677-7000-8000-000000000021',
      },
      emailRedirectTo: 'http://localhost:5173/auth/callback/email-change',
      expiresAt: new Date('2026-08-01T12:00:00.000Z'),
      newEmail: 'new@example.test',
      refreshToken: providerSession.refreshToken,
    });
    expect(subject.repository.reserveContactChange).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: 'new@example.test' }),
    );
    expect(subject.provider.requestEmailChange).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.test' }),
    );
  });

  it('updates optional phone locally without calling Supabase Auth', async () => {
    const subject = service();
    await subject.service.updateOptionalPhone({
      accessToken: providerSession.accessToken,
      context: {
        actorType: 'USER',
        correlationId: '0198a8be-6677-7000-8000-000000000021',
      },
      phone: '+56911111111',
    });
    expect(subject.repository.updateOptionalPhone).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+56911111111' }),
    );
    expect(subject.provider.requestEmailChange).not.toHaveBeenCalled();
  });

  it('recovery changes the password, invalidates all sessions and returns no session', async () => {
    const subject = service();
    await expect(
      subject.service.completePasswordRecovery({
        accessToken: providerSession.accessToken,
        newPassword: 'new-password',
        newPasswordConfirmation: 'new-password',
      }),
    ).resolves.toBeUndefined();
    expect(subject.provider.invalidateUserSessions).toHaveBeenCalledWith(
      providerSession.accessToken,
    );
    expect(subject.repository.invalidateApplicationSessions).toHaveBeenCalledWith({
      accountId: account.accountId,
      reason: 'PASSWORD_RECOVERY',
    });
    expect(subject.repository.recordApplicationSession).not.toHaveBeenCalled();
  });
});
