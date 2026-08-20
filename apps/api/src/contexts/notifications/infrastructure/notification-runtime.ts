import type { Clock } from '@sergod/foundation';
import type { Pool } from 'pg';
import { z } from 'zod';

import { NotificationWorker } from '../application/notification-service.js';
import { PgNotificationQueue } from './postgres-notification-queue.js';
import { ResendEmailGateway } from './resend-email-gateway.js';

const schema = z.object({
  EMAIL_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  EMAIL_PROVIDER: z.literal('RESEND'),
  EMAIL_REPLY_TO: z.string().min(1).optional(),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100),
  WORKER_LEASE_MS: z.coerce.number().int().positive(),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive(),
  WORKER_POLL_MS: z.coerce.number().int().positive(),
});

export interface NotificationRuntime {
  readonly batchSize: number;
  readonly pollMs: number;
  readonly worker: NotificationWorker;
}

export function createNotificationRuntime(
  environment: NodeJS.ProcessEnv,
  pool: Pool,
  clock: Clock,
): NotificationRuntime {
  const parsed = schema.parse(environment);
  const queue = new PgNotificationQueue(
    pool,
    clock,
    parsed.WORKER_LEASE_MS,
    parsed.WORKER_MAX_ATTEMPTS,
  );
  return {
    batchSize: parsed.WORKER_BATCH_SIZE,
    pollMs: parsed.WORKER_POLL_MS,
    worker: new NotificationWorker(
      queue,
      new ResendEmailGateway(
        parsed.EMAIL_API_KEY,
        parsed.EMAIL_FROM,
        parsed.EMAIL_REPLY_TO ?? null,
      ),
      () => clock.now(),
    ),
  };
}

export function notificationWorkerEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment.NOTIFICATION_WORKER_ENABLED === 'true';
}
