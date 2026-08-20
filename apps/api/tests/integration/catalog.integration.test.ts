import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

import { CryptoUuidGenerator, FixedClock, type ExecutionContext } from '@sergod/foundation';
import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CatalogService } from '../../src/contexts/catalog/application/catalog-service.js';
import { CatalogResourceAdminService } from '../../src/contexts/catalog/application/catalog-resource-admin-service.js';
import { CatalogStorageReconciler } from '../../src/contexts/catalog/application/catalog-storage-reconciler.js';
import { CatalogEntityAdminService } from '../../src/contexts/catalog/application/catalog-entity-admin-service.js';
import type {
  CatalogAdminAuthorizer,
  CatalogStorageInventoryPort,
  CatalogResourceValidationPort,
} from '../../src/contexts/catalog/application/ports.js';
import { PgCatalogRepository } from '../../src/contexts/catalog/infrastructure/postgres-catalog-repository.js';
import { UuidCatalogStorageKeyGenerator } from '../../src/contexts/catalog/infrastructure/catalog-storage-key-generator.js';
import { PgCatalogAdminAuthorizer } from '../../src/contexts/catalog/infrastructure/postgres-catalog-admin-authorizer.js';
import { SharpCatalogImageValidator } from '../../src/contexts/catalog/infrastructure/sharp-catalog-image-validator.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';
import { createCatalogImageFixture } from '../support/catalog-image-fixtures.js';

const clock = new FixedClock(new Date('2026-08-01T12:00:00.000Z'));
const uuids = new CryptoUuidGenerator();
const adminId = '0198a8be-6677-7000-8000-000000000001';
const branchId = '0198a8be-6677-7000-8000-000000000002';
let pool: Pool;
let repository: PgCatalogRepository;
let service: CatalogService;
let adminService: CatalogEntityAdminService;
let securedAdminService: CatalogEntityAdminService;
let resourceAdminService: CatalogResourceAdminService;
let commandNumber = 0;
let pngFixture: Uint8Array;
const storedObjects = new Map<string, Uint8Array>();

const authorizer: CatalogAdminAuthorizer = {
  async assertCanManageCatalog(context) {
    if (context.actorId !== adminId) throw new Error('unauthorized test actor');
  },
};
const validator: CatalogResourceValidationPort = new SharpCatalogImageValidator();
const storage: CatalogStorageInventoryPort = {
  async downloadPrivateObject(key) {
    const bytes = storedObjects.get(key);
    if (bytes === undefined) throw new Error('test object missing');
    return bytes;
  },
  async privateObjectExists(key) {
    return storedObjects.has(key);
  },
  async listPrivateObjectKeys() {
    return [...storedObjects.keys()].sort();
  },
  async uploadPrivateObject(input) {
    if (storedObjects.has(input.secureStorageKey)) return 'ALREADY_EXISTS';
    storedObjects.set(input.secureStorageKey, Uint8Array.from(input.bytes));
    return 'CREATED';
  },
};

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
}

function context(label: string): ExecutionContext {
  commandNumber += 1;
  return {
    actorId: adminId,
    actorType: 'USER',
    correlationId: crypto.randomUUID(),
    idempotencyKey: `${label}-${commandNumber}`,
  };
}

async function createGame(name = 'Juego base') {
  return service.createGame({
    context: context('game'),
    description: null,
    name,
    slug: `${name.toLowerCase().replace(/\s+/gu, '-')}-${commandNumber}`,
  });
}

async function createCategory(name = 'Categoría independiente') {
  return service.createCategory({ context: context('category'), description: null, name });
}

async function createCollection(gameId: string, name = 'Colección') {
  return service.createCollection({
    context: context('collection'),
    description: null,
    gameId,
    name,
  });
}

async function createProduct(input: {
  categoryId: string;
  collectionId: string | null;
  gameId: string;
  sku: string;
}) {
  return service.createProduct({
    context: context('product'),
    product: {
      categoryId: input.categoryId,
      collectionId: input.collectionId,
      condition: 'near mint',
      description: null,
      edition: null,
      gameId: input.gameId,
      language: 'es-CL',
      name: `Producto ${input.sku}`,
      priceAmountClp: 10_000,
      saleType: 'REGULAR',
      sku: input.sku,
    },
  });
}

