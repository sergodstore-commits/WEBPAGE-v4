import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  createClient: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: supabase.createClient }));

import { clearEmailCallbackSession, readEmailCallbackAccessToken } from './supabase-browser.js';

describe('Supabase implicit email callbacks', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.example.test');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key');
    supabase.createClient.mockReset();
    supabase.setSession.mockReset();
    supabase.signOut.mockReset();
    supabase.signOut.mockResolvedValue({ error: null });
    supabase.createClient.mockReturnValue({
      auth: { setSession: supabase.setSession, signOut: supabase.signOut },
    } as unknown as SupabaseClient);
  });

  afterEach(async () => {
    await clearEmailCallbackSession();
    vi.unstubAllEnvs();
  });

  it('establishes the implicit session explicitly and returns its validated access token', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback/confirm?locale=es#access_token=raw-access&refresh_token=raw-refresh&type=signup&expires_in=3600',
    );
    supabase.setSession.mockResolvedValue({
      data: { session: { access_token: 'validated-access' } },
      error: null,
    });

    await expect(readEmailCallbackAccessToken()).resolves.toBe('validated-access');
    expect(supabase.createClient).toHaveBeenCalledWith(
      'https://project.example.test',
      'publishable-test-key',
      { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } },
    );
    expect(supabase.setSession).toHaveBeenCalledWith({
      access_token: 'raw-access',
      refresh_token: 'raw-refresh',
    });
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/auth/callback/confirm?locale=es',
    );

    await clearEmailCallbackSession();
    expect(supabase.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('reports an expired callback and removes its sensitive URL parameters', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback/confirm?error_code=otp_expired&error_description=Email%20link%20is%20expired#access_token=discarded',
    );

    await expect(readEmailCallbackAccessToken()).rejects.toThrow(
      'El enlace de correo expiró. Solicita uno nuevo.',
    );
    expect(supabase.createClient).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/auth/callback/confirm',
    );
  });

  it('rejects a callback that does not contain both required credentials', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback/confirm#access_token=incomplete&type=signup',
    );

    await expect(readEmailCallbackAccessToken()).rejects.toThrow(
      'El enlace de correo no contiene credenciales válidas. Solicita uno nuevo.',
    );
    expect(supabase.setSession).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('');
  });

  it('reports a safe validation error when Supabase cannot process the session', async () => {
    window.history.replaceState(
      {},
      '',
      '/auth/callback/confirm#access_token=access&refresh_token=refresh&type=signup',
    );
    supabase.setSession.mockRejectedValue(new Error('network detail'));

    await expect(readEmailCallbackAccessToken()).rejects.toThrow(
      'No fue posible validar el enlace de correo. Inténtalo nuevamente.',
    );
    expect(window.location.hash).toBe('');
  });

  it.each([
    ['/auth/callback/recovery', 'recovery'],
    ['/auth/callback/email-change', 'email_change'],
  ])('uses the same explicit session flow for %s without persisting it', async (path, type) => {
    window.history.replaceState(
      {},
      '',
      `${path}#access_token=${type}-access&refresh_token=${type}-refresh&type=${type}`,
    );
    supabase.setSession.mockResolvedValue({
      data: { session: { access_token: `${type}-validated` } },
      error: null,
    });

    await expect(readEmailCallbackAccessToken()).resolves.toBe(`${type}-validated`);
    expect(window.location.pathname).toBe(path);
    expect(window.location.hash).toBe('');
    await clearEmailCallbackSession();
    expect(supabase.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
