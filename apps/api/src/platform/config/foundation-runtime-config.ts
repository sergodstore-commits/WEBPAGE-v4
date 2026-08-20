import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url(),
  INBOX_ENCRYPTION_KEY_BASE64: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').byteLength === 32, {
      message: 'INBOX_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes.',
    }),
  LOG_LEVEL: z.enum(['debug', 'error', 'fatal', 'info', 'silent', 'trace', 'warn']),
  WORKER_BASE_BACKOFF_MS: z.coerce.number().int().positive(),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().max(100),
  WORKER_LEASE_MS: z.coerce.number().int().positive(),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive(),
  WORKER_POLL_MS: z.coerce.number().int().positive(),
});

export interface FoundationRuntimeConfig {
  readonly databaseUrl: string;
  readonly inboxEncryptionKey: Buffer;
  readonly logLevel: z.infer<typeof schema>['LOG_LEVEL'];
  readonly worker: {
    readonly baseBackoffMs: number;
    readonly batchSize: number;
    readonly leaseMs: number;
    readonly maxAttempts: number;
    readonly pollMs: number;
  };
}

export function loadFoundationRuntimeConfig(
  environment: NodeJS.ProcessEnv,
): FoundationRuntimeConfig {
  const parsed = schema.parse(environment);
  return Object.freeze({
    databaseUrl: parsed.DATABASE_URL,
    inboxEncryptionKey: Buffer.from(parsed.INBOX_ENCRYPTION_KEY_BASE64, 'base64'),
    logLevel: parsed.LOG_LEVEL,
    worker: Object.freeze({
      baseBackoffMs: parsed.WORKER_BASE_BACKOFF_MS,
      batchSize: parsed.WORKER_BATCH_SIZE,
      leaseMs: parsed.WORKER_LEASE_MS,
      maxAttempts: parsed.WORKER_MAX_ATTEMPTS,
      pollMs: parsed.WORKER_POLL_MS,
    }),
  });
}
