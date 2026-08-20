import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PayloadRegistry } from '@sergod/contracts';
import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CatalogEntityAdminService } from '../../src/contexts/catalog/application/catalog-entity-admin-service.js';
import { PgCatalogRepository } from '../../src/contexts/catalog/infrastructure/postgres-catalog-repository.js';
import { PreordersAdminService } from '../../src/contexts/preorders/application/preorders-admin-service.js';
import { PreorderLifecycleJob } from '../../src/contexts/preorders/application/preorder-lifecycle-job.js';
import { PgPreordersAdminAuthorizer } from '../../src/contexts/preorders/infrastructure/postgres-preorders-admin-authorizer.js';
import { PgPreordersRepository } from '../../src/contexts/preorders/infrastructure/postgres-preorders-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';
import { CoordinationStore } from '../../src/platform/coordination/coordination-store.js';

const ids = {
  admin: '0198b111-0000-7000-8000-000000000001',
  branch: '0198b111-0000-7000-8000-000000000002',
  category: '0198b111-0000-7000-8000-000000000003',
  client: '0198b111-0000-7000-8000-000000000004',
  game: '0198b111-0000-7000-8000-000000000005',
  product: '0198b111-0000-7000-8000-000000000006',
  position: '0198b111-0000-7000-8000-000000000007',
} as const;
const clock = new FixedClock(new Date('2026-08-10T13:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
let pool: Pool;
let preorders: PreordersAdminService;
let command = 0;

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
}

function context(label: string, actorId: string = ids.admin, key?: string): ExecutionContext {
  command += 1;
  return {
    actorId,
    actorType: 'USER',
    correlationId: crypto.randomUUID(),
    idempotencyKey: key ?? `${label}-${command}`,
  };
}

beforeAll(async () => {
  const url = await databaseUrl();
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
  pool = createPostgresPool(url, { max: 20 });
  preorders = new PreordersAdminService(
    new PgPreordersRepository(pool, clock, uuids),
    new PgPreordersAdminAuthorizer(pool),
    clock,
  );
});

beforeEach(async () => {
  command = 0;
  clock.set(new Date('2026-08-10T13:00:00.000Z'));
  await pool.query(`
    TRUNCATE
      preorder_campaign_state_history,preorder_campaigns,
      inventory_movements,inventory_positions,system_configurations,product_media,
      products,catalog_entity_media,resource_assets,collections,categories,tcg_games,branches,
      user_accounts,idempotency_records,audit_entries,scheduled_job_runs CASCADE
  `);
  await pool.query(
    `INSERT INTO user_accounts (
      account_id,auth_provider_user_id,role,status,current_email,normalized_email,current_phone,
      normalized_phone,email_verification_status,phone_verification_status,created_at,updated_at,status_changed_at
    ) VALUES
      ($1,$2,'ADMIN','ACTIVE','admin@example.test','admin@example.test',NULL,NULL,'VERIFIED','PENDING',$5,$5,$5),
      ($3,$4,'CLIENTE','ACTIVE','client@example.test','client@example.test',NULL,NULL,'VERIFIED','PENDING',$5,$5,$5)`,
    [ids.admin, crypto.randomUUID(), ids.client, crypto.randomUUID(), clock.now()],
  );
  await pool.query(
    `INSERT INTO branches (
      branch_id,name,internal_address,state,timezone,created_by,created_at,updated_at
    ) VALUES ($1,'Sergod Store','Dirección interna','ACTIVE','America/Santiago',$2,$3,$3)`,
    [ids.branch, ids.admin, clock.now()],
  );
  await pool.query(
    `INSERT INTO tcg_games (game_id,name,slug,publication_status,created_at,updated_at)
     VALUES ($1,'Juego preventa','juego-preventa','DRAFT',$2,$2)`,
    [ids.game, clock.now()],
  );
  await pool.query(
    `INSERT INTO categories (category_id,name,publication_status,created_at,updated_at)
     VALUES ($1,'Categoría preventa','DRAFT',$2,$2)`,
    [ids.category, clock.now()],
  );
  await pool.query(
    `INSERT INTO products (
      product_id,sku,game_id,category_id,name,sale_type,price_amount_clp,
      publication_status,created_at,updated_at
    ) VALUES ($1,'PREORDER-INTEGRATION',$2,$3,'Producto preventa','PREORDER',1000,'DRAFT',$4,$4)`,
    [ids.product, ids.game, ids.category, clock.now()],
  );
  await pool.query(
    `INSERT INTO inventory_positions (
      inventory_position_id,product_id,branch_id,on_hand,reserved,version,updated_at
    ) VALUES ($1,$2,$3,0,0,1,$4)`,
    [ids.position, ids.product, ids.branch, clock.now()],
  );
});

afterAll(async () => pool.end());

const campaignInput = {
  branchId: ids.branch,
  capacity: 20,
  closesAt: '2026-08-11T12:00:00.000Z',
  estimatedArrivalText: 'Octubre 2026',
  fulfillmentGroupKey: null,
  opensAt: '2026-08-10T12:00:00.000Z',
  productId: ids.product,
} as const;

async function publishCatalogProduct(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resources = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const [index, resourceId] of resources.entries()) {
      await client.query(
        `INSERT INTO resource_assets (
          resource_id,resource_class,original_filename_safe,mime_type_real,byte_size,width_px,
          height_px,sha256_hex,secure_storage_key,alt_text,position,state,uploaded_by,
          uploaded_at,validated_at
        ) VALUES ($1,'CATALOG_IMAGE',$2,'image/png',1024,320,320,$3,$4,$5,1,'ACTIVE',$6,$7,$7)`,
        [
          resourceId,
          `fixture-${index}.png`,
          String(index + 1).repeat(64),
          `tests/preorders/${resourceId}`,
          `Recurso técnico ${index + 1}`,
          ids.admin,
          clock.now(),
        ],
      );
    }
    await client.query(
      `INSERT INTO catalog_entity_media (media_id,source_type,source_id,resource_id,is_primary,created_at)
       VALUES ($1,'TCG_GAME',$2,$3,true,$7),($4,'CATEGORY',$5,$6,true,$7)`,
      [
        crypto.randomUUID(),
        ids.game,
        resources[0],
        crypto.randomUUID(),
        ids.category,
        resources[1],
        clock.now(),
      ],
    );
    await client.query(
      `INSERT INTO product_media (media_id,product_id,resource_id,is_primary,created_at)
       VALUES ($1,$2,$3,true,$4)`,
      [crypto.randomUUID(), ids.product, resources[2], clock.now()],
    );
    await client.query(`UPDATE tcg_games SET publication_status='PUBLISHED' WHERE game_id=$1`, [
      ids.game,
    ]);
    await client.query(
      `UPDATE categories SET publication_status='PUBLISHED' WHERE category_id=$1`,
      [ids.category],
    );
    await client.query(`UPDATE products SET publication_status='PUBLISHED' WHERE product_id=$1`, [
      ids.product,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe('PostgreSQL preorder base', () => {
  it('creates campaigns idempotently, separates publication and prevents overlaps', async () => {
    const execution = context('create', ids.admin, 'same-create-key');
    const first = await preorders.createCampaign(execution, campaignInput);
    const replay = await preorders.createCampaign(execution, campaignInput);
    expect(replay.item.preorderCampaignId).toBe(first.item.preorderCampaignId);
    expect(replay.replayed).toBe(true);
    expect(first.item).toMatchObject({
      availableCapacity: 20,
      operationalState: 'DRAFT',
      publicationStatus: 'DRAFT',
    });
    await expect(
      pool.query(`UPDATE products SET sale_type='REGULAR' WHERE product_id=$1`, [ids.product]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(preorders.createCampaign(context('overlap'), campaignInput)).rejects.toMatchObject(
      { code: 'PREORDER_UNIQUE_OR_WINDOW_CONFLICT' },
    );
    await expect(
      preorders.transitionPublication(
        context('invalid-publication'),
        first.item.preorderCampaignId,
        { nextStatus: 'PUBLISHED', reason: null },
      ),
    ).rejects.toMatchObject({ code: 'PREORDER_PUBLICATION_STATE_INVALID' });
    await preorders.transitionOperational(context('open'), first.item.preorderCampaignId, {
      nextState: 'OPEN',
      reason: null,
    });
    await publishCatalogProduct();
    await expect(
      preorders.transitionPublication(context('publish'), first.item.preorderCampaignId, {
        nextStatus: 'PUBLISHED',
        reason: null,
      }),
    ).resolves.toMatchObject({ item: { publicationStatus: 'PUBLISHED' } });
    const catalog = new CatalogEntityAdminService(new PgCatalogRepository(pool, clock, uuids), {
      assertCanManageCatalog: async () => undefined,
    });
    await catalog.transitionProduct(context('unpublish-product'), ids.product, {
      nextStatus: 'UNPUBLISHED',
    });
    await expect(
      preorders.getCampaign(context('campaign-after-product'), first.item.preorderCampaignId),
    ).resolves.toMatchObject({ publicationStatus: 'UNPUBLISHED' });
    await expect(
      preorders.getCampaign(context('client', ids.client), first.item.preorderCampaignId),
    ).rejects.toMatchObject({ code: 'PREORDERS_ACCESS_DENIED' });
  });

  it('opens and closes scheduled campaigns once through durable ScheduledJobRun evidence', async () => {
    const created = await preorders.createCampaign(context('create-scheduled'), campaignInput);
    const campaignId = created.item.preorderCampaignId;
    await preorders.transitionOperational(context('schedule'), campaignId, {
      nextState: 'SCHEDULED',
      reason: null,
    });
    const repository = new PgPreordersRepository(pool, clock, uuids);
    const emptyPayloads = new PayloadRegistry([]);
    const job = new PreorderLifecycleJob(
      repository,
      new CoordinationStore(pool, clock, uuids, emptyPayloads, emptyPayloads, randomBytes(32)),
      clock,
    );
    const openingWindow = clock.now();
    const first = await job.run({
      correlationId: crypto.randomUUID(),
      scheduledFor: openingWindow,
    });
    const replay = await job.run({
      correlationId: crypto.randomUUID(),
      scheduledFor: openingWindow,
    });
    expect(first).toMatchObject({ kind: 'COMPLETED', opened: 1 });
    expect(replay).toEqual({ kind: 'SUCCEEDED' });
    clock.set(new Date('2026-08-11T12:00:00.000Z'));
    const close = await job.run({ correlationId: crypto.randomUUID(), scheduledFor: clock.now() });
    expect(close).toMatchObject({ closed: 1, kind: 'COMPLETED' });
    await expect(preorders.getCampaign(context('detail'), campaignId)).resolves.toMatchObject({
      operationalState: 'CLOSED',
      publicationStatus: 'UNPUBLISHED',
    });
    const history = await pool.query<{ count: string }>(
      `SELECT count(*) FROM preorder_campaign_state_history
       WHERE campaign_id=$1 AND dimension='OPERATIONAL' AND to_value IN ('OPEN','CLOSED')`,
      [campaignId],
    );
    expect(history.rows[0]?.count).toBe('2');
  });
});
