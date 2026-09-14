import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

export interface SessionTokens {
  readonly accessToken: string;
  readonly expiresAt: number | null;
  readonly refreshToken: string;
}

export interface LegalVersion {
  readonly contentLocation: string;
  readonly documentId: string;
  readonly publicTitle: string;
  readonly title: string;
  readonly versionId: string;
  readonly versionLabel: string;
}

export interface AccountView {
  readonly accountId: string;
  readonly currentEmail: string;
  readonly currentPhone: string | null;
  readonly emailVerificationStatus: 'PENDING' | 'VERIFIED';
  readonly role: 'ADMIN' | 'CLIENTE';
  readonly status: 'ACTIVE' | 'DEACTIVATED';
}

let session: SessionTokens | null = null;
let sessionClient: SupabaseClient | null | undefined;
const sessionListeners = new Set<(value: SessionTokens | null) => void>();

export function currentSession(): SessionTokens | null {
  return session;
}

export function subscribeSession(listener: (value: SessionTokens | null) => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export async function initializeSession(): Promise<void> {
  const client = configuredSessionClient();
  if (client === null) {
    updateSession(null);
    return;
  }
  const { data, error } = await client.auth.getSession();
  if (error !== null) {
    updateSession(null);
    return;
  }
  updateSession(mapSession(data.session));
}

export async function clearSession(): Promise<void> {
  const client = configuredSessionClient();
  if (client === null) {
    updateSession(null);
    return;
  }
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error !== null) {
    throw new ApiError(
      'SESSION_CLEAR_FAILED',
      'No fue posible borrar de forma segura la sesión de este navegador.',
    );
  }
  updateSession(null);
}

export async function legalVersions(): Promise<readonly LegalVersion[]> {
  const result = await request<{ documents: LegalVersion[] }>(
    '/api/v1/identity/registration/legal-documents',
  );
  return result.documents;
}

export async function register(input: {
  readonly acceptedLegalVersionIds: readonly string[];
  readonly email: string;
  readonly idempotencyKey: string;
  readonly password: string;
  readonly passwordConfirmation: string;
  readonly phone?: string | null;
}): Promise<void> {
  const { idempotencyKey, ...registration } = input;
  await request('/api/v1/identity/registrations', {
    body: JSON.stringify(registration),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  });
}

export async function login(input: {
  readonly email: string;
  readonly password: string;
}): Promise<void> {
  const client = requiredSessionClient();
  const created = await request<SessionTokens>('/api/v1/identity/sessions', {
    body: JSON.stringify(input),
    method: 'POST',
  });
  let result: Awaited<ReturnType<typeof client.auth.setSession>>;
  try {
    result = await client.auth.setSession({
      access_token: created.accessToken,
      refresh_token: created.refreshToken,
    });
  } catch (error) {
    await discardUnpersistedSession(client, created.accessToken);
    throw sessionPersistenceError(providerErrorReference(error));
  }
  const { data, error } = result;
  if (error !== null || data.session === null) {
    await discardUnpersistedSession(client, created.accessToken);
    throw sessionPersistenceError(providerErrorReference(error));
  }
  updateSession(mapSession(data.session));
}

async function discardUnpersistedSession(
  client: SupabaseClient,
  accessToken: string,
): Promise<void> {
  await request('/api/v1/identity/session', {
    headers: { authorization: `Bearer ${accessToken}` },
    method: 'DELETE',
  }).catch(() => undefined);
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  updateSession(null);
}

function providerErrorReference(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'SESSION_NOT_RETURNED';
  if ('code' in error && typeof error.code === 'string' && error.code !== '') return error.code;
  if ('name' in error && typeof error.name === 'string' && error.name !== '') return error.name;
  return 'SESSION_NOT_RETURNED';
}

function sessionPersistenceError(reference: string): ApiError {
  return new ApiError(
    'SESSION_PERSISTENCE_FAILED',
    `La sesión fue validada, pero no pudo guardarse de forma segura. Referencia: ${reference}.`,
  );
}

