import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ConfigurationKey, SystemConfigurationValue } from '@sergod/contracts';
import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CartService } from '../../src/contexts/commerce-orders/application/cart-service.js';
import { PgCartRepository } from '../../src/contexts/commerce-orders/infrastructure/postgres-cart-repository.js';
import { CartError } from '../../src/contexts/commerce-orders/domain/cart.js';
import { SystemConfigurationService } from '../../src/contexts/system-configuration/application/system-configuration-service.js';
import { PgSystemConfigurationAdminAuthorizer } from '../../src/contexts/system-configuration/infrastructure/postgres-system-configuration-authorizer.js';
import { PgSystemConfigurationRepository } from '../../src/contexts/system-configuration/infrastructure/postgres-system-configuration-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const adminId = '0198a8be-6677-7000-8000-000000000101';
const clientId = '0198a8be-6677-7000-8000-000000000102';
const branchId = '0198a8be-6677-7000-8000-000000000103';
const clock = new FixedClock(new Date('2026-08-12T01:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
let pool: Pool;
let repository: PgSystemConfigurationRepository;
let service: SystemConfigurationService;
let command = 0;

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
}

function context(actorId = adminId, key?: string): ExecutionContext {
  command += 1;
  return {
    actorId,
    actorType: 'USER',
    correlationId: crypto.randomUUID(),
    idempotencyKey: key ?? `system-configuration-${command}`,
  };
}

async function create(
  value: SystemConfigurationValue,
  key: ConfigurationKey = 'ANONYMOUS_CART_INACTIVITY_MINUTES',
  idempotencyKey?: string,
) {
  return service.createVersion(context(adminId, idempotencyKey), {
    configurationKey: key,
    reason: 'Acceptance configuration',
    value,
  });
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
  repository = new PgSystemConfigurationRepository(pool, clock, uuids);
  service = new SystemConfigurationService(
    repository,
    new PgSystemConfigurationAdminAuthorizer(pool),
  );
});

afterAll(async () => pool.end());

beforeEach(async () => {
  command = 0;
  clock.set(new Date('2026-08-12T01:00:00.000Z'));
  await pool.query(`TRUNCATE carts,system_configurations,branches,user_accounts,
    idempotency_records,audit_entries CASCADE`);
  await pool.query(
    `INSERT INTO user_accounts(account_id,auth_provider_user_id,role,status,current_email,
      normalized_email,email_verification_status,phone_verification_status,created_at,updated_at,
      status_changed_at)
     VALUES($1,$2,'ADMIN','ACTIVE','admin@configuration.test','admin@configuration.test',
       'VERIFIED','PENDING',$5,$5,$5),
       ($3,$4,'CLIENTE','ACTIVE','client@configuration.test','client@configuration.test',
       'VERIFIED','PENDING',$5,$5,$5)`,
    [adminId, crypto.randomUUID(), clientId, crypto.randomUUID(), clock.now()],
  );
  await pool.query(
    `INSERT INTO branches(branch_id,name,internal_address,state,timezone,created_by,created_at,updated_at)
     VALUES($1,'Configuration Store','internal','ACTIVE','America/Santiago',$2,$3,$3)`,
    [branchId, adminId, clock.now()],
  );
});

