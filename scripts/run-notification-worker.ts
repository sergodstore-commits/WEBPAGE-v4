import { SystemClock } from '@sergod/foundation';

import { createNotificationRuntime } from '../apps/api/src/contexts/notifications/infrastructure/notification-runtime.js';
import { loadDatabaseRuntimeConfig } from '../apps/api/src/platform/config/database-runtime-config.js';
import { createPostgresPool } from '../apps/api/src/platform/persistence/postgres.js';

const database = loadDatabaseRuntimeConfig(process.env);
if (database === null) throw new Error('Database server configuration is required.');
const pool = createPostgresPool(database.databaseUrl, { max: 2 });
try {
  const runtime = createNotificationRuntime(process.env, pool, new SystemClock());
  const result = await runtime.worker.run(runtime.batchSize);
  process.stdout.write(`Notification job sent=${result.sent} failed=${result.failed}.\n`);
  if (result.failed > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
