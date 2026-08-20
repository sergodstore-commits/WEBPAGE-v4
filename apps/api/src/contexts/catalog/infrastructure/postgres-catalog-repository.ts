import { createHash } from 'node:crypto';

import type { Clock, ExecutionContext, UuidGenerator } from '@sergod/foundation';
import type { Pool, QueryResultRow } from 'pg';

import { PgTransaction, PgTransactionExecutor } from '../../../platform/persistence/postgres.js';
import {
  assertPublicationTransition,
  CatalogError,
  type CatalogEntityType,
  type PublicationStatus,
  type ValidatedResourceDescriptor,
} from '../domain/catalog.js';
import type {
  CatalogEntityView,
  CatalogCategoryDetail,
  CatalogCollectionDetail,
  CatalogEntityListInput,
  CatalogEntityPage,
  CatalogGameDetail,
  CatalogProductDetail,
  CatalogRepository,
  CatalogAssociatedResourceView,
  CatalogResourcePage,
  CatalogResourceReconciliationView,
  CatalogResourceView,
  CatalogStorageKeyGenerator,
} from '../application/ports.js';

const entityTables = {
  CATEGORY: { id: 'category_id', table: 'categories' },
  COLLECTION: { id: 'collection_id', table: 'collections' },
  PRODUCT: { id: 'product_id', table: 'products' },
  TCG_GAME: { id: 'game_id', table: 'tcg_games' },
} as const;

export class PgCatalogRepository implements CatalogRepository {
  readonly #transactions: PgTransactionExecutor;

  constructor(
    pool: Pool,
    private readonly clock: Clock,
    private readonly uuids: UuidGenerator,
    private readonly storageKeys?: CatalogStorageKeyGenerator,
  ) {
    this.#transactions = new PgTransactionExecutor(pool);
    this.pool = pool;
  }

  private readonly pool: Pool;

  async createGame(input: Parameters<CatalogRepository['createGame']>[0]) {
    return this.idempotent(
      'CATALOG_CREATE_GAME',
      input,
      async (transaction, now) => {
        const gameId = this.uuids.generate();
        await transaction.query(
          `INSERT INTO tcg_games (
             game_id, name, slug, description, publication_status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $5)`,
          [gameId, input.name, input.slug, input.description, now],
        );
        await this.audit(transaction, input.context, 'CATALOG_GAME_CREATED', 'TCG_GAME', gameId);
        return gameId;
      },
      (gameId, replayed) => ({ gameId, replayed }),
    );
  }

  async createCategory(input: Parameters<CatalogRepository['createCategory']>[0]) {
    return this.idempotent(
      'CATALOG_CREATE_CATEGORY',
      input,
      async (transaction, now) => {
        const categoryId = this.uuids.generate();
        await transaction.query(
          `INSERT INTO categories (
             category_id, name, description, publication_status, created_at, updated_at
           ) VALUES ($1, $2, $3, 'DRAFT', $4, $4)`,
          [categoryId, input.name, input.description, now],
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_CATEGORY_CREATED',
          'CATEGORY',
          categoryId,
        );
        return categoryId;
      },
      (categoryId, replayed) => ({ categoryId, replayed }),
    );
  }

  async createCollection(input: Parameters<CatalogRepository['createCollection']>[0]) {
    return this.idempotent(
      'CATALOG_CREATE_COLLECTION',
      input,
      async (transaction, now) => {
        const collectionId = this.uuids.generate();
        await transaction.query(
          `INSERT INTO collections (
             collection_id, game_id, name, description, publication_status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $5)`,
          [collectionId, input.gameId, input.name, input.description, now],
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_COLLECTION_CREATED',
          'COLLECTION',
          collectionId,
        );
        return collectionId;
      },
      (collectionId, replayed) => ({ collectionId, replayed }),
    );
  }

  async createProduct(input: Parameters<CatalogRepository['createProduct']>[0]) {
    return this.idempotent(
      'CATALOG_CREATE_PRODUCT',
      input,
      async (transaction, now) => {
        const productId = this.uuids.generate();
        const product = input.product;
        await transaction.query(
          `INSERT INTO products (
             product_id, sku, game_id, category_id, collection_id, name, description,
             language, edition, condition, sale_type, price_amount_clp,
             publication_status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13, $13)`,
          [
            productId,
            product.sku,
            product.gameId,
            product.categoryId,
            product.collectionId,
            product.name,
            product.description,
            product.language,
            product.edition,
            product.condition,
            product.saleType,
            product.priceAmountClp,
            now,
          ],
        );
        const branch = await transaction.query<{ branch_id: string }>(
          `SELECT branch_id FROM branches WHERE state = 'ACTIVE' FOR SHARE`,
        );
        if (branch.rowCount !== 1 || branch.rows[0] === undefined) {
          throw new CatalogError(
            'CATALOG_ACTIVE_BRANCH_REQUIRED',
            'INFRASTRUCTURE',
            'Product creation requires the single ACTIVE Branch.',
          );
        }
        await transaction.query(
          `INSERT INTO inventory_positions (
             inventory_position_id, product_id, branch_id, on_hand, reserved, version, updated_at
           ) VALUES ($1, $2, $3, 0, 0, 1, $4)`,
          [this.uuids.generate(), productId, branch.rows[0].branch_id, now],
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_PRODUCT_CREATED',
          'PRODUCT',
          productId,
        );
        return productId;
      },
      (productId, replayed) => ({ productId, replayed }),
    );
  }

  async registerQuarantinedResource(
    input: Parameters<CatalogRepository['registerQuarantinedResource']>[0],
  ) {
    const result = await this.idempotent(
      'CATALOG_REGISTER_RESOURCE',
      input,
      async (transaction, now) => {
        const resourceId = this.uuids.generate();
        const secureStorageKey = this.storageKeys?.generate();
        if (secureStorageKey === undefined) {
          throw new CatalogError(
            'CATALOG_STORAGE_NOT_CONFIGURED',
            'INFRASTRUCTURE',
            'Catalog resource storage is not configured.',
          );
        }
        await transaction.query(
          `INSERT INTO resource_assets (
             resource_id, resource_class, original_filename_safe, secure_storage_key,
             alt_text, position, state, uploaded_by, uploaded_at
           ) VALUES ($1, 'CATALOG_IMAGE', $2, $3, $4, $5, 'QUARANTINED', $6, $7)`,
          [
            resourceId,
            input.originalFilenameSafe,
            secureStorageKey,
            input.altText,
            input.position,
            requiredActor(input.context),
            now,
          ],
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCE_QUARANTINED',
          'RESOURCE_ASSET',
          resourceId,
        );
        return resourceId;
      },
      (resourceId, replayed) => ({ replayed, resourceId }),
    );
    const resource = await this.findResource(result.resourceId);
    if (resource === null) {
      throw new CatalogError(
        'CATALOG_RESOURCE_NOT_FOUND',
        'NOT_FOUND',
        'Registered catalog resource was not found.',
      );
    }
    return { ...result, secureStorageKey: resource.secureStorageKey };
  }

