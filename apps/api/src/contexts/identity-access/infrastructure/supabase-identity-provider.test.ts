import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn() }));

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>();
  return {
    ...actual,
    createClient: vi.fn(() => ({ auth: { signInWithPassword: mocks.signInWithPassword } })),
  };
});

import { SupabaseIdentityProvider } from './supabase-identity-provider.js';

describe('SupabaseIdentityProvider login errors', () => {
  beforeEach(() => mocks.signInWithPassword.mockReset());

  it.each([
    ['invalid_credentials', 400, 'INVALID_CREDENTIALS', 401],
    ['email_not_confirmed', 400, 'EMAIL_NOT_VERIFIED', 409],
    ['unexpected_failure', 503, 'IDENTITY_PROVIDER_UNAVAILABLE', 503],
  ])(
    'maps %s without reporting every rejection as a gateway failure',
    async (code, status, expectedCode, expectedStatus) => {
      mocks.signInWithPassword.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: {
          __isAuthError: true,
          code,
          message: 'Provider detail must not become a public message.',
          name: 'AuthApiError',
          status,
        },
      });
      const provider = new SupabaseIdentityProvider(
        'https://example.supabase.co',
        'publishable-key',
        'secret-key',
      );

      await expect(
        provider.login({ email: 'client@example.com', password: 'not-logged' }),
      ).rejects.toMatchObject({ code: expectedCode, httpStatus: expectedStatus });
    },
  );
});
