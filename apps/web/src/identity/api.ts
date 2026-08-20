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

export function currentSession(): SessionTokens | null {
  return session;
}

export function clearSession(): void {
  session = null;
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
  readonly password: string;
  readonly passwordConfirmation: string;
  readonly phone?: string | null;
}): Promise<void> {
  await request('/api/v1/identity/registrations', {
    body: JSON.stringify(input),
    headers: { 'idempotency-key': crypto.randomUUID() },
    method: 'POST',
  });
}

export async function login(input: {
  readonly email: string;
  readonly password: string;
}): Promise<void> {
  session = await request<SessionTokens>('/api/v1/identity/sessions', {
    body: JSON.stringify(input),
    method: 'POST',
  });
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
  if (session === null)
    throw new ApiError('AUTHENTICATION_REQUIRED', 'Inicia sesión para continuar.');
  await authorizedRequest('/api/v1/account/email-changes', {
    body: JSON.stringify({ email, refreshToken: session.refreshToken }),
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
  clearSession();
}

export async function logout(): Promise<void> {
  await authorizedRequest('/api/v1/identity/session', { method: 'DELETE' });
  clearSession();
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
  clearSession();
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
  if (session === null)
    throw new ApiError('AUTHENTICATION_REQUIRED', 'Inicia sesión para continuar.');
  return request<Value>(path, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${session.accessToken}` },
  });
}

async function request<Value = void>(path: string, init: RequestInit = {}): Promise<Value> {
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
  if (response.status === 204) return undefined as Value;
  return (await response.json()) as Value;
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