  async activateResource(input: Parameters<CatalogRepository['activateResource']>[0]) {
    return this.idempotent(
      'CATALOG_ACTIVATE_RESOURCE',
      input,
      async (transaction, now) => {
        const descriptor = input.descriptor;
        const updated = await transaction.query(
          `UPDATE resource_assets
              SET mime_type_real = $2, byte_size = $3, width_px = $4, height_px = $5,
                  sha256_hex = $6, validated_at = $7, state = 'ACTIVE'
            WHERE resource_id = $1 AND state = 'QUARANTINED'
              AND secure_storage_key = $8 AND original_filename_safe = $9
          RETURNING resource_id`,
          [
            input.resourceId,
            descriptor.mimeTypeReal,
            descriptor.byteSize,
            descriptor.widthPx,
            descriptor.heightPx,
            descriptor.sha256Hex,
            now,
            descriptor.secureStorageKey,
            descriptor.originalFilenameSafe,
          ],
        );
        if (updated.rowCount !== 1) {
          throw new CatalogError(
            'CATALOG_RESOURCE_NOT_QUARANTINED',
            'CONFLICT',
            'Only a quarantined resource can be activated.',
          );
        }
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCE_ACTIVATED',
          'RESOURCE_ASSET',
          input.resourceId,
        );
        return input.resourceId;
      },
      (resourceId, replayed) => ({ replayed, resourceId }),
    );
  }

  async activateAndAttachResource(
    input: Parameters<CatalogRepository['activateAndAttachResource']>[0],
  ) {
    return this.idempotent(
      'CATALOG_ACTIVATE_ATTACH_RESOURCE',
      input,
      async (transaction, now) => {
        await lockEntity(transaction, input.entityType, input.entityId);
        await activateQuarantined(transaction, input.resourceId, input.descriptor, now);
        const mediaId = this.uuids.generate();
        await insertMedia(
          transaction,
          input.entityType,
          input.entityId,
          input.resourceId,
          mediaId,
          now,
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCE_ACTIVATED',
          'RESOURCE_ASSET',
          input.resourceId,
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCE_ASSOCIATED',
          input.entityType,
          input.entityId,
        );
        return input.resourceId;
      },
      (resourceId, replayed) => ({ replayed, resourceId }),
    );
  }

  async activateAndReplaceResource(
    input: Parameters<CatalogRepository['activateAndReplaceResource']>[0],
  ) {
    return this.idempotent(
      'CATALOG_ACTIVATE_REPLACE_RESOURCE',
      input,
      async (transaction, now) => {
        await lockEntity(transaction, input.entityType, input.entityId);
        const current = await lockAssociatedResource(
          transaction,
          input.entityType,
          input.entityId,
          input.replacedResourceId,
        );
        if (current.state !== 'ACTIVE') {
          throw new CatalogError(
            'CATALOG_RESOURCE_NOT_ACTIVE',
            'CONFLICT',
            'Only an active associated resource can be replaced.',
          );
        }
        await activateQuarantined(
          transaction,
          input.replacementResourceId,
          input.descriptor,
          now,
          current.position,
          input.replacedResourceId,
        );
        await updateMediaResource(
          transaction,
          input.entityType,
          current.mediaId,
          input.replacementResourceId,
        );
        const retired = await transaction.query(
          `UPDATE resource_assets
              SET state = 'REPLACED', retired_by = $2, retired_at = $3
            WHERE resource_id = $1 AND state = 'ACTIVE'`,
          [input.replacedResourceId, requiredActor(input.context), now],
        );
        if (retired.rowCount !== 1) throw resourceStateConflict();
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCE_REPLACED',
          'RESOURCE_ASSET',
          input.replacedResourceId,
          input.reason,
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_REPLACEMENT_ACTIVATED',
          'RESOURCE_ASSET',
          input.replacementResourceId,
          input.reason,
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCE_ASSOCIATION_REPLACED',
          input.entityType,
          input.entityId,
          input.reason,
        );
        return input.replacementResourceId;
      },
      (resourceId, replayed) => ({ replayed, resourceId }),
    );
  }

  async attachCatalogMedia(input: Parameters<CatalogRepository['attachCatalogMedia']>[0]) {
    return this.idempotent(
      'CATALOG_ATTACH_ENTITY_MEDIA',
      input,
      async (transaction, now) => {
        const mediaId = this.uuids.generate();
        await transaction.query(
          `INSERT INTO catalog_entity_media (
             media_id, source_type, source_id, resource_id, is_primary, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [mediaId, input.sourceType, input.sourceId, input.resourceId, input.isPrimary, now],
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_ENTITY_MEDIA_ATTACHED',
          input.sourceType,
          input.sourceId,
        );
        return mediaId;
      },
      (mediaId, replayed) => ({ mediaId, replayed }),
    );
  }

  async attachProductMedia(input: Parameters<CatalogRepository['attachProductMedia']>[0]) {
    return this.idempotent(
      'CATALOG_ATTACH_PRODUCT_MEDIA',
      input,
      async (transaction, now) => {
        const mediaId = this.uuids.generate();
        await transaction.query(
          `INSERT INTO product_media (
             media_id, product_id, resource_id, is_primary, created_at
           ) VALUES ($1, $2, $3, $4, $5)`,
          [mediaId, input.productId, input.resourceId, input.isPrimary, now],
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_PRODUCT_MEDIA_ATTACHED',
          'PRODUCT',
          input.productId,
        );
        return mediaId;
      },
      (mediaId, replayed) => ({ mediaId, replayed }),
    );
  }

  async transitionEntity(input: Parameters<CatalogRepository['transitionEntity']>[0]) {
    return this.idempotent(
      'CATALOG_TRANSITION_ENTITY',
      input,
      async (transaction, now) => {
        const descriptor = entityTables[input.entityType];
        const current = await transaction.query<{ publication_status: PublicationStatus }>(
          `SELECT publication_status FROM ${descriptor.table}
            WHERE ${descriptor.id} = $1 FOR UPDATE`,
          [input.entityId],
        );
        const status = current.rows[0]?.publication_status;
        if (status === undefined) {
          throw new CatalogError(
            'CATALOG_ENTITY_NOT_FOUND',
            'NOT_FOUND',
            'Catalog entity was not found.',
          );
        }
        assertPublicationTransition(status, input.nextStatus);
        const leavingPublished =
          status === 'PUBLISHED' &&
          (input.nextStatus === 'UNPUBLISHED' || input.nextStatus === 'ARCHIVED');
        if (
          !leavingPublished &&
          input.descendantStrategy !== undefined &&
          input.requestFingerprint !== undefined
        ) {
          throw new CatalogError(
            'CATALOG_DESCENDANT_STRATEGY_NOT_APPLICABLE',
            'VALIDATION',
            'Descendant strategy is not applicable to this transition.',
          );
        }
        if (leavingPublished) {
          await this.handlePublishedDescendants(transaction, input, now);
        }
        await transaction.query(
          `UPDATE ${descriptor.table}
              SET publication_status = $2::text, updated_at = $3::timestamptz,
                  archived_at = CASE
                    WHEN $2::text = 'ARCHIVED' THEN $3::timestamptz
                    ELSE NULL::timestamptz
                  END
            WHERE ${descriptor.id} = $1`,
          [input.entityId, input.nextStatus, now],
        );
        await this.audit(
          transaction,
          input.context,
          `CATALOG_${input.nextStatus}`,
          input.entityType,
          input.entityId,
          input.descendantStrategy,
        );
        return input.entityId;
      },
      (entityId, replayed) => ({ entityId, replayed }),
    );
  }

  async transitionResource(input: Parameters<CatalogRepository['transitionResource']>[0]) {
    return this.idempotent(
      'CATALOG_TRANSITION_RESOURCE',
      input,
      async (transaction, now) => {
        if (input.nextState === 'REPLACED' && input.replacementResourceId === undefined) {
          throw new CatalogError(
            'CATALOG_REPLACEMENT_REQUIRED',
            'VALIDATION',
            'Replacement requires the new resource identifier.',
          );
        }
        if (input.nextState === 'REPLACED') {
          const replacement = await transaction.query(
            `SELECT resource_id FROM resource_assets
              WHERE resource_id = $1 AND state = 'ACTIVE' FOR UPDATE`,
            [input.replacementResourceId],
          );
          if (replacement.rowCount !== 1) {
            throw new CatalogError(
              'CATALOG_REPLACEMENT_NOT_ACTIVE',
              'CONFLICT',
              'Replacement resource must already be ACTIVE.',
            );
          }
          await transaction.query(
            `UPDATE catalog_entity_media SET resource_id = $2 WHERE resource_id = $1`,
            [input.resourceId, input.replacementResourceId],
          );
          await transaction.query(
            `UPDATE product_media SET resource_id = $2 WHERE resource_id = $1`,
            [input.resourceId, input.replacementResourceId],
          );
          await transaction.query(
            `UPDATE resource_assets SET replaced_resource_id = $1 WHERE resource_id = $2`,
            [input.resourceId, input.replacementResourceId],
          );
        }
        const updated = await transaction.query(
          `UPDATE resource_assets
              SET state = $2, retired_by = $3, retired_at = $4
            WHERE resource_id = $1 AND state = 'ACTIVE'
          RETURNING resource_id`,
          [input.resourceId, input.nextState, requiredActor(input.context), now],
        );
        if (updated.rowCount !== 1) {
          throw new CatalogError(
            'CATALOG_RESOURCE_NOT_ACTIVE',
            'CONFLICT',
            'Only an active resource can be replaced or removed.',
          );
        }
        await this.audit(
          transaction,
          input.context,
          `CATALOG_RESOURCE_${input.nextState}`,
          'RESOURCE_ASSET',
          input.resourceId,
        );
        return input.resourceId;
      },
      (resourceId, replayed) => ({ replayed, resourceId }),
    );
  }

  async updateGame(input: Parameters<CatalogRepository['updateGame']>[0]) {
    return this.idempotent(
      'CATALOG_UPDATE_GAME',
      input,
      async (transaction, now) => {
        const updated = await transaction.query(
          `UPDATE tcg_games
              SET name = CASE WHEN $2::boolean THEN $3::text ELSE name END,
                  description = CASE WHEN $4::boolean THEN $5::text ELSE description END,
                  updated_at = $6
            WHERE game_id = $1
          RETURNING game_id`,
          [
            input.gameId,
            input.name !== undefined,
            input.name ?? null,
            'description' in input,
            input.description ?? null,
            now,
          ],
        );
        if (updated.rowCount !== 1) throw entityNotFound();
        await this.audit(
          transaction,
          input.context,
          'CATALOG_GAME_UPDATED',
          'TCG_GAME',
          input.gameId,
        );
        return input.gameId;
      },
      (gameId, replayed) => ({ gameId, replayed }),
    );
  }

  async updateCategory(input: Parameters<CatalogRepository['updateCategory']>[0]) {
    return this.idempotent(
      'CATALOG_UPDATE_CATEGORY',
      input,
      async (transaction, now) => {
        const updated = await transaction.query(
          `UPDATE categories
              SET name = CASE WHEN $2::boolean THEN $3::text ELSE name END,
                  description = CASE WHEN $4::boolean THEN $5::text ELSE description END,
                  updated_at = $6
            WHERE category_id = $1
          RETURNING category_id`,
          [
            input.categoryId,
            input.name !== undefined,
            input.name ?? null,
            'description' in input,
            input.description ?? null,
            now,
          ],
        );
        if (updated.rowCount !== 1) throw entityNotFound();
        await this.audit(
          transaction,
          input.context,
          'CATALOG_CATEGORY_UPDATED',
          'CATEGORY',
          input.categoryId,
        );
        return input.categoryId;
      },
      (categoryId, replayed) => ({ categoryId, replayed }),
    );
  }

  async updateCollection(input: Parameters<CatalogRepository['updateCollection']>[0]) {
    return this.idempotent(
      'CATALOG_UPDATE_COLLECTION',
      input,
      async (transaction, now) => {
        const updated = await transaction.query(
          `UPDATE collections
              SET game_id = CASE WHEN $2::boolean THEN $3::uuid ELSE game_id END,
                  name = CASE WHEN $4::boolean THEN $5::text ELSE name END,
                  description = CASE WHEN $6::boolean THEN $7::text ELSE description END,
                  updated_at = $8
            WHERE collection_id = $1
          RETURNING collection_id`,
          [
            input.collectionId,
            input.gameId !== undefined,
            input.gameId ?? null,
            input.name !== undefined,
            input.name ?? null,
            'description' in input,
            input.description ?? null,
            now,
          ],
        );
        if (updated.rowCount !== 1) throw entityNotFound();
        await this.audit(
          transaction,
          input.context,
          'CATALOG_COLLECTION_UPDATED',
          'COLLECTION',
          input.collectionId,
        );
        return input.collectionId;
      },
      (collectionId, replayed) => ({ collectionId, replayed }),
    );
  }

  async updateProduct(input: Parameters<CatalogRepository['updateProduct']>[0]) {
    return this.idempotent(
      'CATALOG_UPDATE_PRODUCT',
      input,
      async (transaction, now) => {
        const product = input.product;
        const updated = await transaction.query(
          `UPDATE products
              SET sku = $2, game_id = $3, category_id = $4, collection_id = $5,
                  name = $6, description = $7, language = $8, edition = $9,
                  condition = $10, sale_type = $11, price_amount_clp = $12, updated_at = $13
            WHERE product_id = $1
          RETURNING product_id`,
          [
            input.productId,
            product.sku,
            product.gameId,
            product.categoryId,
            product.collectionId,
            product.name,
            product.description,
            product.language,
            product.edition,
            product.condition,
            product.saleType,
            product.priceAmountClp,
            now,
          ],
        );
        if (updated.rowCount !== 1) throw entityNotFound();
        await this.audit(
          transaction,
          input.context,
          'CATALOG_PRODUCT_UPDATED',
          'PRODUCT',
          input.productId,
        );
        return input.productId;
      },
      (productId, replayed) => ({ productId, replayed }),
    );
  }

  async findGame(gameId: string): Promise<CatalogGameDetail | null> {
    const result = await this.pool.query<GameRow>(
      `SELECT game_id, name, slug, description, publication_status,
              created_at, updated_at, archived_at
         FROM tcg_games WHERE game_id = $1`,
      [gameId],
    );
    return result.rows[0] === undefined ? null : mapGame(result.rows[0]);
  }

  async findCategory(categoryId: string): Promise<CatalogCategoryDetail | null> {
    const result = await this.pool.query<CategoryRow>(
      `SELECT category_id, name, description, publication_status,
              created_at, updated_at, archived_at
         FROM categories WHERE category_id = $1`,
      [categoryId],
    );
    return result.rows[0] === undefined ? null : mapCategory(result.rows[0]);
  }

  async findCollection(collectionId: string): Promise<CatalogCollectionDetail | null> {
    const result = await this.pool.query<CollectionRow>(
      `SELECT collection_id, game_id, name, description, publication_status,
              created_at, updated_at, archived_at
         FROM collections WHERE collection_id = $1`,
      [collectionId],
    );
    return result.rows[0] === undefined ? null : mapCollection(result.rows[0]);
  }

  async findProduct(productId: string): Promise<CatalogProductDetail | null> {
    const result = await this.pool.query<ProductRow>(
      `SELECT product_id, sku, game_id, category_id, collection_id, name, description,
              language, edition, condition, sale_type, price_amount_clp,
              publication_status, created_at, updated_at, archived_at
         FROM products WHERE product_id = $1`,
      [productId],
    );
    return result.rows[0] === undefined ? null : mapProduct(result.rows[0]);
  }

  async listGames(input: CatalogEntityListInput): Promise<CatalogEntityPage<CatalogGameDetail>> {
    const rows = await this.listRows<GameRow>(
      `game_id, name, slug, description, publication_status, created_at, updated_at, archived_at`,
      'tcg_games',
      'game_id',
      input,
    );
    return mapPage(rows, input.limit, mapGame);
  }

  async listCategories(
    input: CatalogEntityListInput,
  ): Promise<CatalogEntityPage<CatalogCategoryDetail>> {
    const rows = await this.listRows<CategoryRow>(
      `category_id, name, description, publication_status, created_at, updated_at, archived_at`,
      'categories',
      'category_id',
      input,
    );
    return mapPage(rows, input.limit, mapCategory);
  }

  async listCollections(
    input: CatalogEntityListInput & { readonly gameId?: string },
  ): Promise<CatalogEntityPage<CatalogCollectionDetail>> {
    const rows = await this.listRows<CollectionRow>(
      `collection_id, game_id, name, description, publication_status,
       created_at, updated_at, archived_at`,
      'collections',
      'collection_id',
      input,
      input.gameId === undefined ? [] : [['game_id', input.gameId]],
    );
    return mapPage(rows, input.limit, mapCollection);
  }

  async listProducts(
    input: CatalogEntityListInput & {
      readonly categoryId?: string;
      readonly collectionId?: string;
      readonly gameId?: string;
    },
  ): Promise<CatalogEntityPage<CatalogProductDetail>> {
    const filters: [string, string][] = [];
    if (input.gameId !== undefined) filters.push(['game_id', input.gameId]);
    if (input.categoryId !== undefined) filters.push(['category_id', input.categoryId]);
    if (input.collectionId !== undefined) filters.push(['collection_id', input.collectionId]);
    const rows = await this.listRows<ProductRow>(
      `product_id, sku, game_id, category_id, collection_id, name, description,
       language, edition, condition, sale_type, price_amount_clp,
       publication_status, created_at, updated_at, archived_at`,
      'products',
      'product_id',
      input,
      filters,
    );
    return mapPage(rows, input.limit, mapProduct);
  }

  async findEntity(type: CatalogEntityType, id: string): Promise<CatalogEntityView | null> {
    const descriptor = entityTables[type];
    const result = await this.pool.query<{ publication_status: PublicationStatus }>(
      `SELECT publication_status FROM ${descriptor.table} WHERE ${descriptor.id} = $1`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : { id, publicationStatus: row.publication_status };
  }

  async findResource(resourceId: string): Promise<CatalogResourceView | null> {
    const result = await this.pool.query<{
      resource_id: string;
      original_filename_safe: string;
      secure_storage_key: string;
      state: CatalogResourceView['state'];
    }>(
      `SELECT resource_id, original_filename_safe, secure_storage_key, state
         FROM resource_assets WHERE resource_id = $1`,
      [resourceId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          resourceId: row.resource_id,
          originalFilenameSafe: row.original_filename_safe,
          secureStorageKey: row.secure_storage_key,
          state: row.state,
        };
  }

  async findAssociatedResource(
    entityType: Parameters<CatalogRepository['findAssociatedResource']>[0],
    entityId: string,
    resourceId: string,
  ): Promise<CatalogAssociatedResourceView | null> {
    const descriptor = mediaTable(entityType);
    const result = await this.pool.query<AssociatedResourceRow>(
      `${associatedResourceSelect(descriptor)}
        WHERE ${descriptor.ownerPredicate(1)} AND r.resource_id = $${descriptor.parameterCount + 1}`,
      [...descriptor.ownerValues(entityType, entityId), resourceId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapAssociatedResource(row);
  }

  async findReplacementResource(
    entityType: Parameters<CatalogRepository['findReplacementResource']>[0],
    entityId: string,
    replacedResourceId: string,
  ): Promise<CatalogAssociatedResourceView | null> {
    const descriptor = mediaTable(entityType);
    const result = await this.pool.query<AssociatedResourceRow>(
      `${associatedResourceSelect(descriptor)}
        WHERE ${descriptor.ownerPredicate(1, 'm')}
          AND r.replaced_resource_id = $${descriptor.parameterCount + 1}
          AND r.state = 'ACTIVE'`,
      [...descriptor.ownerValues(entityType, entityId), replacedResourceId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapAssociatedResource(row);
  }

  async listAssociatedResources(
    input: Parameters<CatalogRepository['listAssociatedResources']>[0],
  ): Promise<CatalogResourcePage> {
    const descriptor = mediaTable(input.entityType);
    return this.#transactions.execute(async (transaction) => {
      await transaction.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await ensureEntityExists(transaction, input.entityType, input.entityId);
      const values: unknown[] = [...descriptor.ownerValues(input.entityType, input.entityId)];
      const clauses = [descriptor.ownerPredicate(1)];
      if (input.cursor !== undefined) {
        values.push(input.cursor.position, input.cursor.resourceId);
        clauses.push(
          `(r.position, r.resource_id) > ($${values.length - 1}::integer, $${values.length}::uuid)`,
        );
      }
      values.push(input.limit + 1);
      const page = await transaction.query<AssociatedResourceRow>(
        `${associatedResourceSelect(descriptor)}
          WHERE ${clauses.join(' AND ')}
          ORDER BY r.position ASC, r.resource_id ASC
          LIMIT $${values.length}`,
        values,
      );
      const etagRows = await lockedEtagRows(transaction, input.entityType, input.entityId, false);
      return {
        etag: resourceEtag(input.entityType, input.entityId, etagRows),
        hasMore: page.rows.length > input.limit,
        items: page.rows.slice(0, input.limit).map(mapAssociatedResource),
      };
    });
  }

  async listResourcesForReconciliation(): Promise<readonly CatalogResourceReconciliationView[]> {
    const result = await this.pool.query<{
      original_filename_safe: string;
      resource_id: string;
      secure_storage_key: string;
      sha256_hex: string | null;
      state: CatalogResourceReconciliationView['state'];
    }>(
      `SELECT resource_id, original_filename_safe, secure_storage_key, sha256_hex, state
         FROM resource_assets ORDER BY uploaded_at, resource_id`,
    );
    return result.rows.map((row) => ({
      originalFilenameSafe: row.original_filename_safe,
      resourceId: row.resource_id,
      secureStorageKey: row.secure_storage_key,
      sha256Hex: row.sha256_hex,
      state: row.state,
    }));
  }

  async reorderAssociatedResources(
    input: Parameters<CatalogRepository['reorderAssociatedResources']>[0],
  ) {
    return this.idempotent(
      'CATALOG_REORDER_RESOURCES',
      input,
      async (transaction) => {
        await lockEntity(transaction, input.entityType, input.entityId);
        const current = await lockedEtagRows(transaction, input.entityType, input.entityId, true);
        const etag = resourceEtag(input.entityType, input.entityId, current);
        if (etag !== input.expectedEtag) {
          throw new CatalogError(
            'CATALOG_RESOURCE_PRECONDITION_FAILED',
            'CONFLICT',
            'Catalog resource ordering changed.',
          );
        }
        if (
          current.length !== input.orderedResourceIds.length ||
          current.some((row) => !input.orderedResourceIds.includes(row.resourceId))
        ) {
          throw new CatalogError(
            'CATALOG_RESOURCE_ORDER_INVALID',
            'VALIDATION',
            'Resource order must contain every active associated resource exactly once.',
          );
        }
        for (const [index, resourceId] of input.orderedResourceIds.entries()) {
          await transaction.query(
            `UPDATE resource_assets SET position = $2
              WHERE resource_id = $1 AND state = 'ACTIVE'`,
            [resourceId, index + 1],
          );
        }
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCES_REORDERED',
          input.entityType,
          input.entityId,
        );
        return input.entityId;
      },
      (_reference, replayed) => ({ replayed }),
    );
  }

  async selectPrimaryResource(input: Parameters<CatalogRepository['selectPrimaryResource']>[0]) {
    return this.idempotent(
      'CATALOG_SELECT_PRIMARY_RESOURCE',
      input,
      async (transaction) => {
        await lockEntity(transaction, input.entityType, input.entityId);
        const rows = await lockedEtagRows(transaction, input.entityType, input.entityId, true);
        if (!rows.some((row) => row.resourceId === input.resourceId)) {
          throw new CatalogError(
            'CATALOG_RESOURCE_NOT_FOUND',
            'NOT_FOUND',
            'Active associated resource was not found.',
          );
        }
        const descriptor = mediaTable(input.entityType);
        await transaction.query(
          `UPDATE ${descriptor.table} SET is_primary = false WHERE ${descriptor.ownerPredicate(1)}`,
          descriptor.ownerValues(input.entityType, input.entityId),
        );
        const parameters = [
          ...descriptor.ownerValues(input.entityType, input.entityId),
          input.resourceId,
        ];
        const selected = await transaction.query(
          `UPDATE ${descriptor.table} m SET is_primary = true
            FROM resource_assets r
            WHERE ${descriptor.ownerPredicate(1, 'm')} AND m.resource_id = $${parameters.length}
              AND r.resource_id = m.resource_id AND r.state = 'ACTIVE'`,
          parameters,
        );
        if (selected.rowCount !== 1) throw resourceStateConflict();
        await this.audit(
          transaction,
          input.context,
          'CATALOG_PRIMARY_RESOURCE_SELECTED',
          input.entityType,
          input.entityId,
        );
        return input.resourceId;
      },
      (resourceId, replayed) => ({ replayed, resourceId }),
    );
  }

  async retireAssociatedResource(
    input: Parameters<CatalogRepository['retireAssociatedResource']>[0],
  ) {
    return this.idempotent(
      'CATALOG_RETIRE_ASSOCIATED_RESOURCE',
      input,
      async (transaction, now) => {
        const entity = await lockEntity(transaction, input.entityType, input.entityId);
        const current = await lockAssociatedResource(
          transaction,
          input.entityType,
          input.entityId,
          input.resourceId,
        );
        if (current.state !== 'ACTIVE') throw resourceStateConflict();
        if (entity.publicationStatus === 'PUBLISHED' && current.isPrimary) {
          throw new CatalogError(
            'CATALOG_RESOURCE_PUBLICATION_CONFLICT',
            'CONFLICT',
            'Published catalog entity must retain an active primary resource.',
          );
        }
        if (current.isPrimary) {
          const descriptor = mediaTable(input.entityType);
          await transaction.query(
            `UPDATE ${descriptor.table} SET is_primary = false WHERE media_id = $1`,
            [current.mediaId],
          );
        }
        const removed = await transaction.query(
          `UPDATE resource_assets
              SET state = 'REMOVED', retired_by = $2, retired_at = $3
            WHERE resource_id = $1 AND state = 'ACTIVE'`,
          [input.resourceId, requiredActor(input.context), now],
        );
        if (removed.rowCount !== 1) throw resourceStateConflict();
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCE_REMOVED',
          'RESOURCE_ASSET',
          input.resourceId,
          input.reason,
        );
        await this.audit(
          transaction,
          input.context,
          'CATALOG_RESOURCE_ASSOCIATION_RETIRED',
          input.entityType,
          input.entityId,
          input.reason,
        );
        return input.resourceId;
      },
      (resourceId, replayed) => ({ replayed, resourceId }),
    );
  }

  async recordResourceFailure(
    input: Parameters<CatalogRepository['recordResourceFailure']>[0],
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_entries (
         audit_entry_id, actor_id, actor_type, action, resource_type, resource_id,
         result, reason, correlation_id, causation_id, idempotency_key, occurred_at
       ) VALUES ($1, $2, $3, 'CATALOG_RESOURCE_OPERATION_FAILED', 'RESOURCE_ASSET', $4,
                 'FAILURE', $5, $6, $7, $8, $9)`,
      [
        this.uuids.generate(),
        input.context.actorId ?? null,
        input.context.actorType,
        input.resourceId,
        `${input.stage}:${input.errorCode}`,
        input.context.correlationId,
        input.context.causationId ?? null,
        input.context.idempotencyKey ?? null,
        this.clock.now(),
      ],
    );
  }

  private async listRows<Row extends QueryResultRow>(
    select: string,
    table: string,
    idColumn: string,
    input: CatalogEntityListInput,
    exactFilters: readonly (readonly [string, string])[] = [],
  ): Promise<readonly Row[]> {
    const clauses: string[] = [];
    const parameters: unknown[] = [];
    if (input.publicationStatus !== undefined) {
      parameters.push(input.publicationStatus);
      clauses.push(`publication_status = $${parameters.length}`);
    }
    for (const [column, value] of exactFilters) {
      parameters.push(value);
      clauses.push(`${column} = $${parameters.length}::uuid`);
    }
    if (input.cursor !== undefined) {
      parameters.push(input.cursor.createdAt, input.cursor.id);
      clauses.push(
        `(created_at, ${idColumn}) < ($${parameters.length - 1}, $${parameters.length}::uuid)`,
      );
    }
    parameters.push(input.limit + 1);
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const result = await this.pool.query<Row>(
      `SELECT ${select} FROM ${table} ${where}
        ORDER BY created_at DESC, ${idColumn} DESC LIMIT $${parameters.length}`,
      parameters,
    );
    return result.rows;
  }

  private async handlePublishedDescendants(
    transaction: PgTransaction,
    input: Parameters<CatalogRepository['transitionEntity']>[0],
    now: Date,
  ): Promise<void> {
    if (input.entityType === 'PRODUCT') {
      await this.unpublishProductCampaigns(transaction, [input.entityId], input.context, now);
      return;
    }
    const clauses: readonly {
      id: string;
      table: string;
      where: string;
      type: CatalogEntityType;
    }[] =
      input.entityType === 'TCG_GAME'
        ? [
            { id: 'product_id', table: 'products', type: 'PRODUCT', where: 'game_id = $1' },
            {
              id: 'collection_id',
              table: 'collections',
              type: 'COLLECTION',
              where: 'game_id = $1',
            },
          ]
        : input.entityType === 'CATEGORY'
          ? [{ id: 'product_id', table: 'products', type: 'PRODUCT', where: 'category_id = $1' }]
          : input.entityType === 'COLLECTION'
            ? [
                {
                  id: 'product_id',
                  table: 'products',
                  type: 'PRODUCT',
                  where: 'collection_id = $1',
                },
              ]
            : [];

    const locked: Array<{
      readonly clause: (typeof clauses)[number];
      readonly descendants: readonly { readonly id: string }[];
    }> = [];
    for (const clause of clauses) {
      const descendants = await transaction.query<{ id: string }>(
        `SELECT ${clause.id} AS id FROM ${clause.table}
          WHERE ${clause.where} AND publication_status = 'PUBLISHED' FOR UPDATE`,
        [input.entityId],
      );
      if (descendants.rowCount !== 0) locked.push({ clause, descendants: descendants.rows });
    }
    if (locked.length === 0) {
      if (input.descendantStrategy !== undefined) {
        throw new CatalogError(
          'CATALOG_DESCENDANT_STRATEGY_NOT_APPLICABLE',
          'VALIDATION',
          'Descendant strategy is not applicable without published descendants.',
        );
      }
      return;
    }
    if (input.descendantStrategy !== 'UNPUBLISH') {
      throw new CatalogError(
        'CATALOG_PUBLISHED_DESCENDANTS',
        'CONFLICT',
        'Published descendants require explicit atomic unpublication.',
      );
    }
    for (const { clause, descendants } of locked) {
      await transaction.query(
        `UPDATE ${clause.table} SET publication_status = 'UNPUBLISHED', updated_at = $2
          WHERE ${clause.where} AND publication_status = 'PUBLISHED'`,
        [input.entityId, now],
      );
      for (const descendant of descendants) {
        await this.audit(
          transaction,
          input.context,
          'CATALOG_UNPUBLISHED',
          clause.type,
          descendant.id,
          'PARENT_TRANSITION',
        );
      }
      if (clause.type === 'PRODUCT') {
        await this.unpublishProductCampaigns(
          transaction,
          descendants.map((descendant) => descendant.id),
          input.context,
          now,
        );
      }
    }
  }

  private async unpublishProductCampaigns(
    transaction: PgTransaction,
    productIds: readonly string[],
    context: ExecutionContext,
    now: Date,
  ): Promise<void> {
    if (productIds.length === 0) return;
    const campaigns = await transaction.query<{ preorder_campaign_id: string }>(
      `SELECT preorder_campaign_id FROM preorder_campaigns
       WHERE product_id=ANY($1::uuid[]) AND publication_status='PUBLISHED'
       ORDER BY preorder_campaign_id FOR UPDATE`,
      [productIds],
    );
    for (const campaign of campaigns.rows) {
      await transaction.query(
        `UPDATE preorder_campaigns SET publication_status='UNPUBLISHED',unpublished_at=$2,
         version=version+1,updated_at=$2 WHERE preorder_campaign_id=$1`,
        [campaign.preorder_campaign_id, now],
      );
      await transaction.query(
        `INSERT INTO preorder_campaign_state_history (
          history_id,campaign_id,dimension,from_value,to_value,actor_id,reason,
          correlation_id,occurred_at
        ) VALUES ($1,$2,'PUBLICATION','PUBLISHED','UNPUBLISHED',$3,'PRODUCT_TRANSITION',$4,$5)`,
        [
          this.uuids.generate(),
          campaign.preorder_campaign_id,
          context.actorId ?? null,
          context.correlationId,
          now,
        ],
      );
      await this.audit(
        transaction,
        context,
        'PREORDER_CAMPAIGN_UNPUBLISHED',
        'PREORDER_CAMPAIGN',
        campaign.preorder_campaign_id,
        'PRODUCT_TRANSITION',
      );
    }
  }

  private async idempotent<Result>(
    scope: string,
    input: {
      readonly context: ExecutionContext;
      readonly idempotencyKey: string;
      readonly requestFingerprint?: string;
    },
    operation: (transaction: PgTransaction, now: Date) => Promise<string>,
    map: (reference: string, replayed: boolean) => Result,
  ): Promise<Result> {
    try {
      return await this.#transactions.execute(async (transaction) => {
        const now = this.clock.now();
        const fingerprint = input.requestFingerprint ?? hashCanonical(idempotencyPayload(input));
        const recordId = this.uuids.generate();
        const inserted = await transaction.query(
          `INSERT INTO idempotency_records (
             idempotency_record_id, scope, idempotency_key, fingerprint, status, attempts,
             processing_started_at, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, 'PROCESSING', 1, $5, $5, $5)
           ON CONFLICT (scope, idempotency_key) DO NOTHING`,
          [recordId, scope, input.idempotencyKey, fingerprint, now],
        );
        if (inserted.rowCount === 0) {
          const existing = await transaction.query<{
            fingerprint: string;
            result_reference: string | null;
            status: string;
          }>(
            `SELECT fingerprint, result_reference, status FROM idempotency_records
              WHERE scope = $1 AND idempotency_key = $2 FOR UPDATE`,
            [scope, input.idempotencyKey],
          );
          const row = existing.rows[0];
          if (row === undefined || row.fingerprint !== fingerprint) {
            throw new CatalogError(
              'CATALOG_IDEMPOTENCY_CONFLICT',
              'CONFLICT',
              'Idempotency key was reused with different input.',
            );
          }
          if (row.status === 'COMPLETED' && row.result_reference !== null) {
            return map(row.result_reference, true);
          }
          throw new CatalogError(
            'CATALOG_IDEMPOTENCY_IN_PROGRESS',
            'CONFLICT',
            'Catalog command with this idempotency key is still in progress.',
          );
        }
        const reference = await operation(transaction, now);
        await transaction.query(
          `UPDATE idempotency_records
              SET status = 'COMPLETED', result_reference = $2, completed_at = $3,
                  source_type = $4, source_id = $2, updated_at = $3, lease_expires_at = NULL
            WHERE idempotency_record_id = $1`,
          [recordId, reference, now, scope],
        );
        return map(reference, false);
      });
    } catch (error) {
      throw mapPostgresError(error);
    }
  }

  private async audit(
    transaction: PgTransaction,
    context: ExecutionContext,
    action: string,
    resourceType: string,
    resourceId: string,
    reason?: string,
  ): Promise<void> {
    await transaction.query(
      `INSERT INTO audit_entries (
         audit_entry_id, actor_id, actor_type, action, resource_type, resource_id,
         result, reason, correlation_id, causation_id, idempotency_key, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'SUCCESS', $7, $8, $9, $10, $11)`,
      [
        this.uuids.generate(),
        context.actorId ?? null,
        context.actorType,
        action,
        resourceType,
        resourceId,
        reason ?? null,
        context.correlationId,
        context.causationId ?? null,
        context.idempotencyKey ?? null,
        this.clock.now(),
      ],
    );
  }
}

