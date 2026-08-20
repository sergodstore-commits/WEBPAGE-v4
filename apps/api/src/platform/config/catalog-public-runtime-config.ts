import { z } from 'zod';

const schema = z.object({
  CATALOG_PUBLIC_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  CATALOG_PUBLIC_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export interface CatalogPublicRuntimeConfig {
  readonly rateLimitMaximumRequests: number;
  readonly rateLimitWindowMs: number;
}

export function loadCatalogPublicRuntimeConfig(
  environment: NodeJS.ProcessEnv,
): CatalogPublicRuntimeConfig {
  const parsed = schema.parse(environment);
  return Object.freeze({
    rateLimitMaximumRequests: parsed.CATALOG_PUBLIC_RATE_LIMIT_MAX_REQUESTS,
    rateLimitWindowMs: parsed.CATALOG_PUBLIC_RATE_LIMIT_WINDOW_MS,
  });
}
