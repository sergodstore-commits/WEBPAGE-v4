import {
  createClient,
  isAuthApiError,
  isAuthError,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';

import type { IdentityProvider, ProviderIdentity, ProviderSession } from '../application/ports.js';
import { IdentityAccessError } from '../application/identity-access-service.js';

const authOptions = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
} as const;

export class SupabaseIdentityProvider implements IdentityProvider {
  readonly #admin: SupabaseClient;
  readonly #public: SupabaseClient;

  constructor(
    private readonly url: string,
    private readonly publishableKey: string,
    secretKey: string,
  ) {
    this.#admin = createClient(url, secretKey, { auth: authOptions });
    this.#public = createClient(url, publishableKey, { auth: authOptions });
  }

  async getIdentity(providerUserId: string): Promise<ProviderIdentity> {
    const { data, error } = await this.#admin.auth.admin.getUserById(providerUserId);
    if (error !== null) throw providerError(error);
    return mapIdentity(data.user);
  }

  async createRegistrationIdentity(input: {
    readonly email: string;
    readonly emailRedirectTo: string;
    readonly idempotencyKeyHash: string;
    readonly password: string;
  }): Promise<ProviderIdentity> {
    const prior = await this.#findRegistrationIdentity(input);
    if (prior !== null) return prior;

    const { data, error } = await this.#public.auth.signUp({
      email: input.email,
      options: {
        data: { sergod_registration_key_hash: input.idempotencyKeyHash },
        emailRedirectTo: input.emailRedirectTo,
      },
      password: input.password,
    });
    if (error !== null || data.user === null) {
      const recovered = await this.#findRegistrationIdentity(input);
      if (recovered !== null) return recovered;
      throw providerError(error ?? new Error('Supabase did not return the created user.'));
    }
    const { data: updated, error: updateError } = await this.#admin.auth.admin.updateUserById(
      data.user.id,
      { app_metadata: { sergod_registration_key_hash: input.idempotencyKeyHash } },
    );
    if (updateError !== null) {
      await this.#admin.auth.admin.deleteUser(data.user.id);
      throw providerError(updateError);
    }
    return mapIdentity(updated.user);
  }

  async deleteUnlinkedIdentity(providerUserId: string): Promise<void> {
    const { error } = await this.#admin.auth.admin.deleteUser(providerUserId);
    if (error !== null) throw providerError(error);
  }

  async login(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<ProviderSession> {
    const { data, error } = await this.#public.auth.signInWithPassword(input);
    if (error !== null) throw providerError(error);
    return mapSession(
      data.session.access_token,
      data.session.refresh_token,
      data.session.expires_at,
      data.user.id,
    );
  }

  async validateAccessToken(accessToken: string): Promise<{
    readonly authSessionId: string;
    readonly providerUserId: string;
  }> {
    let result: Awaited<ReturnType<SupabaseClient['auth']['getUser']>>;
    try {
      result = await this.#admin.auth.getUser(accessToken);
    } catch (error) {
      throw accessTokenValidationError(error);
    }
    const { data, error } = result;
    if (error !== null) throw accessTokenValidationError(error);
    return { authSessionId: readSessionId(accessToken), providerUserId: data.user.id };
  }

  async validateEmailCallback(accessToken: string): Promise<ProviderIdentity> {
    const { data, error } = await this.#admin.auth.getUser(accessToken);
    if (error !== null) throw providerError(error);
    return mapIdentity(data.user);
  }

  async invalidateSession(accessToken: string): Promise<void> {
    const { error } = await this.#admin.auth.admin.signOut(accessToken, 'local');
    if (error !== null) throw providerError(error);
  }

  async invalidateUserSessions(accessToken: string): Promise<void> {
    const { error } = await this.#admin.auth.admin.signOut(accessToken, 'global');
    if (error !== null) throw providerError(error);
  }

  async resendEmailVerification(input: {
    readonly email: string;
    readonly emailRedirectTo: string;
  }): Promise<void> {
    const { error } = await this.#public.auth.resend({
      email: input.email,
      options: { emailRedirectTo: input.emailRedirectTo },
      type: 'signup',
    });
    if (error !== null) throw providerError(error);
  }

  async requestEmailChange(input: {
    readonly accessToken: string;
    readonly email: string;
    readonly emailRedirectTo: string;
    readonly refreshToken: string;
  }): Promise<void> {
    const client = createClient(this.url, this.publishableKey, { auth: authOptions });
    const { error: sessionError } = await client.auth.setSession({
      access_token: input.accessToken,
      refresh_token: input.refreshToken,
    });
    if (sessionError !== null) throw providerError(sessionError);
    const { error } = await client.auth.updateUser(
      { email: input.email },
      { emailRedirectTo: input.emailRedirectTo },
    );
    if (error !== null) throw providerError(error);
  }

  async requestPasswordRecovery(input: {
    readonly email: string;
    readonly redirectTo: string;
  }): Promise<void> {
    const { error } = await this.#public.auth.resetPasswordForEmail(input.email, {
      redirectTo: input.redirectTo,
    });
    if (error !== null) throw providerError(error);
  }

  async updatePassword(input: {
    readonly accessToken: string;
    readonly password: string;
  }): Promise<void> {
    const trusted = await this.validateAccessToken(input.accessToken);
    const { error } = await this.#admin.auth.admin.updateUserById(trusted.providerUserId, {
      password: input.password,
    });
    if (error !== null) throw providerError(error);
  }

  async #findRegistrationIdentity(input: {
    readonly email: string;
    readonly idempotencyKeyHash: string;
  }): Promise<ProviderIdentity | null> {
    for (let page = 1; ; page += 1) {
      const { data, error } = await this.#admin.auth.admin.listUsers({ page, perPage: 100 });
      if (error !== null) throw providerError(error);
      const user = data.users.find(
        (candidate) =>
          (candidate.app_metadata.sergod_registration_key_hash === input.idempotencyKeyHash ||
            candidate.user_metadata.sergod_registration_key_hash === input.idempotencyKeyHash) &&
          candidate.email?.toLowerCase() === input.email.toLowerCase(),
      );
      if (user !== undefined) {
        if (user.app_metadata.sergod_registration_key_hash !== input.idempotencyKeyHash) {
          const { data: recovered, error: recoveryError } =
            await this.#admin.auth.admin.updateUserById(user.id, {
              app_metadata: { sergod_registration_key_hash: input.idempotencyKeyHash },
            });
          if (recoveryError !== null) throw providerError(recoveryError);
          return mapIdentity(recovered.user);
        }
        return mapIdentity(user);
      }
      if (data.users.length < 100) return null;
    }
  }
}

