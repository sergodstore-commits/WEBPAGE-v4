import type {
  CatalogPublicCategoryItem,
  CatalogPublicCollectionItem,
  CatalogPublicFilterAttribute,
  CatalogPublicGameItem,
  CatalogPublicPrimaryResource,
  CatalogPublicProductCard,
  CatalogPublicProductDetail,
  CatalogPublicSort,
} from '@sergod/contracts';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import type {
  CatalogPublicNameCursor,
  CatalogPublicProductCursor,
  CatalogPublicProductRecord,
  CatalogPublicQueryPage,
  CatalogPublicQueryPort,
  CatalogPublicResourceQueryPort,
  CatalogPublicResourceRecord,
} from '../application/catalog-public-ports.js';

export class PgCatalogPublicQueryRepository
  implements CatalogPublicQueryPort, CatalogPublicResourceQueryPort
{
  readonly #transactions: PgTransactionExecutor;

  constructor(private readonly pool: Pool) {
    this.#transactions = new PgTransactionExecutor(pool);
  }

  async listGames(input: {
    readonly cursor?: CatalogPublicNameCursor;
    readonly limit: number;
  }): Promise<CatalogPublicQueryPage<CatalogPublicNameRecord<CatalogPublicGameItem>>> {
    const parameters: unknown[] = [];
    const clauses = [`publication_status = 'PUBLISHED'`];
    addNameCursor(clauses, parameters, input.cursor, 'name', 'game_id');
    parameters.push(input.limit + 1);
    const result = await this.pool.query<GameListRow>(
      `SELECT game_id, slug, name,
              public.sergod_catalog_search_normalize(name) AS normalized_name
         FROM tcg_games
        WHERE ${clauses.join(' AND ')}
        ORDER BY public.sergod_catalog_search_normalize(name) COLLATE "C" ASC, game_id ASC
        LIMIT $${parameters.length}`,
      parameters,
    );
    return namePage(result.rows, input.limit, (row) => ({
      gameId: row.game_id,
      name: row.name,
      slug: row.slug,
    }));
  }

  async listCategories(input: {
    readonly cursor?: CatalogPublicNameCursor;
    readonly limit: number;
  }): Promise<CatalogPublicQueryPage<CatalogPublicNameRecord<CatalogPublicCategoryItem>>> {
    const parameters: unknown[] = [];
    const clauses = [`publication_status = 'PUBLISHED'`];
    addNameCursor(clauses, parameters, input.cursor, 'name', 'category_id');
    parameters.push(input.limit + 1);
    const result = await this.pool.query<CategoryListRow>(
      `SELECT category_id, name,
              public.sergod_catalog_search_normalize(name) AS normalized_name
         FROM categories
        WHERE ${clauses.join(' AND ')}
        ORDER BY public.sergod_catalog_search_normalize(name) COLLATE "C" ASC, category_id ASC
        LIMIT $${parameters.length}`,
      parameters,
    );
    return namePage(result.rows, input.limit, (row) => ({
      categoryId: row.category_id,
      name: row.name,
    }));
  }

  async listCollections(input: {
    readonly cursor?: CatalogPublicNameCursor;
    readonly gameId?: string;
    readonly limit: number;
  }): Promise<CatalogPublicQueryPage<CatalogPublicNameRecord<CatalogPublicCollectionItem>>> {
    const parameters: unknown[] = [];
    const clauses = [`co.publication_status = 'PUBLISHED'`, `g.publication_status = 'PUBLISHED'`];
    if (input.gameId !== undefined) {
      parameters.push(input.gameId);
      clauses.push(`co.game_id = $${parameters.length}::uuid`);
    }
    addNameCursor(clauses, parameters, input.cursor, 'co.name', 'co.collection_id');
    parameters.push(input.limit + 1);
    const result = await this.pool.query<CollectionListRow>(
      `SELECT co.collection_id, co.name,
              public.sergod_catalog_search_normalize(co.name) AS normalized_name,
              g.game_id, g.slug AS game_slug, g.name AS game_name
         FROM collections co
         JOIN tcg_games g ON g.game_id = co.game_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY public.sergod_catalog_search_normalize(co.name) COLLATE "C" ASC,
                 co.collection_id ASC
        LIMIT $${parameters.length}`,
      parameters,
    );
    return namePage(result.rows, input.limit, (row) => ({
      collectionId: row.collection_id,
      game: { gameId: row.game_id, name: row.game_name, slug: row.game_slug },
      name: row.name,
    }));
  }

  async listProducts(
    input: Parameters<CatalogPublicQueryPort['listProducts']>[0],
  ): Promise<CatalogPublicQueryPage<CatalogPublicProductRecord>> {
    const parameters: unknown[] = [];
    const clauses = publicProductVisibilityClauses();
    addUuidFilter(clauses, parameters, 'p.game_id', input.gameId);
    addUuidFilter(clauses, parameters, 'p.category_id', input.categoryId);
    addUuidFilter(clauses, parameters, 'p.collection_id', input.collectionId);
    addTextFilter(clauses, parameters, 'p.language', input.language);
    addTextFilter(clauses, parameters, 'p.edition', input.edition);
    addTextFilter(clauses, parameters, 'p.condition', input.condition);
    addTextFilter(clauses, parameters, 'p.sale_type', input.saleType);
    for (const term of input.searchTerms) {
      parameters.push(`%${escapeLikeTerm(term)}%`);
      clauses.push(
        `(public.sergod_catalog_search_normalize(p.name || ' ' || p.sku)
             LIKE $${parameters.length}::text ESCAPE '!'
          OR public.sergod_catalog_search_normalize(g.name)
             LIKE $${parameters.length}::text ESCAPE '!'
          OR public.sergod_catalog_search_normalize(c.name)
             LIKE $${parameters.length}::text ESCAPE '!'
          OR public.sergod_catalog_search_normalize(co.name)
             LIKE $${parameters.length}::text ESCAPE '!')`,
      );
    }
    addProductCursor(clauses, parameters, input.cursor);
    parameters.push(input.limit + 1);
    const result = await this.pool.query<ProductListRow>(
      `SELECT ${publicProductCardColumns}
         ${publicProductFrom}
        WHERE ${clauses.join(' AND ')}
        ORDER BY ${productOrder(input.sort)}
        LIMIT $${parameters.length}`,
      parameters,
    );
    return productPage(result.rows, input.limit);
  }

  async findProduct(productId: string): Promise<CatalogPublicProductDetail | null> {
    return this.#transactions.execute(async (transaction) => {
      await transaction.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const detail = await transaction.query<ProductDetailRow>(
        `SELECT ${publicProductCardColumns},
                p.sku, p.description, p.language, p.edition, p.condition,
                c.category_id, c.name AS category_name,
                co.collection_id, co.name AS collection_name
           ${publicProductFrom}
           WHERE p.product_id = $1::uuid
             AND ${publicProductVisibilityClauses().join(' AND ')}`,
        [productId],
      );
      const row = detail.rows[0];
      if (row === undefined) return null;
      return {
        ...mapProductCard(row),
        category: { categoryId: row.category_id, name: row.category_name },
        collection:
          row.collection_id === null
            ? null
            : { collectionId: row.collection_id, name: requiredText(row.collection_name) },
        condition: row.condition,
        description: row.description,
        edition: row.edition,
        language: row.language,
        sku: row.sku,
      };
    });
  }

  async findPublicResource(resourceId: string): Promise<CatalogPublicResourceRecord | null> {
    const result = await this.pool.query<PublicResourceRow>(
      `WITH candidate AS (
         SELECT resource_id, mime_type_real, byte_size, sha256_hex, secure_storage_key
           FROM resource_assets
          WHERE resource_id = $1::uuid
            AND resource_class = 'CATALOG_IMAGE'
            AND state = 'ACTIVE'
       ), owners AS (
         SELECT media.resource_id, media.source_type AS owner_type, media.source_id AS owner_id
           FROM catalog_entity_media media
           JOIN candidate ON candidate.resource_id = media.resource_id
         UNION ALL
         SELECT media.resource_id, 'PRODUCT'::text AS owner_type, media.product_id AS owner_id
           FROM product_media media
           JOIN candidate ON candidate.resource_id = media.resource_id
       ), visible_owners AS (
         SELECT owners.resource_id
           FROM owners
           LEFT JOIN tcg_games game
             ON owners.owner_type = 'TCG_GAME' AND game.game_id = owners.owner_id
           LEFT JOIN categories category
             ON owners.owner_type = 'CATEGORY' AND category.category_id = owners.owner_id
           LEFT JOIN collections collection
             ON owners.owner_type = 'COLLECTION' AND collection.collection_id = owners.owner_id
           LEFT JOIN tcg_games collection_game
             ON collection_game.game_id = collection.game_id
           LEFT JOIN products product
             ON owners.owner_type = 'PRODUCT' AND product.product_id = owners.owner_id
           LEFT JOIN tcg_games product_game
             ON product_game.game_id = product.game_id
           LEFT JOIN categories product_category
             ON product_category.category_id = product.category_id
           LEFT JOIN collections product_collection
             ON product_collection.collection_id = product.collection_id
          WHERE CASE owners.owner_type
            WHEN 'TCG_GAME' THEN game.publication_status = 'PUBLISHED'
            WHEN 'CATEGORY' THEN category.publication_status = 'PUBLISHED'
            WHEN 'COLLECTION' THEN collection.publication_status = 'PUBLISHED'
              AND collection_game.publication_status = 'PUBLISHED'
            WHEN 'PRODUCT' THEN product.publication_status = 'PUBLISHED'
              AND product_game.publication_status = 'PUBLISHED'
              AND product_category.publication_status = 'PUBLISHED'
              AND (product.collection_id IS NULL
                OR product_collection.publication_status = 'PUBLISHED')
            ELSE false
          END
       )
       SELECT candidate.resource_id, candidate.mime_type_real, candidate.byte_size,
              candidate.sha256_hex, candidate.secure_storage_key
         FROM candidate
        WHERE (SELECT count(*) FROM owners) = 1
          AND (SELECT count(*) FROM visible_owners) = 1`,
      [resourceId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          byteSize: safePublicResourceByteSize(row.byte_size),
          mimeTypeReal: row.mime_type_real,
          resourceId: row.resource_id,
          secureStorageKey: row.secure_storage_key,
          sha256Hex: row.sha256_hex,
        };
  }

  async listFilterValues(
    input: Parameters<CatalogPublicQueryPort['listFilterValues']>[0],
  ): Promise<CatalogPublicQueryPage<string>> {
    const column = filterColumn(input.attribute);
    const parameters: unknown[] = [];
    const clauses = publicProductVisibilityClauses();
    clauses.push(`p.${column} IS NOT NULL`);
    if (input.cursor !== undefined) {
      parameters.push(input.cursor.value);
      clauses.push(`p.${column} COLLATE "C" > $${parameters.length}::text COLLATE "C"`);
    }
    parameters.push(input.limit + 1);
    const result = await this.pool.query<FilterValueRow>(
      `SELECT DISTINCT p.${column} COLLATE "C" AS value
         ${publicProductFrom}
        WHERE ${clauses.join(' AND ')}
        ORDER BY value ASC
        LIMIT $${parameters.length}`,
      parameters,
    );
    return {
      hasMore: result.rows.length > input.limit,
      items: result.rows.slice(0, input.limit).map((row) => row.value),
    };
  }
}