async function createActiveResource(position: number) {
  const created = await service.ingestCatalogImage({
    altText: `Recurso ${position}`,
    bytes: pngFixture,
    context: context('resource'),
    declaredMimeType: 'image/png',
    originalFilename: `resource-${commandNumber}.png`,
    position,
  });
  return created.resourceId;
}

async function attachPrimary(
  sourceType: 'CATEGORY' | 'COLLECTION' | 'PRODUCT' | 'TCG_GAME',
  sourceId: string,
  providedResourceId?: string,
) {
  const resourceId = providedResourceId ?? (await createActiveResource(1));
  return service.attachMedia({
    context: context('attach-media'),
    isPrimary: true,
    resourceId,
    sourceId,
    sourceType,
  });
}

async function publish(
  entityType: 'CATEGORY' | 'COLLECTION' | 'PRODUCT' | 'TCG_GAME',
  entityId: string,
) {
  return service.transitionEntity({
    context: context('publish'),
    descendantStrategy: 'REJECT',
    entityId,
    entityType,
    nextStatus: 'PUBLISHED',
  });
}

beforeAll(async () => {
  pngFixture = await createCatalogImageFixture('image/png');
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
  repository = new PgCatalogRepository(
    pool,
    clock,
    uuids,
    new UuidCatalogStorageKeyGenerator(uuids),
  );
  service = new CatalogService(repository, authorizer, validator, storage);
  resourceAdminService = new CatalogResourceAdminService(repository, authorizer, service);
  adminService = new CatalogEntityAdminService(repository, authorizer);
  securedAdminService = new CatalogEntityAdminService(
    repository,
    new PgCatalogAdminAuthorizer(pool),
  );
});

