import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import { PgHomeCarouselRepository } from '../../src/contexts/home-carousel/postgres-home-carousel-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const adminId = '0198e000-0000-7000-8000-000000000001';
const resourceId = '0198e000-0000-7000-8000-000000000002';
const now = new Date('2026-09-23T12:00:00.000Z');
let pool: Pool;
let repository: PgHomeCarouselRepository;

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
  repository = new PgHomeCarouselRepository(pool, new FixedClock(now), new CryptoUuidGenerator());
});

beforeEach(async () => {
  await pool.query(`TRUNCATE home_carousel_slides,resource_assets,user_accounts,
    idempotency_records,audit_entries CASCADE`);
  await pool.query(
    `INSERT INTO user_accounts(account_id,auth_provider_user_id,role,status,current_email,
      normalized_email,email_verification_status,phone_verification_status,
      created_at,updated_at,status_changed_at)
     VALUES($1,$2,'ADMIN','ACTIVE','admin@example.test','admin@example.test',
      'VERIFIED','PENDING',$3,$3,$3)`,
    [adminId, crypto.randomUUID(), now],
  );
  await pool.query(
    `INSERT INTO resource_assets(resource_id,resource_class,original_filename_safe,
      mime_type_real,byte_size,width_px,height_px,sha256_hex,secure_storage_key,
      alt_text,position,state,uploaded_by,uploaded_at,validated_at)
     VALUES($1,'CONTENT_IMAGE','banner.webp','image/webp',100,1200,800,$2,$3,
      'Banner',1,'ACTIVE',$4,$5,$5)`,
    [resourceId, 'a'.repeat(64), `home/carousel/${resourceId}`, adminId, now],
  );
});

afterAll(async () => pool?.end());

it('persists, lists, edits and hides a carousel banner without duplicating a retry', async () => {
  const context: ExecutionContext = {
    actorId: adminId,
    actorType: 'USER',
    correlationId: crypto.randomUUID(),
    idempotencyKey: 'carousel-create-test',
  };
  const input = {
    active: true,
    altText: 'Visitar la tienda',
    fingerprint: 'banner-upload-fingerprint',
    linkPath: '/shop',
    resourceId,
  };
  await repository.create(context, input);
  await repository.create(context, input);
  const listed = await repository.list(true);
  expect(listed.items).toHaveLength(1);
  expect(listed.items[0]).toMatchObject({
    active: true,
    altText: input.altText,
    linkPath: '/shop',
  });
  const slideId = listed.items[0]?.slideId;
  if (!slideId) throw new Error('Carousel slide was not persisted.');
  expect(await repository.resource(slideId, true)).toMatchObject({ resourceId });

  await repository.update({ ...context, idempotencyKey: 'carousel-update-test' }, slideId, {
    active: false,
    altText: 'Visitar Preventas',
    expectedVersion: 1,
    linkPath: '/preorders',
  });
  expect((await repository.list(false)).items[0]).toMatchObject({
    active: false,
    altText: 'Visitar Preventas',
    linkPath: '/preorders',
    version: 2,
  });
  expect((await repository.list(true)).items).toHaveLength(0);
  expect(await repository.resource(slideId, true)).toBeNull();
  expect(await repository.resource(slideId, false)).toMatchObject({ resourceId });
});
