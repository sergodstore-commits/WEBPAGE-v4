import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runner } from 'node-pg-migrate';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CatalogPublicQueryService } from '../../src/contexts/catalog/application/catalog-public-query-service.js';
import { PgCatalogPublicQueryRepository } from '../../src/contexts/catalog/infrastructure/postgres-catalog-public-query-repository.js';
import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const ids = {
  admin: '0198a8be-6677-7000-8000-000000000001',
  branch: '0198a8be-6677-7000-8000-000000000002',
  categoryDraft: '0198a8be-6677-7000-8000-000000000202',
  categoryPublic: '0198a8be-6677-7000-8000-000000000201',
  collectionDraft: '0198a8be-6677-7000-8000-000000000302',
  collectionPublic: '0198a8be-6677-7000-8000-000000000301',
  gameDraft: '0198a8be-6677-7000-8000-000000000102',
  gamePublic: '0198a8be-6677-7000-8000-000000000101',
  productDraft: '0198a8be-6677-7000-8000-000000000404',
  productFirst: '0198a8be-6677-7000-8000-000000000401',
  productSecond: '0198a8be-6677-7000-8000-000000000402',
  productThird: '0198a8be-6677-7000-8000-000000000403',
  productUnpublished: '0198a8be-6677-7000-8000-000000000405',
  resourceCategoryDraft: '0198a8be-6677-7000-8000-000000000508',
  resourceCategoryPublic: '0198a8be-6677-7000-8000-000000000502',
  resourceCollectionPublic: '0198a8be-6677-7000-8000-000000000503',
  resourceGameDraft: '0198a8be-6677-7000-8000-000000000507',
  resourceGamePublic: '0198a8be-6677-7000-8000-000000000501',
  resourceProductFirst: '0198a8be-6677-7000-8000-000000000504',
  resourceProductSecondaryRemoved: '0198a8be-6677-7000-8000-000000000513',
  resourceProductSecondaryReplaced: '0198a8be-6677-7000-8000-000000000512',
  resourceProductSecond: '0198a8be-6677-7000-8000-000000000505',
  resourceProductThird: '0198a8be-6677-7000-8000-000000000506',
  resourceProductUnpublished: '0198a8be-6677-7000-8000-000000000509',
  resourceQuarantined: '0198a8be-6677-7000-8000-000000000511',
  resourceUnassociated: '0198a8be-6677-7000-8000-000000000510',
} as const;

let pool: Pool;
let service: CatalogPublicQueryService;

async function databaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
    /^\uFEFF/u,
    '',
  );
  return (JSON.parse(text) as { databaseUrl: string }).databaseUrl;
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
  pool = createPostgresPool(url, { max: 10 });
  service = new CatalogPublicQueryService(new PgCatalogPublicQueryRepository(pool));
});

beforeEach(async () => {
  await pool.query(`
      TRUNCATE product_media, products, catalog_entity_media,
        resource_assets, collections, categories, tcg_games, user_accounts,
        idempotency_records, scheduled_job_runs, audit_entries CASCADE
    `);
  await seedPublicCatalog(pool);
}, 30_000);

afterAll(async () => {
  await pool.end();
});

