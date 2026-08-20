import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PayloadRegistry } from '@sergod/contracts';
import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CartExpirationJob } from '../../src/contexts/commerce-orders/application/cart-expiration-job.js';
import { CartService } from '../../src/contexts/commerce-orders/application/cart-service.js';
import { CheckoutService } from '../../src/contexts/commerce-orders/application/checkout-service.js';
import { PgCartRepository } from '../../src/contexts/commerce-orders/infrastructure/postgres-cart-repository.js';
import { PgCheckoutRepository } from '../../src/contexts/commerce-orders/infrastructure/postgres-checkout-repository.js';
import { CartError, type CartOwner } from '../../src/contexts/commerce-orders/domain/cart.js';
import { ServiceCoverageService } from '../../src/contexts/service-coverage/application/service-coverage-service.js';
import { PgServiceCoverageRepository } from '../../src/contexts/service-coverage/infrastructure/postgres-service-coverage-repository.js';
import { CoordinationStore } from '../../src/platform/coordination/coordination-store.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const ids = {
  account: '0198a8be-6677-7000-8000-000000000001',
  accountTwo: '0198a8be-6677-7000-8000-000000000002',
  admin: '0198a8be-6677-7000-8000-000000000003',
  branch: '0198a8be-6677-7000-8000-000000000004',
  category: '0198a8be-6677-7000-8000-000000000005',
  game: '0198a8be-6677-7000-8000-000000000006',
  preorder: '0198a8be-6677-7000-8000-000000000007',
  preorderTwo: '0198a8be-6677-7000-8000-000000000008',
  regular: '0198a8be-6677-7000-8000-000000000009',
} as const;
const anonymous: CartOwner = { anonymousSessionId: 'a'.repeat(64), kind: 'ANONYMOUS' };
const anonymousTwo: CartOwner = { anonymousSessionId: 'b'.repeat(64), kind: 'ANONYMOUS' };
const account: CartOwner = { accountId: ids.account, kind: 'ACCOUNT' };
const accountTwo: CartOwner = { accountId: ids.accountTwo, kind: 'ACCOUNT' };
const clock = new FixedClock(new Date('2026-08-11T12:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
let pool: Pool;
let job: CartExpirationJob;
let repository: PgCartRepository;
let service: CartService;
let checkout: CheckoutService;
let command = 0;

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
}
function context(label: string, actorId?: string, key?: string): ExecutionContext {
  command += 1;
  return {
    ...(actorId === undefined ? {} : { actorId }),
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
  repository = new PgCartRepository(pool, clock, uuids);
  service = new CartService(repository);
  checkout = new CheckoutService(
    new PgCheckoutRepository(
      pool,
      clock,
      uuids,
      new ServiceCoverageService(new PgServiceCoverageRepository(pool, clock, uuids)),
    ),
  );
  const payloads = new PayloadRegistry([]);
  job = new CartExpirationJob(
    repository,
    new CoordinationStore(pool, clock, uuids, payloads, payloads, Buffer.alloc(32, 9)),
    clock,
  );
});
afterAll(async () => pool.end());

beforeEach(async () => {
  command = 0;
  clock.set(new Date('2026-08-11T12:00:00.000Z'));
  await pool.query(`TRUNCATE carts,preorder_commitments,
    loyalty_effect_progress,promotion_usages,pos_sale_settlements,pos_sale_state_history,pos_sale_lines,pos_sales,
    preorder_campaign_state_history,preorder_campaigns,inventory_movements,inventory_positions,
    system_configurations,product_media,catalog_entity_media,resource_assets,products,collections,
    categories,tcg_games,branches,user_accounts,idempotency_records,audit_entries,
    scheduled_job_runs CASCADE`);
  await pool.query(
    `INSERT INTO user_accounts(account_id,auth_provider_user_id,role,status,current_email,
      normalized_email,email_verification_status,phone_verification_status,created_at,updated_at,status_changed_at)
     VALUES($1,$2,'ADMIN','ACTIVE','admin@test','admin@test','VERIFIED','PENDING',$7,$7,$7),
       ($3,$4,'CLIENTE','ACTIVE','one@test','one@test','VERIFIED','PENDING',$7,$7,$7),
       ($5,$6,'CLIENTE','ACTIVE','two@test','two@test','VERIFIED','PENDING',$7,$7,$7)`,
    [
      ids.admin,
      crypto.randomUUID(),
      ids.account,
      crypto.randomUUID(),
      ids.accountTwo,
      crypto.randomUUID(),
      clock.now(),
    ],
  );
  await pool.query(
    `INSERT INTO branches(branch_id,name,internal_address,state,timezone,created_by,created_at,updated_at)
     VALUES($1,'Store','internal','ACTIVE','America/Santiago',$2,$3,$3)`,
    [ids.branch, ids.admin, clock.now()],
  );
  await pool.query(
    `INSERT INTO system_configurations(system_configuration_id,configuration_key,scope,value_type,
      integer_value,version_number,state,created_by,created_at,activated_by,activated_at,correlation_id)
     VALUES($1,'ANONYMOUS_CART_INACTIVITY_MINUTES','GLOBAL','INTEGER',30,1,'ACTIVE',$2,$3,$2,$3,$4)`,
    [crypto.randomUUID(), ids.admin, clock.now(), crypto.randomUUID()],
  );
  await pool.query(`INSERT INTO tcg_games VALUES($1,'Game','cart-game',NULL,'DRAFT',$2,$2,NULL)`, [
    ids.game,
    clock.now(),
  ]);
  await pool.query(`INSERT INTO categories VALUES($1,'Category',NULL,'DRAFT',$2,$2,NULL)`, [
    ids.category,
    clock.now(),
  ]);
  for (const [productId, saleType, price] of [
    [ids.regular, 'REGULAR', 3100],
    [ids.preorder, 'PREORDER', 10000],
    [ids.preorderTwo, 'PREORDER', 12000],
  ] as const) {
    await pool.query(
      `INSERT INTO products(product_id,sku,game_id,category_id,name,sale_type,price_amount_clp,
        publication_status,created_at,updated_at)
       VALUES($1,$2,$3,$4,$2,$5,$6,'DRAFT',$7,$7)`,
      [
        productId,
        `CART-${saleType}-${productId}`,
        ids.game,
        ids.category,
        saleType,
        price,
        clock.now(),
      ],
    );
  }
  const resources = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  for (const [index, resourceId] of resources.entries()) {
    await pool.query(
      `INSERT INTO resource_assets(resource_id,resource_class,original_filename_safe,mime_type_real,
        byte_size,width_px,height_px,sha256_hex,secure_storage_key,alt_text,position,state,
        uploaded_by,uploaded_at,validated_at)
       VALUES($1,'CATALOG_IMAGE',$2,'image/png',100,320,320,$3,$4,'Cart test image',1,
        'ACTIVE',$5,$6,$6)`,
      [
        resourceId,
        `cart-${index}.png`,
        index.toString(16).padStart(64, 'c'),
        `cart/${resourceId}`,
        ids.admin,
        clock.now(),
      ],
    );
  }
  await pool.query(
    `INSERT INTO catalog_entity_media VALUES($1,'TCG_GAME',$2,$3,true,$4),($5,'CATEGORY',$6,$7,true,$4)`,
    [
      crypto.randomUUID(),
      ids.game,
      resources[0],
      clock.now(),
      crypto.randomUUID(),
      ids.category,
      resources[1],
    ],
  );
  for (const [productId, resourceId] of [
    [ids.regular, resources[2]],
    [ids.preorder, resources[3]],
    [ids.preorderTwo, resources[4]],
  ] as const) {
    await pool.query(`INSERT INTO product_media VALUES($1,$2,$3,true,$4)`, [
      crypto.randomUUID(),
      productId,
      resourceId,
      clock.now(),
    ]);
  }
  await pool.query(`UPDATE tcg_games SET publication_status='PUBLISHED' WHERE game_id=$1`, [
    ids.game,
  ]);
  await pool.query(`UPDATE categories SET publication_status='PUBLISHED' WHERE category_id=$1`, [
    ids.category,
  ]);
  await pool.query(
    `UPDATE products SET publication_status='PUBLISHED' WHERE product_id=ANY($1::uuid[])`,
    [[ids.regular, ids.preorder, ids.preorderTwo]],
  );
  for (const productId of [ids.regular, ids.preorder, ids.preorderTwo]) {
    await pool.query(
      `INSERT INTO inventory_positions(inventory_position_id,product_id,branch_id,on_hand,reserved,version,updated_at)
       VALUES($1,$2,$3,$4,0,1,$5)`,
      [crypto.randomUUID(), productId, ids.branch, productId === ids.regular ? 5 : 0, clock.now()],
    );
  }
});

async function campaign(productId: string, key: string | null = null): Promise<string> {
  const campaignId = crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO preorder_campaigns(preorder_campaign_id,product_id,branch_id,fulfillment_group_key,
        operational_state,publication_status,capacity,opens_at,closes_at,estimated_arrival_text,
        published_at,created_by,created_at,updated_at)
       VALUES($1,$2,$3,$4,'OPEN','PUBLISHED',5,$5,$6,'October 2026',$5,$7,$5,$5)`,
      [
        campaignId,
        productId,
        ids.branch,
        key,
        new Date('2026-08-11T11:00:00Z'),
        new Date('2026-08-12T12:00:00Z'),
        ids.admin,
      ],
    );
    await client.query('COMMIT');
  } finally {
    await safeRollback(client);
    client.release();
  }
  return campaignId;
}
async function create(owner: CartOwner, actorId?: string, key?: string) {
  return service.createCurrent(context('create', actorId, key), owner);
}
async function add(
  owner: CartOwner,
  productId: string,
  preorderCampaignId: string | null,
  key?: string,
) {
  return service.addLine(
    context('add', owner.kind === 'ACCOUNT' ? owner.accountId : undefined, key),
    owner,
    {
      preorderCampaignId,
      productId,
      quantity: 1,
    },
  );
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected integration fixture value.');
  return value;
}

describe('PostgreSQL Phase 9A cart', () => {
  it('creates and recovers one isolated ACTIVE cart per owner without reservations', async () => {
    const first = await create(anonymous);
    const second = await create(anonymous);
    expect(second.item.cartId).toBe(first.item.cartId);
    expect((await service.getCurrent(anonymous)).item?.expiresAt).toBe('2026-08-11T12:30:00.000Z');
    await create(account, ids.account);
    expect((await service.getCurrent(account)).item?.expiresAt).toBeNull();
    expect((await service.getCurrent(anonymousTwo)).item).toBeNull();
    expect((await service.getCurrent(accountTwo)).item).toBeNull();
    expect(
      (await pool.query(`SELECT count(*)::int count FROM inventory_movements`)).rows[0]?.count,
    ).toBe(0);
    for (const table of [
      'loyalty_movements',
      'pos_sales',
      'preorder_commitments',
      'promotion_usages',
    ]) {
      expect((await pool.query(`SELECT count(*)::int count FROM ${table}`)).rows[0]?.count).toBe(0);
    }
    expect(
      (
        await pool.query(
          `SELECT on_hand,reserved,version FROM inventory_positions ORDER BY product_id`,
        )
      ).rows,
    ).toEqual([
      { on_hand: '0', reserved: '0', version: '1' },
      { on_hand: '0', reserved: '0', version: '1' },
      { on_hand: '5', reserved: '0', version: '1' },
    ]);
  });

  it('requires the active anonymous inactivity configuration and never invents a default', async () => {
    await pool.query(
      `UPDATE system_configurations SET state='RETIRED',retired_by=$1,retired_at=$2
        WHERE state='ACTIVE'`,
      [ids.admin, clock.now()],
    );
    await expect(create(anonymous)).rejects.toMatchObject({
      code: 'CART_ANONYMOUS_INACTIVITY_CONFIGURATION_REQUIRED',
    });
    expect((await pool.query(`SELECT count(*)::int count FROM carts`)).rows[0]?.count).toBe(0);
  });

  it('keeps REGULAR and PREORDER campaigns in normative compatible groups', async () => {
    const ownCampaign = await campaign(ids.preorder);
    const otherCampaign = await campaign(ids.preorderTwo);
    await create(anonymous);
    await pool.query(
      `UPDATE products SET language='es-CL',edition='FIRST EDITION',condition='NEAR MINT'
        WHERE product_id=$1`,
      [ids.regular],
    );
    await add(anonymous, ids.regular, null);
    await add(anonymous, ids.preorder, ownCampaign);
    const result = await add(anonymous, ids.preorderTwo, otherCampaign);
    expect(
      result.item.groups
        .filter((group) => group.state === 'ACTIVE')
        .map((group) => group.groupType)
        .sort(),
    ).toEqual(['PREORDER', 'PREORDER', 'REGULAR']);
    expect(result.item.groups.flatMap((group) => group.lines)).toHaveLength(3);
    expect(
      result.item.groups
        .flatMap((group) => group.lines)
        .find((line) => line.productId === ids.regular),
    ).toMatchObject({ condition: 'NEAR MINT', edition: 'FIRST EDITION', language: 'es-CL' });
  });

  it('groups compatible PREORDER campaigns by non-empty fulfillment_group_key', async () => {
    const first = await campaign(ids.preorder, 'OCTOBER-WAVE');
    const second = await campaign(ids.preorderTwo, 'OCTOBER-WAVE');
    await create(anonymous);
    await add(anonymous, ids.preorder, first);
    const result = await add(anonymous, ids.preorderTwo, second);
    const preorderGroups = result.item.groups.filter(
      (group) => group.groupType === 'PREORDER' && group.state === 'ACTIVE',
    );
    expect(preorderGroups).toHaveLength(1);
    expect(preorderGroups[0]?.lines).toHaveLength(2);
  });

  it('renews only valid mutations and rolls back rejected input without side effects', async () => {
    const created = await create(anonymous);
    const initialExpiry = created.item.expiresAt;
    clock.set(new Date('2026-08-11T12:05:00.000Z'));
    const added = await add(anonymous, ids.regular, null);
    expect(added.item.expiresAt).toBe('2026-08-11T12:35:00.000Z');
    const line = added.item.groups[0]?.lines[0];
    expect(line).toBeDefined();
    const updated = await service.updateLine(
      context('update'),
      anonymous,
      required(line).cartLineId,
      { quantity: 3 },
    );
    expect(updated.item.groups[0]?.lines[0]?.quantity).toBe(3);
    clock.set(new Date('2026-08-11T12:06:00.000Z'));
    await expect(add(anonymous, crypto.randomUUID(), null)).rejects.toBeInstanceOf(CartError);
    expect((await service.getCurrent(anonymous)).item?.expiresAt).toBe('2026-08-11T12:35:00.000Z');
    expect(initialExpiry).not.toBe(added.item.expiresAt);
    expect(
      (
        await pool.query(
          `SELECT count(*)::int count FROM audit_entries WHERE resource_type<>'CART'`,
        )
      ).rows[0]?.count,
    ).toBe(0);
  });

  it('updates and removes lines, and an emptied conflict group becomes REMOVED', async () => {
    const preorderCampaign = await campaign(ids.preorder);
    await create(anonymous);
    const added = await add(anonymous, ids.preorder, preorderCampaign);
    const lineId = added.item.groups[0]?.lines[0]?.cartLineId;
    expect(lineId).toBeDefined();
    await pool.query(
      `UPDATE preorder_campaigns SET operational_state='CANCELLED',publication_status='UNPUBLISHED',unpublished_at=$2 WHERE preorder_campaign_id=$1`,
      [preorderCampaign, clock.now()],
    );
    await create(account, ids.account);
    const merged = await service.merge(
      context('merge', ids.account),
      ids.account,
      anonymous.anonymousSessionId,
    );
    const conflictLine = merged.item.groups.find((group) => group.groupType === 'CONFLICT')
      ?.lines[0];
    expect(conflictLine).toBeDefined();
    await service.removeLine(
      context('remove', ids.account),
      account,
      required(conflictLine).cartLineId,
    );
    const current = (await service.getCurrent(account)).item;
    expect(current?.groups.find((group) => group.groupType === 'CONFLICT')?.state).toBe('REMOVED');
  });

  it('replays the same mutation and rejects the same key with another fingerprint', async () => {
    await create(anonymous);
    const first = await add(anonymous, ids.regular, null, 'same-add');
    const replay = await add(anonymous, ids.regular, null, 'same-add');
    expect(replay.replayed).toBe(true);
    expect(replay.item.groups[0]?.lines[0]?.quantity).toBe(1);
    await expect(
      service.addLine(context('add', undefined, 'same-add'), anonymous, {
        preorderCampaignId: null,
        productId: ids.regular,
        quantity: 2,
      }),
    ).rejects.toMatchObject({ code: 'CART_IDEMPOTENCY_CONFLICT' });
    expect((await service.getCurrent(anonymous)).item?.groups[0]?.lines[0]?.quantity).toBe(1);
    expect(first.item.cartId).toBe(replay.item.cartId);
  });

  it('merges into a newly created account cart once and leaves the anonymous origin final', async () => {
    await create(anonymous);
    await add(anonymous, ids.regular, null);
    const key = 'merge-new-account';
    const first = await service.merge(
      context('merge', ids.account, key),
      ids.account,
      anonymous.anonymousSessionId,
    );
    const replay = await service.merge(
      context('merge', ids.account, key),
      ids.account,
      anonymous.anonymousSessionId,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.item.cartId).toBe(first.item.cartId);
    expect(replay.item.groups.flatMap((group) => group.lines)).toHaveLength(1);
    const source = await pool.query(
      `SELECT state,merged_into_cart_id FROM carts WHERE anonymous_session_id=$1`,
      [anonymous.anonymousSessionId],
    );
    expect(source.rows[0]).toMatchObject({
      state: 'MERGED',
      merged_into_cart_id: first.item.cartId,
    });
    await expect(add(anonymous, ids.regular, null)).rejects.toMatchObject({
      code: 'CART_NOT_FOUND',
    });
  });

  it('merges with an existing account cart and combines only identical compatible lines', async () => {
    await create(account, ids.account);
    await add(account, ids.regular, null);
    await create(anonymous);
    await add(anonymous, ids.regular, null);
    const merged = await service.merge(
      context('merge', ids.account),
      ids.account,
      anonymous.anonymousSessionId,
    );
    expect(
      merged.item.groups.find((group) => group.groupType === 'REGULAR')?.lines[0]?.quantity,
    ).toBe(2);
    expect(
      (
        await pool.query(
          `SELECT count(*)::int count FROM carts WHERE owner_account_id=$1 AND state='ACTIVE'`,
          [ids.account],
        )
      ).rows[0]?.count,
    ).toBe(1);
  });

  it('preserves incompatible merged lines in CONFLICT and resolves only explicitly', async () => {
    const preorderCampaign = await campaign(ids.preorder);
    await create(anonymous);
    await add(anonymous, ids.preorder, preorderCampaign);
    await pool.query(
      `UPDATE preorder_campaigns SET operational_state='CANCELLED',publication_status='UNPUBLISHED',unpublished_at=$2 WHERE preorder_campaign_id=$1`,
      [preorderCampaign, clock.now()],
    );
    const merged = await service.merge(
      context('merge', ids.account),
      ids.account,
      anonymous.anonymousSessionId,
    );
    const conflictGroup = merged.item.groups.find((group) => group.groupType === 'CONFLICT');
    expect(conflictGroup?.conflictReasonCodes).toEqual(['CART_GROUP_INCOMPATIBLE']);
    const lineId = conflictGroup?.lines[0]?.cartLineId;
    expect(lineId).toBeDefined();
    await expect(
      service.createCompatibleGroup(context('resolve', ids.account), account, required(lineId)),
    ).rejects.toMatchObject({ code: 'CART_PRODUCT_NOT_AVAILABLE' });
    expect(
      (await service.getCurrent(account)).item?.groups.find(
        (group) => group.groupType === 'CONFLICT',
      )?.state,
    ).toBe('CONFLICT');
  });

  it('revalidates the existing account cart during merge without discarding incompatible lines', async () => {
    const preorderCampaign = await campaign(ids.preorder);
    await create(account, ids.account);
    await add(account, ids.preorder, preorderCampaign);
    await pool.query(
      `UPDATE preorder_campaigns SET publication_status='UNPUBLISHED',unpublished_at=$2
        WHERE preorder_campaign_id=$1`,
      [preorderCampaign, clock.now()],
    );
    await create(anonymous);
    const merged = await service.merge(
      context('revalidate-destination', ids.account),
      ids.account,
      anonymous.anonymousSessionId,
    );
    expect(
      merged.item.groups.find((group) => group.groupType === 'CONFLICT')?.lines[0],
    ).toMatchObject({ preorderCampaignId: preorderCampaign, productId: ids.preorder });
    expect(merged.item.groups.find((group) => group.groupType === 'PREORDER')?.state).toBe(
      'REMOVED',
    );
  });

  it('moves a conflict line to an explicitly selected compatible group and removes the empty conflict', async () => {
    const preorderCampaign = await campaign(ids.preorder, 'MOVE-WAVE');
    const targetCampaign = await campaign(ids.preorderTwo, 'MOVE-WAVE');
    await create(account, ids.account);
    const accountAdded = await add(account, ids.preorderTwo, targetCampaign);
    const target = required(accountAdded.item.groups[0]).cartGroupId;
    await create(anonymous);
    await add(anonymous, ids.preorder, preorderCampaign);
    await pool.query(
      `UPDATE preorder_campaigns SET publication_status='UNPUBLISHED',unpublished_at=$2 WHERE preorder_campaign_id=$1`,
      [preorderCampaign, clock.now()],
    );
    const merged = await service.merge(
      context('merge', ids.account),
      ids.account,
      anonymous.anonymousSessionId,
    );
    const conflictLine = merged.item.groups.find((group) => group.groupType === 'CONFLICT')
      ?.lines[0];
    expect(conflictLine).toBeDefined();
    await pool.query(
      `UPDATE preorder_campaigns SET publication_status='PUBLISHED',unpublished_at=NULL WHERE preorder_campaign_id=$1`,
      [preorderCampaign],
    );
    const moved = await service.moveConflictLine(
      context('move', ids.account),
      account,
      required(conflictLine).cartLineId,
      { targetGroupId: target },
    );
    expect(moved.item.groups.find((group) => group.cartGroupId === target)?.lines).toHaveLength(2);
    expect(moved.item.groups.find((group) => group.groupType === 'CONFLICT')?.state).toBe(
      'REMOVED',
    );
  });

  it('creates a new compatible group only through explicit conflict resolution', async () => {
    const preorderCampaign = await campaign(ids.preorder);
    await create(anonymous);
    await add(anonymous, ids.preorder, preorderCampaign);
    await pool.query(
      `UPDATE preorder_campaigns SET publication_status='UNPUBLISHED',unpublished_at=$2 WHERE preorder_campaign_id=$1`,
      [preorderCampaign, clock.now()],
    );
    const merged = await service.merge(
      context('merge', ids.account),
      ids.account,
      anonymous.anonymousSessionId,
    );
    const lineId = merged.item.groups.find((group) => group.groupType === 'CONFLICT')?.lines[0]
      ?.cartLineId;
    await pool.query(
      `UPDATE preorder_campaigns SET publication_status='PUBLISHED',unpublished_at=NULL WHERE preorder_campaign_id=$1`,
      [preorderCampaign],
    );
    const resolved = await service.createCompatibleGroup(
      context('resolve', ids.account),
      account,
      required(lineId),
    );
    expect(
      resolved.item.groups.find(
        (group) => group.groupType === 'PREORDER' && group.state === 'ACTIVE',
      )?.lines,
    ).toHaveLength(1);
    expect(resolved.item.groups.find((group) => group.groupType === 'CONFLICT')?.state).toBe(
      'REMOVED',
    );
  });

  it('expires anonymous carts idempotently and never expires authenticated carts', async () => {
    await create(anonymous);
    await create(account, ids.account);
    clock.set(new Date('2026-08-11T12:31:00.000Z'));
    const first = await repository.processExpiredAnonymousCarts(
      { actorType: 'SYSTEM', correlationId: crypto.randomUUID() },
      clock.now(),
    );
    const second = await repository.processExpiredAnonymousCarts(
      { actorType: 'SYSTEM', correlationId: crypto.randomUUID() },
      clock.now(),
    );
    expect(first.expired).toBe(1);
    expect(second.expired).toBe(0);
    expect((await service.getCurrent(anonymous)).item).toBeNull();
    expect((await service.getCurrent(account)).item?.state).toBe('ACTIVE');
  });

  it('records one durable scheduled expiration run and safely replays its slot', async () => {
    await create(anonymous);
    clock.set(new Date('2026-08-11T12:31:00.000Z'));
    const scheduledFor = new Date('2026-08-11T12:31:00.000Z');
    await expect(
      job.run({ correlationId: crypto.randomUUID(), scheduledFor }),
    ).resolves.toMatchObject({
      expired: 1,
      kind: 'COMPLETED',
    });
    await expect(job.run({ correlationId: crypto.randomUUID(), scheduledFor })).resolves.toEqual({
      kind: 'SUCCEEDED',
    });
    expect(
      (
        await pool.query(`SELECT count(*)::int count FROM scheduled_job_runs
        WHERE job_name='ANONYMOUS_CART_EXPIRATION'`)
      ).rows[0]?.count,
    ).toBe(1);
  });

  it('isolates line mutations between accounts', async () => {
    await create(account, ids.account);
    const first = await add(account, ids.regular, null);
    await create(accountTwo, ids.accountTwo);
    const foreignLineId = required(first.item.groups[0]?.lines[0]?.cartLineId);
    await expect(
      service.updateLine(context('foreign-update', ids.accountTwo), accountTwo, foreignLineId, {
        quantity: 2,
      }),
    ).rejects.toMatchObject({ code: 'CART_LINE_NOT_FOUND' });
    expect((await service.getCurrent(account)).item?.groups[0]?.lines[0]?.quantity).toBe(1);
  });

  it('lets a concurrent authentication merge prevent stale anonymous expiration', async () => {
    const created = await create(anonymous);
    clock.set(new Date('2026-08-11T12:31:00.000Z'));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT 1 FROM carts WHERE cart_id=$1 FOR UPDATE`, [created.item.cartId]);
      const merge = service.merge(
        context('concurrent-merge', ids.account),
        ids.account,
        anonymous.anonymousSessionId,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      const expiration = await repository.processExpiredAnonymousCarts(
        { actorType: 'SYSTEM', correlationId: crypto.randomUUID() },
        clock.now(),
      );
      expect(expiration.expired).toBe(0);
      await client.query('COMMIT');
      expect((await merge).item.ownerKind).toBe('ACCOUNT');
      const source = await pool.query(`SELECT state FROM carts WHERE cart_id=$1`, [
        created.item.cartId,
      ]);
      expect(source.rows[0]?.state).toBe('MERGED');
    } finally {
      await safeRollback(client);
      client.release();
    }
  });

  it('rechecks the locked expiration predicate so a concurrent renewal prevents stale expiry', async () => {
    const created = await create(anonymous);
    clock.set(new Date('2026-08-11T12:31:00.000Z'));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT 1 FROM carts WHERE cart_id=$1 FOR UPDATE`, [created.item.cartId]);
      const expiration = repository.processExpiredAnonymousCarts(
        { actorType: 'SYSTEM', correlationId: crypto.randomUUID() },
        clock.now(),
      );
      await client.query(
        `UPDATE carts SET expires_at=$2,updated_at=$3,version=version+1 WHERE cart_id=$1`,
        [created.item.cartId, new Date('2026-08-11T13:01:00Z'), clock.now()],
      );
      await client.query('COMMIT');
      expect((await expiration).expired).toBe(0);
      expect((await service.getCurrent(anonymous)).item?.state).toBe('ACTIVE');
    } finally {
      await safeRollback(client);
      client.release();
    }
  });

  it('enforces database ownership, active uniqueness, positive quantities and default-deny RLS', async () => {
    await create(anonymous);
    await expect(
      pool.query(
        `INSERT INTO carts(cart_id,anonymous_session_id,state,expires_at,version,created_at,updated_at)
       VALUES($1,$2,'ACTIVE',$3,1,$4,$4)`,
        [
          crypto.randomUUID(),
          anonymous.anonymousSessionId,
          new Date('2026-08-11T13:00:00Z'),
          clock.now(),
        ],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      pool.query(
        `INSERT INTO carts(cart_id,state,version,created_at,updated_at) VALUES($1,'ACTIVE',1,$2,$2)`,
        [crypto.randomUUID(), clock.now()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const rls = await pool.query(
      `SELECT relname,relrowsecurity FROM pg_class WHERE relname=ANY($1::text[]) ORDER BY relname`,
      [['cart_groups', 'cart_lines', 'carts']],
    );
    expect(rls.rows).toEqual([
      { relname: 'cart_groups', relrowsecurity: true },
      { relname: 'cart_lines', relrowsecurity: true },
      { relname: 'carts', relrowsecurity: true },
    ]);
    const policies = await pool.query(
      `SELECT count(*)::int count FROM pg_policies WHERE tablename=ANY($1::text[])`,
      [['cart_groups', 'cart_lines', 'carts']],
    );
    expect(policies.rows[0]?.count).toBe(0);
  });
});

async function activeAccountGroup(
  productId: string = ids.regular,
  preorderCampaignId: string | null = null,
) {
  await create(account, ids.account);
  const added = await add(account, productId, preorderCampaignId);
  return required(added.item.groups.find((group) => group.state === 'ACTIVE')).cartGroupId;
}

async function publishPickup(): Promise<void> {
  const infoId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const body = {
    directions: null,
    mapUrl: null,
    openingHours: 'Lunes a viernes 10:00-18:00',
    publicAddress: 'Dirección pública de prueba',
    publicContacts: 'Contacto público de prueba',
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO content_revisions(revision_id,source_type,source_id,revision_number,
        snapshot_contract,snapshot_schema_version,title_snapshot,summary_snapshot,
        body_or_description_snapshot,slug_snapshot,public_byline_snapshot,
        editorial_state_snapshot,public_published_at_snapshot,public_withdrawn_at_snapshot,
        featured_or_content_position_snapshot,author_public_id_snapshot,ordered_resources_snapshot,
        changed_by,changed_at,reason)
       VALUES($1,'PUBLIC_SERVICE_INFO',$2,1,'ContentRevisionSnapshot.v1',1,
        'Public service information',NULL,$3,NULL,NULL,'PUBLISHED',$4,NULL,NULL,NULL,'[]',$5,$4,
        'CHECKOUT_PICKUP_FIXTURE')`,
      [revisionId, infoId, body, clock.now(), ids.admin],
    );
    await client.query(
      `INSERT INTO public_service_info(public_service_info_id,branch_id,public_address,
        opening_hours,public_contacts,directions,map_url,state,current_revision_number,
        current_published_revision_id,author_account_id,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,NULL,NULL,'PUBLISHED',1,$6,$7,$8,$8)`,
      [
        infoId,
        ids.branch,
        body.publicAddress,
        body.openingHours,
        body.publicContacts,
        revisionId,
        ids.admin,
        clock.now(),
      ],
    );
    await client.query('COMMIT');
  } finally {
    await safeRollback(client);
    client.release();
  }
}

