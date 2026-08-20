import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const sensitiveCallbackParameters = [
  'access_token',
  'code',
  'error',
  'error_code',
  'error_description',
  'expires_at',
  'expires_in',
  'provider_refresh_token',
  'provider_token',
  'refresh_token',
  'token_hash',
  'token_type',
  'type',
] as const;

let callbackClient: SupabaseClient | null = null;

export async function readEmailCallbackAccessToken(): Promise<string> {
  const callback = readCallbackParameters();
  clearSensitiveCallbackUrl();

  const callbackError = callback.get('error_code') ?? callback.get('error');
  const callbackErrorDescription = callback.get('error_description');
  if (isExpired(callbackError, callbackErrorDescription)) {
    throw new Error('El enlace de correo expiró. Solicita uno nuevo.');
  }
  if (callbackError !== null || callbackErrorDescription !== null) {
    throw new Error('El enlace de correo no es válido. Solicita uno nuevo.');
  }

  const accessToken = callback.get('access_token');
  const refreshToken = callback.get('refresh_token');
  if (!accessToken || !refreshToken) {
    throw new Error('El enlace de correo no contiene credenciales válidas. Solicita uno nuevo.');
  }

  if (callbackClient !== null) await clearEmailCallbackSession();
  const temporaryClient = browserClient();
  let sessionResult: Awaited<ReturnType<SupabaseClient['auth']['setSession']>>;
  try {
    sessionResult = await temporaryClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch {
    throw new Error('No fue posible validar el enlace de correo. Inténtalo nuevamente.');
  }
  const { data, error } = sessionResult;
  if (error !== null || data.session === null) {
    if (isExpired(error?.code, error?.message)) {
      throw new Error('El enlace de correo expiró. Solicita uno nuevo.');
    }
    throw new Error('El enlace de correo no es válido o ya expiró. Solicita uno nuevo.');
  }

  callbackClient = temporaryClient;
  return data.session.access_token;
}

export async function clearEmailCallbackSession(): Promise<void> {
  const temporaryClient = callbackClient;
  callbackClient = null;
  clearSensitiveCallbackUrl();
  if (temporaryClient === null) return;

  const { error } = await temporaryClient.auth.signOut({ scope: 'local' });
  if (error !== null) {
    throw new Error('No fue posible cerrar de forma segura la sesión temporal del enlace.');
  }
}

function browserClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('La configuración pública de devolución de correo no está disponible.');
  }
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

function clearSensitiveCallbackUrl(): void {
  const url = new URL(window.location.href);
  for (const parameter of sensitiveCallbackParameters) url.searchParams.delete(parameter);
  url.hash = '';
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
}

function isExpired(code: string | null | undefined, description: string | null | undefined) {
  return `${code ?? ''} ${description ?? ''}`.toLowerCase().includes('expir');
}

function readCallbackParameters(): URLSearchParams {
  const url = new URL(window.location.href);
  const parameters = new URLSearchParams(url.search);
  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  for (const [key, value] of fragment) parameters.set(key, value);
  return parameters;
}
