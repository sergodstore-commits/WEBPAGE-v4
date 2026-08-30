import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync(new URL('../../.env', import.meta.url), 'utf8').split(/\r?\n/u)) {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
  const separator = trimmed.indexOf('=');
  let value = trimmed.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    value = value.slice(1, -1);
  env[trimmed.slice(0, separator).trim()] = value;
}

const api = new URL(env.API_PUBLIC_URL);
if (api.protocol !== 'https:' || api.hostname !== 'sergod-store-api-v4.onrender.com')
  throw new Error('Session acceptance is restricted to the expected staging API.');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

async function accountStatus(accessToken) {
  const response = await fetch(new URL('/api/v1/account', api), {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  return response.status;
}

const loginResponse = await fetch(new URL('/api/v1/identity/sessions', api), {
  body: JSON.stringify({
    email: env.SERGOD_CLIENT_EMAIL,
    password: env.SERGOD_CLIENT_PASSWORD,
  }),
  headers: { 'content-type': 'application/json' },
  method: 'POST',
  signal: AbortSignal.timeout(30_000),
});
const created = await loginResponse.json().catch(() => null);
if (
  loginResponse.status !== 201 ||
  typeof created?.accessToken !== 'string' ||
  typeof created?.refreshToken !== 'string'
)
  throw new Error(`The API did not create the isolated session (HTTP ${loginResponse.status}).`);
const persisted = await supabase.auth.setSession({
  access_token: created.accessToken,
  refresh_token: created.refreshToken,
});
if (persisted.error !== null || persisted.data.session === null)
  throw new Error('Supabase did not persist the isolated acceptance session.');
const initial = persisted.data.session;
if ((await accountStatus(initial.access_token)) !== 200)
  throw new Error('The initial provider session was not accepted by the API.');
if ((await accountStatus(`${initial.access_token.slice(0, -1)}x`)) !== 401)
  throw new Error('The API did not reject a corrupted access token.');

const refreshed = await supabase.auth.refreshSession({ refresh_token: initial.refresh_token });
if (refreshed.error !== null || refreshed.data.session === null)
  throw new Error('Supabase did not renew the isolated acceptance session.');
if ((await accountStatus(refreshed.data.session.access_token)) !== 200)
  throw new Error('The renewed provider session was not accepted by the API.');
if (refreshed.data.session.refresh_token === initial.refresh_token)
  throw new Error('The refresh token was not rotated.');

await supabase.auth.signOut({ scope: 'local' });
console.log('REMOTE_SESSION_RENEWAL_ACCEPTANCE=PASS');
console.log('INITIAL_API_STATUS=200');
console.log('INVALID_TOKEN_API_STATUS=401');
console.log('RENEWED_API_STATUS=200');
console.log('REFRESH_TOKEN_ROTATION=PASS');