beforeEach(async () => {
  commandNumber = 0;
  storedObjects.clear();
  await pool.query(`
    TRUNCATE product_media, products, catalog_entity_media,
      resource_assets, collections, categories, tcg_games, user_accounts,
      idempotency_records, scheduled_job_runs, audit_entries CASCADE
  `);
  await pool.query(
    `INSERT INTO user_accounts (
       account_id, auth_provider_user_id, role, status, current_email, normalized_email,
       current_phone, normalized_phone, email_verification_status, phone_verification_status,
       created_at, updated_at, status_changed_at
     ) VALUES ($1, $2, 'ADMIN', 'ACTIVE', 'admin@example.test', 'admin@example.test',
       NULL, NULL, 'VERIFIED', 'PENDING', $3, $3, $3)`,
    [adminId, crypto.randomUUID(), clock.now()],
  );
  await pool.query(
    `INSERT INTO branches (
       branch_id, name, internal_address, state, timezone, created_by, created_at, updated_at
     ) VALUES ($1, 'Sucursal de prueba', 'Dirección de prueba', 'ACTIVE',
       'America/Santiago', $2, $3, $3)`,
    [branchId, adminId, clock.now()],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('PostgreSQL Catalog foundation', () => {
  it('reconciles metadata and Storage without deleting orphan objects', async () => {
    const resourceId = await createActiveResource(1);
    const reconciler = new CatalogStorageReconciler(pool, repository, storage, clock, uuids);
    await expect(
      reconciler.run({ correlationId: crypto.randomUUID(), scheduledFor: clock.now() }),
    ).resolves.toMatchObject({ anomalies: 0, compatible: 1, kind: 'COMPLETED' });

    storedObjects.set('opaque-orphan-test-key', pngFixture);
    const later = new Date(clock.now().getTime() + 60_000);
    await expect(
      reconciler.run({ correlationId: crypto.randomUUID(), scheduledFor: later }),
    ).resolves.toMatchObject({ anomalies: 1, compatible: 1, kind: 'COMPLETED' });
    expect(storedObjects.has('opaque-orphan-test-key')).toBe(true);
    const runs = await pool.query<{ state: string }>(
      `SELECT state FROM scheduled_job_runs WHERE job_name = 'CATALOG_STORAGE_RECONCILIATION'`,
    );
    expect(runs.rows).toHaveLength(2);
    expect(runs.rows.every((row) => row.state === 'SUCCEEDED')).toBe(true);

    const metadata = await repository.findResource(resourceId);
    expect(metadata).not.toBeNull();
    const key = metadata?.secureStorageKey ?? '';
    storedObjects.delete(key);
    const missingSchedule = new Date(clock.now().getTime() + 120_000);
    await expect(
      reconciler.run({ correlationId: crypto.randomUUID(), scheduledFor: missingSchedule }),
    ).resolves.toMatchObject({ anomalies: 2, compatible: 0, kind: 'COMPLETED' });

    storedObjects.set(key, Uint8Array.from([1, 2, 3]));
    const mismatchSchedule = new Date(clock.now().getTime() + 180_000);
    await expect(
      reconciler.run({ correlationId: crypto.randomUUID(), scheduledFor: mismatchSchedule }),
    ).resolves.toMatchObject({ anomalies: 2, compatible: 0, kind: 'COMPLETED' });

    const concurrentSchedule = new Date(clock.now().getTime() + 240_000);
    const concurrent = await Promise.all([
      reconciler.run({ correlationId: crypto.randomUUID(), scheduledFor: concurrentSchedule }),
      reconciler.run({ correlationId: crypto.randomUUID(), scheduledFor: concurrentSchedule }),
    ]);
    expect(concurrent.filter((result) => result.kind === 'COMPLETED')).toHaveLength(1);
    expect(concurrent.some((result) => ['IN_PROGRESS', 'SUCCEEDED'].includes(result.kind))).toBe(
      true,
    );
  });

  it('atomically manages associated resources, ordering, primary selection and history', async () => {
    const game = await createGame('Juego con recursos');
    const firstContext = context('resource-admin-first');
    const firstInput = {
      altText: 'Imagen principal',
      bytes: pngFixture,
      context: firstContext,
      declaredMimeType: 'image/png',
      entityId: game.gameId,
      entityType: 'TCG_GAME' as const,
      originalFilename: 'principal.png',
      position: 2,
    };
    const first = await resourceAdminService.upload(firstInput);
    await expect(resourceAdminService.upload(firstInput)).resolves.toMatchObject({
      replayed: true,
    });
    const second = await resourceAdminService.upload({
      ...firstInput,
      altText: 'Imagen secundaria',
      context: context('resource-admin-second'),
      originalFilename: 'secundaria.png',
      position: 1,
    });

    const listed = await resourceAdminService.list(context('resource-list'), {
      entityId: game.gameId,
      entityType: 'TCG_GAME',
      limit: 100,
    });
    expect(listed.items.map((item) => item.resourceId)).toEqual([
      second.item.resourceId,
      first.item.resourceId,
    ]);
    await resourceAdminService.selectPrimary({
      context: context('resource-primary'),
      entityId: game.gameId,
      entityType: 'TCG_GAME',
      resourceId: first.item.resourceId,
    });
    const beforeReorder = await resourceAdminService.list(context('resource-list-etag'), {
      entityId: game.gameId,
      entityType: 'TCG_GAME',
      limit: 100,
    });
    const reordered = await resourceAdminService.reorder({
      context: context('resource-reorder'),
      entityId: game.gameId,
      entityType: 'TCG_GAME',
      expectedEtag: beforeReorder.etag,
      orderedResourceIds: [first.item.resourceId, second.item.resourceId],
    });
    expect(reordered.items.map((item) => item.position)).toEqual([1, 2]);
    await expect(
      resourceAdminService.reorder({
        context: context('resource-reorder-stale'),
        entityId: game.gameId,
        entityType: 'TCG_GAME',
        expectedEtag: beforeReorder.etag,
        orderedResourceIds: [second.item.resourceId, first.item.resourceId],
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_RESOURCE_PRECONDITION_FAILED' });

    const replacementInput = {
      altText: 'Imagen principal reemplazada',
      bytes: pngFixture,
      context: context('resource-replacement'),
      declaredMimeType: 'image/png',
      entityId: game.gameId,
      entityType: 'TCG_GAME',
      originalFilename: 'reemplazo.png',
      reason: 'Corrección editorial',
      resourceId: first.item.resourceId,
    } as const;
    const replacement = await resourceAdminService.replace(replacementInput);
    expect(replacement.item).toMatchObject({
      isPrimary: true,
      position: 1,
      replacedResourceId: first.item.resourceId,
      state: 'ACTIVE',
    });
    await expect(resourceAdminService.replace(replacementInput)).resolves.toMatchObject({
      item: { resourceId: replacement.item.resourceId },
      replayed: true,
    });
    await expect(repository.findResource(first.item.resourceId)).resolves.toMatchObject({
      state: 'REPLACED',
    });

    await publish('TCG_GAME', game.gameId);
    await expect(
      resourceAdminService.retire({
        context: context('resource-retire-primary'),
        entityId: game.gameId,
        entityType: 'TCG_GAME',
        reason: 'No corresponde',
        resourceId: replacement.item.resourceId,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_RESOURCE_PUBLICATION_CONFLICT' });
  });

  it('serializes concurrent resource ordering and primary selection safely', async () => {
    const game = await createGame('Juego concurrente');
    const common = {
      bytes: pngFixture,
      declaredMimeType: 'image/png',
      entityId: game.gameId,
      entityType: 'TCG_GAME' as const,
    };
    const first = await resourceAdminService.upload({
      ...common,
      altText: 'Primera imagen',
      context: context('concurrent-upload-a'),
      originalFilename: 'concurrent-a.png',
      position: 1,
    });
    const second = await resourceAdminService.upload({
      ...common,
      altText: 'Segunda imagen',
      context: context('concurrent-upload-b'),
      originalFilename: 'concurrent-b.png',
      position: 2,
    });
    const third = await resourceAdminService.upload({
      ...common,
      altText: 'Tercera imagen',
      context: context('concurrent-upload-c'),
      originalFilename: 'concurrent-c.png',
      position: 3,
    });
    const listed = await resourceAdminService.list(context('concurrent-list'), {
      entityId: game.gameId,
      entityType: 'TCG_GAME',
      limit: 100,
    });
    const orders = await Promise.allSettled([
      resourceAdminService.reorder({
        context: context('concurrent-order-a'),
        entityId: game.gameId,
        entityType: 'TCG_GAME',
        expectedEtag: listed.etag,
        orderedResourceIds: [second.item.resourceId, third.item.resourceId, first.item.resourceId],
      }),
      resourceAdminService.reorder({
        context: context('concurrent-order-b'),
        entityId: game.gameId,
        entityType: 'TCG_GAME',
        expectedEtag: listed.etag,
        orderedResourceIds: [third.item.resourceId, first.item.resourceId, second.item.resourceId],
      }),
    ]);
    expect(orders.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(orders.filter((result) => result.status === 'rejected')).toHaveLength(1);

    await Promise.all([
      resourceAdminService.selectPrimary({
        context: context('concurrent-primary-a'),
        entityId: game.gameId,
        entityType: 'TCG_GAME',
        resourceId: first.item.resourceId,
      }),
      resourceAdminService.selectPrimary({
        context: context('concurrent-primary-b'),
        entityId: game.gameId,
        entityType: 'TCG_GAME',
        resourceId: second.item.resourceId,
      }),
    ]);
    const after = await resourceAdminService.list(context('concurrent-list-after'), {
      entityId: game.gameId,
      entityType: 'TCG_GAME',
      limit: 100,
    });
    expect(after.items.filter((resource) => resource.isPrimary)).toHaveLength(1);
  });

  it('supports administrative CRUD detail and filtered lists for all four entities', async () => {
    const gameResult = await adminService.createGame(context('admin-game'), {
      description: null,
      name: 'Juego administrativo',
      slug: 'juego-administrativo',
    });
    const categoryResult = await adminService.createCategory(context('admin-category'), {
      description: null,
      name: 'Categoría administrativa',
    });
    const collectionResult = await adminService.createCollection(context('admin-collection'), {
      description: null,
      gameId: gameResult.item.gameId,
      name: 'Colección administrativa',
    });
    const productResult = await adminService.createProduct(context('admin-product'), {
      categoryId: categoryResult.item.categoryId,
      collectionId: collectionResult.item.collectionId,
      condition: 'near mint',
      description: null,
      edition: null,
      gameId: gameResult.item.gameId,
      language: 'es-cl',
      name: 'Producto administrativo',
      priceAmountClp: 15_000,
      saleType: 'REGULAR',
      sku: 'ADMIN-SKU',
    });

    await expect(
      adminService.editGame(context('edit-game'), gameResult.item.gameId, {
        name: 'Juego editado',
      }),
    ).resolves.toMatchObject({ item: { name: 'Juego editado', slug: 'juego-administrativo' } });
    await expect(
      adminService.editCategory(context('edit-category'), categoryResult.item.categoryId, {
        description: 'Descripción',
      }),
    ).resolves.toMatchObject({ item: { description: 'Descripción' } });
    await expect(
      adminService.editCollection(context('edit-collection'), collectionResult.item.collectionId, {
        name: 'Colección editada',
      }),
    ).resolves.toMatchObject({ item: { name: 'Colección editada' } });
    await expect(
      adminService.editProduct(context('edit-product'), productResult.item.productId, {
        condition: 'lightly played',
        priceAmountClp: 16_000,
      }),
    ).resolves.toMatchObject({ item: { condition: 'LIGHTLY PLAYED', priceAmountClp: 16_000 } });

    expect((await adminService.listGames(context('list-game'), { limit: 10 })).items).toHaveLength(
      1,
    );
    expect(
      (await adminService.listCategories(context('list-category'), { limit: 10 })).items,
    ).toHaveLength(1);
    expect(
      (
        await adminService.listCollections(context('list-collection'), {
          gameId: gameResult.item.gameId,
          limit: 10,
        })
      ).items,
    ).toHaveLength(1);
    expect(
      (
        await adminService.listProducts(context('list-product'), {
          categoryId: categoryResult.item.categoryId,
          collectionId: collectionResult.item.collectionId,
          gameId: gameResult.item.gameId,
          limit: 10,
          publicationStatus: 'DRAFT',
        })
      ).items,
    ).toHaveLength(1);
  });

  it('paginates without duplication and rejects a modified cursor', async () => {
    for (const name of ['A', 'B', 'C']) {
      await adminService.createCategory(context(`page-${name}`), { description: null, name });
    }
    const first = await adminService.listCategories(context('page-list-1'), { limit: 2 });
    const cursor = first.nextCursor;
    if (cursor === null) throw new Error('Expected the first page to provide a cursor.');
    const second = await adminService.listCategories(context('page-list-2'), {
      cursor,
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.categoryId)).size).toBe(3);
    await expect(
      adminService.listCategories(context('page-invalid'), {
        cursor: `${cursor.slice(0, -1)}x`,
        limit: 2,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_CURSOR_INVALID' });
  });

  it('replays across correlation ids without duplicating the entity or audit entry', async () => {
    const firstContext = { ...context('replay'), idempotencyKey: 'admin-http-replay' };
    const secondContext = {
      ...firstContext,
      correlationId: '0198a8be-6677-7000-8000-000000000099',
    };
    const body = { description: null, name: 'Idempotente' };
    const first = await adminService.createCategory(firstContext, body);
    const replay = await adminService.createCategory(secondContext, body);
    expect(replay).toEqual({ item: first.item, replayed: true });
    await expect(
      adminService.createCategory(secondContext, { description: null, name: 'Distinta' }),
    ).rejects.toMatchObject({ code: 'CATALOG_IDEMPOTENCY_CONFLICT' });
    const evidence = await pool.query<{ audits: string; entities: string }>(
      `SELECT
        (SELECT count(*) FROM categories WHERE category_id = $1::uuid) AS entities,
        (SELECT count(*) FROM audit_entries WHERE resource_id = $1::text) AS audits`,
      [first.item.categoryId],
    );
    expect(evidence.rows[0]).toEqual({ audits: '1', entities: '1' });
  });

  it('serializes concurrent requests with the same key into one entity and audit entry', async () => {
    const firstContext = { ...context('concurrent-replay'), idempotencyKey: 'admin-concurrent' };
    const secondContext = {
      ...firstContext,
      correlationId: '0198a8be-6677-7000-8000-000000000098',
    };
    const [left, right] = await Promise.all([
      adminService.createCategory(firstContext, { description: null, name: 'Concurrente' }),
      adminService.createCategory(secondContext, { description: null, name: 'Concurrente' }),
    ]);
    expect(left.item.categoryId).toBe(right.item.categoryId);
    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    const evidence = await pool.query<{ audits: string; entities: string }>(
      `SELECT
        (SELECT count(*) FROM categories WHERE category_id = $1::uuid) AS entities,
        (SELECT count(*) FROM audit_entries WHERE resource_id = $1::text) AS audits`,
      [left.item.categoryId],
    );
    expect(evidence.rows[0]).toEqual({ audits: '1', entities: '1' });
  });

  it('revalidates the Admin role and ACTIVE state in Application on every request', async () => {
    await expect(
      securedAdminService.listCategories(context('secured-active'), { limit: 1 }),
    ).resolves.toBeDefined();
    await pool.query(
      `UPDATE user_accounts
          SET status = 'DEACTIVATED', deactivated_at = $2, deactivated_by = $1
        WHERE account_id = $1`,
      [adminId, clock.now()],
    );
    await expect(
      securedAdminService.listCategories(context('secured-deactivated'), { limit: 1 }),
    ).rejects.toMatchObject({ code: 'CATALOG_ACCESS_DENIED' });
    await pool.query(
      `UPDATE user_accounts
          SET status = 'ACTIVE', role = 'CLIENTE', deactivated_at = NULL, deactivated_by = NULL
        WHERE account_id = $1`,
      [adminId],
    );
    await expect(
      securedAdminService.listCategories(context('secured-client'), { limit: 1 }),
    ).rejects.toMatchObject({ code: 'CATALOG_ACCESS_DENIED' });
  });

  it('replays the same idempotent command and rejects a different fingerprint', async () => {
    const commandContext = context('idempotent-category');
    const first = await service.createCategory({ context: commandContext, name: 'Sellados' });
    const replay = await service.createCategory({ context: commandContext, name: 'Sellados' });
    expect(replay).toEqual({ categoryId: first.categoryId, replayed: true });
    await expect(
      service.createCategory({ context: commandContext, name: 'Accesorios' }),
    ).rejects.toMatchObject({ code: 'CATALOG_IDEMPOTENCY_CONFLICT' });
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) FROM categories WHERE category_id = $1`,
      [first.categoryId],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('reconciles the same asset command without duplicate metadata or objects', async () => {
    const commandContext = context('idempotent-resource');
    const input = {
      altText: 'Recurso idempotente',
      bytes: pngFixture,
      context: commandContext,
      declaredMimeType: 'image/png',
      originalFilename: 'idempotent.png',
      position: 1,
    } as const;
    const first = await service.ingestCatalogImage(input);
    const replay = await service.ingestCatalogImage(input);
    expect(replay).toEqual({ replayed: true, resourceId: first.resourceId, state: 'ACTIVE' });
    expect(storedObjects).toHaveLength(1);
    const resources = await pool.query<{ count: string }>(
      `SELECT count(*) FROM resource_assets WHERE resource_id = $1`,
      [first.resourceId],
    );
    expect(resources.rows[0]?.count).toBe('1');

    const differentBytes = await createCatalogImageFixture('image/png', 321, 320);
    await expect(
      service.ingestCatalogImage({ ...input, bytes: differentBytes }),
    ).rejects.toMatchObject({ code: 'CATALOG_IDEMPOTENCY_CONFLICT' });
    expect(storedObjects).toHaveLength(1);
  });

  it('activates every allowed format with metadata derived from stored bytes', async () => {
    const formats = [
      ['image/jpeg', 'jpeg'],
      ['image/png', 'png'],
      ['image/webp', 'webp'],
      ['image/avif', 'avif'],
    ] as const;
    for (const [mimeType, extension] of formats) {
      const bytes = await createCatalogImageFixture(mimeType);
      const result = await service.ingestCatalogImage({
        altText: `Recurso ${extension}`,
        bytes,
        context: context(`resource-${extension}`),
        declaredMimeType: mimeType,
        originalFilename: `catalog.${extension}`,
        position: 1,
      });
      const persisted = await pool.query<{
        byte_size: string;
        height_px: number;
        mime_type_real: string;
        original_filename_safe: string;
        secure_storage_key: string;
        sha256_hex: string;
        state: string;
        width_px: number;
      }>(
        `SELECT byte_size, height_px, mime_type_real, original_filename_safe,
                secure_storage_key, sha256_hex, state, width_px
           FROM resource_assets WHERE resource_id = $1`,
        [result.resourceId],
      );
      expect(persisted.rows[0]).toMatchObject({
        byte_size: String(bytes.byteLength),
        height_px: 320,
        mime_type_real: mimeType,
        original_filename_safe: `catalog.${extension}`,
        sha256_hex: createHash('sha256').update(bytes).digest('hex'),
        state: 'ACTIVE',
        width_px: 320,
      });
      const storageKey = persisted.rows[0]?.secure_storage_key;
      expect(storageKey).toMatch(/^[0-9a-f-]{36}$/u);
      expect(storageKey).not.toContain('catalog');
      expect(storedObjects.has(storageKey ?? '')).toBe(true);
    }
  });

  it('keeps invalid stored content quarantined', async () => {
    await expect(
      service.ingestCatalogImage({
        altText: 'MIME incompatible',
        bytes: pngFixture,
        context: context('mime-mismatch'),
        declaredMimeType: 'image/jpeg',
        originalFilename: 'mismatch.jpg',
        position: 1,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_RESOURCE_MIME_MISMATCH' });
    const resources = await pool.query<{ state: string }>(
      `SELECT state FROM resource_assets ORDER BY uploaded_at DESC`,
    );
    expect(resources.rows).toEqual([{ state: 'QUARANTINED' }]);
    expect(storedObjects).toHaveLength(1);
  });

  it('retains the private binary when an unreferenced resource is removed', async () => {
    const resourceId = await createActiveResource(1);
    const persisted = await pool.query<{ secure_storage_key: string }>(
      `SELECT secure_storage_key FROM resource_assets WHERE resource_id = $1`,
      [resourceId],
    );
    const storageKey = persisted.rows[0]?.secure_storage_key;
    await service.removeResource({ context: context('remove-resource'), resourceId });
    expect((await repository.findResource(resourceId))?.state).toBe('REMOVED');
    expect(storedObjects.has(storageKey ?? '')).toBe(true);
  });

  it('persists an independent Category and a Collection without Category', async () => {
    const game = await createGame();
    const category = await createCategory();
    const collection = await createCollection(game.gameId);
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('categories', 'collections')
        ORDER BY table_name, ordinal_position`,
    );
    const names = columns.rows.map((row) => row.column_name);
    expect(names).not.toContain('category_id_on_collection');
    expect(await repository.findEntity('CATEGORY', category.categoryId)).toMatchObject({
      publicationStatus: 'DRAFT',
    });
    expect(await repository.findEntity('COLLECTION', collection.collectionId)).toMatchObject({
      publicationStatus: 'DRAFT',
    });
    const forbidden = await pool.query<{ count: string }>(
      `SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public'
          AND ((table_name = 'categories' AND column_name = 'game_id')
            OR (table_name = 'collections' AND column_name = 'category_id'))`,
    );
    expect(forbidden.rows[0]?.count).toBe('0');
  });

  it('rejects case-insensitive duplicate SKU and negative prices', async () => {
    const game = await createGame();
    const category = await createCategory();
    await createProduct({
      categoryId: category.categoryId,
      collectionId: null,
      gameId: game.gameId,
      sku: 'SKU-ABC',
    });
    await expect(
      createProduct({
        categoryId: category.categoryId,
        collectionId: null,
        gameId: game.gameId,
        sku: 'sku-abc',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_UNIQUE_CONFLICT' });
    await expect(
      service.createProduct({
        context: context('negative-price'),
        product: {
          categoryId: category.categoryId,
          collectionId: null,
          condition: null,
          description: null,
          edition: null,
          gameId: game.gameId,
          language: null,
          name: 'Inválido',
          priceAmountClp: -1,
          saleType: 'REGULAR',
          sku: 'NEGATIVE',
        },
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_PRODUCT_INVALID' });
  });

  it('rejects Product with a Collection from another TcgGame', async () => {
    const gameA = await createGame('Juego A');
    const gameB = await createGame('Juego B');
    const category = await createCategory();
    const collection = await createCollection(gameB.gameId);
    await expect(
      createProduct({
        categoryId: category.categoryId,
        collectionId: collection.collectionId,
        gameId: gameA.gameId,
        sku: 'WRONG-GAME',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_REFERENCE_NOT_FOUND' });
  });

  it('rejects publication without valid dependencies or an ACTIVE primary resource', async () => {
    const game = await createGame();
    await expect(publish('TCG_GAME', game.gameId)).rejects.toMatchObject({
      code: 'CATALOG_INVARIANT_VIOLATION',
    });

    await attachPrimary('TCG_GAME', game.gameId);
    await publish('TCG_GAME', game.gameId);
    const category = await createCategory();
    const product = await createProduct({
      categoryId: category.categoryId,
      collectionId: null,
      gameId: game.gameId,
      sku: 'NO-CATEGORY-PUBLICATION',
    });
    await attachPrimary('PRODUCT', product.productId);
    await expect(publish('PRODUCT', product.productId)).rejects.toMatchObject({
      code: 'CATALOG_INVARIANT_VIOLATION',
    });
  });

  it('allows only one concurrent primary media relation', async () => {
    const game = await createGame();
    const [resourceA, resourceB] = await Promise.all([
      createActiveResource(1),
      createActiveResource(2),
    ]);
    const results = await Promise.allSettled([
      attachPrimary('TCG_GAME', game.gameId, resourceA),
      attachPrimary('TCG_GAME', game.gameId, resourceB),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('replaces a published primary resource atomically and rejects an invalid removal', async () => {
    const game = await createGame();
    const original = await createActiveResource(1);
    await attachPrimary('TCG_GAME', game.gameId, original);
    await publish('TCG_GAME', game.gameId);
    const replacement = await createActiveResource(1);

    await service.replaceResource({
      context: context('replace-resource'),
      replacementResourceId: replacement,
      resourceId: original,
    });
    const states = await pool.query<{ resource_id: string; state: string }>(
      `SELECT resource_id, state FROM resource_assets WHERE resource_id = ANY($1::uuid[])
        ORDER BY resource_id`,
      [[original, replacement]],
    );
    expect(states.rows.find((row) => row.resource_id === original)?.state).toBe('REPLACED');
    expect(states.rows.find((row) => row.resource_id === replacement)?.state).toBe('ACTIVE');
    const storedKeys = await pool.query<{ secure_storage_key: string }>(
      `SELECT secure_storage_key FROM resource_assets WHERE resource_id = ANY($1::uuid[])`,
      [[original, replacement]],
    );
    expect(storedKeys.rows.every((row) => storedObjects.has(row.secure_storage_key))).toBe(true);
    expect(await repository.findEntity('TCG_GAME', game.gameId)).toMatchObject({
      publicationStatus: 'PUBLISHED',
    });
    await expect(
      service.removeResource({
        context: context('remove-published-resource'),
        resourceId: replacement,
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_INVARIANT_VIOLATION' });
  });

  it('requires an explicit strategy when withdrawing published descendants', async () => {
    const game = await createGame();
    const category = await createCategory();
    const collection = await createCollection(game.gameId);
    await attachPrimary('TCG_GAME', game.gameId);
    await attachPrimary('CATEGORY', category.categoryId);
    await attachPrimary('COLLECTION', collection.collectionId);
    await publish('TCG_GAME', game.gameId);
    await publish('CATEGORY', category.categoryId);
    await publish('COLLECTION', collection.collectionId);
    const product = await createProduct({
      categoryId: category.categoryId,
      collectionId: collection.collectionId,
      gameId: game.gameId,
      sku: 'DESCENDANT',
    });
    await attachPrimary('PRODUCT', product.productId);
    await publish('PRODUCT', product.productId);

    await expect(
      service.transitionEntity({
        context: context('reject-descendants'),
        descendantStrategy: 'REJECT',
        entityId: game.gameId,
        entityType: 'TCG_GAME',
        nextStatus: 'UNPUBLISHED',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_PUBLISHED_DESCENDANTS' });
    await service.transitionEntity({
      context: context('cascade-descendants'),
      descendantStrategy: 'UNPUBLISH',
      entityId: game.gameId,
      entityType: 'TCG_GAME',
      nextStatus: 'UNPUBLISHED',
    });
    expect(await repository.findEntity('PRODUCT', product.productId)).toMatchObject({
      publicationStatus: 'UNPUBLISHED',
    });
  });

  it('enables RLS with default-deny and no PUBLIC table privileges', async () => {
    const rls = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname IN ('resource_assets', 'tcg_games', 'categories', 'collections',
            'catalog_entity_media', 'products', 'product_media')`,
    );
    expect(rls.rows).toHaveLength(8);
    expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);
    const grants = await pool.query<{ count: string }>(
      `SELECT count(*) FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name IN ('resource_assets', 'tcg_games', 'categories', 'collections',
            'catalog_entity_media', 'products', 'product_media')
          AND grantee IN ('PUBLIC', 'anon', 'authenticated')`,
    );
    expect(grants.rows[0]?.count).toBe('0');
  });
});
