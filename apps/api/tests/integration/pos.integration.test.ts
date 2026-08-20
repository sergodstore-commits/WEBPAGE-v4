import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import { posSettlementSchema } from '@sergod/contracts';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { PosService, PosError } from '../../src/contexts/sales-pos/application/pos-service.js';
import { PgPosRepository } from '../../src/contexts/sales-pos/infrastructure/postgres-pos-repository.js';
import { PreordersAdminService } from '../../src/contexts/preorders/application/preorders-admin-service.js';
import { PgPreordersAdminAuthorizer } from '../../src/contexts/preorders/infrastructure/postgres-preorders-admin-authorizer.js';
import { PgPreordersRepository } from '../../src/contexts/preorders/infrastructure/postgres-preorders-repository.js';
import { ServiceCoverageService } from '../../src/contexts/service-coverage/application/service-coverage-service.js';
import { PgServiceCoverageRepository } from '../../src/contexts/service-coverage/infrastructure/postgres-service-coverage-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';
const clock = new FixedClock(new Date('2026-08-10T12:00:00Z')),
  ids = {
    admin: '0198a8be-6677-7000-8000-000000000001',
    branch: '0198a8be-6677-7000-8000-000000000002',
    game: '0198a8be-6677-7000-8000-000000000003',
    category: '0198a8be-6677-7000-8000-000000000004',
    regular: '0198a8be-6677-7000-8000-000000000005',
    preorder: '0198a8be-6677-7000-8000-000000000006',
  };
let pool: Pool,
  pos: PosService,
  preorders: PreordersAdminService,
  coverage: ServiceCoverageService,
  n = 0;
