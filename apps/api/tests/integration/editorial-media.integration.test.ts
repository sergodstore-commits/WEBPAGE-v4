import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { PgCatalogPublicQueryRepository } from '../../src/contexts/catalog/infrastructure/postgres-catalog-public-query-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const ids = {
  admin: '0198d000-0000-7000-8000-000000000001',
  entry: '0198d000-0000-7000-8000-000000000002',
  media: '0198d000-0000-7000-8000-000000000003',
  resource: '0198d000-0000-7000-8000-000000000004',
};
const now = new Date('2026-09-02T04:00:00.000Z');
let pool: Pool;
let repository: PgCatalogPublicQueryRepository;

beforeAll(async () => {
  const url =
    process.env.DATABASE_URL ??
    (
      JSON.parse(
        (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
          /^\uFEFF/u,
          '',
        ),
      ) as { databaseUrl: string }
    ).databaseUrl;
  await runner({
    checkOrder: true,
    databaseUrl: url,
    dir: resolve('apps/api/migrations'),
    direction: 'up',
    ignorePattern: 'README\\.md',
    migrationsTable: 'pg_migrations',
    schema: 'public',
    singleTransaction: true,
  });
  pool = createPostgresPool(url);
  repository = new PgCatalogPublicQueryRepository(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE editorial_entry_media,editorial_entries,resource_assets,user_accounts,
      idempotency_records,audit_entries CASCADE`,
  );
  await pool.query(
    `INSERT INTO user_accounts(
       account_id,auth_provider_user_id,role,status,current_email,normalized_email,
       email_verification_status,phone_verification_status,created_at,updated_at,status_changed_at
     ) VALUES($1,$2,'ADMIN','ACTIVE','admin@example.test','admin@example.test',
       'VERIFIED','PENDING',$3,$3,$3)`,
    [ids.admin, crypto.randomUUID(), now],
  );
  await pool.query(
    `INSERT INTO editorial_entries(
       editorial_entry_id,type,status,slug,title,excerpt,body,metadata,created_by,updated_by,
       created_at,updated_at
     ) VALUES($1,'NEWS','DRAFT','noticia-imagen','Noticia','Resumen','Cuerpo',$2,$3,$3,$4,$4)`,
    [ids.entry, documentMetadata(), ids.admin, now],
  );
  await pool.query(
    `INSERT INTO resource_assets(
       resource_id,resource_class,original_filename_safe,mime_type_real,byte_size,width_px,
       height_px,sha256_hex,secure_storage_key,alt_text,position,state,uploaded_by,uploaded_at,
       validated_at
     ) VALUES($1,'CONTENT_IMAGE','noticia.webp','image/webp',100,640,480,$2,$3,
       'Mesa de juego',1,'ACTIVE',$4,$5,$5)`,
    [ids.resource, 'a'.repeat(64), crypto.randomUUID(), ids.admin, now],
  );
  await pool.query(
    `INSERT INTO editorial_entry_media(
       editorial_media_id,editorial_entry_id,resource_id,created_by,created_at
     ) VALUES($1,$2,$3,$4,$5)`,
    [ids.media, ids.entry, ids.resource, ids.admin, now],
  );
});

afterAll(async () => pool.end());

it('exposes editorial media only while its owning publication is published and references it', async () => {
  await expect(repository.findPublicResource(ids.resource)).resolves.toBeNull();
  await pool.query(
    `UPDATE editorial_entries SET status='PUBLISHED',published_at=$2 WHERE editorial_entry_id=$1`,
    [ids.entry, now],
  );
  await expect(repository.findPublicResource(ids.resource)).resolves.toMatchObject({
    resourceId: ids.resource,
  });
  await pool.query(
    `UPDATE editorial_entries SET metadata='{"document":{"version":1,"blocks":[]}}'::jsonb
      WHERE editorial_entry_id=$1`,
    [ids.entry],
  );
  await expect(repository.findPublicResource(ids.resource)).resolves.toBeNull();
});

it('prevents editorial media ownership from being rewritten or deleted', async () => {
  await expect(
    pool.query(`DELETE FROM editorial_entry_media WHERE editorial_media_id=$1`, [ids.media]),
  ).rejects.toMatchObject({ code: '23514' });
});

function documentMetadata() {
  return JSON.stringify({
    document: {
      blocks: [
        {
          altText: 'Mesa de juego',
          id: ids.resource,
          placement: 'CENTER',
          resourceId: ids.resource,
          type: 'IMAGE',
          width: 'MEDIUM',
        },
      ],
      version: 1,
    },
  });
}