interface CatalogPublicNameRecord<Item> {
  readonly item: Item;
  readonly normalizedName: string;
}

interface NamedRow extends QueryResultRow {
  readonly name: string;
  readonly normalized_name: string;
}

interface GameListRow extends NamedRow {
  readonly game_id: string;
  readonly slug: string;
}

interface CategoryListRow extends NamedRow {
  readonly category_id: string;
}

interface CollectionListRow extends NamedRow {
  readonly collection_id: string;
  readonly game_id: string;
  readonly game_name: string;
  readonly game_slug: string;
}

interface ProductListRow extends QueryResultRow {
  readonly available_for_purchase: boolean;
  readonly created_at: Date;
  readonly game_id: string;
  readonly game_name: string;
  readonly game_slug: string;
  readonly name: string;
  readonly normalized_name: string;
  readonly price_amount_clp: string;
  readonly preorder_campaign_id: string | null;
  readonly product_id: string;
  readonly resource_alt_text: string;
  readonly resource_height_px: number;
  readonly resource_id: string;
  readonly resource_mime_type: CatalogPublicPrimaryResource['mimeType'];
  readonly resource_width_px: number;
  readonly sale_type: CatalogPublicProductCard['saleType'];
}

interface ProductDetailRow extends ProductListRow {
  readonly category_id: string;
  readonly category_name: string;
  readonly collection_id: string | null;
  readonly collection_name: string | null;
  readonly condition: string | null;
  readonly description: string | null;
  readonly edition: string | null;
  readonly language: string | null;
  readonly sku: string;
}