function checkoutContext(label: string, key: string = crypto.randomUUID()): ExecutionContext {
  return { ...context(label, ids.account, key), causationId: crypto.randomUUID() };
}

async function selectPickup(groupId: string, key: string = crypto.randomUUID()) {
  return checkout.replaceIntent(checkoutContext('pickup', key), ids.account, groupId, {
    branchId: ids.branch,
    mode: 'PICKUP',
  });
}

function freightCollectShippingIntent(carrier: 'CHILEXPRESS' | 'STARKEN' = 'CHILEXPRESS') {
  return {
    agencyDestination: 'Agencia centro de Copiapó',
    carrier,
    destinationCommune: 'Copiapó',
    destinationType: 'CARRIER_AGENCY' as const,
    mode: 'SHIPPING' as const,
    recipientName: 'Cliente Uno',
    shippingIncludedInOrderTotal: false as const,
    shippingPaymentMode: 'FREIGHT_COLLECT' as const,
  };
}

describe('PostgreSQL Phase 9B provisional checkout', () => {
  it('creates, reads, edits and clears exactly one provisional delivery intent', async () => {
    await publishPickup();
    const groupId = await activeAccountGroup();
    const pickup = await selectPickup(groupId);
    expect(pickup.item.deliveryIntent).toMatchObject({ mode: 'PICKUP', validationStatus: 'VALID' });
    const changed = await checkout.replaceIntent(
      checkoutContext('shipping'),
      ids.account,
      groupId,
      freightCollectShippingIntent(),
    );
    expect(changed.item.deliveryIntent).toMatchObject({
      destinationCommune: 'Copiapó',
      mode: 'SHIPPING',
      shippingPaymentMode: 'FREIGHT_COLLECT',
    });
    expect((await checkout.getSummary(ids.account, groupId)).item.deliveryIntent).toMatchObject({
      mode: 'SHIPPING',
    });
    const cleared = await checkout.clearIntent(
      checkoutContext('clear-intent'),
      ids.account,
      groupId,
    );
    expect(cleared.item.deliveryIntent).toBeNull();
    expect(
      (
        await pool.query(
          `SELECT count(*)::int count FROM cart_groups WHERE cart_group_id=$1 AND delivery_mode IS NOT NULL`,
          [groupId],
        )
      ).rows[0]?.count,
    ).toBe(0);
  });

  it('rejects missing pickup information without changing a prior valid intent', async () => {
    const groupId = await activeAccountGroup();
    await checkout.replaceIntent(
      checkoutContext('shipping'),
      ids.account,
      groupId,
      freightCollectShippingIntent(),
    );
    await expect(selectPickup(groupId)).rejects.toMatchObject({
      code: 'PICKUP_INFORMATION_NOT_PUBLISHED',
    });
    expect((await checkout.getSummary(ids.account, groupId)).item.deliveryIntent).toMatchObject({
      mode: 'SHIPPING',
    });
  });

  it('validates nationwide freight collect without adding shipping to the order total', async () => {
    const groupId = await activeAccountGroup();
    let result = await checkout.replaceIntent(
      checkoutContext('shipping'),
      ids.account,
      groupId,
      freightCollectShippingIntent('STARKEN'),
    );
    expect(result.item).toMatchObject({
      canCreateOrder: true,
      shippingCostAmountClp: null,
      shippingIncludedInOrderTotal: false,
      shippingPaymentMode: 'FREIGHT_COLLECT',
    });
    expect(result.item.totalAmountClp).toBe(result.item.orderTotalWithoutShippingClp);
    result = await checkout.revalidate(checkoutContext('nationwide'), ids.account, groupId);
    expect(result.item.validationErrorCodes).toEqual([]);
    expect(result.item.deliveryIntent).toMatchObject({
      agencyDestination: 'Agencia centro de Copiapó',
      carrier: 'STARKEN',
    });
  });

  it('isolates ownership and rejects inactive, unverified, conflict and removed groups', async () => {
    await publishPickup();
    const groupId = await activeAccountGroup();
    await expect(checkout.getSummary(ids.accountTwo, groupId)).rejects.toMatchObject({
      code: 'CHECKOUT_GROUP_NOT_FOUND',
    });
    const cart = await pool.query<{ cart_id: string }>(
      `SELECT cart_id FROM cart_groups WHERE cart_group_id=$1`,
      [groupId],
    );
    const conflictGroupId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO cart_groups(cart_group_id,cart_id,group_type,state,conflict_reason_codes,
         created_at,updated_at)
       VALUES($1,$2,'CONFLICT','CONFLICT',ARRAY['EXPLICIT_CHECKOUT_CONFLICT'],$3,$3)`,
      [conflictGroupId, required(cart.rows[0]).cart_id, clock.now()],
    );
    await expect(checkout.getSummary(ids.account, conflictGroupId)).rejects.toMatchObject({
      code: 'CHECKOUT_GROUP_NOT_ACTIVE',
    });
    await pool.query(
      `UPDATE user_accounts SET status='DEACTIVATED',deactivated_at=$2,deactivated_by=$3,
        status_changed_at=$2,updated_at=$2 WHERE account_id=$1`,
      [ids.account, clock.now(), ids.admin],
    );
    await expect(checkout.getSummary(ids.account, groupId)).rejects.toMatchObject({
      code: 'CHECKOUT_ACCOUNT_INACTIVE',
    });
    await pool.query(
      `UPDATE user_accounts SET status='ACTIVE',email_verification_status='PENDING',
        deactivated_at=NULL,deactivated_by=NULL,status_changed_at=$2,updated_at=$2
       WHERE account_id=$1`,
      [ids.account, clock.now()],
    );
    await expect(checkout.getSummary(ids.account, groupId)).rejects.toMatchObject({
      code: 'CHECKOUT_EMAIL_NOT_VERIFIED',
    });
    await pool.query(
      `UPDATE user_accounts SET email_verification_status='VERIFIED' WHERE account_id=$1`,
      [ids.account],
    );
    await pool.query(`DELETE FROM cart_lines WHERE cart_group_id=$1`, [groupId]);
    await pool.query(`UPDATE cart_groups SET state='REMOVED' WHERE cart_group_id=$1`, [groupId]);
    await expect(checkout.getSummary(ids.account, groupId)).rejects.toMatchObject({
      code: 'CHECKOUT_GROUP_NOT_ACTIVE',
    });
  });

  it('calculates the selected group from current server prices and leaves other groups untouched', async () => {
    await publishPickup();
    const campaignId = await campaign(ids.preorder);
    await create(account, ids.account);
    const regular = await add(account, ids.regular, null);
    const regularGroup = required(
      regular.item.groups.find((group) => group.groupType === 'REGULAR'),
    ).cartGroupId;
    const preorder = await add(account, ids.preorder, campaignId);
    const preorderGroup = required(
      preorder.item.groups.find((group) => group.groupType === 'PREORDER'),
    ).cartGroupId;
    await selectPickup(regularGroup);
    await pool.query(`UPDATE products SET price_amount_clp=3500 WHERE product_id=$1`, [
      ids.regular,
    ]);
    const summary = await checkout.getSummary(ids.account, regularGroup);
    expect(summary.item.merchandiseSubtotalClp).toBe(3500);
    expect(summary.item.lines).toHaveLength(1);
    expect(summary.item.lines[0]?.productId).toBe(ids.regular);
    const untouched = await pool.query(
      `SELECT delivery_mode,selected_coupon_id,requested_points,checkout_version
       FROM cart_groups WHERE cart_group_id=$1`,
      [preorderGroup],
    );
    expect(untouched.rows[0]).toEqual({
      checkout_version: '1',
      delivery_mode: null,
      requested_points: null,
      selected_coupon_id: null,
    });
  });

  it('reports regular inventory and preorder campaign eligibility without reserving anything', async () => {
    await publishPickup();
    const regularGroup = await activeAccountGroup();
    await selectPickup(regularGroup);
    await pool.query(`UPDATE inventory_positions SET on_hand=0 WHERE product_id=$1`, [ids.regular]);
    expect(
      (await checkout.getSummary(ids.account, regularGroup)).item.validationErrorCodes,
    ).toContain('INVENTORY_INSUFFICIENT_AVAILABLE');

    await pool.query(`TRUNCATE carts,idempotency_records,audit_entries CASCADE`);
    const campaignId = await campaign(ids.preorder);
    const preorderGroup = await activeAccountGroup(ids.preorder, campaignId);
    await selectPickup(preorderGroup);
    await pool.query(
      `UPDATE preorder_campaigns SET committed=capacity WHERE preorder_campaign_id=$1`,
      [campaignId],
    );
    expect(
      (await checkout.getSummary(ids.account, preorderGroup)).item.validationErrorCodes,
    ).toContain('PREORDER_CAMPAIGN_NOT_AVAILABLE');
    expect(
      (await pool.query(`SELECT count(*)::int count FROM preorder_commitments`)).rows[0]?.count,
    ).toBe(0);
  });

  it('evaluates automatic and coupon promotions provisionally without creating usages', async () => {
    await publishPickup();
    const groupId = await activeAccountGroup();
    await selectPickup(groupId);
    const automaticId = await insertPromotion({ amount: 500, mode: 'AUTOMATIC' });
    let summary = await checkout.getSummary(ids.account, groupId);
    expect(summary.item.promotionDiscountClp).toBe(500);
    expect(summary.item.appliedPromotions[0]?.promotionId).toBe(automaticId);
    await pool.query(`UPDATE promotions SET state='SUSPENDED' WHERE promotion_id=$1`, [
      automaticId,
    ]);
    const couponPromotionId = await insertPromotion({ amount: 700, mode: 'COUPON_REQUIRED' });
    const couponId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO coupons(coupon_id,promotion_id,normalized_code,state,created_at)
       VALUES($1,$2,'CHECKOUT700','ACTIVE',$3)`,
      [couponId, couponPromotionId, clock.now()],
    );
    const selected = await checkout.selectCoupon(checkoutContext('coupon'), ids.account, groupId, {
      code: ' checkout700 ',
    });
    expect(selected.item.coupon).toMatchObject({ couponId, status: 'APPLIED' });
    expect(selected.item.promotionDiscountClp).toBe(700);
    summary = await checkout.clearCoupon(checkoutContext('coupon-clear'), ids.account, groupId);
    expect(summary.item.coupon).toBeNull();
    await expect(
      checkout.selectCoupon(checkoutContext('coupon-invalid'), ids.account, groupId, {
        code: 'DOES-NOT-EXIST',
      }),
    ).rejects.toMatchObject({ code: 'COUPON_INVALID' });
    expect(
      (await pool.query(`SELECT count(*)::int count FROM promotion_usages`)).rows[0]?.count,
    ).toBe(0);
  });

  it('applies real Loyalty rules provisionally and excludes shipping from its redeem base', async () => {
    const groupId = await activeAccountGroup();
    await checkout.replaceIntent(
      checkoutContext('shipping'),
      ids.account,
      groupId,
      freightCollectShippingIntent(),
    );
    await pool.query(
      `UPDATE loyalty_accounts SET balance=100,reserved_points=10 WHERE account_id=$1`,
      [ids.account],
    );
    await pool.query(
      `INSERT INTO loyalty_configurations(loyalty_configuration_id,branch_id,version_number,
       earn_clp_per_point,redeem_clp_per_point,minimum_redeem_points,
       maximum_redeem_basis_points,state,created_by,created_at,activated_by,activated_at)
       VALUES($1,$2,1,100,10,10,5000,'ACTIVE',$3,$4,$3,$4)`,
      [crypto.randomUUID(), ids.branch, ids.admin, clock.now()],
    );
    const selected = await checkout.selectPoints(checkoutContext('points'), ids.account, groupId, {
      points: 20,
    });
    expect(selected.item.loyalty).toMatchObject({
      availablePoints: 90,
      maxRedeemablePoints: 155,
      pointsDiscountClp: 200,
      requestedPoints: 20,
    });
    expect(selected.item.totalAmountClp).toBe(2900);
    await expect(
      checkout.selectPoints(checkoutContext('points-min'), ids.account, groupId, { points: 5 }),
    ).rejects.toMatchObject({ code: 'LOYALTY_MINIMUM_REDEEM_NOT_MET' });
    await expect(
      checkout.selectPoints(checkoutContext('points-max'), ids.account, groupId, { points: 200 }),
    ).rejects.toMatchObject({ code: 'LOYALTY_REDEEM_LIMIT_EXCEEDED' });
    expect(
      (await pool.query(`SELECT count(*)::int count FROM loyalty_movements`)).rows[0]?.count,
    ).toBe(0);
    expect(
      (
        await pool.query(`SELECT reserved_points FROM loyalty_accounts WHERE account_id=$1`, [
          ids.account,
        ])
      ).rows[0]?.reserved_points,
    ).toBe('10');
  });

  it('replays exact results and rejects key reuse with another payload', async () => {
    await publishPickup();
    const groupId = await activeAccountGroup();
    const key = 'same-checkout-intent';
    const first = await selectPickup(groupId, key);
    clock.set(new Date('2026-08-11T12:10:00.000Z'));
    const replay = await selectPickup(groupId, key);
    expect(replay.replayed).toBe(true);
    expect(replay.item).toEqual(first.item);
    await expect(
      checkout.clearIntent(checkoutContext('clear', key), ids.account, groupId),
    ).rejects.toMatchObject({ code: 'CHECKOUT_IDEMPOTENCY_CONFLICT' });
    expect((await checkout.getSummary(ids.account, groupId)).item.deliveryIntent).toMatchObject({
      mode: 'PICKUP',
    });
  });

  it('serializes concurrent intent replacements and audits actor, correlation, causation and reason', async () => {
    await publishPickup();
    const groupId = await activeAccountGroup();
    const pickupContext = checkoutContext('concurrent-pickup');
    const shippingContext = checkoutContext('concurrent-shipping');
    await Promise.all([
      checkout.replaceIntent(pickupContext, ids.account, groupId, {
        branchId: ids.branch,
        mode: 'PICKUP',
      }),
      checkout.replaceIntent(shippingContext, ids.account, groupId, freightCollectShippingIntent()),
    ]);
    const current = await pool.query(
      `SELECT delivery_mode,checkout_version FROM cart_groups WHERE cart_group_id=$1`,
      [groupId],
    );
    expect(['PICKUP', 'SHIPPING']).toContain(current.rows[0]?.delivery_mode);
    expect(current.rows[0]?.checkout_version).toBe('3');
    const audit = await pool.query(
      `SELECT actor_id,correlation_id,causation_id,reason,idempotency_key
       FROM audit_entries WHERE resource_type='CART_GROUP' ORDER BY occurred_at,audit_entry_id`,
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_id: ids.account,
          causation_id: pickupContext.causationId,
          correlation_id: pickupContext.correlationId,
          idempotency_key: pickupContext.idempotencyKey,
          reason: 'PICKUP_SELECTED',
        }),
        expect.objectContaining({ reason: 'SHIPPING_SELECTED' }),
      ]),
    );
  });

  it('never creates Phase 9C sources, reservations or commercial effects', async () => {
    await publishPickup();
    const groupId = await activeAccountGroup();
    await selectPickup(groupId);
    const forbiddenTables = ['promotion_usages', 'loyalty_movements', 'preorder_commitments'];
    for (const table of forbiddenTables) {
      expect((await pool.query(`SELECT count(*)::int count FROM ${table}`)).rows[0]?.count).toBe(0);
    }
    const future = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name=ANY($1::text[]))`,
      [['orders', 'order_lines', 'payment_attempts', 'loyalty_reservations']],
    );
    expect(future.rows[0]?.exists).toBe(false);
    expect(
      (
        await pool.query(
          `SELECT on_hand,reserved,version FROM inventory_positions WHERE product_id=$1`,
          [ids.regular],
        )
      ).rows[0],
    ).toEqual({ on_hand: '5', reserved: '0', version: '1' });
  });

  it('enforces checkout shape, managed version and private default-deny replay persistence', async () => {
    const groupId = await activeAccountGroup();
    await expect(
      pool.query(
        `UPDATE cart_groups SET delivery_mode='SHIPPING',shipping_recipient_name='A',
          shipping_address='B',shipping_commune='C' WHERE cart_group_id=$1`,
        [groupId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(`UPDATE cart_groups SET checkout_version=10 WHERE cart_group_id=$1`, [groupId]),
    ).rejects.toMatchObject({ code: '23514' });
    const rls = await pool.query(
      `SELECT relrowsecurity FROM pg_class WHERE relname='checkout_provisional_idempotency_results'`,
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    expect(
      (
        await pool.query(
          `SELECT count(*)::int count FROM pg_policies
            WHERE tablename='checkout_provisional_idempotency_results'`,
        )
      ).rows[0]?.count,
    ).toBe(0);
  });
});

async function insertPromotion(input: {
  readonly amount: number;
  readonly mode: 'AUTOMATIC' | 'COUPON_REQUIRED';
}): Promise<string> {
  const promotionId = crypto.randomUUID();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO promotions(promotion_id,name,state,activation_mode,scope,channel,
       benefit_type,fixed_amount_clp,starts_at,ends_at,priority,created_at,updated_at,activated_at)
       VALUES($1,$2,'ACTIVE',$3,'ORDER','ECOMMERCE','FIXED_AMOUNT_DISCOUNT',$4,$5,$6,1,$5,$5,$5)`,
      [
        promotionId,
        `Checkout ${input.mode}`,
        input.mode,
        input.amount,
        new Date('2026-08-11T11:00:00Z'),
        new Date('2026-08-12T12:00:00Z'),
      ],
    );
    await client.query(
      `INSERT INTO promotion_targets(promotion_target_id,promotion_id,side,target_kind,position)
       VALUES($1,$2,'BENEFITED','ALL_PRODUCTS',1)`,
      [crypto.randomUUID(), promotionId],
    );
    await client.query('COMMIT');
  } finally {
    await safeRollback(client);
    client.release();
  }
  return promotionId;
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* transaction may already be closed */
  }
}
