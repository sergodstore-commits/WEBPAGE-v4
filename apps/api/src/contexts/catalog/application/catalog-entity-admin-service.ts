import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  CreateCategory,
  CreateCollection,
  CreateProduct,
  CreateTcgGame,
  EditCategory,
  EditCollection,
  EditProduct,
  EditTcgGame,
  ParentPublicationTransition,
  ProductPublicationTransition,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import {
  assertPublicationTransition,
  CatalogError,
  normalizeCatalogNullableText,
  normalizeCatalogRequiredText,
  normalizeProductInput,
  normalizeProductPatch,
  type CatalogEntityType,
  type NormalizedProductInput,
  type PublicationStatus,
} from '../domain/catalog.js';
import type {
  CatalogAdminAuthorizer,
  CatalogCategoryDetail,
  CatalogCollectionDetail,
  CatalogEntityListInput,
  CatalogEntityPage,
  CatalogGameDetail,
  CatalogProductDetail,
  CatalogRepository,
} from './ports.js';

type ListResult<Item> = { readonly items: readonly Item[]; readonly nextCursor: string | null };
type AdminListInput = Record<string, unknown> & {
  readonly cursor?: string | undefined;
  readonly limit: number;
  readonly publicationStatus?: PublicationStatus | undefined;
};

export class CatalogEntityAdminService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly authorizer: CatalogAdminAuthorizer,
  ) {}

  async listGames(
    context: ExecutionContext,
    input: {
      readonly cursor?: string | undefined;
      readonly limit: number;
      readonly publicationStatus?: PublicationStatus | undefined;
    },
  ): Promise<ListResult<CatalogGameDetail>> {
    await this.authorize(context);
    return this.list('TCG_GAME', input, (query) => this.repository.listGames(query));
  }

  async listCategories(
    context: ExecutionContext,
    input: {
      readonly cursor?: string | undefined;
      readonly limit: number;
      readonly publicationStatus?: PublicationStatus | undefined;
    },
  ): Promise<ListResult<CatalogCategoryDetail>> {
    await this.authorize(context);
    return this.list('CATEGORY', input, (query) => this.repository.listCategories(query));
  }

  async listCollections(
    context: ExecutionContext,
    input: {
      readonly cursor?: string | undefined;
      readonly gameId?: string | undefined;
      readonly limit: number;
      readonly publicationStatus?: PublicationStatus | undefined;
    },
  ): Promise<ListResult<CatalogCollectionDetail>> {
    await this.authorize(context);
    return this.list('COLLECTION', input, (query) => this.repository.listCollections(query));
  }

  async listProducts(
    context: ExecutionContext,
    input: {
      readonly categoryId?: string | undefined;
      readonly collectionId?: string | undefined;
      readonly cursor?: string | undefined;
      readonly gameId?: string | undefined;
      readonly limit: number;
      readonly publicationStatus?: PublicationStatus | undefined;
    },
  ): Promise<ListResult<CatalogProductDetail>> {
    await this.authorize(context);
    return this.list('PRODUCT', input, (query) => this.repository.listProducts(query));
  }

  async getGame(context: ExecutionContext, gameId: string): Promise<CatalogGameDetail> {
    await this.authorize(context);
    return requiredEntity(await this.repository.findGame(gameId));
  }

  async getCategory(context: ExecutionContext, categoryId: string): Promise<CatalogCategoryDetail> {
    await this.authorize(context);
    return requiredEntity(await this.repository.findCategory(categoryId));
  }

  async getCollection(
    context: ExecutionContext,
    collectionId: string,
  ): Promise<CatalogCollectionDetail> {
    await this.authorize(context);
    return requiredEntity(await this.repository.findCollection(collectionId));
  }

  async getProduct(context: ExecutionContext, productId: string): Promise<CatalogProductDetail> {
    await this.authorize(context);
    return requiredEntity(await this.repository.findProduct(productId));
  }

  async createGame(context: ExecutionContext, body: CreateTcgGame) {
    await this.authorizeMutation(context);
    const normalized = {
      description: normalizeCatalogNullableText(body.description),
      name: normalizeCatalogRequiredText(body.name, 'CATALOG_GAME_NAME_REQUIRED'),
      slug: normalizeCatalogRequiredText(body.slug, 'CATALOG_GAME_SLUG_REQUIRED'),
    };
    const result = await this.repository.createGame({
      ...normalized,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      requestFingerprint: mutationFingerprint(
        'POST',
        '/api/v1/admin/catalog/tcg-games',
        null,
        normalized,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findGame(result.gameId)),
      replayed: result.replayed,
    };
  }

  async createCategory(context: ExecutionContext, body: CreateCategory) {
    await this.authorizeMutation(context);
    const normalized = {
      description: normalizeCatalogNullableText(body.description),
      name: normalizeCatalogRequiredText(body.name, 'CATALOG_CATEGORY_NAME_REQUIRED'),
    };
    const result = await this.repository.createCategory({
      ...normalized,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      requestFingerprint: mutationFingerprint(
        'POST',
        '/api/v1/admin/catalog/categories',
        null,
        normalized,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findCategory(result.categoryId)),
      replayed: result.replayed,
    };
  }

  async createCollection(context: ExecutionContext, body: CreateCollection) {
    await this.authorizeMutation(context);
    const normalized = {
      description: normalizeCatalogNullableText(body.description),
      gameId: body.gameId,
      name: normalizeCatalogRequiredText(body.name, 'CATALOG_COLLECTION_NAME_REQUIRED'),
    };
    const result = await this.repository.createCollection({
      ...normalized,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      requestFingerprint: mutationFingerprint(
        'POST',
        '/api/v1/admin/catalog/collections',
        null,
        normalized,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findCollection(result.collectionId)),
      replayed: result.replayed,
    };
  }

  async createProduct(context: ExecutionContext, body: CreateProduct) {
    await this.authorizeMutation(context);
    const product = normalizeProductInput(body);
    const result = await this.repository.createProduct({
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      product,
      requestFingerprint: mutationFingerprint(
        'POST',
        '/api/v1/admin/catalog/products',
        null,
        product,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findProduct(result.productId)),
      replayed: result.replayed,
    };
  }

  async editGame(context: ExecutionContext, gameId: string, body: EditTcgGame) {
    await this.authorizeMutation(context);
    const normalized = {
      ...(body.description !== undefined
        ? { description: normalizeCatalogNullableText(body.description) }
        : {}),
      ...(body.name !== undefined
        ? { name: normalizeCatalogRequiredText(body.name, 'CATALOG_GAME_NAME_REQUIRED') }
        : {}),
    };
    const result = await this.repository.updateGame({
      ...normalized,
      context,
      gameId,
      idempotencyKey: requiredIdempotencyKey(context),
      requestFingerprint: mutationFingerprint(
        'PATCH',
        '/api/v1/admin/catalog/tcg-games/{id}',
        gameId,
        normalized,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findGame(result.gameId)),
      replayed: result.replayed,
    };
  }

  async editCategory(context: ExecutionContext, categoryId: string, body: EditCategory) {
    await this.authorizeMutation(context);
    const normalized = {
      ...(body.description !== undefined
        ? { description: normalizeCatalogNullableText(body.description) }
        : {}),
      ...(body.name !== undefined
        ? { name: normalizeCatalogRequiredText(body.name, 'CATALOG_CATEGORY_NAME_REQUIRED') }
        : {}),
    };
    const result = await this.repository.updateCategory({
      ...normalized,
      categoryId,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      requestFingerprint: mutationFingerprint(
        'PATCH',
        '/api/v1/admin/catalog/categories/{id}',
        categoryId,
        normalized,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findCategory(result.categoryId)),
      replayed: result.replayed,
    };
  }

  async editCollection(context: ExecutionContext, collectionId: string, body: EditCollection) {
    await this.authorizeMutation(context);
    const normalized = {
      ...(body.description !== undefined
        ? { description: normalizeCatalogNullableText(body.description) }
        : {}),
      ...(body.gameId === undefined ? {} : { gameId: body.gameId }),
      ...(body.name !== undefined
        ? { name: normalizeCatalogRequiredText(body.name, 'CATALOG_COLLECTION_NAME_REQUIRED') }
        : {}),
    };
    const result = await this.repository.updateCollection({
      ...normalized,
      collectionId,
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      requestFingerprint: mutationFingerprint(
        'PATCH',
        '/api/v1/admin/catalog/collections/{id}',
        collectionId,
        normalized,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findCollection(result.collectionId)),
      replayed: result.replayed,
    };
  }

  async editProduct(context: ExecutionContext, productId: string, body: EditProduct) {
    await this.authorizeMutation(context);
    const current = requiredEntity(await this.repository.findProduct(productId));
    const product = normalizeProductPatch(
      toProductInput(current),
      compactObject(body) as Partial<NormalizedProductInput>,
    );
    const normalizedBody = changedProductFields(product, body);
    const result = await this.repository.updateProduct({
      context,
      idempotencyKey: requiredIdempotencyKey(context),
      product,
      productId,
      requestFingerprint: mutationFingerprint(
        'PATCH',
        '/api/v1/admin/catalog/products/{id}',
        productId,
        normalizedBody,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findProduct(result.productId)),
      replayed: result.replayed,
    };
  }

  async transitionParent(
    context: ExecutionContext,
    entityType: Exclude<CatalogEntityType, 'PRODUCT'>,
    entityId: string,
    body: ParentPublicationTransition,
  ) {
    await this.authorizeMutation(context);
    const current = await this.findEntity(entityType, entityId);
    assertPublicationTransition(current.publicationStatus, body.nextStatus);
    const normalizedBody = {
      ...(body.descendantStrategy === undefined
        ? {}
        : { descendantStrategy: body.descendantStrategy }),
      nextStatus: body.nextStatus,
    };
    const result = await this.repository.transitionEntity({
      context,
      ...(body.descendantStrategy === undefined
        ? {}
        : { descendantStrategy: body.descendantStrategy }),
      entityId,
      entityType,
      idempotencyKey: requiredIdempotencyKey(context),
      nextStatus: body.nextStatus,
      requestFingerprint: mutationFingerprint(
        'POST',
        `/api/v1/admin/catalog/${routeSegment(entityType)}/{id}/publication-transitions`,
        entityId,
        normalizedBody,
      ),
    });
    return {
      item: await this.getByType(entityType, result.entityId),
      replayed: result.replayed,
    };
  }

  async transitionProduct(
    context: ExecutionContext,
    productId: string,
    body: ProductPublicationTransition,
  ) {
    await this.authorizeMutation(context);
    const current = requiredEntity(await this.repository.findProduct(productId));
    assertPublicationTransition(current.publicationStatus, body.nextStatus);
    const result = await this.repository.transitionEntity({
      context,
      entityId: productId,
      entityType: 'PRODUCT',
      idempotencyKey: requiredIdempotencyKey(context),
      nextStatus: body.nextStatus,
      requestFingerprint: mutationFingerprint(
        'POST',
        '/api/v1/admin/catalog/products/{id}/publication-transitions',
        productId,
        body,
      ),
    });
    return {
      item: requiredEntity(await this.repository.findProduct(result.entityId)),
      replayed: result.replayed,
    };
  }

  private async list<Item extends { readonly createdAt: Date }>(
    kind: CatalogEntityType,
    input: AdminListInput,
    query: (
      input: CatalogEntityListInput & Record<string, unknown>,
    ) => Promise<CatalogEntityPage<Item>>,
  ): Promise<ListResult<Item>> {
    const { cursor, limit, ...rawFilters } = input;
    const normalizedFilters = compactObject(rawFilters);
    const filters = { ...normalizedFilters, limit } as CatalogEntityListInput &
      Record<string, unknown>;
    const filterHash = hashCanonical(normalizedFilters);
    const page = await query({
      ...filters,
      ...(cursor === undefined ? {} : { cursor: decodeCursor(cursor, kind, filterHash) }),
    });
    const items = page.items;
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor(kind, filterHash, last.createdAt, entityId(kind, last))
          : null,
    };
  }

  private async findEntity(type: CatalogEntityType, id: string) {
    const entity = await this.repository.findEntity(type, id);
    return requiredEntity(entity);
  }

  private async getByType(type: Exclude<CatalogEntityType, 'PRODUCT'>, id: string) {
    if (type === 'TCG_GAME') return requiredEntity(await this.repository.findGame(id));
    if (type === 'CATEGORY') return requiredEntity(await this.repository.findCategory(id));
    return requiredEntity(await this.repository.findCollection(id));
  }

  private async authorize(context: ExecutionContext): Promise<void> {
    if (context.actorType !== 'USER' || context.actorId === undefined) {
      throw new CatalogError(
        'CATALOG_ADMIN_REQUIRED',
        'VALIDATION',
        'Catalog administrator is required.',
      );
    }
    await this.authorizer.assertCanManageCatalog(context);
  }

  private async authorizeMutation(context: ExecutionContext): Promise<void> {
    await this.authorize(context);
    requiredIdempotencyKey(context);
  }
}

function requiredIdempotencyKey(context: ExecutionContext): string {
  const key = context.idempotencyKey?.trim();
  if (key === undefined || !/^[\x21-\x7e]{1,255}$/u.test(key)) {
    throw new CatalogError(
      'CATALOG_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'A valid Idempotency-Key is required.',
    );
  }
  return key;
}

function requiredEntity<Item>(item: Item | null): Item {
  if (item === null) {
    throw new CatalogError(
      'CATALOG_ENTITY_NOT_FOUND',
      'NOT_FOUND',
      'Catalog entity was not found.',
    );
  }
  return item;
}

function mutationFingerprint(
  method: string,
  normalizedRoute: string,
  targetId: string | null,
  body: unknown,
) {
  return hashCanonical({ body, method, normalizedRoute, targetId });
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
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

function encodeCursor(
  kind: CatalogEntityType,
  filterHash: string,
  createdAt: Date,
  id: string,
): string {
  const payload = Buffer.from(
    stableJson({ createdAt: createdAt.toISOString(), filterHash, id, kind, version: 1 }),
    'utf8',
  ).toString('base64url');
  const checksum = createHash('sha256')
    .update(`sergod-catalog-cursor-v1\0${payload}`)
    .digest('base64url');
  return `${payload}.${checksum}`;
}

function decodeCursor(value: string, kind: CatalogEntityType, filterHash: string) {
  try {
    const [payload, checksum, extra] = value.split('.');
    if (payload === undefined || checksum === undefined || extra !== undefined) throw new Error();
    const expected = createHash('sha256').update(`sergod-catalog-cursor-v1\0${payload}`).digest();
    const actual = Buffer.from(checksum, 'base64url');
    if (
      actual.toString('base64url') !== checksum ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      throw new Error();
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (
      parsed.version !== 1 ||
      parsed.kind !== kind ||
      parsed.filterHash !== filterHash ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(parsed.id)
    ) {
      throw new Error();
    }
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt)
      throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new CatalogError('CATALOG_CURSOR_INVALID', 'VALIDATION', 'Catalog cursor is invalid.');
  }
}

function entityId(kind: CatalogEntityType, item: object): string {
  if (kind === 'TCG_GAME') return (item as CatalogGameDetail).gameId;
  if (kind === 'CATEGORY') return (item as CatalogCategoryDetail).categoryId;
  if (kind === 'COLLECTION') return (item as CatalogCollectionDetail).collectionId;
  return (item as CatalogProductDetail).productId;
}

function routeSegment(type: Exclude<CatalogEntityType, 'PRODUCT'>): string {
  if (type === 'TCG_GAME') return 'tcg-games';
  if (type === 'CATEGORY') return 'categories';
  return 'collections';
}

function toProductInput(product: CatalogProductDetail): NormalizedProductInput {
  return {
    categoryId: product.categoryId,
    collectionId: product.collectionId,
    condition: product.condition,
    description: product.description,
    edition: product.edition,
    gameId: product.gameId,
    language: product.language,
    name: product.name,
    priceAmountClp: product.priceAmountClp,
    saleType: product.saleType,
    sku: product.sku,
  };
}

function changedProductFields(
  product: NormalizedProductInput,
  patch: EditProduct,
): Partial<NormalizedProductInput> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof NormalizedProductInput)[]) {
    if (patch[key] !== undefined) result[key] = product[key];
  }
  return result as Partial<NormalizedProductInput>;
}

function compactObject<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined),
  ) as Partial<T>;
}