interface FilterValueRow extends QueryResultRow {
  readonly value: string;
}

interface PublicResourceRow extends QueryResultRow {
  readonly byte_size: string;
  readonly mime_type_real: CatalogPublicResourceRecord['mimeTypeReal'];
  readonly resource_id: string;
  readonly secure_storage_key: string;
  readonly sha256_hex: string;
}

const publicProductFrom = `FROM products p
  JOIN tcg_games g ON g.game_id = p.game_id
  JOIN categories c ON c.category_id = p.category_id
  LEFT JOIN collections co ON co.collection_id = p.collection_id
  LEFT JOIN LATERAL (
    SELECT campaign.preorder_campaign_id
      FROM preorder_campaigns campaign
      JOIN branches campaign_branch
        ON campaign_branch.branch_id=campaign.branch_id AND campaign_branch.state='ACTIVE'
     WHERE campaign.product_id=p.product_id
       AND campaign.operational_state='OPEN'
       AND campaign.publication_status='PUBLISHED'
       AND campaign.opens_at<=CURRENT_TIMESTAMP AND campaign.closes_at>CURRENT_TIMESTAMP
       AND campaign.temporarily_reserved+campaign.committed<campaign.capacity
     ORDER BY campaign.opens_at,campaign.preorder_campaign_id
     LIMIT 1
  ) preorder ON p.sale_type='PREORDER'
  JOIN product_media pm ON pm.product_id = p.product_id AND pm.is_primary
  JOIN resource_assets resource ON resource.resource_id = pm.resource_id AND resource.state = 'ACTIVE'`;

