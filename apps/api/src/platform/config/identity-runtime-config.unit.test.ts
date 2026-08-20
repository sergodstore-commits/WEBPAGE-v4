import { describe, expect, it } from 'vitest';

import { loadIdentityRuntimeConfig } from './identity-runtime-config.js';

const configured = {
  CONTACT_CHANGE_TTL_MS: '3600000',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key',
  SUPABASE_SECRET_KEY: 'fixture-secret-key',
  SUPABASE_URL: 'https://project.supabase.test',
};

describe('IdentityAccess runtime configuration', () => {
  it('keeps the context disabled when no identity variable is present', () => {
    expect(loadIdentityRuntimeConfig({})).toBeNull();
    expect(loadIdentityRuntimeConfig({ DATABASE_URL: configured.DATABASE_URL })).toBeNull();
  });

  it('uses the approved localhost callback origin when no override is provided', () => {
    expect(loadIdentityRuntimeConfig(configured)?.webAppUrl).toBe('http://localhost:5173');
  });

  it('accepts an explicit web origin without exposing private values to Vite', () => {
    expect(
      loadIdentityRuntimeConfig({ ...configured, WEB_APP_URL: 'https://store.example.test' })
        ?.webAppUrl,
    ).toBe('https://store.example.test');
  });
});