function requiredActor(context: ExecutionContext): string {
  if (context.actorId === undefined) {
    throw new CatalogError('CATALOG_ADMIN_REQUIRED', 'VALIDATION', 'Catalog actor is required.');
  }
  return context.actorId;
}

interface CatalogBaseRow {
  readonly archived_at: Date | null;
  readonly created_at: Date;
  readonly description: string | null;
  readonly name: string;
  readonly publication_status: PublicationStatus;
  readonly updated_at: Date;
}

interface GameRow extends CatalogBaseRow, QueryResultRow {
  readonly game_id: string;
  readonly slug: string;
}

interface CategoryRow extends CatalogBaseRow, QueryResultRow {
  readonly category_id: string;
}

interface CollectionRow extends CatalogBaseRow, QueryResultRow {
  readonly collection_id: string;
  readonly game_id: string;
}

interface ProductRow extends CatalogBaseRow, QueryResultRow {
  readonly category_id: string;
  readonly collection_id: string | null;
  readonly condition: string | null;
  readonly edition: string | null;
  readonly game_id: string;
  readonly language: string | null;
  readonly price_amount_clp: string;
  readonly product_id: string;
  readonly sale_type: CatalogProductDetail['saleType'];
  readonly sku: string;
}

interface AssociatedResourceRow extends QueryResultRow {
  readonly alt_text: string;
  readonly byte_size: string;
  readonly height_px: number;
  readonly is_primary: boolean;
  readonly media_id: string;
  readonly mime_type_real: CatalogAssociatedResourceView['mimeTypeReal'];
  readonly original_filename_safe: string;
  readonly position: number;
  readonly replaced_resource_id: string | null;
  readonly resource_id: string;
  readonly retired_at: Date | null;
  readonly retired_by: string | null;
  readonly sha256_hex: string;
  readonly state: CatalogAssociatedResourceView['state'];
  readonly uploaded_at: Date;
  readonly uploaded_by: string;
  readonly validated_at: Date;
  readonly width_px: number;
}