const publicProductCardColumns = `p.product_id, p.name, p.price_amount_clp, p.sale_type,
  ((p.sale_type = 'REGULAR' AND EXISTS (
      SELECT 1 FROM inventory_positions inventory
      JOIN branches branch ON branch.branch_id = inventory.branch_id AND branch.state = 'ACTIVE'
      WHERE inventory.product_id = p.product_id AND inventory.on_hand > inventory.reserved
    )) OR (p.sale_type='PREORDER' AND preorder.preorder_campaign_id IS NOT NULL))
    AS available_for_purchase,
  preorder.preorder_campaign_id,
  p.created_at, public.sergod_catalog_search_normalize(p.name) AS normalized_name,
  g.game_id, g.slug AS game_slug, g.name AS game_name,
  resource.resource_id, resource.alt_text AS resource_alt_text,
  resource.mime_type_real AS resource_mime_type,
  resource.width_px AS resource_width_px, resource.height_px AS resource_height_px`;

function publicProductVisibilityClauses(): string[] {
  return [
    `p.publication_status = 'PUBLISHED'`,
    `g.publication_status = 'PUBLISHED'`,
    `c.publication_status = 'PUBLISHED'`,
    `(p.collection_id IS NULL OR co.publication_status = 'PUBLISHED')`,
  ];
}

function addNameCursor(
  clauses: string[],
  parameters: unknown[],
  cursor: CatalogPublicNameCursor | undefined,
  nameColumn: string,
  idColumn: string,
): void {
  if (cursor === undefined) return;
  parameters.push(cursor.normalizedName, cursor.id);
  clauses.push(
    `(public.sergod_catalog_search_normalize(${nameColumn}) COLLATE "C", ${idColumn}) >
     ($${parameters.length - 1}::text COLLATE "C", $${parameters.length}::uuid)`,
  );
}

function addUuidFilter(
  clauses: string[],
  parameters: unknown[],
  column: string,
  value: string | undefined,
): void {
  if (value === undefined) return;
  parameters.push(value);
  clauses.push(`${column} = $${parameters.length}::uuid`);
}

