import type { ExecutionContext } from '@sergod/foundation';

import type {
  CatalogEntityType,
  CatalogImageMimeType,
  CatalogMediaSourceType,
  NormalizedProductInput,
  PublicationStatus,
  ResourceClass,
  ResourceState,
  ValidatedResourceDescriptor,
} from '../domain/catalog.js';

export interface CatalogAdminAuthorizer {
  assertCanManageCatalog(context: ExecutionContext): Promise<void>;
}

export interface CatalogResourceValidationPort {
  validate(input: {
    readonly bytes: Uint8Array;
    readonly declaredMimeType: string;
    readonly originalFilenameSafe: string;
    readonly secureStorageKey: string;
  }): Promise<ValidatedResourceDescriptor>;
}

export interface CatalogPrivateStoragePort {
  downloadPrivateObject(secureStorageKey: string): Promise<Uint8Array>;
  privateObjectExists(secureStorageKey: string): Promise<boolean>;
  uploadPrivateObject(input: {
    readonly bytes: Uint8Array;
    readonly declaredMimeType: CatalogImageMimeType | 'application/pdf';
    readonly secureStorageKey: string;
  }): Promise<'ALREADY_EXISTS' | 'CREATED'>;
}

export interface CatalogStorageInventoryPort extends CatalogPrivateStoragePort {
  listPrivateObjectKeys(): Promise<readonly string[]>;
}

export interface CatalogStorageKeyGenerator {
  generate(): string;
}

export interface CatalogEntityView {
  readonly id: string;
  readonly publicationStatus: PublicationStatus;
}

export interface CatalogEntityPageCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface CatalogEntityListInput {
  readonly cursor?: CatalogEntityPageCursor;
  readonly limit: number;
  readonly publicationStatus?: PublicationStatus;
}

interface CatalogEntityDetailBase {
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly description: string | null;
  readonly name: string;
  readonly publicationStatus: PublicationStatus;
  readonly updatedAt: Date;
}

export interface CatalogGameDetail extends CatalogEntityDetailBase {
  readonly gameId: string;
  readonly slug: string;
}

export interface CatalogCategoryDetail extends CatalogEntityDetailBase {
  readonly categoryId: string;
}

export interface CatalogCollectionDetail extends CatalogEntityDetailBase {
  readonly collectionId: string;
  readonly gameId: string;
}

export interface CatalogProductDetail extends CatalogEntityDetailBase, NormalizedProductInput {
  readonly productId: string;
}

export interface CatalogEntityPage<Item> {
  readonly hasMore: boolean;
  readonly items: readonly Item[];
}

export interface CatalogResourceView {
  readonly originalFilenameSafe: string;
  readonly resourceId: string;
  readonly secureStorageKey: string;
  readonly state: ResourceState;
}

export interface CatalogAssociatedResourceView {
  readonly altText: string;
  readonly byteSize: number;
  readonly heightPx: number;
  readonly isPrimary: boolean;
  readonly mimeTypeReal: CatalogImageMimeType;
  readonly originalFilenameSafe: string;
  readonly position: number;
  readonly replacedResourceId: string | null;
  readonly resourceId: string;
  readonly retiredAt: Date | null;
  readonly retiredBy: string | null;
  readonly sha256Hex: string;
  readonly state: ResourceState;
  readonly uploadedAt: Date;
  readonly uploadedBy: string;
  readonly validatedAt: Date;
  readonly widthPx: number;
}

export interface CatalogResourcePageCursor {
  readonly position: number;
  readonly resourceId: string;
}

export interface CatalogResourcePage {
  readonly etag: string;
  readonly hasMore: boolean;
  readonly items: readonly CatalogAssociatedResourceView[];
}

export interface CatalogResourceReconciliationView extends CatalogResourceView {
  readonly sha256Hex: string | null;
}