export async function completeEmailCallback(
  accessToken: string,
): Promise<'EMAIL_CHANGE_CONFIRMED' | 'EMAIL_CHANGE_PENDING' | 'REGISTRATION_CONFIRMED'> {
  return (
    await request<{
      status: 'EMAIL_CHANGE_CONFIRMED' | 'EMAIL_CHANGE_PENDING' | 'REGISTRATION_CONFIRMED';
    }>('/api/v1/identity/email-callbacks', {
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'POST',
    })
  ).status;
}

export async function resendEmailVerification(email: string): Promise<void> {
  await request('/api/v1/identity/verification-requests', {
    body: JSON.stringify({ email }),
    method: 'POST',
  });
}

export async function requestEmailChange(email: string): Promise<void> {
  const active = await activeSession();
  await authorizedRequest('/api/v1/account/email-changes', {
    body: JSON.stringify({ email, refreshToken: active.refreshToken }),
    method: 'POST',
  });
}

export async function updatePhone(phone: string | null): Promise<void> {
  await authorizedRequest('/api/v1/account/phone', {
    body: JSON.stringify({ phone }),
    method: 'PUT',
  });
}

export async function changePassword(input: {
  readonly newPassword: string;
  readonly newPasswordConfirmation: string;
}): Promise<void> {
  await authorizedRequest('/api/v1/account/password', {
    body: JSON.stringify(input),
    method: 'POST',
  });
  await clearSession();
}

export async function logout(): Promise<void> {
  await authorizedRequest('/api/v1/identity/session', { method: 'DELETE' });
  await clearSession();
}

export async function requestRecovery(email: string): Promise<void> {
  await request('/api/v1/identity/recovery-requests', {
    body: JSON.stringify({ email }),
    method: 'POST',
  });
}

export async function completeRecovery(
  accessToken: string,
  input: { readonly newPassword: string; readonly newPasswordConfirmation: string },
): Promise<void> {
  await request('/api/v1/identity/recoveries', {
    body: JSON.stringify(input),
    headers: { authorization: `Bearer ${accessToken}` },
    method: 'POST',
  });
  await clearSession();
}

export async function ownAccount(): Promise<AccountView> {
  return (await authorizedRequest<{ account: AccountView }>('/api/v1/account')).account;
}

export async function accounts(): Promise<readonly AccountView[]> {
  return (await authorizedRequest<{ accounts: AccountView[] }>('/api/v1/admin/accounts')).accounts;
}

export async function changeAccountState(
  accountId: string,
  action: 'deactivate' | 'reactivate',
  reason: string,
): Promise<void> {
  await authorizedRequest(`/api/v1/admin/accounts/${accountId}/${action}`, {
    body: JSON.stringify({ reason }),
    method: 'POST',
  });
}

export async function promoteAccount(accountId: string, reason: string): Promise<void> {
  await authorizedRequest(`/api/v1/admin/accounts/${accountId}/promote`, {
    body: JSON.stringify({ reason }),
    method: 'POST',
  });
}

export async function authorizedRequest<Value>(
  path: string,
  init: RequestInit = {},
): Promise<Value> {
  return (await authorizedResponse<Value>(path, init)).body;
}

export async function authorizedBlob(path: string): Promise<Blob> {
  const active = await activeSession();
  try {
    return await authorizedBlobOnce(path, active);
  } catch (error) {
    if (!(error instanceof ApiError) || !refreshableAuthenticationError(error.code)) throw error;
    return authorizedBlobOnce(path, await refreshSession());
  }
}

async function authorizedBlobOnce(path: string, active: SessionTokens): Promise<Blob> {
  const response = await fetch(path, {
    headers: { authorization: `Bearer ${active.accessToken}` },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? 'No fue posible cargar la imagen.',
    );
  }
  return response.blob();
}

export interface AuthorizedResponse<Value> {
  readonly body: Value;
  readonly headers: Headers;
  readonly status: number;
}

