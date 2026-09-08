import { CryptoUuidGenerator, SystemClock } from '@sergod/foundation';

import { CatalogStorageReconciler } from '../apps/api/src/contexts/catalog/application/catalog-storage-reconciler.js';
import { PgCatalogRepository } from '../apps/api/src/contexts/catalog/infrastructure/postgres-catalog-repository.js';
import { SupabaseCatalogPrivateStorage } from '../apps/api/src/contexts/catalog/infrastructure/supabase-catalog-private-storage.js';
import { loadCatalogRuntimeConfig } from '../apps/api/src/platform/config/catalog-runtime-config.js';
import { loadIdentityRuntimeConfig } from '../apps/api/src/platform/config/identity-runtime-config.js';
import { createPostgresPool } from '../apps/api/src/platform/persistence/postgres.js';

const identityConfig = loadIdentityRuntimeConfig(process.env);
const catalogConfig = loadCatalogRuntimeConfig(process.env);
if (identityConfig === null || catalogConfig === null) {
  throw new Error('Database and private catalog Storage server configuration are required.');
}
const clock = new SystemClock();
const uuids = new CryptoUuidGenerator();
const pool = createPostgresPool(identityConfig.databaseUrl, { max: 2 });
try {
  const scheduledFor = scheduledTime(process.argv.slice(2), clock.now());
  const result = await new CatalogStorageReconciler(
    pool,
    new PgCatalogRepository(pool, clock, uuids),
    SupabaseCatalogPrivateStorage.fromCredentials({
      bucket: catalogConfig.assetBucket,
      secretKey: catalogConfig.supabaseSecretKey,
      supabaseUrl: catalogConfig.supabaseUrl,
    }),
    clock,
    uuids,
  ).run({ correlationId: uuids.generate(), scheduledFor });
  process.stdout.write(
    [
      `Catalog Storage reconciliation ${result.kind.toLowerCase()}:`,
      `${result.scanned} scanned,`,
      `${result.compatible} compatible,`,
      `${result.anomalies} anomalies.`,
      `Usage: ${formatBytes(result.usage.totalBytes)} in ${result.usage.totalObjects} objects`,
      `(${formatBytes(result.usage.activeBytes)} active,`,
      `${formatBytes(result.usage.retainedBytes)} safely retained,`,
      `${formatBytes(result.usage.orphanBytes)} orphaned).\n`,
    ].join(' '),
  );
} finally {
  await pool.end();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function scheduledTime(arguments_: readonly string[], now: Date): Date {
  const prefix = '--scheduled-for=';
  const supplied = arguments_.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (supplied === undefined) {
    const minute = new Date(now);
    minute.setUTCSeconds(0, 0);
    return minute;
  }
  const parsed = new Date(supplied);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== supplied) {
    throw new Error('--scheduled-for must be an exact ISO-8601 UTC instant.');
  }
  return parsed;
}
