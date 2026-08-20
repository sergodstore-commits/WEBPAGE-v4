import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

const runExternalContract = process.env.RUN_SUPABASE_STORAGE_CONTRACT === 'true';

describe('Catalog Storage configuration contract', () => {
  it('versions a private local bucket with the current limits', async () => {
    const config = await readFile(resolve('supabase/config.toml'), 'utf8');
    expect(config).toContain('[storage.buckets.catalog-assets]');
    expect(config).toMatch(
      /\[storage\.buckets\.catalog-assets\][\s\S]*?public = false[\s\S]*?file_size_limit = "10MiB"/u,
    );
    expect(config).toContain(
      'allowed_mime_types = ["image/jpeg", "image/png", "image/webp", "image/avif"]',
    );
  });

  it('does not add permissive Storage policies for browser roles', async () => {
    const files = [
      'supabase/migrations/20260731193601_phase_1_foundation_baseline.sql',
      'supabase/migrations/20260731210201_phase_2_identity_access_baseline.sql',
      'supabase/migrations/20260731233233_phase_2_email_only_authentication.sql',
      'supabase/migrations/20260801014709_phase_2_security_hardening.sql',
      'supabase/migrations/20260801051248_phase_3a_catalog_foundation.sql',
    ];
    const sql = (await Promise.all(files.map((file) => readFile(resolve(file), 'utf8')))).join(
      '\n',
    );
    expect(sql).not.toMatch(/CREATE\s+POLICY[\s\S]*storage\.objects/iu);
  });

  it('keeps public delivery behind the backend without public or signed URL helpers', async () => {
    const files = [
      'apps/api/src/contexts/catalog/application/catalog-public-resource-service.ts',
      'apps/api/src/contexts/catalog/presentation/catalog-public-resource-http-api.ts',
      'apps/api/src/contexts/catalog/infrastructure/supabase-catalog-private-storage.ts',
    ];
    const source = (await Promise.all(files.map((file) => readFile(resolve(file), 'utf8')))).join(
      '\n',
    );
    expect(source).not.toMatch(/createSignedUrl|getPublicUrl/iu);
  });
});

describe.skipIf(!runExternalContract)('Supabase Storage external contract', () => {
  it('keeps the bucket private and denies anon and authenticated direct access', async () => {
    const required = requireExternalEnvironment();
    const options = {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    } as const;
    const service = createClient(required.url, required.secretKey, options);
    const anon = createClient(required.url, required.publishableKey, options);
    const authenticated = createClient(required.url, required.publishableKey, {
      ...options,
      global: { headers: { Authorization: `Bearer ${required.authenticatedAccessToken}` } },
    });

    const bucketResult = await service.storage.getBucket(required.bucket);
    expect(bucketResult.error).toBeNull();
    expect(bucketResult.data).toMatchObject({
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
      file_size_limit: 10 * 1024 * 1024,
      public: false,
    });

    const testId = randomUUID();
    const storedKey = `contract-tests/${testId}`;
    const attemptedKeys = [
      `contract-tests/${testId}-anon`,
      `contract-tests/${testId}-auth`,
    ] as const;
    const serviceFile = service.storage.from(required.bucket);
    try {
      const upload = await serviceFile.upload(storedKey, new Uint8Array([1, 2, 3]), {
        contentType: 'image/png',
        upsert: false,
      });
      expect(upload.error).toBeNull();

      for (const [client, attemptedKey] of [
        [anon, attemptedKeys[0]],
        [authenticated, attemptedKeys[1]],
      ] as const) {
        const files = client.storage.from(required.bucket);
        const listing = await files.list('contract-tests', { search: testId });
        expect(listing.error !== null || listing.data.length === 0).toBe(true);
        expect((await files.download(storedKey)).error).not.toBeNull();
        expect(
          (
            await files.upload(attemptedKey, new Uint8Array([1]), {
              contentType: 'image/png',
              upsert: false,
            })
          ).error,
        ).not.toBeNull();
      }
    } finally {
      await serviceFile.remove([storedKey, ...attemptedKeys]);
    }
  });
});

function requireExternalEnvironment() {
  const environment = {
    authenticatedAccessToken: process.env.SUPABASE_STORAGE_TEST_USER_ACCESS_TOKEN,
    bucket: process.env.CATALOG_ASSET_BUCKET,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    url: process.env.SUPABASE_URL,
  };
  const missing = Object.entries(environment)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `External Storage contract is enabled but variables are missing: ${missing.join(', ')}.`,
    );
  }
  return environment as Record<keyof typeof environment, string>;
}
