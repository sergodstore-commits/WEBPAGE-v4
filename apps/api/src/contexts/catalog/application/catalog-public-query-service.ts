import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  CatalogPublicFilterAttribute,
  CatalogPublicProductListQuery,
  CatalogPublicSort,
} from '@sergod/contracts';

import { CatalogError } from '../domain/catalog.js';
import type {
  CatalogPublicNameCursor,
  CatalogPublicProductCursor,
  CatalogPublicProductRecord,
  CatalogPublicQueryPort,
} from './catalog-public-ports.js';

export class CatalogPublicQueryService {
  constructor(private readonly repository: CatalogPublicQueryPort) {}

  async listGames(input: { readonly cursor?: string; readonly limit: number }) {
    const scope = 'TCG_GAMES';
    const fingerprint = queryFingerprint({ scope });
    const cursor = decodeNameCursor(input.cursor, scope, fingerprint);
    const page = await this.repository.listGames({
      limit: input.limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    return publicNamePage(page, scope, fingerprint);
  }

  async listCategories(input: { readonly cursor?: string; readonly limit: number }) {
    const scope = 'CATEGORIES';
    const fingerprint = queryFingerprint({ scope });
    const cursor = decodeNameCursor(input.cursor, scope, fingerprint);
    const page = await this.repository.listCategories({
      limit: input.limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    return publicNamePage(page, scope, fingerprint);
  }

  async listCollections(input: {
    readonly cursor?: string;
    readonly gameId?: string;
    readonly limit: number;
  }) {
    const scope = 'COLLECTIONS';
    const fingerprint = queryFingerprint({ gameId: input.gameId ?? null, scope });
    const cursor = decodeNameCursor(input.cursor, scope, fingerprint);
    const page = await this.repository.listCollections({
      limit: input.limit,
      ...(input.gameId === undefined ? {} : { gameId: input.gameId }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    return publicNamePage(page, scope, fingerprint);
  }

  async listProducts(input: CatalogPublicProductListQuery) {
    const normalizedQuery = input.q === undefined ? null : normalizeSearchQuery(input.q);
    const filters = {
      categoryId: input.categoryId ?? null,
      collectionId: input.collectionId ?? null,
      condition: input.condition ?? null,
      edition: input.edition ?? null,
      gameId: input.gameId ?? null,
      language: input.language ?? null,
      q: normalizedQuery,
      saleType: input.saleType ?? null,
      sort: input.sort,
    };
    const fingerprint = queryFingerprint(filters);
    const cursor = decodeProductCursor(input.cursor, input.sort, fingerprint);
    const page = await this.repository.listProducts({
      limit: input.limit,
      searchTerms: normalizedQuery === null ? [] : normalizedQuery.split(' '),
      sort: input.sort,
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
      ...(input.collectionId === undefined ? {} : { collectionId: input.collectionId }),
      ...(input.condition === undefined ? {} : { condition: input.condition }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(input.edition === undefined ? {} : { edition: input.edition }),
      ...(input.gameId === undefined ? {} : { gameId: input.gameId }),
      ...(input.language === undefined ? {} : { language: input.language }),
      ...(input.saleType === undefined ? {} : { saleType: input.saleType }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map((record) => record.item),
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeProductCursor(last, input.sort, fingerprint)
          : null,
    };
  }

  async getProduct(productId: string) {
    const item = await this.repository.findProduct(productId);
    if (item === null) {
      throw new CatalogError(
        'CATALOG_ENTITY_NOT_FOUND',
        'NOT_FOUND',
        'Public catalog product was not found.',
      );
    }
    return item;
  }

  async listFilterValues(input: {
    readonly attribute: CatalogPublicFilterAttribute;
    readonly cursor?: string;
    readonly limit: number;
  }) {
    const scope = `FILTER_${input.attribute.toUpperCase()}`;
    const fingerprint = queryFingerprint({ attribute: input.attribute, scope });
    const cursor = decodeFilterCursor(input.cursor, scope, fingerprint);
    const page = await this.repository.listFilterValues({
      attribute: input.attribute,
      limit: input.limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const last = page.items.at(-1);
    return {
      items: page.items,
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeCursor({ fingerprint, scope, value: last, version: 1 })
          : null,
    };
  }
}

export function normalizeSearchQuery(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('und')
    .trim()
    .replace(/\s+/gu, ' ');
  if (normalized.length === 0) {
    throw new CatalogError('CATALOG_QUERY_INVALID', 'VALIDATION', 'Catalog query is invalid.');
  }
  return normalized;
}

function publicNamePage<Item>(
  page: {
    readonly hasMore: boolean;
    readonly items: readonly { readonly item: Item; readonly normalizedName: string }[];
  },
  scope: string,
  fingerprint: string,
) {
  const last = page.items.at(-1);
  return {
    items: page.items.map((record) => record.item),
    nextCursor:
      page.hasMore && last !== undefined
        ? encodeCursor({
            fingerprint,
            id: publicItemId(last.item),
            normalizedName: last.normalizedName,
            scope,
            version: 1,
          })
        : null,
  };
}

function publicItemId(item: unknown): string {
  if (typeof item !== 'object' || item === null) throw new Error('Public catalog item is invalid.');
  for (const key of ['gameId', 'categoryId', 'collectionId']) {
    const value = Reflect.get(item, key);
    if (typeof value === 'string') return value;
  }
  throw new Error('Public catalog item identifier is missing.');
}

function encodeProductCursor(
  record: CatalogPublicProductRecord,
  sort: CatalogPublicSort,
  fingerprint: string,
): string {
  const orderValue =
    sort === 'NEWEST'
      ? record.createdAt.toISOString()
      : sort === 'NAME_ASC'
        ? record.normalizedName
        : record.item.priceAmountClp;
  return encodeCursor({
    fingerprint,
    orderValue,
    productId: record.item.productId,
    scope: 'PRODUCTS',
    sort,
    version: 1,
  });
}

function decodeNameCursor(
  value: string | undefined,
  scope: string,
  fingerprint: string,
): CatalogPublicNameCursor | undefined {
  if (value === undefined) return undefined;
  const parsed = decodeCursor(value, scope, fingerprint);
  if (
    typeof parsed.normalizedName !== 'string' ||
    parsed.normalizedName.length === 0 ||
    typeof parsed.id !== 'string' ||
    !uuidPattern.test(parsed.id)
  ) {
    throw invalidCursor();
  }
  return { id: parsed.id, normalizedName: parsed.normalizedName };
}

function decodeFilterCursor(value: string | undefined, scope: string, fingerprint: string) {
  if (value === undefined) return undefined;
  const parsed = decodeCursor(value, scope, fingerprint);
  if (typeof parsed.value !== 'string' || parsed.value.length === 0 || parsed.value.length > 80) {
    throw invalidCursor();
  }
  return { value: parsed.value };
}

function decodeProductCursor(
  value: string | undefined,
  sort: CatalogPublicSort,
  fingerprint: string,
): CatalogPublicProductCursor | undefined {
  if (value === undefined) return undefined;
  const parsed = decodeCursor(value, 'PRODUCTS', fingerprint);
  if (
    parsed.sort !== sort ||
    typeof parsed.productId !== 'string' ||
    !uuidPattern.test(parsed.productId)
  ) {
    throw invalidCursor();
  }
  if (sort === 'NEWEST') {
    if (typeof parsed.orderValue !== 'string') throw invalidCursor();
    const createdAt = new Date(parsed.orderValue);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== parsed.orderValue) {
      throw invalidCursor();
    }
    return { createdAt, productId: parsed.productId, sort };
  }
  if (sort === 'NAME_ASC') {
    if (typeof parsed.orderValue !== 'string' || parsed.orderValue.length === 0) {
      throw invalidCursor();
    }
    return { normalizedName: parsed.orderValue, productId: parsed.productId, sort };
  }
  if (!Number.isSafeInteger(parsed.orderValue) || Number(parsed.orderValue) < 0) {
    throw invalidCursor();
  }
  return { priceAmountClp: Number(parsed.orderValue), productId: parsed.productId, sort };
}

function encodeCursor(value: Record<string, unknown>): string {
  const payload = Buffer.from(stableJson(value), 'utf8').toString('base64url');
  const checksum = createHash('sha256')
    .update(`sergod-catalog-public-cursor-v1\0${payload}`)
    .digest('base64url');
  return `${payload}.${checksum}`;
}

function decodeCursor(value: string, scope: string, fingerprint: string): Record<string, unknown> {
  try {
    const [payload, checksum, extra] = value.split('.');
    if (payload === undefined || checksum === undefined || extra !== undefined) throw new Error();
    const expected = createHash('sha256')
      .update(`sergod-catalog-public-cursor-v1\0${payload}`)
      .digest();
    const actual = Buffer.from(checksum, 'base64url');
    if (
      actual.toString('base64url') !== checksum ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new Error();
    }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    if (parsed.version !== 1 || parsed.scope !== scope || parsed.fingerprint !== fingerprint) {
      throw new Error();
    }
    return parsed;
  } catch {
    throw invalidCursor();
  }
}

function invalidCursor(): CatalogError {
  return new CatalogError(
    'CATALOG_PUBLIC_CURSOR_INVALID',
    'VALIDATION',
    'Public catalog cursor is invalid.',
  );
}

function queryFingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('base64url');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
    .join(',')}}`;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
