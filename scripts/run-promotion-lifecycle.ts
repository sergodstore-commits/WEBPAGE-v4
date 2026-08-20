import { randomBytes } from 'node:crypto';

import { PayloadRegistry } from '@sergod/contracts';
import { CryptoUuidGenerator, SystemClock } from '@sergod/foundation';

import { PromotionLifecycleJob } from '../apps/api/src/contexts/promotions/application/promotion-lifecycle-job.js';
import { PgPromotionsRepository } from '../apps/api/src/contexts/promotions/infrastructure/postgres-promotions-repository.js';
import { loadDatabaseRuntimeConfig } from '../apps/api/src/platform/config/database-runtime-config.js';
import { CoordinationStore } from '../apps/api/src/platform/coordination/coordination-store.js';
import { createPostgresPool } from '../apps/api/src/platform/persistence/postgres.js';

const config = loadDatabaseRuntimeConfig(process.env);
if (config === null) throw new Error('Database server configuration is required.');
const clock = new SystemClock();
const uuids = new CryptoUuidGenerator();
const pool = createPostgresPool(config.databaseUrl, { max: 2 });
const emptyPayloads = new PayloadRegistry([]);
try {
  const scheduledFor = scheduledTime(process.argv.slice(2), clock.now());
  const coordination = new CoordinationStore(
    pool,
    clock,
    uuids,
    emptyPayloads,
    emptyPayloads,
    randomBytes(32),
  );
  const result = await new PromotionLifecycleJob(
    new PgPromotionsRepository(pool, clock, uuids),
    coordination,
    clock,
  ).run({ correlationId: uuids.generate(), scheduledFor });
  process.stdout.write(`Promotion lifecycle job ${result.kind.toLowerCase()}.\n`);
} finally {
  await pool.end();
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
