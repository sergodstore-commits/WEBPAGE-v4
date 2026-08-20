import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LoyaltyService } from '../../src/contexts/loyalty/application/loyalty-service.js';
import { PgLoyaltyAdminAuthorizer } from '../../src/contexts/loyalty/infrastructure/postgres-loyalty-authorizer.js';
import { PgLoyaltyRepository } from '../../src/contexts/loyalty/infrastructure/postgres-loyalty-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const ids = {
  admin: '0198a8be-6677-7000-8000-000000000201',
  branch: '0198a8be-6677-7000-8000-000000000202',
  client: '0198a8be-6677-7000-8000-000000000203',
};
const clock = new FixedClock(new Date('2026-08-12T12:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
let pool: Pool;
let service: LoyaltyService;
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

const configuration = {
  branchId: ids.branch,
  earnClpPerPoint: 1000,
  maximumRedeemBasisPoints: 5000,
  minimumRedeemPoints: 10,
  redeemClpPerPoint: 100,
};

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
  service = new LoyaltyService(
    new PgLoyaltyRepository(pool, clock, uuids),
    new PgLoyaltyAdminAuthorizer(pool),
  );
});

beforeEach(async () => {
  sequence = 0;
  await pool.query(
    `TRUNCATE loyalty_movements,loyalty_configurations,loyalty_accounts,branches,user_accounts,idempotency_records,audit_entries CASCADE`,
  );
  await pool.query(
    `INSERT INTO user_accounts (
      account_id,auth_provider_user_id,role,status,current_email,normalized_email,current_phone,
      normalized_phone,email_verification_status,phone_verification_status,created_at,updated_at,status_changed_at
    ) VALUES
      ($1,$2,'ADMIN','ACTIVE','admin@loyalty.test','admin@loyalty.test',NULL,NULL,'VERIFIED','PENDING',$5,$5,$5),
      ($3,$4,'CLIENTE','ACTIVE','client@loyalty.test','client@loyalty.test',NULL,NULL,'VERIFIED','PENDING',$5,$5,$5)`,
    [ids.admin, crypto.randomUUID(), ids.client, crypto.randomUUID(), clock.now()],
  );
  await pool.query(
    `INSERT INTO branches (branch_id,name,internal_address,state,timezone,created_by,created_at,updated_at)
     VALUES ($1,'Loyalty branch','Private','ACTIVE','America/Santiago',$2,$3,$3)`,
    [ids.branch, ids.admin, clock.now()],
  );
});

afterAll(async () => pool.end());

