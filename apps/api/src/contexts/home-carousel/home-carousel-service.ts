import { createHash } from 'node:crypto';

import {
  homeCarouselFieldsSchema,
  homeCarouselOrderSchema,
  homeCarouselUpdateSchema,
  type HomeCarouselList,
} from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';
import type { z } from 'zod';

import type { CatalogService } from '../catalog/application/catalog-service.js';
import { CatalogPublicResourceDelivery } from '../catalog/application/catalog-public-resource-service.js';
import type { CatalogPublicResourceRecord } from '../catalog/application/catalog-public-ports.js';
import type {
  CatalogAdminAuthorizer,
  CatalogPrivateStoragePort,
} from '../catalog/application/ports.js';
import { CatalogError } from '../catalog/domain/catalog.js';

export type CarouselFields = z.infer<typeof homeCarouselFieldsSchema>;
export interface HomeCarouselRepository {
  list(publicOnly: boolean): Promise<HomeCarouselList>;
  create(
    context: ExecutionContext,
    input: CarouselFields & { resourceId: string; fingerprint: string },
  ): Promise<void>;
  update(
    context: ExecutionContext,
    slideId: string,
    input: z.infer<typeof homeCarouselUpdateSchema>,
  ): Promise<void>;
  reorder(context: ExecutionContext, input: z.infer<typeof homeCarouselOrderSchema>): Promise<void>;
  resource(slideId: string, publicOnly: boolean): Promise<CatalogPublicResourceRecord | null>;
}

export class HomeCarouselService {
  constructor(
    private readonly repository: HomeCarouselRepository,
    private readonly authorizer: CatalogAdminAuthorizer,
    private readonly resources: CatalogService | null,
    private readonly storage: CatalogPrivateStoragePort | null,
  ) {}

  listPublic() {
    return this.repository.list(true);
  }

  async listAdmin(context: ExecutionContext) {
    await this.authorizer.assertCanManageCatalog(context);
    return this.repository.list(false);
  }

  async upload(
    context: ExecutionContext,
    input: CarouselFields & {
      bytes: Uint8Array;
      declaredMimeType: string;
      originalFilename: string;
    },
  ) {
    await this.authorizer.assertCanManageCatalog(context);
    const fields = homeCarouselFieldsSchema.parse({
      altText: input.altText,
      active: input.active,
      linkPath: input.linkPath,
    });
    if (this.resources === null) throw unavailable();
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          ...fields,
          actorId: context.actorId,
          declaredMimeType: input.declaredMimeType,
          originalFilename: input.originalFilename,
          contentHash: createHash('sha256').update(input.bytes).digest('hex'),
        }),
      )
      .digest('hex');
    const { resourceId } = await this.resources.ingestHomeCarouselImage({
      ...input,
      ...fields,
      context,
      requestFingerprint: fingerprint,
    });
    await this.repository.create(context, { ...fields, fingerprint, resourceId });
    return this.repository.list(false);
  }

  async update(context: ExecutionContext, slideId: string, input: unknown) {
    await this.authorizer.assertCanManageCatalog(context);
    await this.repository.update(context, slideId, homeCarouselUpdateSchema.parse(input));
    return this.repository.list(false);
  }

  async reorder(context: ExecutionContext, input: unknown) {
    await this.authorizer.assertCanManageCatalog(context);
    await this.repository.reorder(context, homeCarouselOrderSchema.parse(input));
    return this.repository.list(false);
  }

  async prepare(slideId: string, context?: ExecutionContext) {
    if (context) await this.authorizer.assertCanManageCatalog(context);
    const resource = await this.repository.resource(slideId, context === undefined);
    if (resource === null)
      throw new CatalogError(
        'HOME_CAROUSEL_NOT_FOUND',
        'NOT_FOUND',
        'La imagen no está disponible.',
      );
    if (this.storage === null) throw unavailable();
    return new CatalogPublicResourceDelivery(resource, this.storage);
  }
}

function unavailable() {
  return new CatalogError(
    'HOME_CAROUSEL_STORAGE_UNAVAILABLE',
    'INFRASTRUCTURE',
    'El almacenamiento de imágenes no está disponible.',
  );
}
