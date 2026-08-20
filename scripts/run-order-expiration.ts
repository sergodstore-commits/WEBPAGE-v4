import { CryptoUuidGenerator, SystemClock } from '@sergod/foundation';

import { OrderService } from '../apps/api/src/contexts/commerce-orders/application/order-service.js';
import { PgOrderRepository } from '../apps/api/src/contexts/commerce-orders/infrastructure/postgres-order-repository.js';
import { loadDatabaseRuntimeConfig } from '../apps/api/src/platform/config/database-runtime-config.js';
import { createPostgresPool } from '../apps/api/src/platform/persistence/postgres.js';

const config = loadDatabaseRuntimeConfig(process.env);
if (config === null) throw new Error('Database server configuration is required.');
const clock = new SystemClock();
const uuids = new CryptoUuidGenerator();
const pool = createPostgresPool(config.databaseUrl, { max: 2 });
try {
  const result = await new OrderService(new PgOrderRepository(pool, clock, uuids)).expirePending(
    {
      actorType: 'SYSTEM',
      correlationId: uuids.generate(),
    },
    100,
  );
  process.stdout.write(`Expired pending-payment orders: ${result.expired}.\n`);
} finally {
  await pool.end();
}