describe('PostgreSQL loyalty foundation', () => {
  it('coordinates every new UserAccount with one zero LoyaltyAccount and keeps backfill idempotent', async () => {
    const initial = await pool.query<{ balance: string; count: string; reserved_points: string }>(
      `SELECT count(*)::text count,min(balance)::text balance,min(reserved_points)::text reserved_points FROM loyalty_accounts`,
    );
    expect(initial.rows[0]).toEqual({ balance: '0', count: '2', reserved_points: '0' });
    await pool.query(
      `INSERT INTO loyalty_accounts (loyalty_account_id,account_id,balance,reserved_points,version,created_at,updated_at)
       SELECT gen_random_uuid(),account_id,0,0,1,created_at,created_at FROM user_accounts
       ON CONFLICT (account_id) DO NOTHING`,
    );
    const counts = await pool.query<{ accounts: string; loyalty: string }>(
      `SELECT (SELECT count(*) FROM user_accounts)::text accounts,(SELECT count(*) FROM loyalty_accounts)::text loyalty`,
    );
    expect(counts.rows[0]).toEqual({ accounts: '2', loyalty: '2' });
    expect(await service.getOwnAccount(context('self', ids.client))).toMatchObject({
      accountId: ids.client,
      availablePoints: 0,
      balance: 0,
      reservedPoints: 0,
    });
  });

  it('creates increasing versions under concurrency and atomically retires the previous ACTIVE', async () => {
    const [first, second] = await Promise.all([
      service.createConfiguration(context('create-a'), configuration),
      service.createConfiguration(context('create-b'), { ...configuration, earnClpPerPoint: 2000 }),
    ]);
    expect(new Set([first.item.versionNumber, second.item.versionNumber])).toEqual(new Set([1, 2]));
    await service.editConfiguration(context('edit'), first.item.loyaltyConfigurationId, {
      earnClpPerPoint: 1500,
      maximumRedeemBasisPoints: 5000,
      minimumRedeemPoints: 10,
      redeemClpPerPoint: 100,
    });
    const activeFirst = await service.activateConfiguration(
      context('activate-a'),
      first.item.loyaltyConfigurationId,
    );
    expect(activeFirst.item.state).toBe('ACTIVE');
    const activeSecond = await service.activateConfiguration(
      context('activate-b'),
      second.item.loyaltyConfigurationId,
    );
    expect(activeSecond.item.state).toBe('ACTIVE');
    expect(
      (await service.getConfiguration(context('read'), first.item.loyaltyConfigurationId)).state,
    ).toBe('RETIRED');
    expect(
      (await service.getActiveConfiguration(context('active'), ids.branch)).loyaltyConfigurationId,
    ).toBe(second.item.loyaltyConfigurationId);
    await expect(
      service.editConfiguration(context('immutable'), second.item.loyaltyConfigurationId, {
        earnClpPerPoint: 1,
        maximumRedeemBasisPoints: null,
        minimumRedeemPoints: 0,
        redeemClpPerPoint: 1,
      }),
    ).rejects.toMatchObject({ code: 'LOYALTY_CONFIGURATION_IMMUTABLE' });
  });

  it('applies ADMIN_CORRECTION with locking, ledger, audit and idempotent replay', async () => {
    const key = 'loyalty-correction-replay';
    const first = await service.correctAccount(context('positive', ids.admin, key), ids.client, {
      pointsSigned: 100,
      reason: 'Verified support correction',
    });
    const replay = await service.correctAccount(context('positive', ids.admin, key), ids.client, {
      pointsSigned: 100,
      reason: 'Verified support correction',
    });
    expect(replay).toMatchObject({
      movementId: first.movementId,
      replayed: true,
      account: { balance: 100 },
    });
    const counts = await pool.query<{ audits: string; movements: string }>(
      `SELECT (SELECT count(*) FROM loyalty_movements)::text movements,
              (SELECT count(*) FROM audit_entries WHERE action='LOYALTY_ADMIN_CORRECTION')::text audits`,
    );
    expect(counts.rows[0]).toEqual({ audits: '1', movements: '1' });
    const competing = await Promise.allSettled([
      service.correctAccount(context('minus-a'), ids.client, {
        pointsSigned: -60,
        reason: 'First concurrent correction',
      }),
      service.correctAccount(context('minus-b'), ids.client, {
        pointsSigned: -60,
        reason: 'Second concurrent correction',
      }),
    ]);
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await service.getAdminAccount(context('balance'), ids.client)).balance).toBe(40);
  });

  it('rejects direct ledger mutation and unsafe correction while exposing paginated own history only', async () => {
    await service.correctAccount(context('seed'), ids.client, {
      pointsSigned: 5,
      reason: 'Documented correction',
    });
    await expect(
      service.correctAccount(context('unsafe'), ids.client, {
        pointsSigned: -6,
        reason: 'Unsafe correction',
      }),
    ).rejects.toMatchObject({ code: 'LOYALTY_CORRECTION_NEGATIVE_BALANCE' });
    const movement = await service.listOwnMovements(context('history', ids.client), { limit: 1 });
    expect(movement.items).toHaveLength(1);
    expect(movement.items[0]).toMatchObject({ pointsSigned: 5, type: 'ADMIN_CORRECTION' });
    expect(movement.items[0]).not.toHaveProperty('idempotencyKey');
    expect(movement.items[0]).not.toHaveProperty('actorId');
    await expect(pool.query(`UPDATE loyalty_movements SET points_signed=6`)).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('keeps RLS default-deny and no direct grants for browser roles', async () => {
    const rls = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('loyalty_accounts','loyalty_configurations','loyalty_movements') ORDER BY relname`,
    );
    expect(rls.rows).toEqual([
      { relname: 'loyalty_accounts', relrowsecurity: true },
      { relname: 'loyalty_configurations', relrowsecurity: true },
      { relname: 'loyalty_movements', relrowsecurity: true },
    ]);
    const grants = await pool.query<{ count: string }>(
      `SELECT count(*)::text count FROM information_schema.role_table_grants
       WHERE table_name LIKE 'loyalty_%' AND grantee IN ('anon','authenticated')`,
    );
    expect(grants.rows[0]?.count).toBe('0');
    const commercial = await pool.query<{ count: string }>(
      `SELECT count(*)::text count FROM loyalty_movements WHERE type<>'ADMIN_CORRECTION'`,
    );
    expect(commercial.rows[0]?.count).toBe('0');
  });

  it('revalidates ADMIN ACTIVE authorization on every administrative request', async () => {
    await pool.query(
      `UPDATE user_accounts SET status='DEACTIVATED',deactivated_at=$2,deactivated_by=$1,
        status_changed_at=$2,updated_at=$2 WHERE account_id=$1`,
      [ids.admin, clock.now()],
    );
    await expect(
      service.listConfigurations(context('deactivated'), { limit: 10 }),
    ).rejects.toMatchObject({ code: 'LOYALTY_ACCESS_DENIED' });
  });
});
