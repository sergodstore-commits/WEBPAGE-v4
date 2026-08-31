import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_SSL_CA_BASE64: z.string().optional(),
});

export interface DatabaseRuntimeConfig {
  readonly databaseUrl: string;
  readonly sslCaCertificate?: string;
}

export function loadDatabaseRuntimeConfig(
  environment: NodeJS.ProcessEnv,
): DatabaseRuntimeConfig | null {
  if (!environment.DATABASE_URL?.trim()) return null;
  const parsed = schema.parse(environment);
  if (!parsed.DATABASE_SSL_CA_BASE64?.trim()) {
    return Object.freeze({ databaseUrl: parsed.DATABASE_URL });
  }
  const sslCaCertificate = Buffer.from(parsed.DATABASE_SSL_CA_BASE64, 'base64').toString('utf8');
  if (!/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/u.test(sslCaCertificate)) {
    throw new Error('DATABASE_SSL_CA_BASE64 must contain one base64-encoded PEM certificate.');
  }
  const databaseUrl = new URL(parsed.DATABASE_URL);
  for (const parameter of ['sslcert', 'sslkey', 'sslmode', 'sslrootcert']) {
    databaseUrl.searchParams.delete(parameter);
  }
  return Object.freeze({ databaseUrl: databaseUrl.href, sslCaCertificate });
}