interface MediaDescriptor {
  readonly ownerPredicate: (start: number, alias?: string) => string;
  readonly ownerValues: (type: CatalogEntityType, id: string) => readonly string[];
  readonly parameterCount: number;
  readonly table: 'catalog_entity_media' | 'product_media';
}

interface LockedAssociatedResource {
  readonly isPrimary: boolean;
  readonly mediaId: string;
  readonly position: number;
  readonly resourceId: string;
  readonly state: CatalogAssociatedResourceView['state'];
}

function mediaTable(entityType: CatalogEntityType): MediaDescriptor {
  if (entityType === 'PRODUCT') {
    return {
      ownerPredicate: (start, alias = '') => `${qualified(alias, 'product_id')} = $${start}`,
      ownerValues: (_type, id) => [id],
      parameterCount: 1,
      table: 'product_media',
    };
  }
  return {
    ownerPredicate: (start, alias = '') =>
      `${qualified(alias, 'source_type')} = $${start} AND ${qualified(alias, 'source_id')} = $${start + 1}`,
    ownerValues: (type, id) => [type, id],
    parameterCount: 2,
    table: 'catalog_entity_media',
  };
}

function qualified(alias: string, column: string): string {
  return alias.length === 0 ? column : `${alias}.${column}`;
}

function associatedResourceSelect(descriptor: MediaDescriptor): string {
  return `SELECT m.media_id, r.resource_id, r.original_filename_safe, r.mime_type_real,
                 r.byte_size, r.width_px, r.height_px, r.sha256_hex, r.alt_text,
                 r.position, r.state, m.is_primary, r.uploaded_by, r.uploaded_at,
                 r.validated_at, r.replaced_resource_id, r.retired_by, r.retired_at
            FROM ${descriptor.table} m
            JOIN resource_assets r ON r.resource_id = m.resource_id`;
}

