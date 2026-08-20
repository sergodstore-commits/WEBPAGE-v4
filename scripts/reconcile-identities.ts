import { CryptoUuidGenerator, SystemClock } from '@sergod/foundation';

import { IdentityAccessService } from '../apps/api/src/contexts/identity-access/application/identity-access-service.js';
import { PgIdentityAccessRepository } from '../apps/api/src/contexts/identity-access/infrastructure/postgres-identity-access-repository.js';
import { SupabaseIdentityProvider } from '../apps/api/src/contexts/identity-access/infrastructure/supabase-identity-provider.js';
import { loadIdentityRuntimeConfig } from '../apps/api/src/platform/config/identity-runtime-config.js';
import { createPostgresPool } from '../apps/api/src/platform/persistence/postgres.js';

const config = loadIdentityRuntimeConfig(process.env);
if (config === null) throw new Error('IdentityAccess server configuration is required.');
const options = {
  baseBackoffMs: positiveInteger('--base-backoff-ms'),
  leaseMs: positiveInteger('--lease-ms'),
  limit: positiveInteger('--limit'),
  maxAttempts: positiveInteger('--max-attempts'),
};
const pool = createPostgresPool(config.databaseUrl, { max: 2 });
try {
  const clock = new SystemClock();
  const result = await new IdentityAccessService(
    new PgIdentityAccessRepository(pool, clock, new CryptoUuidGenerator()),
    new SupabaseIdentityProvider(
      config.supabaseUrl,
      config.supabasePublishableKey,
      config.supabaseSecretKey,
    ),
    clock,
    {
      configured: false,
      challenge: () => Promise.reject(new Error('MFA is disabled in V1.')),
    },
  ).reconcileExternalIdentities(options);
  process.stdout.write(
    `Identity reconciliation completed: ${result.resolved} resolved, ${result.failed} failed.\n`,
  );
} finally {
  await pool.end();
}

function positiveInteger(name: string): number {
  const prefix = `${name}=`;
  const raw = process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}
