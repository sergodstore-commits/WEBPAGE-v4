import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CryptoUuidGenerator, FixedClock } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PgIdentityAccessRepository } from '../../src/contexts/identity-access/infrastructure/postgres-identity-access-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const clock = new FixedClock(new Date('2026-07-31T12:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
const correlationId = '0198a8be-6677-7000-8000-000000000001';
const context = { actorType: 'SYSTEM' as const, correlationId };
let pool: Pool;
let repository: PgIdentityAccessRepository;

async function localDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
}

async function migrate(url: string): Promise<void> {
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
}

async function bootstrap(idempotencyKey = 'bootstrap-1') {
  return repository.provisionFirstAdmin({
    context: { ...context, idempotencyKey },
    diagnosticContext: { contract: 'BootstrapDiagnosticContext.v1' },
    environmentIdentifier: 'integration-test',
    executionSource: 'DEPLOYMENT_COMMAND',
    idempotencyKey,
    identity: {
      email: 'admin@example.test',
      emailVerified: true,
      providerUserId: '0198a8be-6677-7000-8000-000000000100',
    },
  });
}

async function activeLegal(adminId: string) {
  const documentId = await repository.createLegalDocument({
    actorAccountId: adminId,
    key: 'terms_test',
    publicTitle: 'Términos de prueba',
    requiredForRegistration: true,
  });
  const versionId = await repository.createLegalVersion({
    actorAccountId: adminId,
    contentLocation: 'https://example.test/legal/terms-v1',
    legalDocumentId: documentId,
    title: 'Términos de prueba v1',
    versionLabel: 'v1',
  });
  await repository.activateLegalVersion({ actorAccountId: adminId, legalVersionId: versionId });
  await repository.activateLegalDocument({ actorAccountId: adminId, legalDocumentId: documentId });
  return { documentId, versionId };
}

async function registerClient(
  versionId: string,
  suffix: number,
  overrides: {
    emailVerified?: boolean;
    legal?: readonly string[];
    idempotencyKey?: string;
  } = {},
) {
  return repository.registerClient({
    acceptedLegalVersionIds: overrides.legal ?? [versionId],
    context: { ...context, idempotencyKey: overrides.idempotencyKey ?? `registration-${suffix}` },
    evidenceContext: { contract: 'LegalEvidenceContext.v1' },
    idempotencyKey: overrides.idempotencyKey ?? `registration-${suffix}`,
    identity: {
      email: `client${suffix}@example.test`,
      emailVerified: overrides.emailVerified ?? true,
      providerUserId: `0198a8be-6677-7000-8000-${suffix.toString().padStart(12, '0')}`,
    },
    phone: `+56920000${suffix.toString().padStart(3, '0')}`,
    registrationSetFingerprint: `fingerprint-${suffix}`,
  });
}

beforeAll(async () => {
  const url = await localDatabaseUrl();
  await migrate(url);
  pool = createPostgresPool(url, { max: 20 });
  repository = new PgIdentityAccessRepository(pool, clock, uuids);
});

beforeEach(async () => {
  clock.set(new Date('2026-07-31T12:00:00.000Z'));
  await pool.query(`
    TRUNCATE inventory_movements, inventory_positions, product_media,
             products, catalog_entity_media, resource_assets, collections, categories,
             tcg_games, branches, legal_acceptances, legal_document_versions, legal_documents,
             external_identity_reconciliations, account_contact_changes,
             application_sessions, role_history,
             account_state_history, system_bootstrap_records, user_accounts,
             audit_entries, idempotency_records, outbox_events, inbox_messages,
             scheduled_job_runs CASCADE
  `);
});

afterAll(async () => {
  await pool.end();
});