describe('PostgreSQL public catalog queries', () => {
  it('returns only published entities with published dependencies and safe projections', async () => {
    await expect(service.listGames({ limit: 100 })).resolves.toMatchObject({
      items: [{ gameId: ids.gamePublic, name: 'Pokémon', slug: 'pokemon' }],
    });
    await expect(service.listCategories({ limit: 100 })).resolves.toMatchObject({
      items: [{ categoryId: ids.categoryPublic, name: 'Cartas' }],
    });
    const collections = await service.listCollections({ limit: 100 });
    expect(collections.items).toEqual([
      {
        collectionId: ids.collectionPublic,
        game: { gameId: ids.gamePublic, name: 'Pokémon', slug: 'pokemon' },
        name: 'Colección Áurea',
      },
    ]);
    expect((await service.listCollections({ gameId: ids.gameDraft, limit: 100 })).items).toEqual(
      [],
    );

    const products = await service.listProducts({ limit: 100, sort: 'NEWEST' });
    expect(products.items.map((item) => item.productId)).toEqual([
      ids.productThird,
      ids.productSecond,
      ids.productFirst,
    ]);
    expect(products.items.map((item) => item.availableForPurchase)).toEqual([false, false, true]);
    expect(JSON.stringify(products)).not.toMatch(
      /secureStorageKey|publicationStatus|uploadedBy|sha256|description/u,
    );
    expect(products.items.every((item) => Object.keys(item.primaryResource).length === 5)).toBe(
      true,
    );
  });

  it('resolves every public owner by resourceId and hides every non-public condition', async () => {
    const repository = new PgCatalogPublicQueryRepository(pool);
    for (const resourceId of [
      ids.resourceGamePublic,
      ids.resourceCategoryPublic,
      ids.resourceCollectionPublic,
      ids.resourceProductFirst,
    ]) {
      await expect(repository.findPublicResource(resourceId)).resolves.toMatchObject({
        byteSize: 1024,
        mimeTypeReal: 'image/webp',
        resourceId,
      });
    }

    for (const resourceId of [
      ids.resourceGameDraft,
      ids.resourceCategoryDraft,
      ids.resourceProductUnpublished,
      ids.resourceQuarantined,
      ids.resourceUnassociated,
      '0198a8be-6677-7000-8000-000000000599',
    ]) {
      await expect(repository.findPublicResource(resourceId)).resolves.toBeNull();
    }
  });

  it('revalidates resource and owner state while valid transitions preserve dependencies', async () => {
    const repository = new PgCatalogPublicQueryRepository(pool);

    await pool.query(`UPDATE resource_assets SET state = 'REPLACED' WHERE resource_id = $1`, [
      ids.resourceProductSecondaryReplaced,
    ]);
    await pool.query(`UPDATE resource_assets SET state = 'REMOVED' WHERE resource_id = $1`, [
      ids.resourceProductSecondaryRemoved,
    ]);
    await expect(
      repository.findPublicResource(ids.resourceProductSecondaryReplaced),
    ).resolves.toBeNull();
    await expect(
      repository.findPublicResource(ids.resourceProductSecondaryRemoved),
    ).resolves.toBeNull();

    await pool.query(
      `UPDATE products SET publication_status = 'UNPUBLISHED' WHERE product_id IN ($1, $2)`,
      [ids.productFirst, ids.productSecond],
    );
    await expect(repository.findPublicResource(ids.resourceProductFirst)).resolves.toBeNull();

    await pool.query(
      `UPDATE collections
          SET publication_status = 'UNPUBLISHED'
        WHERE collection_id = $1`,
      [ids.collectionPublic],
    );
    await expect(repository.findPublicResource(ids.resourceCollectionPublic)).resolves.toBeNull();

    await pool.query(
      `UPDATE products SET publication_status = 'UNPUBLISHED' WHERE product_id = $1`,
      [ids.productThird],
    );
    await pool.query(`UPDATE tcg_games SET publication_status = 'UNPUBLISHED' WHERE game_id = $1`, [
      ids.gamePublic,
    ]);
    await expect(repository.findPublicResource(ids.resourceGamePublic)).resolves.toBeNull();

    await pool.query(
      `UPDATE categories
          SET publication_status = 'ARCHIVED', archived_at = $2
        WHERE category_id = $1`,
      [ids.categoryPublic, new Date('2026-08-02T12:00:00.000Z')],
    );
    await expect(repository.findPublicResource(ids.resourceCategoryPublic)).resolves.toBeNull();
  });

  it('searches the five approved fields accent-insensitively with AND terms', async () => {
    await expect(productIdsForQuery('ALBUM')).resolves.toEqual([ids.productFirst]);
    await expect(productIdsForQuery('sku-á1')).resolves.toEqual([ids.productFirst]);
    await expect(productIdsForQuery('pokemon')).resolves.toEqual([
      ids.productThird,
      ids.productSecond,
      ids.productFirst,
    ]);
    await expect(productIdsForQuery('cartas')).resolves.toEqual([
      ids.productThird,
      ids.productSecond,
      ids.productFirst,
    ]);
    await expect(productIdsForQuery('aurea')).resolves.toEqual([
      ids.productSecond,
      ids.productFirst,
    ]);
    await expect(productIdsForQuery('pokemon album aurea')).resolves.toEqual([ids.productFirst]);
    await expect(productIdsForQuery('pokemon inexistente')).resolves.toEqual([]);
    await expect(productIdsForQuery('descripcionsecreta')).resolves.toEqual([]);
  });

  it('applies every closed filter and exposes normalized public filter values', async () => {
    expect(
      (
        await service.listProducts({
          collectionId: ids.collectionPublic,
          condition: 'NEAR MINT',
          edition: 'FIRST EDITION',
          gameId: ids.gamePublic,
          language: 'es-CL',
          limit: 100,
          saleType: 'REGULAR',
          sort: 'NEWEST',
        })
      ).items.map((item) => item.productId),
    ).toEqual([ids.productFirst]);
    expect(
      (
        await service.listProducts({
          categoryId: ids.categoryPublic,
          limit: 100,
          saleType: 'PREORDER',
          sort: 'NEWEST',
        })
      ).items.map((item) => item.productId),
    ).toEqual([ids.productSecond]);
    await expect(
      service.listFilterValues({ attribute: 'language', limit: 100 }),
    ).resolves.toMatchObject({ items: ['en-US', 'es-CL'] });
    await expect(
      service.listFilterValues({ attribute: 'edition', limit: 100 }),
    ).resolves.toMatchObject({ items: ['FIRST EDITION', 'UNLIMITED'] });
    await expect(
      service.listFilterValues({ attribute: 'condition', limit: 100 }),
    ).resolves.toMatchObject({ items: ['NEAR MINT', 'SEALED'] });
  });

  it('implements every approved sort and stable keyset pagination without duplicates', async () => {
    await expect(productIds('NEWEST')).resolves.toEqual([
      ids.productThird,
      ids.productSecond,
      ids.productFirst,
    ]);
    await expect(productIds('NAME_ASC')).resolves.toEqual([
      ids.productFirst,
      ids.productSecond,
      ids.productThird,
    ]);
    await expect(productIds('PRICE_ASC')).resolves.toEqual([
      ids.productSecond,
      ids.productThird,
      ids.productFirst,
    ]);
    await expect(productIds('PRICE_DESC')).resolves.toEqual([
      ids.productFirst,
      ids.productSecond,
      ids.productThird,
    ]);

    const paged: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.listProducts({
        ...(cursor === undefined ? {} : { cursor }),
        limit: 1,
        sort: 'PRICE_ASC',
      });
      paged.push(...page.items.map((item) => item.productId));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    expect(paged).toEqual([ids.productSecond, ids.productThird, ids.productFirst]);
    expect(new Set(paged).size).toBe(paged.length);
  });

  it('returns a complete safe product detail', async () => {
    const detail = await service.getProduct(ids.productFirst);
    expect(detail).toMatchObject({
      category: { categoryId: ids.categoryPublic, name: 'Cartas' },
      collection: { collectionId: ids.collectionPublic, name: 'Colección Áurea' },
      condition: 'NEAR MINT',
      description: 'DescripcionSecreta del producto',
      edition: 'FIRST EDITION',
      language: 'es-CL',
      productId: ids.productFirst,
      sku: 'SKU-Á1',
    });
  });

  it('makes DRAFT, UNPUBLISHED and missing product details indistinguishable', async () => {
    for (const productId of [
      ids.productDraft,
      ids.productUnpublished,
      '0198a8be-6677-7000-8000-000000000499',
    ]) {
      await expect(service.getProduct(productId)).rejects.toMatchObject({
        code: 'CATALOG_ENTITY_NOT_FOUND',
      });
    }
  });

  it('keeps RLS, Data API default-deny, function restrictions and technical indexes intact', async () => {
    const rls = await pool.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
          AND relname IN ('resource_assets', 'tcg_games', 'categories', 'collections',
            'catalog_entity_media', 'products', 'product_media')`,
    );
    expect(rls.rows).toHaveLength(7);
    expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);
    const grants = await pool.query<{ count: string }>(
      `SELECT count(*) FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name IN ('resource_assets', 'tcg_games', 'categories', 'collections',
            'catalog_entity_media', 'products', 'product_media')
          AND grantee IN ('PUBLIC', 'anon', 'authenticated')`,
    );
    expect(grants.rows[0]?.count).toBe('0');
    const functions = await pool.query<{ count: string }>(
      `SELECT count(*) FROM information_schema.routine_privileges
        WHERE routine_schema = 'public'
          AND routine_name = 'sergod_catalog_search_normalize'
          AND privilege_type = 'EXECUTE'
          AND grantee IN ('PUBLIC', 'anon', 'authenticated')`,
    );
    expect(functions.rows[0]?.count).toBe('0');
    const indexes = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND indexname LIKE '%_public_%_idx'
        ORDER BY indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        'categories_public_name_order_idx',
        'collections_public_game_name_order_idx',
        'products_public_condition_filter_idx',
        'products_public_name_order_idx',
        'products_public_newest_order_idx',
        'products_public_price_asc_order_idx',
        'products_public_price_desc_order_idx',
        'products_public_search_idx',
        'tcg_games_public_name_order_idx',
      ]),
    );
  });
});

async function productIdsForQuery(q: string): Promise<readonly string[]> {
  return (await service.listProducts({ limit: 100, q, sort: 'NEWEST' })).items.map(
    (item) => item.productId,
  );
}

async function productIds(
  sort: 'NAME_ASC' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC',
): Promise<readonly string[]> {
  return (await service.listProducts({ limit: 100, sort })).items.map((item) => item.productId);
}

async function seedPublicCatalog(database: Pool): Promise<void> {
  const now = new Date('2026-08-01T10:00:00.000Z');
  const resources = [
    ids.resourceGamePublic,
    ids.resourceCategoryPublic,
    ids.resourceCollectionPublic,
    ids.resourceProductFirst,
    ids.resourceProductSecond,
    ids.resourceProductThird,
    ids.resourceGameDraft,
    ids.resourceCategoryDraft,
    ids.resourceProductUnpublished,
    ids.resourceUnassociated,
    ids.resourceQuarantined,
    ids.resourceProductSecondaryReplaced,
    ids.resourceProductSecondaryRemoved,
  ] as const;
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_accounts (
         account_id, auth_provider_user_id, role, status, current_email, normalized_email,
         current_phone, normalized_phone, email_verification_status, phone_verification_status,
         created_at, updated_at, status_changed_at
       ) VALUES ($1, $2, 'ADMIN', 'ACTIVE', 'admin@example.test', 'admin@example.test',
         NULL, NULL, 'VERIFIED', 'PENDING', $3, $3, $3)`,
      [ids.admin, crypto.randomUUID(), now],
    );
    await client.query(
      `INSERT INTO branches (
         branch_id, name, internal_address, state, timezone, created_by, created_at, updated_at
       ) VALUES ($1, 'Sucursal pública', 'Dirección interna', 'ACTIVE',
         'America/Santiago', $2, $3, $3)`,
      [ids.branch, ids.admin, now],
    );
    for (const [index, resourceId] of resources.entries()) {
      await client.query(
        `INSERT INTO resource_assets (
           resource_id, resource_class, original_filename_safe, mime_type_real, byte_size,
           width_px, height_px, sha256_hex, secure_storage_key, alt_text, position, state,
           uploaded_by, uploaded_at, validated_at
         ) VALUES ($1, 'CATALOG_IMAGE', $2, 'image/webp', 1024, 800, 800, $3, $4, $5, $9,
           $8, $6, $7, $7)`,
        [
          resourceId,
          `public-${index + 1}.webp`,
          (index + 1).toString(16).padStart(64, '0'),
          `private/catalog/${resourceId}`,
          `Imagen ${index + 1}`,
          ids.admin,
          now,
          resourceId === ids.resourceQuarantined ? 'QUARANTINED' : 'ACTIVE',
          resourceId === ids.resourceProductSecondaryReplaced
            ? 2
            : resourceId === ids.resourceProductSecondaryRemoved
              ? 3
              : 1,
        ],
      );
    }
    await client.query(
      `INSERT INTO tcg_games (
         game_id, name, slug, description, publication_status, created_at, updated_at
       ) VALUES
         ($1, 'Pokémon', 'pokemon', NULL, 'PUBLISHED', $3, $3),
         ($2, 'Digimón', 'digimon', NULL, 'DRAFT', $3, $3)`,
      [ids.gamePublic, ids.gameDraft, now],
    );
    await client.query(
      `INSERT INTO categories (
         category_id, name, description, publication_status, created_at, updated_at
       ) VALUES
         ($1, 'Cartas', NULL, 'PUBLISHED', $3, $3),
         ($2, 'Accesorios', NULL, 'DRAFT', $3, $3)`,
      [ids.categoryPublic, ids.categoryDraft, now],
    );
    await client.query(
      `INSERT INTO collections (
         collection_id, game_id, name, description, publication_status, created_at, updated_at
       ) VALUES
         ($1, $2, 'Colección Áurea', NULL, 'PUBLISHED', $4, $4),
         ($3, $2, 'Colección Oculta', NULL, 'DRAFT', $4, $4)`,
      [ids.collectionPublic, ids.gamePublic, ids.collectionDraft, now],
    );
    await client.query(
      `INSERT INTO catalog_entity_media (
         media_id, source_type, source_id, resource_id, is_primary, created_at
       ) VALUES
         ($1, 'TCG_GAME', $2, $3, true, $8),
         ($4, 'CATEGORY', $5, $6, true, $8),
         ($7, 'COLLECTION', $9, $10, true, $8),
         ($11, 'TCG_GAME', $12, $13, true, $8),
         ($14, 'CATEGORY', $15, $16, true, $8)`,
      [
        crypto.randomUUID(),
        ids.gamePublic,
        resources[0],
        crypto.randomUUID(),
        ids.categoryPublic,
        resources[1],
        crypto.randomUUID(),
        now,
        ids.collectionPublic,
        resources[2],
        crypto.randomUUID(),
        ids.gameDraft,
        resources[6],
        crypto.randomUUID(),
        ids.categoryDraft,
        resources[7],
      ],
    );
    await client.query(
      `INSERT INTO products (
         product_id, sku, game_id, category_id, collection_id, name, description,
         language, edition, condition, sale_type, price_amount_clp,
         publication_status, created_at, updated_at
       ) VALUES
         ($1, 'SKU-Á1', $6, $7, $8, 'Álbum Élite', 'DescripcionSecreta del producto',
          'es-CL', 'FIRST EDITION', 'NEAR MINT', 'REGULAR', 5000, 'PUBLISHED', $9, $9),
         ($2, 'BOOST-2', $6, $7, $8, 'Booster Base', NULL,
          'en-US', 'UNLIMITED', 'SEALED', 'PREORDER', 3000, 'PUBLISHED', $10, $10),
         ($3, 'CARD-3', $6, $7, NULL, 'Carta económica', NULL,
          'es-CL', NULL, 'NEAR MINT', 'REGULAR', 3000, 'PUBLISHED', $11, $11),
         ($4, 'DRAFT-4', $6, $7, NULL, 'Producto borrador', NULL,
          NULL, NULL, NULL, 'REGULAR', 1000, 'DRAFT', $12, $12),
         ($5, 'HIDDEN-5', $6, $7, NULL, 'Producto retirado', NULL,
          NULL, NULL, NULL, 'REGULAR', 1000, 'UNPUBLISHED', $12, $12)`,
      [
        ids.productFirst,
        ids.productSecond,
        ids.productThird,
        ids.productDraft,
        ids.productUnpublished,
        ids.gamePublic,
        ids.categoryPublic,
        ids.collectionPublic,
        new Date('2026-08-01T11:00:00.000Z'),
        new Date('2026-08-01T12:00:00.000Z'),
        new Date('2026-08-01T13:00:00.000Z'),
        new Date('2026-08-01T14:00:00.000Z'),
      ],
    );
    await client.query(
      `INSERT INTO inventory_positions (
         inventory_position_id, product_id, branch_id, on_hand, reserved, version, updated_at
       ) VALUES
         ($1, $2, $11, 2, 0, 1, $12),
         ($3, $4, $11, 10, 0, 1, $12),
         ($5, $6, $11, 0, 0, 1, $12),
         ($7, $8, $11, 0, 0, 1, $12),
         ($9, $10, $11, 0, 0, 1, $12)`,
      [
        crypto.randomUUID(),
        ids.productFirst,
        crypto.randomUUID(),
        ids.productSecond,
        crypto.randomUUID(),
        ids.productThird,
        crypto.randomUUID(),
        ids.productDraft,
        crypto.randomUUID(),
        ids.productUnpublished,
        ids.branch,
        now,
      ],
    );
    for (const [productId, resourceId] of [
      [ids.productFirst, resources[3]],
      [ids.productSecond, resources[4]],
      [ids.productThird, resources[5]],
      [ids.productUnpublished, resources[8]],
    ] as const) {
      await client.query(
        `INSERT INTO product_media (
           media_id, product_id, resource_id, is_primary, created_at
         ) VALUES ($1, $2, $3, true, $4)`,
        [crypto.randomUUID(), productId, resourceId, now],
      );
    }
    await client.query(
      `INSERT INTO product_media (
         media_id, product_id, resource_id, is_primary, created_at
       ) VALUES
         ($1, $2, $3, false, $6),
         ($4, $2, $5, false, $6)`,
      [
        crypto.randomUUID(),
        ids.productFirst,
        ids.resourceProductSecondaryReplaced,
        crypto.randomUUID(),
        ids.resourceProductSecondaryRemoved,
        now,
      ],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
