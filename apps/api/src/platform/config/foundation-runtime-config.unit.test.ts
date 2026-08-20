import { describe, expect, it } from 'vitest';

import { loadFoundationRuntimeConfig } from './foundation-runtime-config.js';

const valid = {
  DATABASE_URL: 'postgresql://127.0.0.1:5432/local',
  INBOX_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString('base64'),
  LOG_LEVEL: 'info',
  WORKER_BASE_BACKOFF_MS: '100',
  WORKER_BATCH_SIZE: '10',
  WORKER_LEASE_MS: '30000',
  WORKER_MAX_ATTEMPTS: '5',
  WORKER_POLL_MS: '500',
};

describe('foundation runtime configuration', () => {
  it('loads validated technical values', () => {
    const config = loadFoundationRuntimeConfig(valid);

    expect(config.worker).toEqual({
      baseBackoffMs: 100,
      batchSize: 10,
      leaseMs: 30_000,
      maxAttempts: 5,
      pollMs: 500,
    });
    expect(config.inboxEncryptionKey).toHaveLength(32);
  });

  it('rejects an absent database URL and invalid encryption key', () => {
    expect(() =>
      loadFoundationRuntimeConfig({
        ...valid,
        DATABASE_URL: '',
        INBOX_ENCRYPTION_KEY_BASE64: 'not-a-32-byte-key',
      }),
    ).toThrow();
  });
});