function addTextFilter(
  clauses: string[],
  parameters: unknown[],
  column: string,
  value: string | undefined,
): void {
  if (value === undefined) return;
  parameters.push(value);
  clauses.push(`${column} = $${parameters.length}::text`);
}

function addProductCursor(
  clauses: string[],
  parameters: unknown[],
  cursor: CatalogPublicProductCursor | undefined,
): void {
  if (cursor === undefined) return;
  if (cursor.sort === 'NEWEST') {
    parameters.push(cursor.createdAt, cursor.productId);
    clauses.push(
      `(p.created_at, p.product_id) < ($${parameters.length - 1}::timestamptz, $${parameters.length}::uuid)`,
    );
    return;
  }
  if (cursor.sort === 'NAME_ASC') {
    parameters.push(cursor.normalizedName, cursor.productId);
    clauses.push(
      `(public.sergod_catalog_search_normalize(p.name) COLLATE "C", p.product_id) >
       ($${parameters.length - 1}::text COLLATE "C", $${parameters.length}::uuid)`,
    );
    return;
  }
  parameters.push(cursor.priceAmountClp, cursor.productId);
  if (cursor.sort === 'PRICE_ASC') {
    clauses.push(
      `(p.price_amount_clp, p.product_id) > ($${parameters.length - 1}::bigint, $${parameters.length}::uuid)`,
    );
    return;
  }
  clauses.push(
    `(p.price_amount_clp < $${parameters.length - 1}::bigint OR
      (p.price_amount_clp = $${parameters.length - 1}::bigint AND
       p.product_id > $${parameters.length}::uuid))`,
  );
}

function productOrder(sort: CatalogPublicSort): string {
  if (sort === 'NEWEST') return 'p.created_at DESC, p.product_id DESC';
  if (sort === 'NAME_ASC') {
    return 'public.sergod_catalog_search_normalize(p.name) COLLATE "C" ASC, p.product_id ASC';
  }
  if (sort === 'PRICE_ASC') return 'p.price_amount_clp ASC, p.product_id ASC';
  return 'p.price_amount_clp DESC, p.product_id ASC';
}

function filterColumn(
  attribute: CatalogPublicFilterAttribute,
): 'condition' | 'edition' | 'language' {
  if (attribute === 'language') return 'language';
  if (attribute === 'edition') return 'edition';
  return 'condition';
}

function namePage<Row extends NamedRow, Item>(
  rows: readonly Row[],
  limit: number,
  map: (row: Row) => Item,
): CatalogPublicQueryPage<CatalogPublicNameRecord<Item>> {
  return {
    hasMore: rows.length > limit,
    items: rows.slice(0, limit).map((row) => ({
      item: map(row),
      normalizedName: row.normalized_name,
    })),
  };
}

function productPage(
  rows: readonly ProductListRow[],
  limit: number,
): CatalogPublicQueryPage<CatalogPublicProductRecord> {
  return {
    hasMore: rows.length > limit,
    items: rows.slice(0, limit).map((row) => ({
      createdAt: row.created_at,
      item: mapProductCard(row),
      normalizedName: row.normalized_name,
    })),
  };
}

function mapProductCard(row: ProductListRow): CatalogPublicProductCard {
  return {
    availableForPurchase: row.available_for_purchase,
    game: { gameId: row.game_id, name: row.game_name, slug: row.game_slug },
    name: row.name,
    priceAmountClp: safeInteger(row.price_amount_clp),
    preorderCampaignId: row.preorder_campaign_id,
    primaryResource: {
      altText: row.resource_alt_text,
      heightPx: row.resource_height_px,
      mimeType: row.resource_mime_type,
      resourceId: row.resource_id,
      widthPx: row.resource_width_px,
    },
    productId: row.product_id,
    saleType: row.sale_type,
  };
}

function safeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Public catalog monetary value is outside the supported integer range.');
  }
  return parsed;
}

function safePublicResourceByteSize(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Public catalog resource size is invalid.');
  }
  return parsed;
}

function requiredText(value: string | null): string {
  if (value === null) throw new Error('Visible catalog collection is inconsistent.');
  return value;
}

function escapeLikeTerm(value: string): string {
  return value.replace(/!/gu, '!!').replace(/%/gu, '!%').replace(/_/gu, '!_');
}
