import { z } from 'zod';

const schema = z.object({
  CONTACT_CHANGE_TTL_MS: z.coerce.number().int().positive(),
  DATABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_URL: z.url(),
  WEB_APP_URL: z.url().default('http://localhost:5173'),
});

export interface IdentityRuntimeConfig {
  readonly contactChangeTtlMs: number;
  readonly databaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly supabaseSecretKey: string;
  readonly supabaseUrl: string;
  readonly webAppUrl: string;
}

export function loadIdentityRuntimeConfig(
  environment: NodeJS.ProcessEnv,
): IdentityRuntimeConfig | null {
  const names = [
    'CONTACT_CHANGE_TTL_MS',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_URL',
    'WEB_APP_URL',
  ] as const;
  if (names.every((name) => environment[name]?.trim() === undefined)) return null;
  const parsed = schema.parse(environment);
  return Object.freeze({
    contactChangeTtlMs: parsed.CONTACT_CHANGE_TTL_MS,
    databaseUrl: parsed.DATABASE_URL,
    supabasePublishableKey: parsed.SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: parsed.SUPABASE_SECRET_KEY,
    supabaseUrl: parsed.SUPABASE_URL,
    webAppUrl: parsed.WEB_APP_URL,
  });
}