function mapAssociatedResource(row: AssociatedResourceRow): CatalogAssociatedResourceView {
  const byteSize = Number(row.byte_size);
  if (!Number.isSafeInteger(byteSize)) {
    throw new CatalogError(
      'CATALOG_RESOURCE_SIZE_OUT_OF_RANGE',
      'INFRASTRUCTURE',
      'Catalog resource size cannot be represented safely.',
    );
  }
  return {
    altText: row.alt_text,
    byteSize,
    heightPx: row.height_px,
    isPrimary: row.is_primary,
    mimeTypeReal: row.mime_type_real,
    originalFilenameSafe: row.original_filename_safe,
    position: row.position,
    replacedResourceId: row.replaced_resource_id,
    resourceId: row.resource_id,
    retiredAt: row.retired_at,
    retiredBy: row.retired_by,
    sha256Hex: row.sha256_hex,
    state: row.state,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    validatedAt: row.validated_at,
    widthPx: row.width_px,
  };
}

async function ensureEntityExists(
  transaction: PgTransaction,
  entityType: CatalogEntityType,
  entityId: string,
): Promise<void> {
  const descriptor = entityTables[entityType];
  const result = await transaction.query(
    `SELECT ${descriptor.id} FROM ${descriptor.table} WHERE ${descriptor.id} = $1`,
    [entityId],
  );
  if (result.rowCount !== 1) throw entityNotFound();
}

