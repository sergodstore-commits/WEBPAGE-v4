import { describe, expect, it } from 'vitest';

import { loadCatalogPublicRuntimeConfig } from './catalog-public-runtime-config.js';

describe('public catalog runtime configuration', () => {
  it('uses bounded technical defaults', () => {
    expect(loadCatalogPublicRuntimeConfig({})).toEqual({
      rateLimitMaximumRequests: 120,
      rateLimitWindowMs: 60_000,
    });
  });

  it('accepts positive overrides and rejects invalid values', () => {
    expect(
      loadCatalogPublicRuntimeConfig({
        CATALOG_PUBLIC_RATE_LIMIT_MAX_REQUESTS: '25',
        CATALOG_PUBLIC_RATE_LIMIT_WINDOW_MS: '1000',
      }),
    ).toEqual({ rateLimitMaximumRequests: 25, rateLimitWindowMs: 1000 });
    expect(() =>
      loadCatalogPublicRuntimeConfig({ CATALOG_PUBLIC_RATE_LIMIT_MAX_REQUESTS: '0' }),
    ).toThrow();
  });
});