describe('PostgreSQL SystemConfiguration administration', () => {
  it('accepts 5760, rejects unknown keys and incompatible or out-of-range values', async () => {
    const created = await create(5760);
    expect(created.item).toMatchObject({
      configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
      state: 'DRAFT',
      value: 5760,
      valueType: 'INTEGER',
      versionNumber: 1,
    });
    await expect(create('5760')).rejects.toMatchObject({
      code: 'SYSTEM_CONFIGURATION_VALUE_INVALID',
    });
    await expect(create(0)).rejects.toMatchObject({
      code: 'SYSTEM_CONFIGURATION_VALUE_INVALID',
    });
    await expect(
      service.createVersion(context(), {
        configurationKey: 'UNKNOWN' as ConfigurationKey,
        reason: 'Unknown key',
        value: 1,
      }),
    ).rejects.toMatchObject({ code: 'SYSTEM_CONFIGURATION_KEY_UNKNOWN' });
  });

  it('numbers versions monotonically, edits only DRAFT and preserves activated history', async () => {
    const first = await create(5760);
    const edited = await service.editDraft(context(), first.item.systemConfigurationId, {
      reason: 'Correct draft',
      value: 6000,
    });
    expect(edited.item.value).toBe(6000);
    const active = await service.transition(context(), first.item.systemConfigurationId, {
      nextState: 'ACTIVE',
      reason: 'Activate first version',
    });
    expect(active.item.state).toBe('ACTIVE');
    await expect(
      service.editDraft(context(), first.item.systemConfigurationId, {
        reason: 'Forbidden edit',
        value: 7000,
      }),
    ).rejects.toMatchObject({ code: 'SYSTEM_CONFIGURATION_IMMUTABLE' });

    const second = await create(5760);
    expect(second.item.versionNumber).toBe(2);
    await service.transition(context(), second.item.systemConfigurationId, {
      nextState: 'ACTIVE',
      reason: 'Replace first version',
    });
    expect((await service.getVersion(context(), first.item.systemConfigurationId)).state).toBe(
      'RETIRED',
    );
    expect((await service.getActive(context(), 'ANONYMOUS_CART_INACTIVITY_MINUTES')).value).toBe(
      5760,
    );
    const history = await service.listVersions(context(), {
      configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
      limit: 10,
    });
    expect(history.items.map((item) => item.versionNumber).sort()).toEqual([1, 2]);
  });

  it('serializes concurrent activations and leaves exactly one ACTIVE version', async () => {
    const first = await create(5760);
    const second = await create(6000);
    await Promise.all([
      service.transition(context(), first.item.systemConfigurationId, {
        nextState: 'ACTIVE',
        reason: 'Concurrent first',
      }),
      service.transition(context(), second.item.systemConfigurationId, {
        nextState: 'ACTIVE',
        reason: 'Concurrent second',
      }),
    ]);
    const states = await pool.query<{ count: number; state: string }>(
      `SELECT state,count(*)::int AS count FROM system_configurations GROUP BY state ORDER BY state`,
    );
    expect(states.rows).toEqual([
      { count: 1, state: 'ACTIVE' },
      { count: 1, state: 'RETIRED' },
    ]);
  });

  it('replays mutations and rejects the same key with a different fingerprint', async () => {
    const key = 'configuration-replay';
    const first = await create(5760, 'ANONYMOUS_CART_INACTIVITY_MINUTES', key);
    const replay = await create(5760, 'ANONYMOUS_CART_INACTIVITY_MINUTES', key);
    expect(replay.replayed).toBe(true);
    expect(replay.item.systemConfigurationId).toBe(first.item.systemConfigurationId);
    await expect(create(6000, 'ANONYMOUS_CART_INACTIVITY_MINUTES', key)).rejects.toMatchObject({
      code: 'SYSTEM_CONFIGURATION_IDEMPOTENCY_CONFLICT',
    });
    expect(
      (await pool.query(`SELECT count(*)::int AS count FROM system_configurations`)).rows[0]?.count,
    ).toBe(1);
  });

  it('requires a current ACTIVE ADMIN and records reasons without secret payloads', async () => {
    await expect(
      service.createVersion(context(clientId), {
        configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
        reason: 'Denied',
        value: 5760,
      }),
    ).rejects.toMatchObject({ code: 'SYSTEM_CONFIGURATION_ACCESS_DENIED' });
    const created = await create(5760);
    await service.transition(context(), created.item.systemConfigurationId, {
      nextState: 'ACTIVE',
      reason: 'Enable anonymous cart expiration',
    });
    const audits = await pool.query<{
      action: string;
      actor_id: string;
      diagnostic_context: unknown;
      reason: string;
    }>(
      `SELECT action,actor_id,diagnostic_context,reason FROM audit_entries
        WHERE resource_type='SYSTEM_CONFIGURATION' ORDER BY occurred_at,audit_entry_id`,
    );
    expect(audits.rows.map((row) => row.action).sort()).toEqual(
      ['SYSTEM_CONFIGURATION_VERSION_CREATED', 'SYSTEM_CONFIGURATION_ACTIVATED'].sort(),
    );
    expect(audits.rows.every((row) => row.actor_id === adminId)).toBe(true);
    expect(audits.rows.every((row) => row.diagnostic_context === null)).toBe(true);
    expect(JSON.stringify(audits.rows)).not.toContain('5760');
  });

  it('drives anonymous cart expiry from ACTIVE=5760 and keeps the missing-config gate closed', async () => {
    const created = await create(5760);
    await service.transition(context(), created.item.systemConfigurationId, {
      nextState: 'ACTIVE',
      reason: 'Enable cart expiration',
    });
    const cart = new CartService(new PgCartRepository(pool, clock, uuids));
    const first = await cart.createCurrent(context(), {
      anonymousSessionId: 'a'.repeat(64),
      kind: 'ANONYMOUS',
    });
    expect(
      (new Date(required(first.item.expiresAt)).getTime() -
        new Date(first.item.updatedAt).getTime()) /
        60_000,
    ).toBe(5760);

    await service.transition(context(), created.item.systemConfigurationId, {
      nextState: 'RETIRED',
      reason: 'Verify closed gate',
    });
    await expect(
      cart.createCurrent(context(), {
        anonymousSessionId: 'b'.repeat(64),
        kind: 'ANONYMOUS',
      }),
    ).rejects.toBeInstanceOf(CartError);
  });

  it('enforces the registry, immutable history and default-deny at PostgreSQL level', async () => {
    await expect(
      pool.query(
        `INSERT INTO system_configurations(
          system_configuration_id,configuration_key,scope,value_type,integer_value,version_number,
          state,created_by,created_at,correlation_id
        ) VALUES($1,'UNKNOWN','GLOBAL','INTEGER',1,1,'DRAFT',$2,$3,$4)`,
        [crypto.randomUUID(), adminId, clock.now(), crypto.randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const created = await create(5760);
    await service.transition(context(), created.item.systemConfigurationId, {
      nextState: 'ACTIVE',
      reason: 'Activate immutable version',
    });
    await expect(
      pool.query(
        `UPDATE system_configurations SET integer_value=1 WHERE system_configuration_id=$1`,
        [created.item.systemConfigurationId],
      ),
    ).rejects.toMatchObject({ code: '55000' });
    await expect(
      pool.query(`DELETE FROM system_configurations WHERE system_configuration_id=$1`, [
        created.item.systemConfigurationId,
      ]),
    ).rejects.toMatchObject({ code: '55000' });
    const rls = await pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname='system_configurations'`,
    );
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
  });
});

function required<T>(value: T | null): T {
  if (value === null) throw new Error('Expected value.');
  return value;
}