async function lockEntity(
  transaction: PgTransaction,
  entityType: CatalogEntityType,
  entityId: string,
): Promise<{ readonly publicationStatus: PublicationStatus }> {
  const descriptor = entityTables[entityType];
  const result = await transaction.query<{ publication_status: PublicationStatus }>(
    `SELECT publication_status FROM ${descriptor.table}
      WHERE ${descriptor.id} = $1 FOR UPDATE`,
    [entityId],
  );
  const publicationStatus = result.rows[0]?.publication_status;
  if (publicationStatus === undefined) throw entityNotFound();
  return { publicationStatus };
}

async function activateQuarantined(
  transaction: PgTransaction,
  resourceId: string,
  descriptor: ValidatedResourceDescriptor,
  now: Date,
  position?: number,
  replacedResourceId?: string,
): Promise<void> {
  const result = await transaction.query(
    `UPDATE resource_assets
        SET mime_type_real = $2, byte_size = $3, width_px = $4, height_px = $5,
            sha256_hex = $6, validated_at = $7, state = 'ACTIVE',
            position = COALESCE($8, position), replaced_resource_id = $9
      WHERE resource_id = $1 AND state = 'QUARANTINED'
        AND secure_storage_key = $10 AND original_filename_safe = $11`,
    [
      resourceId,
      descriptor.mimeTypeReal,
      descriptor.byteSize,
      descriptor.widthPx,
      descriptor.heightPx,
      descriptor.sha256Hex,
      now,
      position ?? null,
      replacedResourceId ?? null,
      descriptor.secureStorageKey,
      descriptor.originalFilenameSafe,
    ],
  );
  if (result.rowCount !== 1) throw resourceStateConflict();
}

