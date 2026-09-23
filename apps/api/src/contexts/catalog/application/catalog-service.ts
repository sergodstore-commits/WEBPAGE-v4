import { createHash } from 'node:crypto';

import type { ExecutionContext } from '@sergod/foundation';

import {
  assertPublicationTransition,
  assertResourceTransition,
  catalogImageLimits,
  catalogImageMimeTypes,
  CatalogError,
  normalizeCatalogNullableText,
  normalizeCatalogRequiredText,
  normalizeProductInput,
  normalizeSafeFilename,
  parseValidatedResourceDescriptor,
  type CatalogEntityType,
  type CatalogImageMimeType,
  type CatalogMediaSourceType,
  type PublicationStatus,
  type ResourceClass,
} from '../domain/catalog.js';
import type {
  CatalogAdminAuthorizer,
  CatalogImageOptimizationPort,
  CatalogPrivateStoragePort,
  CatalogRepository,
  CatalogResourceValidationPort,
} from './ports.js';

export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly authorizer: CatalogAdminAuthorizer,
    private readonly validator: CatalogResourceValidationPort,
    private readonly storage: CatalogPrivateStoragePort,
    private readonly optimizer?: CatalogImageOptimizationPort,
  ) {}

  async createGame(input: {
    readonly context: ExecutionContext;
    readonly description?: string | null;
    readonly name: string;
    readonly slug: string;
  }) {
    await this.authorize(input.context);
    return this.repository.createGame({
      context: input.context,
      description: normalizeCatalogNullableText(input.description),
      idempotencyKey: requireIdempotencyKey(input.context),
      name: normalizeCatalogRequiredText(input.name, 'CATALOG_GAME_NAME_REQUIRED'),
      slug: normalizeCatalogRequiredText(input.slug, 'CATALOG_GAME_SLUG_REQUIRED'),
    });
  }

  async createCategory(input: {
    readonly context: ExecutionContext;
    readonly description?: string | null;
    readonly name: string;
  }) {
    await this.authorize(input.context);
    return this.repository.createCategory({
      context: input.context,
      description: normalizeCatalogNullableText(input.description),
      idempotencyKey: requireIdempotencyKey(input.context),
      name: normalizeCatalogRequiredText(input.name, 'CATALOG_CATEGORY_NAME_REQUIRED'),
    });
  }

  async createCollection(input: {
    readonly context: ExecutionContext;
    readonly description?: string | null;
    readonly gameId: string;
    readonly name: string;
  }) {
    await this.authorize(input.context);
    return this.repository.createCollection({
      context: input.context,
      description: normalizeCatalogNullableText(input.description),
      gameId: input.gameId,
      idempotencyKey: requireIdempotencyKey(input.context),
      name: normalizeCatalogRequiredText(input.name, 'CATALOG_COLLECTION_NAME_REQUIRED'),
    });
  }

  async createProduct(input: { readonly context: ExecutionContext; readonly product: unknown }) {
    await this.authorize(input.context);
    return this.repository.createProduct({
      context: input.context,
      idempotencyKey: requireIdempotencyKey(input.context),
      product: normalizeProductInput(input.product),
    });
  }

  private async registerQuarantinedResource(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly originalFilename: string;
    readonly position: number;
    readonly requestFingerprint?: string;
    readonly resourceClass: ResourceClass;
    readonly storageFolder?: string;
  }) {
    if (!Number.isSafeInteger(input.position) || input.position <= 0) {
      throw new CatalogError(
        'CATALOG_RESOURCE_POSITION_INVALID',
        'VALIDATION',
        'Position is invalid.',
      );
    }
    const originalFilenameSafe = normalizeSafeFilename(input.originalFilename);
    return this.repository.registerQuarantinedResource({
      altText: requireText(input.altText, 'CATALOG_RESOURCE_ALT_TEXT_REQUIRED'),
      contentSha256: sha256(input.bytes),
      context: input.context,
      declaredMimeType: input.declaredMimeType,
      idempotencyKey: requireIdempotencyKey(input.context),
      originalFilenameSafe,
      position: input.position,
      resourceClass: input.resourceClass,
      ...(input.storageFolder === undefined ? {} : { storageFolder: input.storageFolder }),
      ...(input.requestFingerprint === undefined
        ? {}
        : { requestFingerprint: input.requestFingerprint }),
    });
  }

  async ingestCatalogImage(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly originalFilename: string;
    readonly position: number;
  }) {
    await this.authorize(input.context);
    const { descriptor, registered } = await this.prepareCatalogImage({
      ...input,
      resourceClass: 'CATALOG_IMAGE',
      storageFolder: 'catalog/unassigned',
    });

    const activated = await this.activateResource({
      context: input.context,
      descriptor,
      resourceId: registered.resourceId,
    });
    return {
      replayed: registered.replayed && activated.replayed,
      resourceId: registered.resourceId,
      state: 'ACTIVE' as const,
    };
  }

  async ingestAndAttachCatalogImage(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly originalFilename: string;
    readonly position: number;
    readonly requestFingerprint: string;
  }) {
    await this.authorize(input.context);
    const { descriptor, registered } = await this.prepareCatalogImage({
      ...input,
      resourceClass: 'CATALOG_IMAGE',
      storageFolder: catalogStorageFolder(input.entityType, input.entityId),
    });
    try {
      const associated = await this.repository.activateAndAttachResource({
        context: input.context,
        descriptor,
        entityId: input.entityId,
        entityType: input.entityType,
        idempotencyKey: requireIdempotencyKey(input.context),
        requestFingerprint: input.requestFingerprint,
        resourceId: registered.resourceId,
      });
      return {
        replayed: registered.replayed && associated.replayed,
        resourceId: associated.resourceId,
      };
    } catch (error) {
      await this.recordFailure(input.context, registered.resourceId, 'FINAL_ASSOCIATION', error);
      throw error;
    }
  }

  async ingestAndAttachEditorialImage(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly editorialEntryId: string;
    readonly originalFilename: string;
    readonly placement: 'CENTER' | 'FULL' | 'LEFT' | 'RIGHT';
    readonly resourceClass: 'COMIC_PAGE' | 'CONTENT_IMAGE';
    readonly storageFolder: string;
    readonly width: 'LARGE' | 'MEDIUM' | 'SMALL';
  }) {
    await this.authorize(input.context);
    const requestFingerprint = sha256(
      Buffer.from(
        JSON.stringify({
          altText: input.altText,
          contentSha256: sha256(input.bytes),
          declaredMimeType: input.declaredMimeType,
          editorialEntryId: input.editorialEntryId,
          originalFilename: input.originalFilename,
          placement: input.placement,
          resourceClass: input.resourceClass,
          width: input.width,
        }),
      ),
    );
    const { descriptor, registered } = await this.prepareCatalogImage({
      ...input,
      position: 1,
      requestFingerprint,
    });
    try {
      const associated = await this.repository.activateAndAttachEditorialResource({
        altText: input.altText,
        context: input.context,
        descriptor,
        editorialEntryId: input.editorialEntryId,
        idempotencyKey: requireIdempotencyKey(input.context),
        placement: input.placement,
        requestFingerprint,
        resourceId: registered.resourceId,
        width: input.width,
      });
      return {
        replayed: registered.replayed && associated.replayed,
        resourceId: associated.resourceId,
      };
    } catch (error) {
      await this.recordFailure(
        input.context,
        registered.resourceId,
        'FINAL_EDITORIAL_ASSOCIATION',
        error,
      );
      throw error;
    }
  }

  async ingestHomeCarouselImage(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly originalFilename: string;
    readonly requestFingerprint: string;
  }) {
    await this.authorize(input.context);
    const { descriptor, registered } = await this.prepareCatalogImage({
      ...input,
      position: 1,
      resourceClass: 'CONTENT_IMAGE',
      storageFolder: 'home/carousel',
    });
    await this.activateResource({
      context: input.context,
      descriptor,
      resourceId: registered.resourceId,
    });
    return { resourceId: registered.resourceId };
  }

  async replaceAssociatedCatalogImage(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly originalFilename: string;
    readonly reason: string;
    readonly replacedResourceId: string;
    readonly requestFingerprint: string;
  }) {
    await this.authorize(input.context);
    const directlyAssociated = await this.repository.findAssociatedResource(
      input.entityType,
      input.entityId,
      input.replacedResourceId,
    );
    const current =
      directlyAssociated ??
      (await this.repository.findReplacementResource(
        input.entityType,
        input.entityId,
        input.replacedResourceId,
      ));
    if (current === null) {
      throw new CatalogError(
        'CATALOG_RESOURCE_NOT_FOUND',
        'NOT_FOUND',
        'Associated resource was not found.',
      );
    }
    const { descriptor, registered } = await this.prepareCatalogImage({
      ...input,
      position: current.position,
      resourceClass: 'CATALOG_IMAGE',
      storageFolder: catalogStorageFolder(input.entityType, input.entityId),
    });
    try {
      const replaced = await this.repository.activateAndReplaceResource({
        context: input.context,
        descriptor,
        entityId: input.entityId,
        entityType: input.entityType,
        idempotencyKey: requireIdempotencyKey(input.context),
        reason: requireText(input.reason, 'CATALOG_RESOURCE_REASON_REQUIRED'),
        replacedResourceId: input.replacedResourceId,
        replacementResourceId: registered.resourceId,
        requestFingerprint: input.requestFingerprint,
      });
      return {
        replayed: registered.replayed && replaced.replayed,
        resourceId: replaced.resourceId,
      };
    } catch (error) {
      await this.recordFailure(input.context, registered.resourceId, 'FINAL_REPLACEMENT', error);
      throw error;
    }
  }

  private async prepareCatalogImage(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly originalFilename: string;
    readonly position: number;
    readonly requestFingerprint?: string;
    readonly resourceClass: ResourceClass;
    readonly storageFolder?: string;
  }) {
    const submittedBytes =
      input.bytes.byteLength <= catalogImageLimits.maximumByteSize
        ? Buffer.from(input.bytes)
        : input.bytes;
    const registered = await this.registerQuarantinedResource({
      ...input,
      bytes: submittedBytes,
    });
    try {
      if (submittedBytes.byteLength === 0) {
        throw new CatalogError(
          'CATALOG_RESOURCE_EMPTY',
          'VALIDATION',
          'Catalog image bytes are required.',
        );
      }
      if (submittedBytes.byteLength > catalogImageLimits.maximumByteSize) {
        throw new CatalogError(
          'CATALOG_RESOURCE_TOO_LARGE',
          'VALIDATION',
          'Catalog image exceeds the configured byte limit.',
        );
      }
      if (!catalogImageMimeTypes.includes(input.declaredMimeType as CatalogImageMimeType)) {
        throw new CatalogError(
          'CATALOG_RESOURCE_DECLARED_MIME_UNSUPPORTED',
          'VALIDATION',
          'Declared catalog image MIME is not allowed.',
        );
      }

      const declaredMimeType = input.declaredMimeType as CatalogImageMimeType;
      const originalFilenameSafe = normalizeSafeFilename(input.originalFilename);
      const bytes =
        this.optimizer === undefined
          ? submittedBytes
          : await this.optimizer.optimize({
              bytes: submittedBytes,
              declaredMimeType,
              originalFilenameSafe,
            });

      await this.storage.uploadPrivateObject({
        bytes,
        declaredMimeType,
        secureStorageKey: registered.secureStorageKey,
      });
      if (!(await this.storage.privateObjectExists(registered.secureStorageKey))) {
        throw new CatalogError(
          'CATALOG_STORAGE_OBJECT_MISSING',
          'INFRASTRUCTURE',
          'The private catalog object is unavailable.',
        );
      }
      const storedBytes = await this.storage.downloadPrivateObject(registered.secureStorageKey);
      const descriptor = parseValidatedResourceDescriptor(
        await this.validator.validate({
          bytes: storedBytes,
          declaredMimeType,
          originalFilenameSafe,
          secureStorageKey: registered.secureStorageKey,
        }),
      );
      if (descriptor.sha256Hex !== sha256(bytes)) {
        throw new CatalogError(
          'CATALOG_STORAGE_OBJECT_MISMATCH',
          'CONFLICT',
          'The private catalog object differs from the submitted bytes.',
        );
      }
      return { descriptor, registered };
    } catch (error) {
      await this.recordFailure(input.context, registered.resourceId, 'UPLOAD_OR_VALIDATION', error);
      throw error;
    }
  }

  private async recordFailure(
    context: ExecutionContext,
    resourceId: string,
    stage: string,
    error: unknown,
  ): Promise<void> {
    const reporter = this.repository.recordResourceFailure;
    if (typeof reporter !== 'function') return;
    await reporter.call(this.repository, {
      context,
      errorCode: error instanceof CatalogError ? error.code : 'CATALOG_RESOURCE_FAILURE',
      resourceId,
      stage,
    });
  }

  private async activateResource(input: {
    readonly context: ExecutionContext;
    readonly descriptor: ReturnType<typeof parseValidatedResourceDescriptor>;
    readonly resourceId: string;
  }) {
    const resource = await this.repository.findResource(input.resourceId);
    if (resource === null) {
      throw new CatalogError('CATALOG_RESOURCE_NOT_FOUND', 'NOT_FOUND', 'Resource was not found.');
    }
    assertResourceTransition(resource.state, 'ACTIVE');
    if (
      resource.secureStorageKey !== input.descriptor.secureStorageKey ||
      resource.originalFilenameSafe !== input.descriptor.originalFilenameSafe
    ) {
      throw new CatalogError(
        'CATALOG_RESOURCE_DESCRIPTOR_MISMATCH',
        'CONFLICT',
        'Validated catalog descriptor does not belong to the resource.',
      );
    }
    return this.repository.activateResource({
      context: input.context,
      descriptor: input.descriptor,
      idempotencyKey: requireIdempotencyKey(input.context),
      resourceId: input.resourceId,
    });
  }

  async removeResource(input: { readonly context: ExecutionContext; readonly resourceId: string }) {
    await this.authorize(input.context);
    const resource = await this.repository.findResource(input.resourceId);
    if (resource === null) {
      throw new CatalogError('CATALOG_RESOURCE_NOT_FOUND', 'NOT_FOUND', 'Resource was not found.');
    }
    assertResourceTransition(resource.state, 'REMOVED');
    return this.repository.transitionResource({
      context: input.context,
      idempotencyKey: requireIdempotencyKey(input.context),
      nextState: 'REMOVED',
      resourceId: input.resourceId,
    });
  }

  async replaceResource(input: {
    readonly context: ExecutionContext;
    readonly replacementResourceId: string;
    readonly resourceId: string;
  }) {
    await this.authorize(input.context);
    if (input.resourceId === input.replacementResourceId) {
      throw new CatalogError(
        'CATALOG_RESOURCE_SELF_REPLACEMENT',
        'VALIDATION',
        'A resource cannot replace itself.',
      );
    }
    const [current, replacement] = await Promise.all([
      this.repository.findResource(input.resourceId),
      this.repository.findResource(input.replacementResourceId),
    ]);
    if (current === null || replacement === null) {
      throw new CatalogError('CATALOG_RESOURCE_NOT_FOUND', 'NOT_FOUND', 'Resource was not found.');
    }
    assertResourceTransition(current.state, 'REPLACED');
    if (replacement.state !== 'ACTIVE') {
      throw new CatalogError(
        'CATALOG_REPLACEMENT_NOT_ACTIVE',
        'CONFLICT',
        'Replacement resource must already be ACTIVE.',
      );
    }
    return this.repository.transitionResource({
      context: input.context,
      idempotencyKey: requireIdempotencyKey(input.context),
      nextState: 'REPLACED',
      replacementResourceId: input.replacementResourceId,
      resourceId: input.resourceId,
    });
  }

  async attachMedia(input: {
    readonly context: ExecutionContext;
    readonly isPrimary: boolean;
    readonly resourceId: string;
    readonly sourceId: string;
    readonly sourceType: CatalogEntityType;
  }) {
    await this.authorize(input.context);
    const common = {
      context: input.context,
      idempotencyKey: requireIdempotencyKey(input.context),
      isPrimary: input.isPrimary,
      resourceId: input.resourceId,
    };
    if (input.sourceType === 'PRODUCT') {
      return this.repository.attachProductMedia({ ...common, productId: input.sourceId });
    }
    return this.repository.attachCatalogMedia({
      ...common,
      sourceId: input.sourceId,
      sourceType: input.sourceType satisfies CatalogMediaSourceType,
    });
  }

  async transitionEntity(input: {
    readonly context: ExecutionContext;
    readonly descendantStrategy: 'REJECT' | 'UNPUBLISH';
    readonly entityId: string;
    readonly entityType: CatalogEntityType;
    readonly nextStatus: PublicationStatus;
  }) {
    await this.authorize(input.context);
    const entity = await this.repository.findEntity(input.entityType, input.entityId);
    if (entity === null) {
      throw new CatalogError(
        'CATALOG_ENTITY_NOT_FOUND',
        'NOT_FOUND',
        'Catalog entity was not found.',
      );
    }
    assertPublicationTransition(entity.publicationStatus, input.nextStatus);
    return this.repository.transitionEntity({
      ...input,
      idempotencyKey: requireIdempotencyKey(input.context),
    });
  }

  private async authorize(context: ExecutionContext): Promise<void> {
    if (context.actorType !== 'USER' || context.actorId === undefined) {
      throw new CatalogError(
        'CATALOG_ADMIN_REQUIRED',
        'VALIDATION',
        'Catalog administration requires an authenticated user actor.',
      );
    }
    await this.authorizer.assertCanManageCatalog(context);
  }
}

function requireIdempotencyKey(context: ExecutionContext): string {
  const key = context.idempotencyKey?.trim();
  if (!key) {
    throw new CatalogError(
      'CATALOG_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'Mutable catalog commands require an idempotency key.',
    );
  }
  return key;
}

function requireText(value: string, code: string): string {
  const text = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!text) throw new CatalogError(code, 'VALIDATION', 'Required catalog text is missing.');
  return text;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function catalogStorageFolder(entityType: CatalogEntityType, entityId: string): string {
  const folders: Readonly<Record<CatalogEntityType, string>> = {
    CATEGORY: 'categories',
    COLLECTION: 'collections',
    PRODUCT: 'products',
    TCG_GAME: 'games',
  };
  return `${folders[entityType]}/${entityId}`;
}
