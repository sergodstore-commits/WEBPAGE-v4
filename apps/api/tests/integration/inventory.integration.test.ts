import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CatalogEntityAdminService } from '../../src/contexts/catalog/application/catalog-entity-admin-service.js';
import { PgCatalogRepository } from '../../src/contexts/catalog/infrastructure/postgres-catalog-repository.js';
import { InventoryAdminService } from '../../src/contexts/inventory/application/inventory-admin-service.js';
import { PgInventoryAdminAuthorizer } from '../../src/contexts/inventory/infrastructure/postgres-inventory-admin-authorizer.js';
import { PgInventoryRepository } from '../../src/contexts/inventory/infrastructure/postgres-inventory-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const ids = {
  admin: '0198a8be-6677-7000-8000-000000000001',
  branch: '0198a8be-6677-7000-8000-000000000002',
  category: '0198a8be-6677-7000-8000-000000000003',
  client: '0198a8be-6677-7000-8000-000000000004',
  config: '0198a8be-6677-7000-8000-000000000005',
  game: '0198a8be-6677-7000-8000-000000000006',
} as const;
const clock = new FixedClock(new Date('2026-08-08T12:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
let pool: Pool;
let inventory: InventoryAdminService;
let commandNumber = 0;

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
}

function context(
  label: string,
  actorId: string = ids.admin,
  idempotencyKey?: string,
): ExecutionContext {
  commandNumber += 1;
  return {
    actorId,
    actorType: 'USER',
    correlationId: crypto.randomUUID(),
    idempotencyKey: idempotencyKey ?? `${label}-${commandNumber}`,
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
  inventory = new InventoryAdminService(
    new PgInventoryRepository(pool, clock, uuids),
    new PgInventoryAdminAuthorizer(pool),
  );
});

beforeEach(async () => {
  commandNumber = 0;
  await pool.query(`
    TRUNCATE inventory_movements, inventory_positions, system_configurations,
      product_media, products, catalog_entity_media, resource_assets,
      collections, categories, tcg_games, branches, user_accounts,
      idempotency_records, audit_entries CASCADE
  `);
  await pool.query(
    `INSERT INTO user_accounts (
       account_id, auth_provider_user_id, role, status, current_email, normalized_email,
       current_phone, normalized_phone, email_verification_status, phone_verification_status,
       created_at, updated_at, status_changed_at
     ) VALUES
       ($1, $2, 'ADMIN', 'ACTIVE', 'admin@example.test', 'admin@example.test', NULL, NULL,
        'VERIFIED', 'PENDING', $5, $5, $5),
       ($3, $4, 'CLIENTE', 'ACTIVE', 'client@example.test', 'client@example.test', NULL, NULL,
        'VERIFIED', 'PENDING', $5, $5, $5)`,
    [ids.admin, crypto.randomUUID(), ids.client, crypto.randomUUID(), clock.now()],
  );
  await pool.query(
    `INSERT INTO branches (
       branch_id, name, internal_address, state, timezone, created_by, created_at, updated_at
     ) VALUES ($1, 'Sucursal real de prueba', 'Dirección interna', 'ACTIVE',
       'America/Santiago', $2, $3, $3)`,
    [ids.branch, ids.admin, clock.now()],
  );
  await pool.query(
    `INSERT INTO system_configurations (
       system_configuration_id, configuration_key, scope, value_type, integer_value,
       version_number, state, created_by, created_at, activated_by, activated_at, correlation_id
     ) VALUES ($1, 'DEFAULT_LOW_STOCK_THRESHOLD', 'GLOBAL', 'INTEGER', 3,
       1, 'ACTIVE', $2, $3, $2, $3, $4)`,
    [ids.config, ids.admin, clock.now(), crypto.randomUUID()],
  );
  await pool.query(
    `INSERT INTO tcg_games (
       game_id, name, slug, description, publication_status, created_at, updated_at
     ) VALUES ($1, 'Juego inventario', 'juego-inventario', NULL, 'DRAFT', $2, $2)`,
    [ids.game, clock.now()],
  );
  await pool.query(
    `INSERT INTO categories (
       category_id, name, description, publication_status, created_at, updated_at
     ) VALUES ($1, 'Categoría inventario', NULL, 'DRAFT', $2, $2)`,
    [ids.category, clock.now()],
  );
});

afterAll(async () => {
  await pool.end();
});

async function seedProduct(
  saleType: 'PREORDER' | 'REGULAR' = 'REGULAR',
  options: {
    readonly onHand?: number;
    readonly reserved?: number;
    readonly status?: 'ARCHIVED' | 'DRAFT';
  } = {},
): Promise<string> {
  const productId = crypto.randomUUID();
  const status = options.status ?? 'DRAFT';
  await pool.query(
    `INSERT INTO products (
       product_id, sku, game_id, category_id, collection_id, name, description,
       language, edition, condition, sale_type, price_amount_clp,
       publication_status, created_at, updated_at, archived_at
     ) VALUES ($1, $2, $3, $4, NULL, $5, NULL, NULL, NULL, NULL, $6, 1000,
       $7, $8, $8, $9)`,
    [
      productId,
      `INV-${productId}`,
      ids.game,
      ids.category,
      `Producto ${productId}`,
      saleType,
      status,
      clock.now(),
      status === 'ARCHIVED' ? clock.now() : null,
    ],
  );
  await pool.query(
    `INSERT INTO inventory_positions (
       inventory_position_id, product_id, branch_id, on_hand, reserved, version, updated_at
     ) VALUES ($1, $2, $3, $4, $5, 1, $6)`,
    [
      crypto.randomUUID(),
      productId,
      ids.branch,
      options.onHand ?? 0,
      options.reserved ?? 0,
      clock.now(),
    ],
  );
  return productId;
}

describe('PostgreSQL regular inventory base', () => {
  it('backfills positions idempotently, enforces uniqueness and creates a position with a new Product', async () => {
    const preexistingProduct = crypto.randomUUID();
    await pool.query(
      `INSERT INTO products (
         product_id, sku, game_id, category_id, name, sale_type, price_amount_clp,
         publication_status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, 'Producto preexistente', 'REGULAR', 1000, 'DRAFT', $5, $5)`,
      [
        preexistingProduct,
        `PREEXISTING-${preexistingProduct}`,
        ids.game,
        ids.category,
        clock.now(),
      ],
    );
    const backfill = `INSERT INTO inventory_positions (
        inventory_position_id, product_id, branch_id, on_hand, reserved, version, updated_at
      ) SELECT md5(p.product_id::text || ':' || b.branch_id::text)::uuid,
          p.product_id, b.branch_id, 0, 0, 1, CURRENT_TIMESTAMP
        FROM products p CROSS JOIN branches b WHERE b.state = 'ACTIVE'
      ON CONFLICT (product_id, branch_id) DO NOTHING`;
    await pool.query(backfill);
    await pool.query(backfill);
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) FROM inventory_positions WHERE product_id = $1`,
      [preexistingProduct],
    );
    expect(count.rows[0]?.count).toBe('1');
    await expect(
      pool.query(
        `INSERT INTO inventory_positions (
           inventory_position_id, product_id, branch_id, on_hand, reserved, version, updated_at
         ) VALUES ($1, $2, $3, 0, 0, 1, $4)`,
        [crypto.randomUUID(), preexistingProduct, ids.branch, clock.now()],
      ),
    ).rejects.toMatchObject({ code: '23505' });

    const catalog = new CatalogEntityAdminService(new PgCatalogRepository(pool, clock, uuids), {
      assertCanManageCatalog: async () => undefined,
    });
    const created = await catalog.createProduct(context('new-product'), {
      categoryId: ids.category,
      collectionId: null,
      condition: null,
      description: null,
      edition: null,
      gameId: ids.game,
      language: null,
      name: 'Producto nuevo',
      priceAmountClp: 1000,
      saleType: 'REGULAR',
      sku: `NEW-${crypto.randomUUID()}`,
    });
    await expect(
      inventory.getPosition(context('read'), created.item.productId),
    ).resolves.toMatchObject({
      available: 0,
      branchId: ids.branch,
      onHand: 0,
      reserved: 0,
      version: 1,
    });
  });

  it('applies a regular stock entry once and records its immutable origin and audit', async () => {
    const productId = await seedProduct();
    const command = context('entry', ids.admin, 'same-entry-key');
    const first = await inventory.registerStockEntry(command, productId, {
      quantity: 5,
      reason: 'Conteo inicial',
      reference: null,
    });
    const replay = await inventory.registerStockEntry(command, productId, {
      quantity: 5,
      reason: 'Conteo inicial',
      reference: null,
    });
    expect(first).toMatchObject({
      position: { available: 5, onHand: 5, reserved: 0, version: 2 },
      replayed: false,
    });
    expect(replay).toMatchObject({
      movementId: first.movementId,
      position: { onHand: 5 },
      replayed: true,
    });
    const ledger = await pool.query<{ count: string }>(
      `SELECT count(*) FROM inventory_movements WHERE inventory_position_id =
        (SELECT inventory_position_id FROM inventory_positions WHERE product_id = $1)`,
      [productId],
    );
    expect(ledger.rows[0]?.count).toBe('1');
    await expect(
      pool.query(`UPDATE inventory_movements SET quantity = 6 WHERE movement_id = $1`, [
        first.movementId,
      ]),
    ).rejects.toMatchObject({ code: '55000' });
    const audit = await pool.query<{ count: string }>(
      `SELECT count(*) FROM audit_entries WHERE resource_id = $1 AND result = 'SUCCESS'`,
      [first.movementId],
    );
    expect(audit.rows[0]?.count).toBe('1');
  });

  it('rejects PREORDER, archived discretionary entry, invalid quantity and incompatible idempotency reuse', async () => {
    const preorderId = await seedProduct('PREORDER');
    await expect(
      inventory.registerStockEntry(context('preorder'), preorderId, {
        quantity: 1,
        reason: 'No aplica',
        reference: null,
      }),
    ).rejects.toMatchObject({ code: 'INVENTORY_REGULAR_OPERATION_NOT_ALLOWED' });
    const archivedId = await seedProduct('REGULAR', { status: 'ARCHIVED' });
    await expect(
      inventory.registerStockEntry(context('archived'), archivedId, {
        quantity: 1,
        reason: 'Entrada',
        reference: null,
      }),
    ).rejects.toMatchObject({ code: 'INVENTORY_ARCHIVED_STOCK_ENTRY_NOT_ALLOWED' });
    const productId = await seedProduct();
    await expect(
      inventory.registerStockEntry(context('invalid'), productId, {
        quantity: 0,
        reason: 'Inválida',
        reference: null,
      }),
    ).rejects.toMatchObject({ code: 'INVENTORY_QUANTITY_INVALID' });
    const firstContext = context('entry', ids.admin, 'reused-key');
    await inventory.registerStockEntry(firstContext, productId, {
      quantity: 1,
      reason: 'Uno',
      reference: null,
    });
    await expect(
      inventory.registerStockEntry(firstContext, productId, {
        quantity: 2,
        reason: 'Dos',
        reference: null,
      }),
    ).rejects.toMatchObject({ code: 'INVENTORY_IDEMPOTENCY_CONFLICT' });
  });

  it('applies positive and negative corrections, preserves reserved and permits archived-product correction', async () => {
    const productId = await seedProduct('REGULAR', { onHand: 10, reserved: 3 });
    await inventory.adjust(context('positive'), productId, {
      direction: 'POSITIVE',
      investigationReference: 'INV-100',
      quantity: 2,
      reason: 'Corrección confirmada',
    });
    await inventory.adjust(context('negative'), productId, {
      direction: 'NEGATIVE',
      investigationReference: 'INV-101',
      quantity: 4,
      reason: 'Merma confirmada',
    });
    await expect(inventory.getPosition(context('read'), productId)).resolves.toMatchObject({
      available: 5,
      onHand: 8,
      reserved: 3,
      version: 3,
    });
    await expect(
      inventory.adjust(context('too-low'), productId, {
        direction: 'NEGATIVE',
        investigationReference: 'INV-102',
        quantity: 6,
        reason: 'No debe aplicarse',
      }),
    ).rejects.toMatchObject({ code: 'INVENTORY_INSUFFICIENT_AVAILABLE' });
    const archivedId = await seedProduct('REGULAR', { onHand: 1, status: 'ARCHIVED' });
    await expect(
      inventory.adjust(context('historic'), archivedId, {
        direction: 'NEGATIVE',
        investigationReference: 'INV-HIST',
        quantity: 1,
        reason: 'Corrección histórica',
      }),
    ).resolves.toMatchObject({ position: { onHand: 0 } });
  });

  it('derives global, override and zero threshold projections and pages movement history', async () => {
    const productId = await seedProduct('REGULAR', { onHand: 3 });
    await expect(inventory.getPosition(context('global'), productId)).resolves.toMatchObject({
      effectiveLowStockThreshold: 3,
      lowStock: true,
      thresholdSource: 'GLOBAL',
    });
    await inventory.setThresholdOverride(context('override'), productId, {
      lowStockThresholdOverride: 2,
    });
    await expect(inventory.getPosition(context('override-read'), productId)).resolves.toMatchObject(
      {
        effectiveLowStockThreshold: 2,
        lowStock: false,
        thresholdSource: 'OVERRIDE',
      },
    );
    await inventory.setThresholdOverride(context('zero'), productId, {
      lowStockThresholdOverride: 0,
    });
    await inventory.registerStockEntry(context('entry'), productId, {
      quantity: 1,
      reason: null,
      reference: 'REF-1',
    });
    await inventory.adjust(context('adjustment'), productId, {
      direction: 'POSITIVE',
      investigationReference: 'INV-200',
      quantity: 1,
      reason: 'Corrección',
    });
    const firstPage = await inventory.listMovements(context('history'), productId, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    if (firstPage.nextCursor === null) throw new Error('Expected a movement cursor.');
    const secondPage = await inventory.listMovements(context('history-2'), productId, {
      cursor: firstPage.nextCursor,
      limit: 1,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.movementId).not.toBe(firstPage.items[0]?.movementId);
    await expect(inventory.getPosition(context('zero-read'), productId)).resolves.toMatchObject({
      effectiveLowStockThreshold: 0,
      lowStock: false,
    });
  });

  it('blocks non-Admin and serializes concurrent negative adjustments without invalid stock', async () => {
    const productId = await seedProduct('REGULAR', { onHand: 5 });
    await expect(
      inventory.getPosition(context('client', ids.client), productId),
    ).rejects.toMatchObject({
      code: 'INVENTORY_ACCESS_DENIED',
    });
    const outcomes = await Promise.allSettled([
      inventory.adjust(context('race-a'), productId, {
        direction: 'NEGATIVE',
        investigationReference: 'RACE-A',
        quantity: 4,
        reason: 'Ajuste concurrente A',
      }),
      inventory.adjust(context('race-b'), productId, {
        direction: 'NEGATIVE',
        investigationReference: 'RACE-B',
        quantity: 4,
        reason: 'Ajuste concurrente B',
      }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    await expect(inventory.getPosition(context('final'), productId)).resolves.toMatchObject({
      available: 1,
      onHand: 1,
      reserved: 0,
      version: 2,
    });
    const movements = await pool.query<{ count: string }>(
      `SELECT count(*) FROM inventory_movements WHERE inventory_position_id =
        (SELECT inventory_position_id FROM inventory_positions WHERE product_id = $1)`,
      [productId],
    );
    expect(movements.rows[0]?.count).toBe('1');
  });

  it('blocks the inventory gate when the mandatory global threshold is absent', async () => {
    const productId = await seedProduct();
    await pool.query(
      `UPDATE system_configurations
          SET state = 'RETIRED', retired_by = $1, retired_at = $2
        WHERE state = 'ACTIVE'`,
      [ids.admin, clock.now()],
    );
    await expect(
      inventory.registerStockEntry(context('missing-config'), productId, {
        quantity: 1,
        reason: 'No debe aplicarse',
        reference: null,
      }),
    ).rejects.toMatchObject({ code: 'INVENTORY_DEFAULT_THRESHOLD_REQUIRED' });
    const persisted = await pool.query<{ movements: string; on_hand: string }>(
      `SELECT ip.on_hand,
              (SELECT count(*) FROM inventory_movements m
                WHERE m.inventory_position_id = ip.inventory_position_id) AS movements
         FROM inventory_positions ip WHERE ip.product_id = $1`,
      [productId],
    );
    expect(persisted.rows[0]).toEqual({ movements: '0', on_hand: '0' });
  });
});
