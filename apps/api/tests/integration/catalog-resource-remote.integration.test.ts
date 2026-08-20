import { CryptoUuidGenerator, SystemClock } from '@sergod/foundation';
import { afterAll, describe, expect, it } from 'vitest';

import { CatalogStorageReconciler } from '../../src/contexts/catalog/application/catalog-storage-reconciler.js';
import { PgCatalogRepository } from '../../src/contexts/catalog/infrastructure/postgres-catalog-repository.js';
import { SupabaseCatalogPrivateStorage } from '../../src/contexts/catalog/infrastructure/supabase-catalog-private-storage.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';
import { createCatalogImageFixture } from '../support/catalog-image-fixtures.js';

const enabled = process.env.RUN_CATALOG_RESOURCE_REMOTE_ACCEPTANCE === '1';
const pools: ReturnType<typeof createPostgresPool>[] = [];

afterAll(async () => Promise.all(pools.map((pool) => pool.end())).then(() => undefined));

describe.skipIf(!enabled)('Remote catalog resource acceptance', () => {
  it('covers the authorized end-to-end lifecycle without physical deletion', async () => {
    const apiUrl = requiredEnvironment('CATALOG_RESOURCE_ACCEPTANCE_API_URL');
    const adminToken = requiredEnvironment('CATALOG_RESOURCE_ACCEPTANCE_ADMIN_TOKEN');
    const segment = requiredSegment(requiredEnvironment('CATALOG_RESOURCE_ACCEPTANCE_SEGMENT'));
    const entityId = requiredEnvironment('CATALOG_RESOURCE_ACCEPTANCE_ENTITY_ID');
    const databaseUrl = requiredEnvironment('DATABASE_URL');
    const supabaseUrl = requiredEnvironment('SUPABASE_URL');
    const secretKey = requiredEnvironment('SUPABASE_SECRET_KEY');
    const publishableKey = requiredEnvironment('SUPABASE_PUBLISHABLE_KEY');
    const bucket = requiredEnvironment('CATALOG_ASSET_BUCKET');
    const runId = crypto.randomUUID();
    const bytes = await createCatalogImageFixture('image/png');
    const base = `${apiUrl.replace(/\/$/u, '')}/api/v1/admin/catalog/${segment}/${entityId}/resources`;

    const first = await upload(base, adminToken, `${runId}-first`, bytes, {
      altText: `Phase 3D acceptance ${runId} first`,
      filename: `phase-3d-acceptance-${runId}-first.png`,
      position: 1,
    });
    const replay = await upload(base, adminToken, `${runId}-first`, bytes, {
      altText: `Phase 3D acceptance ${runId} first`,
      filename: `phase-3d-acceptance-${runId}-first.png`,
      position: 1,
    });
    expect(replay).toMatchObject({ item: { resourceId: first.item.resourceId }, replayed: true });
    const second = await upload(base, adminToken, `${runId}-second`, bytes, {
      altText: `Phase 3D acceptance ${runId} second`,
      filename: `phase-3d-acceptance-${runId}-second.png`,
      position: 2,
    });

    const listed = await apiRequest(`${base}?limit=100`, adminToken);
    expect(listed.response.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toMatch(/secureStorageKey|catalog-assets|SUPABASE/u);
    await successfulMutation(`${base}/primary`, adminToken, `${runId}-primary`, 'PUT', {
      resourceId: first.item.resourceId,
    });
    const beforeOrder = await apiRequest(`${base}?limit=100`, adminToken);
    const etag = beforeOrder.response.headers.get('etag');
    expect(etag).toBeTruthy();
    await successfulMutation(
      `${base}/order`,
      adminToken,
      `${runId}-order`,
      'PATCH',
      { orderedResourceIds: [second.item.resourceId, first.item.resourceId] },
      { 'if-match': etag ?? '' },
    );

    const replacementForm = new FormData();
    replacementForm.set(
      'file',
      new Blob([bytes], { type: 'image/png' }),
      `phase-3d-acceptance-${runId}-replacement.png`,
    );
    replacementForm.set('altText', `Phase 3D acceptance ${runId} replacement`);
    replacementForm.set('reason', 'Authorized Phase 3D acceptance replacement');
    const replacementResponse = await fetch(`${base}/${first.item.resourceId}/replacements`, {
      body: replacementForm,
      headers: authorizationHeaders(adminToken, `${runId}-replacement`),
      method: 'POST',
    });
    expect(replacementResponse.status).toBe(201);
    const replacement = (await replacementResponse.json()) as ResourceResult;
    expect(replacement.item).toMatchObject({
      isPrimary: true,
      position: 2,
      replacedResourceId: first.item.resourceId,
      state: 'ACTIVE',
    });
    await successfulMutation(
      `${base}/${second.item.resourceId}/retirements`,
      adminToken,
      `${runId}-retirement`,
      'POST',
      { reason: 'Authorized Phase 3D acceptance retirement' },
    );

    const clock = new SystemClock();
    const uuids = new CryptoUuidGenerator();
    const pool = createPostgresPool(databaseUrl, { max: 2 });
    pools.push(pool);
    const repository = new PgCatalogRepository(pool, clock, uuids);
    const storage = SupabaseCatalogPrivateStorage.fromCredentials({
      bucket,
      secretKey,
      supabaseUrl,
    });
    for (const id of [first.item.resourceId, second.item.resourceId, replacement.item.resourceId]) {
      const resource = await repository.findResource(id);
      expect(resource).not.toBeNull();
      await expect(storage.privateObjectExists(resource?.secureStorageKey ?? '')).resolves.toBe(
        true,
      );
    }
    const reconciliation = await new CatalogStorageReconciler(
      pool,
      repository,
      storage,
      clock,
      uuids,
    ).run({ correlationId: uuids.generate(), scheduledFor: clock.now() });
    expect(reconciliation.kind).toBe('COMPLETED');

    const denied = await fetch(
      `${supabaseUrl}/rest/v1/resource_assets?select=resource_id&limit=1`,
      {
        headers: { apikey: publishableKey, authorization: `Bearer ${publishableKey}` },
      },
    );
    expect(denied.status).not.toBe(200);
  });
});

interface ResourceResult {
  readonly item: {
    readonly isPrimary: boolean;
    readonly position: number;
    readonly replacedResourceId: string | null;
    readonly resourceId: string;
    readonly state: string;
  };
  readonly replayed: boolean;
}

async function upload(
  base: string,
  token: string,
  idempotencyKey: string,
  bytes: Uint8Array,
  input: { readonly altText: string; readonly filename: string; readonly position: number },
): Promise<ResourceResult> {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'image/png' }), input.filename);
  form.set('altText', input.altText);
  form.set('position', String(input.position));
  const response = await fetch(base, {
    body: form,
    headers: authorizationHeaders(token, idempotencyKey),
    method: 'POST',
  });
  expect([200, 201]).toContain(response.status);
  return (await response.json()) as ResourceResult;
}

async function successfulMutation(
  url: string,
  token: string,
  idempotencyKey: string,
  method: 'PATCH' | 'POST' | 'PUT',
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      ...authorizationHeaders(token, idempotencyKey),
      'content-type': 'application/json',
      ...extraHeaders,
    },
    method,
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function apiRequest(url: string, token: string) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  return { body: (await response.json()) as unknown, response };
}

function authorizationHeaders(token: string, idempotencyKey: string) {
  return { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for explicitly enabled remote acceptance.`);
  return value;
}

function requiredSegment(value: string): 'categories' | 'collections' | 'products' | 'tcg-games' {
  if (!['categories', 'collections', 'products', 'tcg-games'].includes(value)) {
    throw new Error('CATALOG_RESOURCE_ACCEPTANCE_SEGMENT is invalid.');
  }
  return value as 'categories' | 'collections' | 'products' | 'tcg-games';
}