const context = (key?: string): ExecutionContext => ({
  actorType: 'USER',
  actorId: ids.admin,
  correlationId: crypto.randomUUID(),
  idempotencyKey: key ?? `pos-${++n}`,
});
async function activeMoneyMethod() {
  const created = await pos.createMethod(context(), {
    code: `CASH_${++n}`,
    name: 'External cash confirmation',
    description: null,
    publicInstructions: null,
  });
  await pos.transitionMethod(context(), created.id, 'ACTIVE', 'Ready for acceptance');
  return created.id;
}
async function regularSale(options: { accountId?: string; quantity?: number } = {}) {
  const sale = await pos.create(context(), {
    branchId: ids.branch,
    saleType: 'REGULAR',
    ...(options.accountId ? { accountId: options.accountId } : {}),
  });
  await pos.addLine(context(), sale.id, {
    productId: ids.regular,
    quantity: options.quantity ?? 1,
  });
  return sale.id;
}
async function completePaid(
  saleId: string,
  methodId: string,
  evidence: Record<string, unknown> = {},
) {
  await pos.prepare(context(), saleId);
  const total = Number((await pos.get(context(), saleId)).item.total_amount_clp);
  return pos.complete(context(), saleId, {
    amountClp: total,
    externalMoneyMethodId: methodId,
    ...evidence,
  });
}
async function automaticPromotion(
  input: { coupon?: boolean; globalLimit?: number; perAccountLimit?: number } = {},
) {
  const promotionId = crypto.randomUUID();
  await pool.query(
    `WITH inserted AS (INSERT INTO promotions(promotion_id,name,state,activation_mode,scope,channel,benefit_type,percentage_basis_points,branch_id,global_limit,per_account_limit,starts_at,ends_at,priority,created_at,updated_at,activated_at) VALUES($1,'POS acceptance','ACTIVE',$2,'LINE','POS','PERCENTAGE_DISCOUNT',1000,$3,$4,$5,$6,$7,10,$6,$6,$6) RETURNING promotion_id) INSERT INTO promotion_targets SELECT $8,promotion_id,'BENEFITED','ALL_PRODUCTS',NULL,NULL,NULL,1 FROM inserted`,
    [
      promotionId,
      input.coupon ? 'COUPON_REQUIRED' : 'AUTOMATIC',
      ids.branch,
      input.globalLimit ?? null,
      input.perAccountLimit ?? null,
      new Date(clock.now().getTime() - 60000),
      new Date(clock.now().getTime() + 60000),
      crypto.randomUUID(),
    ],
  );
  if (!input.coupon) return { promotionId, couponId: null, code: null };
  const couponId = crypto.randomUUID(),
    code = `POS${++n}`;
  await pool.query(
    `INSERT INTO coupons(coupon_id,promotion_id,normalized_code,state,starts_at,ends_at,global_limit,per_account_limit,created_at) VALUES($1,$2,$3,'ACTIVE',NULL,NULL,$4,$5,$6)`,
    [
      couponId,
      promotionId,
      code,
      input.globalLimit ?? null,
      input.perAccountLimit ?? null,
      clock.now(),
    ],
  );
  return { promotionId, couponId, code };
}
async function activeLoyalty(balance = 0) {
  const configurationId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO loyalty_configurations(loyalty_configuration_id,branch_id,version_number,earn_clp_per_point,redeem_clp_per_point,minimum_redeem_points,maximum_redeem_basis_points,state,created_by,created_at,activated_by,activated_at) VALUES($1,$2,1,100,10,1,10000,'ACTIVE',$3,$4,$3,$4)`,
    [configurationId, ids.branch, ids.admin, clock.now()],
  );
  await pool.query(`UPDATE loyalty_accounts SET balance=$2 WHERE account_id=$1`, [
    ids.admin,
    balance,
  ]);
  return configurationId;
}
async function openPreorderCampaign(capacity = 20) {
  const created = await preorders.createCampaign(context(), {
    branchId: ids.branch,
    capacity,
    closesAt: '2026-08-11T12:00:00.000Z',
    estimatedArrivalText: 'October 2026',
    fulfillmentGroupKey: null,
    opensAt: '2026-08-10T11:00:00.000Z',
    productId: ids.preorder,
  });
  await preorders.transitionOperational(context(), created.item.preorderCampaignId, {
    nextState: 'OPEN',
    reason: null,
  });
  await preorders.transitionPublication(context(), created.item.preorderCampaignId, {
    nextStatus: 'PUBLISHED',
    reason: null,
  });
  return created.item.preorderCampaignId;
}
async function publishPickupInfo() {
  const existing = await pool.query(
    `SELECT 1 FROM public_service_info WHERE branch_id=$1 AND state='PUBLISHED'`,
    [ids.branch],
  );
  if (existing.rowCount) return;
  const info = (await coverage.saveInfo(context(), {
    branchId: ids.branch,
    publicAddress: 'Public pickup address',
    openingHours: 'Monday to Friday',
    publicContacts: 'contact@example.test',
    directions: null,
    mapUrl: null,
    reason: null,
  })) as { id: string };
  await coverage.transitionInfo(context(), info.id, 'PUBLISHED', 'Enable POS preorder pickup');
}
async function preorderSale(campaignId: string) {
  await publishPickupInfo();
  const sale = await pos.create(context(), {
    branchId: ids.branch,
    saleType: 'PREORDER',
    buyerName: 'Guest buyer',
    buyerEmail: 'guest@example.test',
  });
  await pos.setBuyer(context(), sale.id, {
    accountId: null,
    buyerName: 'Guest buyer',
    buyerEmail: 'guest@example.test',
    buyerPhone: null,
    delivery: {
      mode: 'PICKUP',
      branchId: ids.branch,
      recipientName: 'Guest buyer',
    },
  });
  await pos.addLine(context(), sale.id, {
    productId: ids.preorder,
    quantity: 2,
    preorderCampaignId: campaignId,
  });
  return sale.id;
}
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
  pool = createPostgresPool(url, { max: 10 });
  pos = new PosService(new PgPosRepository(pool, clock, new CryptoUuidGenerator()));
  preorders = new PreordersAdminService(
    new PgPreordersRepository(pool, clock, new CryptoUuidGenerator()),
    new PgPreordersAdminAuthorizer(pool),
    clock,
  );
  coverage = new ServiceCoverageService(
    new PgServiceCoverageRepository(pool, clock, new CryptoUuidGenerator()),
  );
});
afterAll(async () => pool.end());
beforeEach(async () => {
  n = 0;
  await pool.query(
    `TRUNCATE preorder_commitments,loyalty_effect_progress,promotion_usages,pos_sale_settlements,pos_sale_state_history,pos_sale_lines,pos_sales,external_money_method_history,external_money_methods,shipping_configuration_history,shipping_options,shipping_zone_communes,shipping_zones,content_revisions,public_service_info,preorder_campaign_state_history,preorder_campaigns,loyalty_movements,loyalty_configurations,loyalty_accounts,inventory_movements,inventory_positions,products,categories,tcg_games,branches,user_accounts,idempotency_records,audit_entries CASCADE`,
  );
  await pool.query(
    `INSERT INTO user_accounts(account_id,auth_provider_user_id,role,status,current_email,normalized_email,email_verification_status,phone_verification_status,created_at,updated_at,status_changed_at)VALUES($1,$2,'ADMIN','ACTIVE','admin@example.test','admin@example.test','VERIFIED','PENDING',$3,$3,$3)`,
    [ids.admin, crypto.randomUUID(), clock.now()],
  );
  await pool.query(
    `INSERT INTO branches VALUES($1,'Store','internal','ACTIVE','America/Santiago',$2,$3,$3)`,
    [ids.branch, ids.admin, clock.now()],
  );
  await pool.query(`INSERT INTO tcg_games VALUES($1,'Game','game',NULL,'DRAFT',$2,$2,NULL)`, [
    ids.game,
    clock.now(),
  ]);
  await pool.query(`INSERT INTO categories VALUES($1,'Category',NULL,'DRAFT',$2,$2,NULL)`, [
    ids.category,
    clock.now(),
  ]);
  for (const [p, saleType, price] of [
    [ids.regular, 'REGULAR', 1000],
    [ids.preorder, 'PREORDER', 2000],
  ] as const)
    await pool.query(
      `INSERT INTO products(product_id,sku,game_id,category_id,name,sale_type,price_amount_clp,publication_status,created_at,updated_at)VALUES($1,$2,$3,$4,$2,$5,$6,'DRAFT',$7,$7)`,
      [p, `SKU-${saleType}`, ids.game, ids.category, saleType, price, clock.now()],
    );
  const resourceIds = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  for (const [index, resourceId] of resourceIds.entries())
    await pool.query(
      `INSERT INTO resource_assets(resource_id,resource_class,original_filename_safe,mime_type_real,byte_size,width_px,height_px,sha256_hex,secure_storage_key,alt_text,position,state,uploaded_by,uploaded_at,validated_at) VALUES($1,'CATALOG_IMAGE',$2,'image/png',100,320,320,$3,$4,'Test image',1,'ACTIVE',$5,$6,$6)`,
      [
        resourceId,
        `test-${index}.png`,
        index.toString(16).padStart(64, 'a'),
        `test/${resourceId}`,
        ids.admin,
        clock.now(),
      ],
    );
  await pool.query(
    `INSERT INTO catalog_entity_media VALUES($1,'TCG_GAME',$2,$3,true,$4),($5,'CATEGORY',$6,$7,true,$4)`,
    [
      crypto.randomUUID(),
      ids.game,
      resourceIds[0],
      clock.now(),
      crypto.randomUUID(),
      ids.category,
      resourceIds[1],
    ],
  );
  await pool.query(`INSERT INTO product_media VALUES($1,$2,$3,true,$4),($5,$6,$7,true,$4)`, [
    crypto.randomUUID(),
    ids.regular,
    resourceIds[2],
    clock.now(),
    crypto.randomUUID(),
    ids.preorder,
    resourceIds[3],
  ]);
  await pool.query(`UPDATE tcg_games SET publication_status='PUBLISHED' WHERE game_id=$1`, [
    ids.game,
  ]);
  await pool.query(`UPDATE categories SET publication_status='PUBLISHED' WHERE category_id=$1`, [
    ids.category,
  ]);
  await pool.query(
    `UPDATE products SET publication_status='PUBLISHED' WHERE product_id=ANY($1::uuid[])`,
    [[ids.regular, ids.preorder]],
  );
  await pool.query(
    `INSERT INTO inventory_positions VALUES($1,$2,$3,2,0,NULL,1,$4),($5,$6,$3,0,0,NULL,1,$4)`,
    [crypto.randomUUID(), ids.regular, ids.branch, clock.now(), crypto.randomUUID(), ids.preorder],
  );
});
it('completes an anonymous REGULAR zero-total sale atomically and replays once', async () => {
  await pool.query(`UPDATE products SET price_amount_clp=0 WHERE product_id=$1`, [ids.regular]);
  const created = await pos.create(context(), { branchId: ids.branch, saleType: 'REGULAR' });
  await pos.addLine(context(), created.id, { productId: ids.regular, quantity: 1 });
  const key = 'complete-once',
    first = await pos.complete(context(key), created.id, null),
    replay = await pos.complete(context(key), created.id, null);
  expect(replay).toEqual({ ...first, replayed: true });
  const sale = await pos.get(context(), created.id);
  expect(sale.item.state).toBe('COMPLETED');
  expect(sale.settlements[0].kind).toBe('ZERO_TOTAL');
  const stock = await pool.query(`SELECT on_hand FROM inventory_positions WHERE product_id=$1`, [
    ids.regular,
  ]);
  expect(stock.rows[0].on_hand).toBe('1');
  expect(
    (await pool.query(`SELECT * FROM inventory_movements WHERE source_id=$1`, [created.id]))
      .rowCount,
  ).toBe(1);
});
it('rejects mixed sale types without changing the draft', async () => {
  const created = await pos.create(context(), { branchId: ids.branch, saleType: 'REGULAR' });
  await expect(
    pos.addLine(context(), created.id, { productId: ids.preorder, quantity: 1 }),
  ).rejects.toMatchObject({ code: 'POS_MIXED_SALE_TYPES' } satisfies Partial<PosError>);
  expect((await pos.get(context(), created.id)).lines).toHaveLength(0);
});
it('locks concurrent last-unit completion so inventory never becomes negative', async () => {
  await pool.query(`UPDATE inventory_positions SET on_hand=1 WHERE product_id=$1`, [ids.regular]);
  await pool.query(`UPDATE products SET price_amount_clp=0 WHERE product_id=$1`, [ids.regular]);
  const a = await pos.create(context(), { branchId: ids.branch, saleType: 'REGULAR' }),
    b = await pos.create(context(), { branchId: ids.branch, saleType: 'REGULAR' });
  await pos.addLine(context(), a.id, { productId: ids.regular, quantity: 1 });
  await pos.addLine(context(), b.id, { productId: ids.regular, quantity: 1 });
  const outcomes = await Promise.allSettled([
    pos.complete(context('finish-a'), a.id, null),
    pos.complete(context('finish-b'), b.id, null),
  ]);
  expect(outcomes.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await pool.query(`SELECT on_hand FROM inventory_positions WHERE product_id=$1`, [ids.regular]))
      .rows[0].on_hand,
  ).toBe('0');
});
it('completes a positive anonymous sale with one immutable external settlement', async () => {
  const method = await activeMoneyMethod(),
    sale = await regularSale();
  await completePaid(sale, method);
  const detail = await pos.get(context(), sale);
  expect(detail.item.state).toBe('COMPLETED');
  expect(detail.settlements).toHaveLength(1);
  expect(detail.settlements[0]).toMatchObject({ kind: 'EXTERNAL_DECLARED', amount_clp: '1000' });
});
it('serializes concurrent finalization of the same sale without duplicating effects', async () => {
  const method = await activeMoneyMethod(),
    sale = await regularSale();
  await pos.prepare(context(), sale);
  const results = await Promise.allSettled([
    pos.complete(context('same-sale-a'), sale, {
      amountClp: 1000,
      externalMoneyMethodId: method,
    }),
    pos.complete(context('same-sale-b'), sale, {
      amountClp: 1000,
      externalMoneyMethodId: method,
    }),
  ]);
  expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
  expect(
    (await pool.query(`SELECT 1 FROM pos_sale_settlements WHERE pos_sale_id=$1`, [sale])).rows,
  ).toHaveLength(1);
  expect(
    (await pool.query(`SELECT 1 FROM inventory_movements WHERE source_id=$1`, [sale])).rows,
  ).toHaveLength(1);
});
it('freezes an ACTIVE linked account when payment starts', async () => {
  const sale = await regularSale({ accountId: ids.admin });
  await pos.prepare(context(), sale);
  expect((await pos.get(context(), sale)).item).toMatchObject({
    account_role_snapshot: 'ADMIN',
    account_state_snapshot: 'ACTIVE',
  });
});
it('blocks a linked account deactivated before identity freeze', async () => {
  const sale = await regularSale({ accountId: ids.admin });
  await pool.query(
    `UPDATE user_accounts SET status='DEACTIVATED',deactivated_at=$2,deactivated_by=$1,status_changed_at=$2,updated_at=$2 WHERE account_id=$1`,
    [ids.admin, clock.now()],
  );
  await expect(pos.prepare(context(), sale)).rejects.toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
});
it('allows a legitimately prepared settlement after account deactivation', async () => {
  const method = await activeMoneyMethod(),
    sale = await regularSale({ accountId: ids.admin });
  await pos.prepare(context(), sale);
  await pool.query(
    `UPDATE user_accounts SET status='DEACTIVATED',deactivated_at=$2,deactivated_by=$1,status_changed_at=$2,updated_at=$2 WHERE account_id=$1`,
    [ids.admin, clock.now()],
  );
  await pos.complete(context(), sale, { amountClp: 1000, externalMoneyMethodId: method });
  expect((await pos.get(context(), sale)).item).toMatchObject({
    state: 'COMPLETED',
    account_id: ids.admin,
    account_state_snapshot: 'ACTIVE',
  });
});
it('returning to draft clears the frozen identity snapshot', async () => {
  const sale = await regularSale({ accountId: ids.admin });
  await pos.prepare(context(), sale);
  await pos.returnToDraft(context(), sale, 'Buyer requested an edit');
  expect((await pos.get(context(), sale)).item).toMatchObject({
    state: 'DRAFT',
    account_role_snapshot: null,
    account_state_snapshot: null,
    identity_frozen_at: null,
  });
});
it('commits an automatic PromotionUsage from a real PosSale exactly once', async () => {
  const promotion = await automaticPromotion(),
    method = await activeMoneyMethod(),
    sale = await regularSale();
  await completePaid(sale, method);
  const usages = await pool.query(`SELECT * FROM promotion_usages WHERE source_id=$1`, [sale]);
  expect(usages.rows).toHaveLength(1);
  expect(usages.rows[0]).toMatchObject({
    promotion_id: promotion.promotionId,
    status: 'COMMITTED',
    discount_amount_clp: '100',
  });
  await pos.complete(context('second-completion'), sale, {
    amountClp: 900,
    externalMoneyMethodId: method,
  });
  expect(
    (await pool.query(`SELECT * FROM promotion_usages WHERE source_id=$1`, [sale])).rows,
  ).toHaveLength(1);
});
it('commits a coupon usage and enforces a global limit under concurrency', async () => {
  const promotion = await automaticPromotion({ coupon: true, globalLimit: 1 }),
    method = await activeMoneyMethod();
  const first = await regularSale(),
    second = await regularSale();
  await pos.setCoupon(context(), first, promotion.code);
  await pos.setCoupon(context(), second, promotion.code);
  await pos.prepare(context(), first);
  await pos.prepare(context(), second);
  const results = await Promise.allSettled([
    pos.complete(context('coupon-a'), first, { amountClp: 900, externalMoneyMethodId: method }),
    pos.complete(context('coupon-b'), second, { amountClp: 900, externalMoneyMethodId: method }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(
    (await pool.query(`SELECT * FROM promotion_usages WHERE coupon_id=$1`, [promotion.couponId]))
      .rows,
  ).toHaveLength(1);
});
it('enforces promotion and coupon per-account limits', async () => {
  const promotion = await automaticPromotion({ coupon: true, perAccountLimit: 1 }),
    method = await activeMoneyMethod();
  const first = await regularSale({ accountId: ids.admin });
  await pos.setCoupon(context(), first, promotion.code);
  await completePaid(first, method);
  const second = await regularSale({ accountId: ids.admin });
  await pos.setCoupon(context(), second, promotion.code);
  await expect(pos.prepare(context(), second)).rejects.toMatchObject({
    code: 'COUPON_LIMIT_REACHED',
  });
});
it('creates REDEEM and EARN loyalty movements exactly once from a linked sale', async () => {
  await activeLoyalty(100);
  const method = await activeMoneyMethod(),
    sale = await regularSale({ accountId: ids.admin });
  await pos.setLoyalty(context(), sale, 10);
  await completePaid(sale, method);
  const movements = (
    await pool.query(
      `SELECT type,points_signed,source_id FROM loyalty_movements WHERE source_id=$1 ORDER BY type`,
      [sale],
    )
  ).rows;
  expect(movements).toEqual([
    { type: 'EARN', points_signed: '9', source_id: sale },
    { type: 'REDEEM', points_signed: '-10', source_id: sale },
  ]);
  await pos.complete(context('loyalty-replay-other-key'), sale, {
    amountClp: 900,
    externalMoneyMethodId: method,
  });
  expect(
    (await pool.query(`SELECT * FROM loyalty_movements WHERE source_id=$1`, [sale])).rows,
  ).toHaveLength(2);
});
it('prevents a loyalty redemption from producing a negative balance', async () => {
  await activeLoyalty(1);
  const sale = await regularSale({ accountId: ids.admin });
  await pos.setLoyalty(context(), sale, 2);
  await expect(pos.prepare(context(), sale)).rejects.toMatchObject({
    code: 'LOYALTY_AVAILABLE_POINTS_INSUFFICIENT',
  });
});
it('ExternalMoneyMethod starts DRAFT and supports edit before activation', async () => {
  const created = await pos.createMethod(context(), {
    code: 'BANK_TRANSFER',
    name: 'Bank transfer',
    description: null,
    publicInstructions: null,
  });
  expect((await pos.getMethod(context(), created.id)).item.state).toBe('DRAFT');
  await pos.editMethod(context(), created.id, {
    name: 'Confirmed transfer',
    description: 'External confirmation',
    publicInstructions: 'Confirm receipt first',
  });
  expect((await pos.getMethod(context(), created.id)).item).toMatchObject({
    code_normalized: 'BANK_TRANSFER',
    display_name: 'Confirmed transfer',
  });
});
it('ExternalMoneyMethod supports activate, deactivate and reactivate', async () => {
  const method = await activeMoneyMethod();
  await pos.transitionMethod(context(), method, 'INACTIVE', 'Temporarily unavailable');
  await pos.transitionMethod(context(), method, 'ACTIVE', 'Available again');
  expect((await pos.getMethod(context(), method)).item.state).toBe('ACTIVE');
  expect(
    (
      await pool.query(
        `SELECT * FROM external_money_method_history WHERE external_money_method_id=$1`,
        [method],
      )
    ).rows,
  ).toHaveLength(3);
});
it('RETIRED ExternalMoneyMethod is final', async () => {
  const created = await pos.createMethod(context(), {
    code: 'OLD_METHOD',
    name: 'Old method',
    description: null,
    publicInstructions: null,
  });
  await pos.transitionMethod(context(), created.id, 'RETIRED', 'Permanently retired');
  await expect(
    pos.transitionMethod(context(), created.id, 'ACTIVE', 'Not allowed'),
  ).rejects.toMatchObject({ code: 'MONEY_METHOD_TRANSITION_INVALID' });
});
it('deletes only a never-used DRAFT ExternalMoneyMethod', async () => {
  const created = await pos.createMethod(context(), {
    code: 'TEMP_METHOD',
    name: 'Temporary',
    description: null,
    publicInstructions: null,
  });
  await pos.deleteMethod(context(), created.id);
  await expect(pos.getMethod(context(), created.id)).rejects.toMatchObject({
    code: 'MONEY_METHOD_NOT_FOUND',
  });
});
it('keeps code_normalized unique and immutable', async () => {
  const method = await activeMoneyMethod();
  await expect(
    pool.query(
      `UPDATE external_money_methods SET code_normalized='CHANGED' WHERE external_money_method_id=$1`,
      [method],
    ),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    pos.createMethod(context(), {
      code: (await pos.getMethod(context(), method)).item.code_normalized,
      name: 'Duplicate',
      description: null,
      publicInstructions: null,
    }),
  ).rejects.toMatchObject({ code: 'MONEY_METHOD_CODE_CONFLICT' });
});
it('blocks a positive sale when the external method is inactive', async () => {
  const method = await activeMoneyMethod(),
    sale = await regularSale();
  await pos.prepare(context(), sale);
  await pos.transitionMethod(context(), method, 'INACTIVE', 'Unavailable');
  await expect(
    pos.complete(context(), sale, { amountClp: 1000, externalMoneyMethodId: method }),
  ).rejects.toMatchObject({ code: 'MONEY_METHOD_NOT_ACTIVE' });
});
it('requires the exact settlement amount', async () => {
  const method = await activeMoneyMethod(),
    sale = await regularSale();
  await pos.prepare(context(), sale);
  await expect(
    pos.complete(context(), sale, { amountClp: 999, externalMoneyMethodId: method }),
  ).rejects.toMatchObject({ code: 'SETTLEMENT_AMOUNT_MISMATCH' });
});
it('accepts optional payment reference and note without documentary evidence', async () => {
  const method = await activeMoneyMethod(),
    sale = await regularSale();
  await completePaid(sale, method, { reference: 'BANK-123', note: 'Confirmed by operator' });
  expect((await pos.get(context(), sale)).settlements[0]).toMatchObject({
    external_reference: 'BANK-123',
    note: 'Confirmed by operator',
  });
});
it('preserves the method snapshot after first use', async () => {
  const method = await activeMoneyMethod(),
    sale = await regularSale();
  await completePaid(sale, method);
  const snapshot = (await pos.get(context(), sale)).settlements[0].method_snapshot;
  await expect(
    pos.editMethod(context(), method, {
      name: 'Changed',
      description: null,
      publicInstructions: null,
    }),
  ).rejects.toMatchObject({ code: 'MONEY_METHOD_IMMUTABLE' });
  expect((await pos.get(context(), sale)).settlements[0].method_snapshot).toEqual(snapshot);
});
it('rolls back settlement, benefits and loyalty when inventory completion fails', async () => {
  await automaticPromotion();
  await activeLoyalty();
  const method = await activeMoneyMethod(),
    sale = await regularSale({ accountId: ids.admin });
  await pos.prepare(context(), sale);
  await pool.query(`UPDATE inventory_positions SET on_hand=0 WHERE product_id=$1`, [ids.regular]);
  await expect(
    pos.complete(context(), sale, { amountClp: 900, externalMoneyMethodId: method }),
  ).rejects.toMatchObject({ code: 'INVENTORY_INSUFFICIENT' });
  expect(
    (await pool.query(`SELECT * FROM pos_sale_settlements WHERE pos_sale_id=$1`, [sale])).rows,
  ).toHaveLength(0);
  expect(
    (await pool.query(`SELECT * FROM promotion_usages WHERE source_id=$1`, [sale])).rows,
  ).toHaveLength(0);
  expect(
    (await pool.query(`SELECT * FROM loyalty_movements WHERE source_id=$1`, [sale])).rows,
  ).toHaveLength(0);
});
it('rolls back inventory and every commercial effect when a later completion step fails', async () => {
  await automaticPromotion();
  await activeLoyalty(100);
  const method = await activeMoneyMethod(),
    sale = await regularSale({ accountId: ids.admin });
  await pos.setLoyalty(context(), sale, 10);
  await pos.prepare(context(), sale);
  await pool.query(
    `CREATE OR REPLACE FUNCTION fail_pos_completion_for_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced later failure'; END $$`,
  );
  await pool.query(
    `CREATE TRIGGER fail_pos_completion_for_test BEFORE UPDATE OF state ON pos_sales FOR EACH ROW WHEN (NEW.state='COMPLETED') EXECUTE FUNCTION fail_pos_completion_for_test()`,
  );
  try {
    await expect(
      pos.complete(context(), sale, { amountClp: 800, externalMoneyMethodId: method }),
    ).rejects.toThrow('forced later failure');
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS fail_pos_completion_for_test ON pos_sales`);
    await pool.query(`DROP FUNCTION IF EXISTS fail_pos_completion_for_test()`);
  }
  expect(
    (await pool.query(`SELECT on_hand FROM inventory_positions WHERE product_id=$1`, [ids.regular]))
      .rows[0].on_hand,
  ).toBe('2');
  expect(
    (await pool.query(`SELECT 1 FROM pos_sale_settlements WHERE pos_sale_id=$1`, [sale])).rows,
  ).toHaveLength(0);
  for (const table of ['promotion_usages', 'loyalty_movements', 'inventory_movements'])
    expect(
      (await pool.query(`SELECT 1 FROM ${table} WHERE source_id=$1`, [sale])).rows,
    ).toHaveLength(0);
});
it('PREORDER requires real identity and a frozen contact', async () => {
  const campaign = await openPreorderCampaign();
  const sale = await pos.create(context(), { branchId: ids.branch, saleType: 'PREORDER' });
  await pos.addLine(context(), sale.id, {
    productId: ids.preorder,
    quantity: 1,
    preorderCampaignId: campaign,
  });
  await expect(pos.prepare(context(), sale.id)).rejects.toMatchObject({
    code: 'PREORDER_IDENTITY_REQUIRED',
  });
});
it('PREORDER creates a source-bound commitment without consuming inventory', async () => {
  const campaign = await openPreorderCampaign(),
    method = await activeMoneyMethod(),
    sale = await preorderSale(campaign);
  const before = (
    await pool.query(`SELECT on_hand,reserved FROM inventory_positions WHERE product_id=$1`, [
      ids.preorder,
    ])
  ).rows[0];
  await completePaid(sale, method);
  const commitment = (
    await pool.query(
      `SELECT c.*,l.pos_sale_id FROM preorder_commitments c JOIN pos_sale_lines l USING(pos_sale_line_id) WHERE l.pos_sale_id=$1`,
      [sale],
    )
  ).rows[0];
  expect(commitment).toMatchObject({
    state: 'PAID_COMMITTED',
    channel: 'POS',
    quantity: '2',
    pos_sale_id: sale,
  });
  expect(
    (
      await pool.query(`SELECT on_hand,reserved FROM inventory_positions WHERE product_id=$1`, [
        ids.preorder,
      ])
    ).rows[0],
  ).toEqual(before);
});
it('reads persisted DeliverySnapshot.v1 sales without rewriting them', async () => {
  const sale = await pos.create(context(), {
    branchId: ids.branch,
    saleType: 'PREORDER',
    buyerName: 'Persisted buyer',
    buyerEmail: 'persisted@example.test',
  });
  const snapshot = {
    snapshot_contract: 'DeliverySnapshot.v1',
    snapshot_schema_version: 1,
    mode: 'SHIPPING',
    branchId: ids.branch,
    recipientName: 'Persisted buyer',
    contactEmail: 'persisted@example.test',
    contactPhone: null,
    capturedAt: clock.now().toISOString(),
    address: 'Persisted carrier destination',
    commune: 'Copiapó',
    details: null,
    shippingZoneId: crypto.randomUUID(),
    shippingZoneName: 'Persisted zone',
    shippingZoneVersion: 1,
    shippingOptionId: crypto.randomUUID(),
    shippingOptionVersion: 1,
    carrier: 'CHILEXPRESS',
    feeAmountClp: 2500,
  };
  await pool.query(
    `UPDATE pos_sales SET delivery_mode='SHIPPING',delivery_snapshot=$2,shipping_fee_amount_clp=2500 WHERE pos_sale_id=$1`,
    [sale.id, snapshot],
  );

  const persisted = (await pos.get(context(), sale.id)).item;
  expect(persisted.delivery_snapshot).toEqual(snapshot);
  expect(persisted.shipping_fee_amount_clp).toBe('2500');
});
it('completes nationwide freight collect PREORDER without adding shipping to its total', async () => {
  const campaign = await openPreorderCampaign();
  const method = await activeMoneyMethod();
  const sale = await pos.create(context(), {
    branchId: ids.branch,
    saleType: 'PREORDER',
    buyerName: 'Guest buyer',
    buyerEmail: 'guest@example.test',
  });
  await pos.addLine(context(), sale.id, {
    productId: ids.preorder,
    quantity: 1,
    preorderCampaignId: campaign,
  });
  await pos.setBuyer(context(), sale.id, {
    accountId: null,
    buyerName: 'Guest buyer',
    buyerEmail: 'guest@example.test',
    buyerPhone: null,
    delivery: {
      agencyDestination: 'Agencia centro de Copiapó',
      carrier: 'STARKEN',
      destinationCommune: 'Copiapó',
      destinationType: 'CARRIER_AGENCY',
      mode: 'SHIPPING',
      recipientName: 'Guest buyer',
      shippingIncludedInOrderTotal: false,
      shippingPaymentMode: 'FREIGHT_COLLECT',
    },
  });
  await completePaid(sale.id, method);
  const completed = (await pos.get(context(), sale.id)).item;
  expect(completed).toMatchObject({
    delivery_mode: 'SHIPPING',
    shipping_fee_amount_clp: null,
    subtotal_amount_clp: '2000',
    total_amount_clp: '2000',
  });
  expect(completed.delivery_snapshot).toMatchObject({
    agencyDestination: 'Agencia centro de Copiapó',
    carrier: 'STARKEN',
    orderTotalWithoutShippingClp: 2000,
    shippingCostAmountClp: 0,
    shippingIncludedInOrderTotal: false,
    shippingPaymentMode: 'FREIGHT_COLLECT',
    snapshot_contract: 'DeliverySnapshot.v2',
    snapshot_schema_version: 2,
  });
});
it('uses authoritative account contact data in the delivery snapshot', async () => {
  const campaign = await openPreorderCampaign();
  const sale = await pos.create(context(), {
    accountId: ids.admin,
    branchId: ids.branch,
    saleType: 'PREORDER',
  });
  await pos.addLine(context(), sale.id, {
    productId: ids.preorder,
    quantity: 1,
    preorderCampaignId: campaign,
  });
  await pos.setBuyer(context(), sale.id, {
    accountId: ids.admin,
    buyerEmail: 'untrusted@example.test',
    buyerName: 'Account buyer',
    buyerPhone: '+56999999999',
    delivery: {
      agencyDestination: 'Agencia central',
      carrier: 'CHILEXPRESS',
      destinationCommune: 'Puerto Montt',
      destinationType: 'CARRIER_AGENCY',
      mode: 'SHIPPING',
      recipientName: 'Account buyer',
      shippingIncludedInOrderTotal: false,
      shippingPaymentMode: 'FREIGHT_COLLECT',
    },
  });
  const item = (await pos.get(context(), sale.id)).item;
  expect(item.buyer_email).toBe('admin@example.test');
  expect(item.delivery_snapshot.contactEmail).toBe('admin@example.test');
  expect(item.delivery_snapshot.contactPhone).toBeNull();
});
it('rejects a PREORDER campaign that does not exist', async () => {
  await openPreorderCampaign();
  const sale = await pos.create(context(), {
    branchId: ids.branch,
    saleType: 'PREORDER',
    buyerName: 'Guest',
    buyerEmail: 'guest@example.test',
  });
  await expect(
    pos.addLine(context(), sale.id, {
      productId: ids.preorder,
      quantity: 1,
      preorderCampaignId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: 'PREORDER_CAMPAIGN_INCOMPATIBLE' });
});
it('protects PREORDER campaign capacity under concurrent completions', async () => {
  const campaign = await openPreorderCampaign(2),
    method = await activeMoneyMethod(),
    first = await preorderSale(campaign),
    second = await preorderSale(campaign);
  await pos.prepare(context(), first);
  await pos.prepare(context(), second);
  const results = await Promise.allSettled([
    pos.complete(context('preorder-capacity-a'), first, {
      amountClp: 4000,
      externalMoneyMethodId: method,
    }),
    pos.complete(context('preorder-capacity-b'), second, {
      amountClp: 4000,
      externalMoneyMethodId: method,
    }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(
    (
      await pool.query(`SELECT committed FROM preorder_campaigns WHERE preorder_campaign_id=$1`, [
        campaign,
      ])
    ).rows[0].committed,
  ).toBe('2');
});
it('does not allow a completed sale to be discarded', async () => {
  await pool.query(`UPDATE products SET price_amount_clp=0 WHERE product_id=$1`, [ids.regular]);
  const sale = await regularSale();
  await pos.complete(context(), sale, null);
  await expect(pos.discard(context(), sale, 'Not allowed')).rejects.toMatchObject({
    code: 'POS_DISCARD_INVALID',
  });
});
it('reports completed sales by completed_at in Branch.timezone', async () => {
  await pool.query(`UPDATE products SET price_amount_clp=0 WHERE product_id=$1`, [ids.regular]);
  const sale = await regularSale();
  await pos.complete(context(), sale, null);
  await pos.discard(
    context(),
    (await pos.create(context(), { branchId: ids.branch, saleType: 'REGULAR' })).id,
    'Unused draft',
  );
  expect(await pos.daily(context(), ids.branch, '2026-08-10')).toMatchObject({
    sale_count: 1,
    gross_amount_clp: 0,
    net_amount_clp: 0,
  });
});
it('replays the same mutation fingerprint and rejects a different payload', async () => {
  const execution = context('create-idempotency');
  const [first, replay] = await Promise.all([
    pos.create(execution, { branchId: ids.branch, saleType: 'REGULAR' }),
    pos.create(execution, { branchId: ids.branch, saleType: 'REGULAR' }),
  ]);
  expect(first.id).toBe(replay.id);
  expect([first.replayed, replay.replayed].sort()).toEqual([false, true]);
  await expect(
    pos.create(execution, { branchId: ids.branch, saleType: 'PREORDER' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  expect((await pool.query(`SELECT * FROM pos_sales`)).rows).toHaveLength(1);
});
it('keeps sale state history append-only', async () => {
  const sale = await regularSale();
  await pos.prepare(context(), sale);
  const history = (
    await pool.query(`SELECT history_id FROM pos_sale_state_history WHERE pos_sale_id=$1 LIMIT 1`, [
      sale,
    ])
  ).rows[0];
  await expect(
    pool.query(`DELETE FROM pos_sale_state_history WHERE history_id=$1`, [history.history_id]),
  ).rejects.toMatchObject({ code: '55000' });
});
it('keeps PosSaleSettlement immutable', async () => {
  await pool.query(`UPDATE products SET price_amount_clp=0 WHERE product_id=$1`, [ids.regular]);
  const sale = await regularSale();
  await pos.complete(context(), sale, null);
  await expect(
    pool.query(`UPDATE pos_sale_settlements SET amount_clp=1 WHERE pos_sale_id=$1`, [sale]),
  ).rejects.toMatchObject({ code: '55000' });
});
it('strict settlement contracts reject card data', () => {
  expect(() =>
    posSettlementSchema.parse({
      amountClp: 1000,
      externalMoneyMethodId: crypto.randomUUID(),
      cardNumber: '4111111111111111',
    }),
  ).toThrow();
});