async function insertMedia(
  transaction: PgTransaction,
  entityType: CatalogEntityType,
  entityId: string,
  resourceId: string,
  mediaId: string,
  now: Date,
): Promise<void> {
  if (entityType === 'PRODUCT') {
    await transaction.query(
      `INSERT INTO product_media (media_id, product_id, resource_id, is_primary, created_at)
       VALUES ($1, $2, $3, false, $4)`,
      [mediaId, entityId, resourceId, now],
    );
    return;
  }
  await transaction.query(
    `INSERT INTO catalog_entity_media
       (media_id, source_type, source_id, resource_id, is_primary, created_at)
     VALUES ($1, $2, $3, $4, false, $5)`,
    [mediaId, entityType, entityId, resourceId, now],
  );
}

async function updateMediaResource(
  transaction: PgTransaction,
  entityType: CatalogEntityType,
  mediaId: string,
  resourceId: string,
): Promise<void> {
  const descriptor = mediaTable(entityType);
  const result = await transaction.query(
    `UPDATE ${descriptor.table} SET resource_id = $2 WHERE media_id = $1`,
    [mediaId, resourceId],
  );
  if (result.rowCount !== 1) throw resourceStateConflict();
}

async function lockAssociatedResource(
  transaction: PgTransaction,
  entityType: CatalogEntityType,
  entityId: string,
  resourceId: string,
): Promise<LockedAssociatedResource> {
  const descriptor = mediaTable(entityType);
  const parameters = [...descriptor.ownerValues(entityType, entityId), resourceId];
  const result = await transaction.query<AssociatedResourceRow>(
    `${associatedResourceSelect(descriptor)}
      WHERE ${descriptor.ownerPredicate(1, 'm')} AND r.resource_id = $${parameters.length}
      FOR UPDATE OF m, r`,
    parameters,
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new CatalogError(
      'CATALOG_RESOURCE_NOT_FOUND',
      'NOT_FOUND',
      'Associated resource was not found.',
    );
  }
  return {
    isPrimary: row.is_primary,
    mediaId: row.media_id,
    position: row.position,
    resourceId: row.resource_id,
    state: row.state,
  };
}

