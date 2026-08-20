import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => {
  const auth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    refreshSession: vi.fn(),
    setSession: vi.fn(),
    signOut: vi.fn(),
  };
  return {
    auth,
    authListener: { current: null as null | ((event: string, value: unknown) => void) },
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ auth: supabase.auth })),
}));

import {
  authorizedRequest,
  clearSession,
  currentSession,
  initializeSession,
  login,
  subscribeSession,
} from './api.js';

function providerSession(accessToken: string, refreshToken: string, expiresAt = 1_900_000_000) {
  return {
    access_token: accessToken,
    expires_at: expiresAt,
    expires_in: 3600,
    refresh_token: refreshToken,
    token_type: 'bearer',
    user: { id: '0198a8be-6677-7000-8000-000000000010' },
  };
}

describe('browser session lifecycle', () => {
  beforeEach(async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-key');
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    supabase.auth.onAuthStateChange.mockImplementation(
      (listener: (event: string, value: unknown) => void) => {
        supabase.authListener.current = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    );
    supabase.auth.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
    supabase.auth.setSession.mockResolvedValue({ data: { session: null }, error: null });
    supabase.auth.signOut.mockResolvedValue({ error: null });
    await clearSession();
    vi.clearAllMocks();
  });

  it('restores a persisted Supabase session before the app starts', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: providerSession('restored-access', 'restored-refresh') },
      error: null,
    });

    await initializeSession();

    expect(currentSession()).toEqual({
      accessToken: 'restored-access',
      expiresAt: 1_900_000_000,
      refreshToken: 'restored-refresh',
    });
  });

  it('persists the tokens returned by the API after password login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            accessToken: 'api-access',
            expiresAt: 1_900_000_000,
            refreshToken: 'api-refresh',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      ),
    );
    supabase.auth.setSession.mockResolvedValue({
      data: { session: providerSession('stored-access', 'stored-refresh') },
      error: null,
    });

    await login({ email: 'cliente@example.test', password: 'correct horse battery staple' });

    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'api-access',
      refresh_token: 'api-refresh',
    });
    expect(currentSession()?.accessToken).toBe('stored-access');
  });

  it('uses the restored access token for protected API requests', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: providerSession('restored-access', 'restored-refresh') },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(authorizedRequest('/api/v1/account')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/account',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer restored-access' }),
      }),
    );
  });

  it('refreshes once and retries when the API rejects an expired access token', async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: providerSession('expired-access', 'current-refresh') },
      error: null,
    });
    supabase.auth.refreshSession.mockResolvedValue({
      data: { session: providerSession('fresh-access', 'fresh-refresh') },
      error: null,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'PROVIDER_TOKEN_INVALID', message: 'Expired.' } }),
          { headers: { 'content-type': 'application/json' }, status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(authorizedRequest('/api/v1/account')).resolves.toEqual({ ok: true });

    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer fresh-access' }),
      }),
    );
  });

  it('notifies the interface when Supabase refreshes or closes the session', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSession(listener);

    supabase.authListener.current?.(
      'TOKEN_REFRESHED',
      providerSession('fresh-access', 'fresh-refresh'),
    );
    supabase.authListener.current?.('SIGNED_OUT', null);

    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ accessToken: 'fresh-access' }),
    );
    expect(listener).toHaveBeenNthCalledWith(2, null);
    unsubscribe();
  });
});
