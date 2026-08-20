import { describe, expect, it } from 'vitest';

import { loadCatalogRuntimeConfig } from './catalog-runtime-config.js';

describe('catalog runtime config', () => {
  it('keeps the unconfigured Catalog resource module disabled', () => {
    expect(loadCatalogRuntimeConfig({ SUPABASE_SECRET_KEY: 'identity-only' })).toBeNull();
  });

  it('requires complete private server configuration when enabled', () => {
    expect(() =>
      loadCatalogRuntimeConfig({
        CATALOG_ASSET_BUCKET: 'catalog-assets',
        SUPABASE_SECRET_KEY: 'private-test-key',
        SUPABASE_URL: 'https://project.supabase.co',
      }),
    ).not.toThrow();
    expect(() => loadCatalogRuntimeConfig({ CATALOG_ASSET_BUCKET: '../unsafe' })).toThrow();
  });
});