async function lockedEtagRows(
  transaction: PgTransaction,
  entityType: CatalogEntityType,
  entityId: string,
  lock: boolean,
): Promise<readonly LockedAssociatedResource[]> {
  const descriptor = mediaTable(entityType);
  const result = await transaction.query<AssociatedResourceRow>(
    `${associatedResourceSelect(descriptor)}
      WHERE ${descriptor.ownerPredicate(1, 'm')} AND r.state = 'ACTIVE'
      ORDER BY r.position ASC, r.resource_id ASC${lock ? ' FOR UPDATE OF m, r' : ''}`,
    descriptor.ownerValues(entityType, entityId),
  );
  return result.rows.map((row) => ({
    isPrimary: row.is_primary,
    mediaId: row.media_id,
    position: row.position,
    resourceId: row.resource_id,
    state: row.state,
  }));
}

function resourceEtag(
  entityType: CatalogEntityType,
  entityId: string,
  rows: readonly LockedAssociatedResource[],
): string {
  const digest = createHash('sha256')
    .update(
      stableJson({
        entityId,
        entityType,
        resources: rows.map((row) => ({
          isPrimary: row.isPrimary,
          position: row.position,
          resourceId: row.resourceId,
          state: row.state,
        })),
      }),
    )
    .digest('base64url');
  return `"${digest}"`;
}

function resourceStateConflict(): CatalogError {
  return new CatalogError(
    'CATALOG_RESOURCE_STATE_CONFLICT',
    'CONFLICT',
    'Catalog resource state changed or is not eligible for this operation.',
  );
}

function mapBase(row: CatalogBaseRow) {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    description: row.description,
    name: row.name,
    publicationStatus: row.publication_status,
    updatedAt: row.updated_at,
  };
}

function mapGame(row: GameRow): CatalogGameDetail {
  return { ...mapBase(row), gameId: row.game_id, slug: row.slug };
}

function mapCategory(row: CategoryRow): CatalogCategoryDetail {
  return { ...mapBase(row), categoryId: row.category_id };
}

function mapCollection(row: CollectionRow): CatalogCollectionDetail {
  return { ...mapBase(row), collectionId: row.collection_id, gameId: row.game_id };
}

function mapProduct(row: ProductRow): CatalogProductDetail {
  const priceAmountClp = Number(row.price_amount_clp);
  if (!Number.isSafeInteger(priceAmountClp)) {
    throw new CatalogError(
      'CATALOG_PRICE_OUT_OF_RANGE',
      'INFRASTRUCTURE',
      'Catalog price cannot be represented safely.',
    );
  }
  return {
    ...mapBase(row),
    categoryId: row.category_id,
    collectionId: row.collection_id,
    condition: row.condition,
    edition: row.edition,
    gameId: row.game_id,
    language: row.language,
    priceAmountClp,
    productId: row.product_id,
    saleType: row.sale_type,
    sku: row.sku,
  };
}

function mapPage<Row, Item>(
  rows: readonly Row[],
  limit: number,
  map: (row: Row) => Item,
): CatalogEntityPage<Item> {
  return { hasMore: rows.length > limit, items: rows.slice(0, limit).map(map) };
}

function entityNotFound(): CatalogError {
  return new CatalogError('CATALOG_ENTITY_NOT_FOUND', 'NOT_FOUND', 'Catalog entity was not found.');
}

function idempotencyPayload(input: {
  readonly context: ExecutionContext;
  readonly idempotencyKey: string;
  readonly requestFingerprint?: string;
}): unknown {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => !['context', 'idempotencyKey', 'requestFingerprint'].includes(key),
    ),
  );
}

function hashCanonical(input: unknown): string {
  return createHash('sha256').update(stableJson(input)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`;
}

function mapPostgresError(error: unknown): unknown {
  if (error instanceof CatalogError) return error;
  if (typeof error !== 'object' || error === null || !('code' in error)) return error;
  const code = String(error.code);
  if (code === '23505') {
    return new CatalogError('CATALOG_UNIQUE_CONFLICT', 'CONFLICT', 'Catalog uniqueness conflict.', {
      cause: error,
    });
  }
  if (code === '23503') {
    return new CatalogError(
      'CATALOG_REFERENCE_NOT_FOUND',
      'NOT_FOUND',
      'Catalog reference is missing.',
      {
        cause: error,
      },
    );
  }
  if (code === '23514' || code === '55000') {
    return new CatalogError(
      'CATALOG_INVARIANT_VIOLATION',
      'CONFLICT',
      'Catalog persistence invariant was rejected.',
      { cause: error },
    );
  }
  return error;
}
