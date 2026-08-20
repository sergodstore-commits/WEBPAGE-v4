import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { createNotificationRuntime, notificationWorkerEnabled } from './notification-runtime.js';

describe('notification runtime wiring', () => {
  it('is disabled by default and only accepts an explicit true flag', () => {
    expect(notificationWorkerEnabled({})).toBe(false);
    expect(notificationWorkerEnabled({ NOTIFICATION_WORKER_ENABLED: 'false' })).toBe(false);
    expect(notificationWorkerEnabled({ NOTIFICATION_WORKER_ENABLED: 'true' })).toBe(true);
  });

  it('constructs an executable worker from concrete environment settings', () => {
    const runtime = createNotificationRuntime(
      {
        EMAIL_API_KEY: 'key',
        EMAIL_FROM: 'Sergod <store@example.com>',
        EMAIL_PROVIDER: 'RESEND',
        WORKER_BATCH_SIZE: '25',
        WORKER_LEASE_MS: '60000',
        WORKER_MAX_ATTEMPTS: '4',
        WORKER_POLL_MS: '5000',
      },
      {} as Pool,
      { now: () => new Date('2026-08-20T12:00:00Z') },
    );
    expect(runtime.batchSize).toBe(25);
    expect(runtime.pollMs).toBe(5000);
    expect(runtime.worker.run).toBeTypeOf('function');
  });

  it('fails closed when enabled wiring lacks provider credentials', () => {
    expect(() =>
      createNotificationRuntime(
        {
          EMAIL_PROVIDER: 'RESEND',
          WORKER_BATCH_SIZE: '25',
          WORKER_LEASE_MS: '60000',
          WORKER_MAX_ATTEMPTS: '4',
          WORKER_POLL_MS: '5000',
        },
        {} as Pool,
        { now: () => new Date() },
      ),
    ).toThrow();
  });
});
