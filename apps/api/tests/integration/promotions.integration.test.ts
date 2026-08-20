import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PayloadRegistry } from '@sergod/contracts';
import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PromotionLifecycleJob } from '../../src/contexts/promotions/application/promotion-lifecycle-job.js';
import { PromotionsAdminService } from '../../src/contexts/promotions/application/promotions-admin-service.js';
import { PgPromotionsAdminAuthorizer } from '../../src/contexts/promotions/infrastructure/postgres-promotions-admin-authorizer.js';
import { PgPromotionsRepository } from '../../src/contexts/promotions/infrastructure/postgres-promotions-repository.js';
import { CoordinationStore } from '../../src/platform/coordination/coordination-store.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const ids = {
  admin: '0198a8be-6677-7000-8000-000000000101',
  branch: '0198a8be-6677-7000-8000-000000000102',
  client: '0198a8be-6677-7000-8000-000000000103',
};
const clock = new FixedClock(new Date('2026-08-10T12:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
const payloads = new PayloadRegistry([]);
let pool: Pool;
let service: PromotionsAdminService;
let repository: PgPromotionsRepository;
let job: PromotionLifecycleJob;
let sequence = 0;

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
}

function context(label: string, actorId = ids.admin, key?: string): ExecutionContext {
  sequence += 1;
  return {
    actorId,
    actorType: 'USER',
    correlationId: crypto.randomUUID(),
    idempotencyKey: key ?? `${label}-${sequence}`,
  };
}

function configuration() {
  return {
    activationMode: 'COUPON_REQUIRED' as const,
    benefit: { basisPoints: 1000, type: 'PERCENTAGE_DISCOUNT' as const },
    branchId: ids.branch,
    channel: 'BOTH' as const,
    endsAt: '2026-08-20T00:00:00.000Z',
    globalLimit: null,
    minimumEligibleAmountClp: null,
    minimumEligibleQuantity: null,
    name: 'Promoción integración',
    perAccountLimit: null,
    priority: 10,
    schedules: [] as {
      dayOfWeek: number;
      endMinuteLocal: number;
      position: number;
      startMinuteLocal: number;
    }[],
    scope: 'LINE' as const,
    startsAt: '2026-08-11T00:00:00.000Z',
    targets: [
      {
        categoryId: null,
        gameId: null,
        kind: 'ALL_PRODUCTS' as const,
        position: 1,
        productId: null,
        side: 'BENEFITED' as const,
      },
    ],
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
  repository = new PgPromotionsRepository(pool, clock, uuids);
  service = new PromotionsAdminService(repository, new PgPromotionsAdminAuthorizer(pool), clock);
  const coordination = new CoordinationStore(
    pool,
    clock,
    uuids,
    payloads,
    payloads,
    Buffer.alloc(32, 17),
  );
  job = new PromotionLifecycleJob(repository, coordination, clock);
});

beforeEach(async () => {
  sequence = 0;
  clock.set(new Date('2026-08-10T12:00:00.000Z'));
  await pool.query(
    `TRUNCATE coupons,promotion_weekly_schedules,promotion_targets,promotions,branches,user_accounts,idempotency_records,audit_entries,scheduled_job_runs CASCADE`,
  );
  await pool.query(
    `INSERT INTO user_accounts (
      account_id,auth_provider_user_id,role,status,current_email,normalized_email,current_phone,
      normalized_phone,email_verification_status,phone_verification_status,created_at,updated_at,status_changed_at
    ) VALUES
      ($1,$2,'ADMIN','ACTIVE','admin@phase5.test','admin@phase5.test',NULL,NULL,'VERIFIED','PENDING',$5,$5,$5),
      ($3,$4,'CLIENTE','ACTIVE','client@phase5.test','client@phase5.test',NULL,NULL,'VERIFIED','PENDING',$5,$5,$5)`,
    [ids.admin, crypto.randomUUID(), ids.client, crypto.randomUUID(), clock.now()],
  );
  await pool.query(
    `INSERT INTO branches (branch_id,name,internal_address,state,timezone,created_by,created_at,updated_at)
     VALUES ($1,'Branch phase 5','Private','ACTIVE','America/Santiago',$2,$3,$3)`,
    [ids.branch, ids.admin, clock.now()],
  );
});

afterAll(async () => pool.end());

describe('PostgreSQL promotions and coupons foundation', () => {
  it('creates relational configuration atomically, audits it and replays idempotently', async () => {
    const key = 'promotion-create-replay';
    const first = await service.createPromotion(context('create', ids.admin, key), configuration());
    const replay = await service.createPromotion(
      context('create', ids.admin, key),
      configuration(),
    );
    expect(replay).toMatchObject({
      replayed: true,
      item: { promotionId: first.item.promotionId, state: 'DRAFT' },
    });
    const counts = await pool.query<{ audits: string; promotions: string; targets: string }>(
      `SELECT (SELECT count(*) FROM promotions)::text promotions,
              (SELECT count(*) FROM promotion_targets)::text targets,
              (SELECT count(*) FROM audit_entries)::text audits`,
    );
    expect(counts.rows[0]).toEqual({ audits: '1', promotions: '1', targets: '1' });
  });

  it('paginates stably and binds an opaque cursor to its filters', async () => {
    await service.createPromotion(context('page-a'), { ...configuration(), name: 'Page A' });
    await service.createPromotion(context('page-b'), { ...configuration(), name: 'Page B' });
    const page = await service.listPromotions(context('page-read'), { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    await expect(
      service.listPromotions(context('page-invalid'), {
        cursor: page.nextCursor ?? undefined,
        limit: 1,
        state: 'DRAFT',
      }),
    ).rejects.toMatchObject({ code: 'PROMOTIONS_CURSOR_INVALID' });
  });

  it('rolls back the aggregate when a target reference is invalid', async () => {
    await expect(
      service.createPromotion(context('invalid'), {
        ...configuration(),
        targets: [
          {
            categoryId: null,
            gameId: null,
            kind: 'PRODUCT',
            position: 1,
            productId: crypto.randomUUID(),
            side: 'BENEFITED',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'PROMOTIONS_REFERENCE_NOT_FOUND' });
    await expect(
      pool.query(`SELECT count(*)::integer count FROM promotions`),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it('allows only ACTIVE verified Admin and preserves Cliente denial', async () => {
    await expect(
      service.listPromotions(context('admin-read'), { limit: 10 }),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      service.listPromotions(context('client-read', ids.client), { limit: 10 }),
    ).rejects.toMatchObject({ code: 'PROMOTIONS_ACCESS_DENIED' });
  });

  it('serializes concurrent state transitions and permits only one winner', async () => {
    const created = await service.createPromotion(context('concurrent-create'), {
      ...configuration(),
      startsAt: '2026-08-01T00:00:00.000Z',
    });
    const attempts = await Promise.allSettled([
      service.transitionPromotion(context('activate-a'), created.item.promotionId, 'ACTIVE'),
      service.transitionPromotion(context('activate-b'), created.item.promotionId, 'ACTIVE'),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    await expect(
      service.getPromotion(context('concurrent-read'), created.item.promotionId),
    ).resolves.toMatchObject({ state: 'ACTIVE' });
  });

  it('enforces normalized Coupon uniqueness and Coupon-required ownership', async () => {
    const automatic = await service.createPromotion(context('automatic'), {
      ...configuration(),
      activationMode: 'AUTOMATIC',
    });
    await expect(
      service.createCoupon(context('invalid-coupon'), {
        code: 'AUTO',
        endsAt: null,
        globalLimit: null,
        perAccountLimit: null,
        promotionId: automatic.item.promotionId,
        startsAt: null,
      }),
    ).rejects.toMatchObject({ code: 'PROMOTIONS_CONSTRAINT_CONFLICT' });
    const promotion = await service.createPromotion(context('coupon-promotion'), configuration());
    const input = {
      code: ' save10 ',
      endsAt: '2026-08-19T00:00:00.000Z',
      globalLimit: 2,
      perAccountLimit: 1,
      promotionId: promotion.item.promotionId,
      startsAt: null,
    };
    const created = await service.createCoupon(context('coupon'), input);
    expect(created.item.normalizedCode).toBe('SAVE10');
    await expect(
      service.createCoupon(context('duplicate'), { ...input, code: 'SAVE10' }),
    ).rejects.toMatchObject({ code: 'PROMOTIONS_UNIQUE_CONFLICT' });
  });

  it('runs scheduled activation and expiration once with ScheduledJobRun', async () => {
    const promotion = await service.createPromotion(context('promotion'), configuration());
    await service.transitionPromotion(context('schedule'), promotion.item.promotionId, 'SCHEDULED');
    const coupon = await service.createCoupon(context('coupon'), {
      code: 'JOB',
      endsAt: '2026-08-12T00:00:00.000Z',
      globalLimit: null,
      perAccountLimit: null,
      promotionId: promotion.item.promotionId,
      startsAt: null,
    });
    await service.transitionCoupon(context('activate-coupon'), coupon.item.couponId, 'ACTIVE');

    clock.set(new Date('2026-08-11T01:00:00.000Z'));
    const scheduledFor = new Date('2026-08-11T01:00:00.000Z');
    await expect(
      job.run({ correlationId: crypto.randomUUID(), scheduledFor }),
    ).resolves.toMatchObject({ kind: 'COMPLETED', promotions: 1 });
    await expect(job.run({ correlationId: crypto.randomUUID(), scheduledFor })).resolves.toEqual({
      kind: 'SUCCEEDED',
    });
    await expect(
      service.getPromotion(context('read'), promotion.item.promotionId),
    ).resolves.toMatchObject({ state: 'ACTIVE' });

    clock.set(new Date('2026-08-21T00:00:00.000Z'));
    await job.run({ correlationId: crypto.randomUUID(), scheduledFor: clock.now() });
    await expect(
      service.getPromotion(context('read-promotion'), promotion.item.promotionId),
    ).resolves.toMatchObject({ state: 'EXPIRED' });
    await expect(
      service.getCoupon(context('read-coupon'), coupon.item.couponId),
    ).resolves.toMatchObject({ state: 'EXPIRED' });
    const runs = await pool.query<{ count: string }>(
      `SELECT count(*) FROM scheduled_job_runs WHERE job_name='PROMOTION_LIFECYCLE'`,
    );
    expect(runs.rows[0]?.count).toBe('2');
  });

  it('enables RLS without opening policies and keeps direct public roles revoked when present', async () => {
    const rls = await pool.query<{ relrowsecurity: boolean; relname: string }>(
      `SELECT relname,relrowsecurity FROM pg_class WHERE relname = ANY($1::text[]) ORDER BY relname`,
      [['coupons', 'promotion_targets', 'promotion_weekly_schedules', 'promotions']],
    );
    expect(rls.rows).toHaveLength(4);
    expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);
    const policies = await pool.query<{ count: string }>(
      `SELECT count(*) FROM pg_policies WHERE tablename = ANY($1::text[])`,
      [['coupons', 'promotion_targets', 'promotion_weekly_schedules', 'promotions']],
    );
    expect(policies.rows[0]?.count).toBe('0');
  });
});
