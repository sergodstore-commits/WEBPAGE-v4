import { afterEach, describe, expect, it, vi } from 'vitest';

import { SupabaseIdentityProvider } from '../../src/contexts/identity-access/infrastructure/supabase-identity-provider.js';

const providerUserId = '0198a8be-6677-7000-8000-000000000010';
const sessionId = '0198a8be-6677-7000-8000-000000000011';
const accessToken = jwt({ session_id: sessionId, sub: providerUserId });
const user = {
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2026-07-31T12:00:00.000Z',
  email: 'client@example.test',
  email_confirmed_at: '2026-07-31T12:00:00.000Z',
  id: providerUserId,
  role: 'authenticated',
  updated_at: '2026-07-31T12:00:00.000Z',
  user_metadata: {},
};

afterEach(() => vi.unstubAllGlobals());

describe('Supabase Auth SDK contract', () => {
  it('maps a password login to trusted session evidence and uses only the publishable key', async () => {
    const requests: { headers: Headers; url: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({ headers: new Headers(init?.headers), url: String(input) });
        return Response.json({
          access_token: accessToken,
          expires_at: 1_800_000_000,
          expires_in: 3600,
          refresh_token: 'fixture-refresh-token',
          token_type: 'bearer',
          user,
        });
      }),
    );
    const provider = new SupabaseIdentityProvider(
      'https://project.supabase.test',
      'fixture-publishable-key',
      'fixture-secret-key',
    );
    const session = await provider.login({
      email: 'client@example.test',
      password: 'fixture-password',
    });
    expect(session).toMatchObject({ authSessionId: sessionId, providerUserId });
    expect(requests[0]?.url).toContain('/auth/v1/token?grant_type=password');
    expect(requests[0]?.headers.get('apikey')).toBe('fixture-publishable-key');
    expect(requests[0]?.headers.get('apikey')).not.toBe('fixture-secret-key');
  });

  it('validates the access token through Supabase getUser before trusting session_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ user })),
    );
    const provider = new SupabaseIdentityProvider(
      'https://project.supabase.test',
      'fixture-publishable-key',
      'fixture-secret-key',
    );
    await expect(provider.validateAccessToken(accessToken)).resolves.toEqual({
      authSessionId: sessionId,
      providerUserId,
    });
  });

  it.each([
    ['expired token', 401, 'session_expired'],
    ['malformed token', 401, 'bad_jwt'],
    ['missing session', 403, 'session_not_found'],
    ['missing user', 404, 'user_not_found'],
  ])('classifies a non-usable %s as authentication required', async (_case, status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { code, message: 'provider detail must remain private' },
          { headers: { 'x-supabase-api-version': '2024-01-01' }, status },
        ),
      ),
    );
    const provider = createProvider();

    const failure = await provider
      .validateAccessToken(accessToken)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'PROVIDER_TOKEN_INVALID', httpStatus: 401 });
    expect(JSON.stringify(failure)).not.toContain('provider detail must remain private');
  });

  it('classifies a network failure as dependency unavailable without retaining its detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed for https://secret.example.test?token=must-not-leak');
      }),
    );
    const failure = await createProvider()
      .validateAccessToken(accessToken)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'IDENTITY_PROVIDER_UNAVAILABLE', httpStatus: 503 });
    expect(JSON.stringify(failure)).not.toContain('must-not-leak');
    expect(JSON.stringify(failure)).not.toContain('secret.example.test');
  });

  it('classifies a Supabase Auth 5xx response as dependency unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: 503, statusText: 'Service Unavailable' })),
    );

    await expect(createProvider().validateAccessToken(accessToken)).rejects.toMatchObject({
      code: 'IDENTITY_PROVIDER_UNAVAILABLE',
      httpStatus: 503,
    });
  });

  it('rejects an invalid JWT payload even after a successful provider response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ user })),
    );

    await expect(createProvider().validateAccessToken('invalid-token')).rejects.toMatchObject({
      code: 'PROVIDER_TOKEN_INVALID',
      httpStatus: 401,
    });
  });
});

function createProvider(): SupabaseIdentityProvider {
  return new SupabaseIdentityProvider(
    'https://project.supabase.test',
    'fixture-publishable-key',
    'fixture-secret-key',
  );
}

function jwt(payload: Record<string, string>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.fixture-signature`;
}
