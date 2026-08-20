import { randomUUID } from 'node:crypto';

import { CryptoUuidGenerator, SystemClock } from '@sergod/foundation';

import { IdentityAccessService } from '../apps/api/src/contexts/identity-access/application/identity-access-service.js';
import { PgIdentityAccessRepository } from '../apps/api/src/contexts/identity-access/infrastructure/postgres-identity-access-repository.js';
import { SupabaseIdentityProvider } from '../apps/api/src/contexts/identity-access/infrastructure/supabase-identity-provider.js';
import { loadIdentityRuntimeConfig } from '../apps/api/src/platform/config/identity-runtime-config.js';
import { createPostgresPool } from '../apps/api/src/platform/persistence/postgres.js';

const argumentsByName = new Map(
  process.argv.slice(2).map((argument) => {
    const [name, ...valueParts] = argument.split('=');
    return [name, valueParts.join('=')] as const;
  }),
);

const authProviderUserId = required('--auth-user-id');
const deploymentId = required('--deployment-id');
const environmentIdentifier = required('--environment-identifier');
const idempotencyKey = required('--idempotency-key');
const config = loadIdentityRuntimeConfig(process.env);
if (config === null) throw new Error('IdentityAccess server configuration is required.');

const pool = createPostgresPool(config.databaseUrl, { max: 2 });
try {
  const clock = new SystemClock();
  const service = new IdentityAccessService(
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
  );
  const result = await service.provisionFirstAdmin({
    authProviderUserId,
    commandVersion: '1',
    context: {
      actorType: 'SYSTEM',
      correlationId: randomUUID(),
      idempotencyKey,
    },
    deploymentId,
    environmentIdentifier,
    executionSource: 'DEPLOYMENT_COMMAND',
    idempotencyKey,
  });
  process.stdout.write(
    result.replayed
      ? 'First Admin bootstrap was already completed for this idempotency key.\n'
      : 'First Admin bootstrap completed.\n',
  );
} finally {
  await pool.end();
}

function required(name: string): string {
  const value = argumentsByName.get(name)?.trim();
  if (value === undefined || value === '') throw new Error(`Missing required argument ${name}.`);
  return value;
}