describe('IdentityAccess PostgreSQL integration', () => {
  it('enables RLS on every application table exposed through the public schema', async () => {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM pg_class relation
         JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
          AND relation.relname <> 'pg_migrations' AND NOT relation.relrowsecurity`,
    );
    expect(result.rows[0]?.count).toBe('0');
  });

  it('keeps registration closed before bootstrap', async () => {
    await expect(registerClient('0198a8be-6677-7000-8000-000000000200', 201)).rejects.toMatchObject(
      { code: 'REGISTRATION_NOT_ENABLED' },
    );
    const count = await pool.query<{ count: string }>('SELECT count(*) FROM user_accounts');
    expect(count.rows[0]?.count).toBe('0');
  });

  it('persists email confirmation by changing the internal account from PENDING to VERIFIED', async () => {
    const admin = await bootstrap();
    const legal = await activeLegal(admin.accountId);
    await registerClient(legal.versionId, 216, { emailVerified: false });

    expect(
      (await repository.findAccountByProviderUserId('0198a8be-6677-7000-8000-000000000216'))
        ?.emailVerificationStatus,
    ).toBe('PENDING');
    await expect(
      repository.markEmailVerified({
        context,
        providerUserId: '0198a8be-6677-7000-8000-000000000216',
        verifiedEmail: 'client216@example.test',
      }),
    ).resolves.toBe('REGISTRATION_CONFIRMED');
    expect(
      (await repository.findAccountByProviderUserId('0198a8be-6677-7000-8000-000000000216'))
        ?.emailVerificationStatus,
    ).toBe('VERIFIED');
  });

  it('provisions exactly one first Admin, replays the same key and rejects another key', async () => {
    const first = await bootstrap();
    await expect(bootstrap()).resolves.toEqual({ accountId: first.accountId, replayed: true });
    await expect(bootstrap('other-bootstrap')).rejects.toMatchObject({
      code: 'BOOTSTRAP_ALREADY_COMPLETED',
    });
    const accounts = await pool.query<{ role: string; status: string }>(
      'SELECT role, status FROM user_accounts',
    );
    expect(accounts.rows).toEqual([{ role: 'ADMIN', status: 'ACTIVE' }]);
  });

  it('serializes bootstrap against public registration so no Client can win initialization', async () => {
    const [bootstrapResult, registrationResult] = await Promise.allSettled([
      bootstrap('race-bootstrap'),
      registerClient('0198a8be-6677-7000-8000-000000000200', 202),
    ]);
    expect(bootstrapResult.status).toBe('fulfilled');
    expect(registrationResult.status).toBe('rejected');
    const roles = await pool.query<{ role: string }>('SELECT role FROM user_accounts');
    expect(roles.rows).toEqual([{ role: 'ADMIN' }]);
  });

  it('accepts exactly the current legal set, persists a common fingerprint and replays without duplicates', async () => {
    const admin = await bootstrap();
    const legal = await activeLegal(admin.accountId);
    const first = await registerClient(legal.versionId, 203);
    const replay = await registerClient(legal.versionId, 203);
    expect(replay).toEqual({ accountId: first.accountId, replayed: true });
    const acceptance = await pool.query<{
      count: string;
      registration_set_fingerprint: string;
    }>(
      `SELECT count(*)::text AS count, min(registration_set_fingerprint) AS registration_set_fingerprint
         FROM legal_acceptances WHERE account_id = $1`,
      [first.accountId],
    );
    expect(acceptance.rows[0]).toEqual({
      count: '1',
      registration_set_fingerprint: 'fingerprint-203',
    });
  });

  it('rejects missing, extra and concurrently replaced legal versions without a usable account', async () => {
    const admin = await bootstrap();
    const legal = await activeLegal(admin.accountId);
    await expect(registerClient(legal.versionId, 204, { legal: [] })).rejects.toMatchObject({
      code: 'LEGAL_SET_CHANGED',
    });
    await expect(
      registerClient(legal.versionId, 205, {
        legal: [legal.versionId, '0198a8be-6677-7000-8000-000000000999'],
      }),
    ).rejects.toMatchObject({ code: 'LEGAL_SET_CHANGED' });

    const replacement = await repository.createLegalVersion({
      actorAccountId: admin.accountId,
      contentLocation: 'https://example.test/legal/terms-v2',
      legalDocumentId: legal.documentId,
      title: 'Términos v2',
      versionLabel: 'v2',
    });
    await repository.activateLegalVersion({
      actorAccountId: admin.accountId,
      legalVersionId: replacement,
    });
    await expect(registerClient(legal.versionId, 206)).rejects.toMatchObject({
      code: 'LEGAL_SET_CHANGED',
    });
    const clients = await pool.query<{ count: string }>(
      `SELECT count(*) FROM user_accounts WHERE role = 'CLIENTE'`,
    );
    expect(clients.rows[0]?.count).toBe('0');
  });

  it('keeps DRAFT legal content private and makes ACTIVE or accepted versions immutable', async () => {
    const admin = await bootstrap();
    const documentId = await repository.createLegalDocument({
      actorAccountId: admin.accountId,
      key: 'privacy_test',
      publicTitle: 'Privacidad',
      requiredForRegistration: true,
    });
    const versionId = await repository.createLegalVersion({
      actorAccountId: admin.accountId,
      contentLocation: 'https://example.test/legal/privacy-v1',
      legalDocumentId: documentId,
      title: 'Privacidad v1',
      versionLabel: 'v1',
    });
    expect(await repository.listPublicLegalVersions()).toEqual([]);
    await repository.updateDraftLegalDocument({
      actorAccountId: admin.accountId,
      legalDocumentId: documentId,
      publicTitle: 'Privacidad actualizada',
      requiredForRegistration: true,
    });
    await repository.activateLegalVersion({
      actorAccountId: admin.accountId,
      legalVersionId: versionId,
    });
    await repository.activateLegalDocument({
      actorAccountId: admin.accountId,
      legalDocumentId: documentId,
    });
    expect(await repository.listPublicLegalVersions()).toHaveLength(1);
    await expect(
      pool.query(
        `UPDATE legal_document_versions SET title = 'mutated' WHERE legal_document_version_id = $1`,
        [versionId],
      ),
    ).rejects.toThrow('immutable');
  });

  it('protects the last Admin and serializes concurrent deactivations', async () => {
    const admin = await bootstrap();
    await expect(
      repository.changeAccountState({
        accountId: admin.accountId,
        actorAccountId: admin.accountId,
        context: { ...context, actorId: admin.accountId, actorType: 'USER' },
        reason: 'test',
        targetStatus: 'DEACTIVATED',
      }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN_PROTECTED' });

    const legal = await activeLegal(admin.accountId);
    const second = await registerClient(legal.versionId, 207);
    await repository.promoteToAdmin({
      accountId: second.accountId,
      actorAccountId: admin.accountId,
      context: { ...context, actorId: admin.accountId, actorType: 'USER' },
      reason: 'verified promotion',
    });
    const results = await Promise.allSettled([
      repository.changeAccountState({
        accountId: admin.accountId,
        actorAccountId: second.accountId,
        context: { ...context, actorId: second.accountId, actorType: 'USER' },
        reason: 'concurrent-a',
        targetStatus: 'DEACTIVATED',
      }),
      repository.changeAccountState({
        accountId: second.accountId,
        actorAccountId: admin.accountId,
        context: { ...context, actorId: admin.accountId, actorType: 'USER' },
        reason: 'concurrent-b',
        targetStatus: 'DEACTIVATED',
      }),
    ]);
    expect(
      results.filter(({ status }) => status === 'fulfilled'),
      results
        .map((result) =>
          result.status === 'rejected' && result.reason instanceof Error
            ? result.reason.message
            : result.status,
        )
        .join(' | '),
    ).toHaveLength(1);
    const activeAdmins = await pool.query<{ count: string }>(
      `SELECT count(*) FROM user_accounts WHERE role = 'ADMIN' AND status = 'ACTIVE'`,
    );
    expect(activeAdmins.rows[0]?.count).toBe('1');
  });

  it('invalidates prior sessions on promotion while preserving role history', async () => {
    const admin = await bootstrap();
    const legal = await activeLegal(admin.accountId);
    const client = await registerClient(legal.versionId, 208);
    await repository.recordApplicationSession({
      accountId: client.accountId,
      authSessionId: '0198a8be-6677-7000-8000-000000000300',
      channel: 'EMAIL_PASSWORD',
      now: clock.now(),
    });
    await repository.promoteToAdmin({
      accountId: client.accountId,
      actorAccountId: admin.accountId,
      context: { ...context, actorId: admin.accountId, actorType: 'USER' },
      reason: 'promotion',
    });
    const state = await pool.query<{
      invalidation_reason: string;
      role_history: string;
    }>(
      `SELECT
         (SELECT invalidation_reason FROM application_sessions WHERE account_id = $1) AS invalidation_reason,
         (SELECT count(*) FROM role_history WHERE account_id = $1)::text AS role_history`,
      [client.accountId],
    );
    expect(state.rows[0]).toEqual({
      invalidation_reason: 'ROLE_CHANGED_TO_ADMIN',
      role_history: '1',
    });
  });

  it('creates one Branch under concurrency and replays its idempotency key', async () => {
    const admin = await bootstrap();
    const command = {
      actorAccountId: admin.accountId,
      context: { ...context, actorId: admin.accountId, actorType: 'USER' as const },
      idempotencyKey: 'branch-1',
      internalAddress: 'Dirección de integración',
      name: 'Sucursal de integración',
      timezone: 'America/Santiago',
    };
    const [first, second] = await Promise.all([
      repository.initializeFirstBranch(command),
      repository.initializeFirstBranch(command),
    ]);
    expect(new Set([first.branchId, second.branchId]).size).toBe(1);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    const count = await pool.query<{ count: string }>('SELECT count(*) FROM branches');
    expect(count.rows[0]?.count).toBe('1');
    await expect(
      repository.initializeFirstBranch({ ...command, idempotencyKey: 'branch-2' }),
    ).rejects.toMatchObject({ code: 'BRANCH_ALREADY_INITIALIZED' });
  });

  it('backfills zero inventory positions when the first Branch is initialized after inventory', async () => {
    const admin = await bootstrap();
    const gameId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();
    const regularProductId = crypto.randomUUID();
    const preorderProductId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tcg_games (
         game_id, name, slug, publication_status, created_at, updated_at
       ) VALUES ($1, 'Juego previo', $2, 'DRAFT', $3, $3)`,
      [gameId, `juego-previo-${gameId}`, clock.now()],
    );
    await pool.query(
      `INSERT INTO categories (
         category_id, name, publication_status, created_at, updated_at
       ) VALUES ($1, 'Categoría previa', 'DRAFT', $2, $2)`,
      [categoryId, clock.now()],
    );
    await pool.query(
      `INSERT INTO products (
         product_id, sku, game_id, category_id, name, sale_type, price_amount_clp,
         publication_status, created_at, updated_at
       ) VALUES
         ($1, $2, $3, $4, 'Producto regular previo', 'REGULAR', 1000, 'DRAFT', $7, $7),
         ($5, $6, $3, $4, 'Producto preventa previo', 'PREORDER', 2000, 'DRAFT', $7, $7)`,
      [
        regularProductId,
        `REGULAR-${regularProductId}`,
        gameId,
        categoryId,
        preorderProductId,
        `PREORDER-${preorderProductId}`,
        clock.now(),
      ],
    );

    const command = {
      actorAccountId: admin.accountId,
      context: { ...context, actorId: admin.accountId, actorType: 'USER' as const },
      idempotencyKey: 'branch-after-inventory',
      internalAddress: 'Dirección interna real',
      name: 'Sucursal posterior al inventario',
      timezone: 'America/Santiago',
    };
    const initialized = await repository.initializeFirstBranch(command);
    const readPositions = () =>
      pool.query<{
        branch_id: string;
        low_stock_threshold_override: string | null;
        on_hand: string;
        product_id: string;
        reserved: string;
        sale_type: string;
        version: string;
      }>(`SELECT position.branch_id, position.product_id, product.sale_type,
              position.on_hand::text, position.reserved::text,
              position.low_stock_threshold_override::text, position.version::text
         FROM inventory_positions position
         JOIN products product ON product.product_id = position.product_id
        ORDER BY product.sale_type`);
    const expectedPositions = [
      {
        branch_id: initialized.branchId,
        low_stock_threshold_override: null,
        on_hand: '0',
        product_id: preorderProductId,
        reserved: '0',
        sale_type: 'PREORDER',
        version: '1',
      },
      {
        branch_id: initialized.branchId,
        low_stock_threshold_override: null,
        on_hand: '0',
        product_id: regularProductId,
        reserved: '0',
        sale_type: 'REGULAR',
        version: '1',
      },
    ];

    await expect(readPositions()).resolves.toMatchObject({ rows: expectedPositions });
    const replay = await repository.initializeFirstBranch(command);
    expect(replay).toEqual({ branchId: initialized.branchId, replayed: true });
    await expect(readPositions()).resolves.toMatchObject({ rows: expectedPositions });

    await pool.query('DELETE FROM inventory_positions');
    const repairedReplay = await repository.initializeFirstBranch(command);
    expect(repairedReplay).toEqual({ branchId: initialized.branchId, replayed: true });
    await expect(readPositions()).resolves.toMatchObject({ rows: expectedPositions });
    const movements = await pool.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM inventory_movements',
    );
    expect(movements.rows[0]?.count).toBe('0');
    await expect(
      pool.query(
        `INSERT INTO inventory_positions (
           inventory_position_id, product_id, branch_id, on_hand, reserved, version, updated_at
         ) VALUES ($1, $2, $3, 0, 0, 1, $4)`,
        [crypto.randomUUID(), regularProductId, initialized.branchId, clock.now()],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rolls back the first Branch when inventory position backfill fails', async () => {
    const admin = await bootstrap();
    const gameId = crypto.randomUUID();
    const categoryId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO tcg_games (
         game_id, name, slug, publication_status, created_at, updated_at
       ) VALUES ($1, 'Juego rollback', $2, 'DRAFT', $3, $3)`,
      [gameId, `juego-rollback-${gameId}`, clock.now()],
    );
    await pool.query(
      `INSERT INTO categories (
         category_id, name, publication_status, created_at, updated_at
       ) VALUES ($1, 'Categoría rollback', 'DRAFT', $2, $2)`,
      [categoryId, clock.now()],
    );
    await pool.query(
      `INSERT INTO products (
         product_id, sku, game_id, category_id, name, sale_type, price_amount_clp,
         publication_status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'Producto rollback', 'REGULAR', 1000, 'DRAFT', $5, $5)`,
      [productId, `ROLLBACK-${productId}`, gameId, categoryId, clock.now()],
    );
    await pool.query(`
      CREATE OR REPLACE FUNCTION sergod_test_reject_inventory_position()
      RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
      BEGIN
        RAISE EXCEPTION 'forced inventory backfill failure';
      END;
      $$;
      CREATE TRIGGER reject_inventory_position
        BEFORE INSERT ON inventory_positions
        FOR EACH ROW EXECUTE FUNCTION sergod_test_reject_inventory_position();
    `);

    try {
      await expect(
        repository.initializeFirstBranch({
          actorAccountId: admin.accountId,
          context: { ...context, actorId: admin.accountId, actorType: 'USER' },
          idempotencyKey: 'branch-backfill-failure',
          internalAddress: 'Dirección rollback',
          name: 'Sucursal rollback',
          timezone: 'America/Santiago',
        }),
      ).rejects.toThrow('forced inventory backfill failure');
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS reject_inventory_position ON inventory_positions;
        DROP FUNCTION IF EXISTS sergod_test_reject_inventory_position();
      `);
    }

    const state = await pool.query<{ audits: string; branches: string; idempotency: string }>(
      `SELECT
         (SELECT count(*) FROM branches)::text AS branches,
         (SELECT count(*) FROM idempotency_records
           WHERE scope = 'INITIALIZE_FIRST_BRANCH')::text AS idempotency,
         (SELECT count(*) FROM audit_entries
           WHERE action = 'INITIALIZE_FIRST_BRANCH')::text AS audits`,
    );
    expect(state.rows[0]).toEqual({ audits: '0', branches: '0', idempotency: '0' });
  });

  it('prevents two accounts from reserving the same new contact concurrently', async () => {
    const admin = await bootstrap();
    const legal = await activeLegal(admin.accountId);
    const first = await registerClient(legal.versionId, 211);
    const second = await registerClient(legal.versionId, 212);
    const commands = [first.accountId, second.accountId].map((accountId) =>
      repository.reserveContactChange({
        accountId,
        context,
        expiresAt: new Date('2026-08-01T12:00:00.000Z'),
        newValue: 'shared@example.test',
      }),
    );
    const results = await Promise.allSettled(commands);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const pending = await pool.query<{ count: string }>(
      `SELECT count(*) FROM account_contact_changes WHERE state = 'PENDING'`,
    );
    expect(pending.rows[0]?.count).toBe('1');
  });

  it('keeps the current email active until the pending replacement is confirmed', async () => {
    const admin = await bootstrap();
    const legal = await activeLegal(admin.accountId);
    const client = await registerClient(legal.versionId, 215);
    await repository.reserveContactChange({
      accountId: client.accountId,
      context,
      expiresAt: new Date('2026-08-01T12:00:00.000Z'),
      newValue: 'replacement@example.test',
    });
    await expect(
      repository.markEmailVerified({
        context,
        providerUserId: '0198a8be-6677-7000-8000-000000000215',
        verifiedEmail: 'client215@example.test',
      }),
    ).resolves.toBe('EMAIL_CHANGE_PENDING');
    expect(
      (await repository.findAccountByProviderUserId('0198a8be-6677-7000-8000-000000000215'))
        ?.currentEmail,
    ).toBe('client215@example.test');
    await expect(
      repository.markEmailVerified({
        context,
        providerUserId: '0198a8be-6677-7000-8000-000000000215',
        verifiedEmail: 'replacement@example.test',
      }),
    ).resolves.toBe('EMAIL_CHANGE_CONFIRMED');
  });

  it('stores optional phone as nullable, shared and never verified', async () => {
    const admin = await bootstrap();
    const legal = await activeLegal(admin.accountId);
    const first = await registerClient(legal.versionId, 213);
    const second = await registerClient(legal.versionId, 214);
    const sharedPhone = '+56999999999';
    await repository.updateOptionalPhone({
      accountId: first.accountId,
      context,
      phone: sharedPhone,
    });
    await repository.updateOptionalPhone({
      accountId: second.accountId,
      context,
      phone: sharedPhone,
    });
    await repository.updateOptionalPhone({ accountId: first.accountId, context, phone: null });
    const rows = await pool.query<{
      current_phone: string | null;
      phone_verification_status: string;
    }>(
      `SELECT current_phone, phone_verification_status FROM user_accounts
        WHERE account_id IN ($1, $2) ORDER BY account_id`,
      [first.accountId, second.accountId],
    );
    expect(rows.rows.map(({ current_phone }) => current_phone)).toEqual(
      expect.arrayContaining([null, sharedPhone]),
    );
    expect(
      rows.rows.every(({ phone_verification_status }) => phone_verification_status === 'PENDING'),
    ).toBe(true);
  });

  it('rejects every new PHONE_PASSWORD ApplicationSession at the database boundary', async () => {
    const admin = await bootstrap();
    await expect(
      pool.query(
        `INSERT INTO application_sessions (
           auth_session_id, account_id, login_channel, created_at, last_validated_at
         ) VALUES ($1, $2, 'PHONE_PASSWORD', $3, $3)`,
        ['0198a8be-6677-7000-8000-000000000777', admin.accountId, clock.now()],
      ),
    ).rejects.toThrow('EMAIL_PASSWORD');
  });

  it('retries and resolves one durable external identity reconciliation without duplication', async () => {
    const providerUserId = '0198a8be-6677-7000-8000-000000000500';
    await repository.createExternalIdentityReconciliation({ context, providerUserId });
    const [first, competing] = await Promise.all([
      repository.claimExternalIdentityReconciliations({ leaseMs: 1_000, limit: 1 }),
      repository.claimExternalIdentityReconciliations({ leaseMs: 1_000, limit: 1 }),
    ]);
    const claim = [...first, ...competing][0];
    expect([...first, ...competing]).toHaveLength(1);
    if (claim === undefined) throw new Error('Expected a reconciliation claim.');
    await repository.failExternalIdentityReconciliation({
      baseBackoffMs: 100,
      errorCode: 'IDENTITY_PROVIDER_ERROR',
      maxAttempts: 3,
      reconciliationId: claim.reconciliationId,
    });
    expect(
      await repository.claimExternalIdentityReconciliations({ leaseMs: 1_000, limit: 1 }),
    ).toEqual([]);
    clock.set(new Date('2026-07-31T12:00:00.101Z'));
    const [retried] = await repository.claimExternalIdentityReconciliations({
      leaseMs: 1_000,
      limit: 1,
    });
    expect(retried?.reconciliationId).toBe(claim.reconciliationId);
    await repository.resolveExternalIdentityReconciliation(claim.reconciliationId);
    const state = await pool.query<{ attempts: number; state: string }>(
      `SELECT attempts, state FROM external_identity_reconciliations WHERE reconciliation_id = $1`,
      [claim.reconciliationId],
    );
    expect(state.rows[0]).toEqual({ attempts: 2, state: 'RESOLVED' });
  });
});