export interface CatalogRepository {
  activateAndAttachEditorialResource(input: {
    readonly altText: string;
    readonly context: ExecutionContext;
    readonly descriptor: ValidatedResourceDescriptor;
    readonly editorialEntryId: string;
    readonly idempotencyKey: string;
    readonly placement: 'CENTER' | 'FULL' | 'LEFT' | 'RIGHT';
    readonly requestFingerprint: string;
    readonly resourceId: string;
    readonly width: 'LARGE' | 'MEDIUM' | 'SMALL';
  }): Promise<{ readonly replayed: boolean; readonly resourceId: string }>;
  activateResource(input: {
    readonly context: ExecutionContext;
    readonly descriptor: ValidatedResourceDescriptor;
    readonly idempotencyKey: string;
    readonly resourceId: string;
  }): Promise<{ readonly replayed: boolean; readonly resourceId: string }>;
  activateAndAttachResource(input: {
    readonly context: ExecutionContext;
    readonly descriptor: ValidatedResourceDescriptor;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly resourceId: string;
  }): Promise<{ readonly replayed: boolean; readonly resourceId: string }>;
  activateAndReplaceResource(input: {
    readonly context: ExecutionContext;
    readonly descriptor: ValidatedResourceDescriptor;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly idempotencyKey: string;
    readonly reason: string;
    readonly replacedResourceId: string;
    readonly replacementResourceId: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly replayed: boolean; readonly resourceId: string }>;
  attachCatalogMedia(input: {
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly isPrimary: boolean;
    readonly resourceId: string;
    readonly sourceId: string;
    readonly sourceType: CatalogMediaSourceType;
  }): Promise<{ readonly mediaId: string; readonly replayed: boolean }>;
  attachProductMedia(input: {
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly isPrimary: boolean;
    readonly productId: string;
    readonly resourceId: string;
  }): Promise<{ readonly mediaId: string; readonly replayed: boolean }>;
  createCategory(input: {
    readonly context: ExecutionContext;
    readonly description: string | null;
    readonly idempotencyKey: string;
    readonly name: string;
    readonly requestFingerprint?: string;
  }): Promise<{ readonly categoryId: string; readonly replayed: boolean }>;
  createCollection(input: {
    readonly context: ExecutionContext;
    readonly description: string | null;
    readonly gameId: string;
    readonly idempotencyKey: string;
    readonly name: string;
    readonly requestFingerprint?: string;
  }): Promise<{ readonly collectionId: string; readonly replayed: boolean }>;
  createGame(input: {
    readonly context: ExecutionContext;
    readonly description: string | null;
    readonly idempotencyKey: string;
    readonly name: string;
    readonly slug: string;
    readonly requestFingerprint?: string;
  }): Promise<{ readonly gameId: string; readonly replayed: boolean }>;
  createProduct(input: {
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly product: NormalizedProductInput;
    readonly requestFingerprint?: string;
  }): Promise<{ readonly productId: string; readonly replayed: boolean }>;
  findEntity(type: CatalogEntityType, id: string): Promise<CatalogEntityView | null>;
  findCategory(categoryId: string): Promise<CatalogCategoryDetail | null>;
  findCollection(collectionId: string): Promise<CatalogCollectionDetail | null>;
  findGame(gameId: string): Promise<CatalogGameDetail | null>;
  findProduct(productId: string): Promise<CatalogProductDetail | null>;
  findResource(resourceId: string): Promise<CatalogResourceView | null>;
  findAssociatedResource(
    entityType: CatalogEntityType,
    entityId: string,
    resourceId: string,
  ): Promise<CatalogAssociatedResourceView | null>;
  findReplacementResource(
    entityType: CatalogEntityType,
    entityId: string,
    replacedResourceId: string,
  ): Promise<CatalogAssociatedResourceView | null>;
  listCategories(input: CatalogEntityListInput): Promise<CatalogEntityPage<CatalogCategoryDetail>>;
  listCollections(
    input: CatalogEntityListInput & { readonly gameId?: string },
  ): Promise<CatalogEntityPage<CatalogCollectionDetail>>;
  listGames(input: CatalogEntityListInput): Promise<CatalogEntityPage<CatalogGameDetail>>;
  listProducts(
    input: CatalogEntityListInput & {
      readonly categoryId?: string;
      readonly collectionId?: string;
      readonly gameId?: string;
    },
  ): Promise<CatalogEntityPage<CatalogProductDetail>>;
  listAssociatedResources(input: {
    readonly cursor?: CatalogResourcePageCursor;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly limit: number;
  }): Promise<CatalogResourcePage>;
  listResourcesForReconciliation(): Promise<readonly CatalogResourceReconciliationView[]>;
  registerQuarantinedResource(input: {
    readonly altText: string;
    readonly contentSha256: string;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly idempotencyKey: string;
    readonly originalFilenameSafe: string;
    readonly position: number;
    readonly resourceClass: ResourceClass;
    readonly requestFingerprint?: string;
  }): Promise<{
    readonly replayed: boolean;
    readonly resourceId: string;
    readonly secureStorageKey: string;
  }>;
  recordResourceFailure(input: {
    readonly context: ExecutionContext;
    readonly errorCode: string;
    readonly resourceId: string;
    readonly stage: string;
  }): Promise<void>;
  reorderAssociatedResources(input: {
    readonly context: ExecutionContext;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly expectedEtag: string;
    readonly idempotencyKey: string;
    readonly orderedResourceIds: readonly string[];
    readonly requestFingerprint: string;
  }): Promise<{ readonly replayed: boolean }>;
  retireAssociatedResource(input: {
    readonly context: ExecutionContext;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly idempotencyKey: string;
    readonly reason: string;
    readonly requestFingerprint: string;
    readonly resourceId: string;
  }): Promise<{ readonly replayed: boolean; readonly resourceId: string }>;
  selectPrimaryResource(input: {
    readonly context: ExecutionContext;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly resourceId: string;
  }): Promise<{ readonly replayed: boolean; readonly resourceId: string }>;
  transitionEntity(input: {
    readonly context: ExecutionContext;
    readonly descendantStrategy?: 'REJECT' | 'UNPUBLISH';
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly idempotencyKey: string;
    readonly nextStatus: PublicationStatus;
    readonly requestFingerprint?: string;
  }): Promise<{ readonly entityId: string; readonly replayed: boolean }>;
  transitionResource(input: {
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly nextState: Extract<ResourceState, 'REMOVED' | 'REPLACED'>;
    readonly replacementResourceId?: string;
    readonly resourceId: string;
  }): Promise<{ readonly replayed: boolean; readonly resourceId: string }>;
  updateCategory(input: {
    readonly categoryId: string;
    readonly context: ExecutionContext;
    readonly description?: string | null;
    readonly idempotencyKey: string;
    readonly name?: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly categoryId: string; readonly replayed: boolean }>;
  updateCollection(input: {
    readonly collectionId: string;
    readonly context: ExecutionContext;
    readonly description?: string | null;
    readonly gameId?: string;
    readonly idempotencyKey: string;
    readonly name?: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly collectionId: string; readonly replayed: boolean }>;
  updateGame(input: {
    readonly context: ExecutionContext;
    readonly description?: string | null;
    readonly gameId: string;
    readonly idempotencyKey: string;
    readonly name?: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly gameId: string; readonly replayed: boolean }>;
  updateProduct(input: {
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly product: NormalizedProductInput;
    readonly productId: string;
    readonly requestFingerprint: string;
  }): Promise<{ readonly productId: string; readonly replayed: boolean }>;
}
