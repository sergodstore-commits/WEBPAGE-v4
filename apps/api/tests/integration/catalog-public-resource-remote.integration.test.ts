import { createHash } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const enabled = process.env.RUN_CATALOG_RESOURCE_REMOTE_ACCEPTANCE === '1';
const pools: ReturnType<typeof createPostgresPool>[] = [];

afterAll(async () => Promise.all(pools.map((pool) => pool.end())).then(() => undefined));

describe.skipIf(!enabled)('Remote public catalog resource acceptance', () => {
  it('delivers a private object only through the anonymous backend proxy', async () => {
    const required = requireRemoteEnvironment();
    const pool = createPostgresPool(required.databaseUrl, { max: 2 });
    pools.push(pool);
    const visible = await primaryResource(pool, required.productId);
    const hidden = await primaryResource(pool, required.hiddenProductId);
    const path = `${required.apiUrl}/api/v1/catalog/resources/${visible.resourceId}/content`;

    const response = await fetch(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(visible.mimeType);
    expect(response.headers.get('content-length')).toBe(String(visible.byteSize));
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(response.headers.get('cache-control')).toBe('public, no-cache');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(visible.byteSize);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(visible.sha256Hex);

    const head = await fetch(path, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-length')).toBe(String(visible.byteSize));
    expect(head.headers.get('content-type')).toBe(visible.mimeType);
    const etag = head.headers.get('etag');
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/u);

    const unchanged = await fetch(path, { headers: { 'If-None-Match': etag ?? '' } });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe('');
    expect(unchanged.headers.get('cache-control')).toBe('public, no-cache');

    const hiddenResponse = await fetch(
      `${required.apiUrl}/api/v1/catalog/resources/${hidden.resourceId}/content`,
    );
    expect(hiddenResponse.status).toBe(404);
    expect(await hiddenResponse.json()).toMatchObject({
      error: { code: 'CATALOG_RESOURCE_NOT_FOUND' },
    });

    const existingPublicApi = await fetch(
      `${required.apiUrl}/api/v1/catalog/products/${required.productId}`,
    );
    expect(existingPublicApi.status).toBe(200);

    const options = {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    } as const;
    const anonymous = createClient(required.supabaseUrl, required.publishableKey, options);
    const authenticated = createClient(required.supabaseUrl, required.publishableKey, {
      ...options,
      global: { headers: { Authorization: `Bearer ${required.authenticatedAccessToken}` } },
    });
    for (const client of [anonymous, authenticated]) {
      const direct = await client.storage.from(required.bucket).download(visible.secureStorageKey);
      expect(direct.error).not.toBeNull();
      expect(direct.data).toBeNull();
    }
  });
});

interface RemoteResourceRow {
  readonly byte_size: string;
  readonly mime_type_real: string;
  readonly resource_id: string;
  readonly secure_storage_key: string;
  readonly sha256_hex: string;
}

async function primaryResource(pool: ReturnType<typeof createPostgresPool>, productId: string) {
  const result = await pool.query<RemoteResourceRow>(
    `SELECT resource.resource_id, resource.mime_type_real, resource.byte_size,
            resource.sha256_hex, resource.secure_storage_key
       FROM products product
       JOIN product_media media ON media.product_id = product.product_id AND media.is_primary
       JOIN resource_assets resource ON resource.resource_id = media.resource_id
      WHERE product.product_id = $1::uuid`,
    [productId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Remote acceptance product has no primary resource.');
  const byteSize = Number(row.byte_size);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error('Remote acceptance resource has an invalid persisted size.');
  }
  return {
    byteSize,
    mimeType: row.mime_type_real,
    resourceId: row.resource_id,
    secureStorageKey: row.secure_storage_key,
    sha256Hex: row.sha256_hex,
  };
}

function requireRemoteEnvironment() {
  const values = {
    apiUrl: process.env.CATALOG_PUBLIC_ACCEPTANCE_API_URL?.replace(/\/$/u, ''),
    authenticatedAccessToken: process.env.SUPABASE_STORAGE_TEST_USER_ACCESS_TOKEN,
    bucket: process.env.CATALOG_ASSET_BUCKET,
    databaseUrl: process.env.DATABASE_URL,
    hiddenProductId: process.env.CATALOG_PUBLIC_ACCEPTANCE_HIDDEN_PRODUCT_ID,
    productId: process.env.CATALOG_PUBLIC_ACCEPTANCE_PRODUCT_ID,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    supabaseUrl: process.env.SUPABASE_URL?.replace(/\/$/u, ''),
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Remote resource acceptance variables are missing: ${missing.join(', ')}.`);
  }
  return values as Record<keyof typeof values, string>;
}