function mapIdentity(user: User): ProviderIdentity {
  if (user.email === undefined) {
    throw new IdentityAccessError(
      'PROVIDER_EMAIL_INCOMPLETE',
      409,
      'Supabase identity must contain email.',
    );
  }
  return {
    email: user.email,
    emailVerified: user.email_confirmed_at !== undefined,
    providerUserId: user.id,
  };
}

function mapSession(
  accessToken: string,
  refreshToken: string,
  expiresAt: number | undefined,
  providerUserId: string,
): ProviderSession {
  return {
    accessToken,
    authSessionId: readSessionId(accessToken),
    expiresAt: expiresAt ?? null,
    providerUserId,
    refreshToken,
  };
}

function readSessionId(accessToken: string): string {
  const payload = accessToken.split('.')[1];
  if (payload === undefined)
    throw new IdentityAccessError('PROVIDER_TOKEN_INVALID', 401, 'Invalid token.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new IdentityAccessError('PROVIDER_TOKEN_INVALID', 401, 'Invalid token.');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('session_id' in parsed) ||
    typeof parsed.session_id !== 'string'
  ) {
    throw new IdentityAccessError(
      'PROVIDER_SESSION_ID_MISSING',
      401,
      'Token has no session identity.',
    );
  }
  return parsed.session_id;
}

function accessTokenValidationError(error: unknown): IdentityAccessError {
  if (isAuthRetryableFetchError(error) || (isAuthApiError(error) && error.status >= 500)) {
    return new IdentityAccessError(
      'IDENTITY_PROVIDER_UNAVAILABLE',
      503,
      'Identity provider is unavailable.',
    );
  }
  if (isAuthError(error)) {
    return new IdentityAccessError(
      'PROVIDER_TOKEN_INVALID',
      401,
      'Invalid or expired authentication token.',
    );
  }
  return new IdentityAccessError(
    'IDENTITY_PROVIDER_RESPONSE_INVALID',
    500,
    'Identity provider returned an invalid response.',
  );
}

function providerError(error: { readonly message: string }): IdentityAccessError {
  return new IdentityAccessError(
    'IDENTITY_PROVIDER_ERROR',
    502,
    'Identity provider request failed.',
    { cause: new Error(error.message) },
  );
}