export async function authorizedResponse<Value>(
  path: string,
  init: RequestInit = {},
): Promise<AuthorizedResponse<Value>> {
  const active = await activeSession();
  try {
    return await authorizedResponseOnce<Value>(path, init, active);
  } catch (error) {
    if (!(error instanceof ApiError) || !refreshableAuthenticationError(error.code)) throw error;
    const refreshed = await refreshSession();
    return authorizedResponseOnce<Value>(path, init, refreshed);
  }
}

async function authorizedResponseOnce<Value>(
  path: string,
  init: RequestInit,
  active: SessionTokens,
): Promise<AuthorizedResponse<Value>> {
  return requestResponse<Value>(path, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${active.accessToken}` },
  });
}

async function activeSession(): Promise<SessionTokens> {
  const client = requiredSessionClient();
  const { data, error } = await client.auth.getSession();
  if (error !== null) {
    throw new ApiError(
      'IDENTITY_PROVIDER_UNAVAILABLE',
      'No fue posible comprobar tu sesión. Inténtalo nuevamente.',
    );
  }
  const active = mapSession(data.session);
  updateSession(active);
  if (active === null) {
    throw new ApiError('AUTHENTICATION_REQUIRED', 'Inicia sesión para continuar.');
  }
  return active;
}

async function refreshSession(): Promise<SessionTokens> {
  const client = requiredSessionClient();
  const { data, error } = await client.auth.refreshSession();
  if (error !== null) {
    throw new ApiError(
      'IDENTITY_PROVIDER_UNAVAILABLE',
      'No fue posible renovar tu sesión. Inténtalo nuevamente.',
    );
  }
  const refreshed = mapSession(data.session);
  updateSession(refreshed);
  if (refreshed === null) {
    throw new ApiError('AUTHENTICATION_REQUIRED', 'Tu sesión terminó. Ingresa nuevamente.');
  }
  return refreshed;
}

function configuredSessionClient(): SupabaseClient | null {
  if (sessionClient !== undefined) return sessionClient;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    sessionClient = null;
    return sessionClient;
  }
  sessionClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storageKey: 'sergod-store-auth-v2',
    },
  });
  sessionClient.auth.onAuthStateChange((event, value) => {
    if (event === 'SIGNED_OUT') {
      updateSession(null);
    } else if (value !== null) {
      updateSession(mapSession(value));
    }
  });
  return sessionClient;
}

function requiredSessionClient(): SupabaseClient {
  const client = configuredSessionClient();
  if (client === null) {
    throw new ApiError(
      'AUTH_CONFIGURATION_MISSING',
      'La configuración pública de autenticación no está disponible.',
    );
  }
  return client;
}

function mapSession(value: Session | null): SessionTokens | null {
  if (value === null) return null;
  return {
    accessToken: value.access_token,
    expiresAt: value.expires_at ?? null,
    refreshToken: value.refresh_token,
  };
}

function updateSession(value: SessionTokens | null): void {
  if (
    session?.accessToken === value?.accessToken &&
    session?.expiresAt === value?.expiresAt &&
    session?.refreshToken === value?.refreshToken
  ) {
    return;
  }
  session = value;
  for (const listener of sessionListeners) listener(value);
}

function refreshableAuthenticationError(code: string): boolean {
  return code === 'AUTHENTICATION_REQUIRED' || code === 'PROVIDER_TOKEN_INVALID';
}

async function request<Value = void>(path: string, init: RequestInit = {}): Promise<Value> {
  return (await requestResponse<Value>(path, init)).body;
}

async function requestResponse<Value = void>(
  path: string,
  init: RequestInit = {},
): Promise<AuthorizedResponse<Value>> {
  const contentHeaders =
    init.body instanceof FormData ? {} : { 'content-type': 'application/json' };
  const response = await fetch(path, {
    ...init,
    headers: { ...contentHeaders, ...init.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? 'No fue posible completar la solicitud.',
    );
  }
  const body = response.status === 204 ? (undefined as Value) : ((await response.json()) as Value);
  return { body, headers: response.headers, status: response.status };
}

export function publicRequest<Value>(path: string, init: RequestInit = {}): Promise<Value> {
  return request<Value>(path, init);
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
