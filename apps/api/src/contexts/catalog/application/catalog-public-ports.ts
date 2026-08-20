import type {
  CatalogPublicCategoryItem,
  CatalogPublicCollectionItem,
  CatalogPublicFilterAttribute,
  CatalogPublicGameItem,
  CatalogPublicProductCard,
  CatalogPublicProductDetail,
  CatalogPublicSort,
} from '@sergod/contracts';

import type { CatalogImageMimeType } from '../domain/catalog.js';

export interface CatalogPublicNameCursor {
  readonly id: string;
  readonly normalizedName: string;
}

export type CatalogPublicProductCursor =
  | {
      readonly createdAt: Date;
      readonly productId: string;
      readonly sort: 'NEWEST';
    }
  | {
      readonly normalizedName: string;
      readonly productId: string;
      readonly sort: 'NAME_ASC';
    }
  | {
      readonly priceAmountClp: number;
      readonly productId: string;
      readonly sort: 'PRICE_ASC' | 'PRICE_DESC';
    };

export interface CatalogPublicFilterValueCursor {
  readonly value: string;
}

export interface CatalogPublicProductRecord {
  readonly createdAt: Date;
  readonly item: CatalogPublicProductCard;
  readonly normalizedName: string;
}

export interface CatalogPublicNameRecord<Item> {
  readonly item: Item;
  readonly normalizedName: string;
}

export interface CatalogPublicQueryPage<Item> {
  readonly hasMore: boolean;
  readonly items: readonly Item[];
}

export interface CatalogPublicResourceRecord {
  readonly byteSize: number;
  readonly mimeTypeReal: CatalogImageMimeType;
  readonly resourceId: string;
  readonly secureStorageKey: string;
  readonly sha256Hex: string;
}

export interface CatalogPublicResourceQueryPort {
  findPublicResource(resourceId: string): Promise<CatalogPublicResourceRecord | null>;
}

export interface CatalogPublicQueryPort {
  findProduct(productId: string): Promise<CatalogPublicProductDetail | null>;
  listCategories(input: {
    readonly cursor?: CatalogPublicNameCursor;
    readonly limit: number;
  }): Promise<CatalogPublicQueryPage<CatalogPublicNameRecord<CatalogPublicCategoryItem>>>;
  listCollections(input: {
    readonly cursor?: CatalogPublicNameCursor;
    readonly gameId?: string;
    readonly limit: number;
  }): Promise<CatalogPublicQueryPage<CatalogPublicNameRecord<CatalogPublicCollectionItem>>>;
  listFilterValues(input: {
    readonly attribute: CatalogPublicFilterAttribute;
    readonly cursor?: CatalogPublicFilterValueCursor;
    readonly limit: number;
  }): Promise<CatalogPublicQueryPage<string>>;
  listGames(input: {
    readonly cursor?: CatalogPublicNameCursor;
    readonly limit: number;
  }): Promise<CatalogPublicQueryPage<CatalogPublicNameRecord<CatalogPublicGameItem>>>;
  listProducts(input: {
    readonly categoryId?: string;
    readonly collectionId?: string;
    readonly condition?: string;
    readonly cursor?: CatalogPublicProductCursor;
    readonly edition?: string;
    readonly gameId?: string;
    readonly language?: string;
    readonly limit: number;
    readonly saleType?: 'REGULAR' | 'PREORDER';
    readonly searchTerms: readonly string[];
    readonly sort: CatalogPublicSort;
  }): Promise<CatalogPublicQueryPage<CatalogPublicProductRecord>>;
}
