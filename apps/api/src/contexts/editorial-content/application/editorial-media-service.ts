import type { EditorialImagePlacement, EditorialImageWidth } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import { CatalogService } from '../../catalog/application/catalog-service.js';
import { CatalogPublicResourceService } from '../../catalog/application/catalog-public-resource-service.js';
import { EditorialService } from './editorial-service.js';

export class EditorialMediaService {
  constructor(
    private readonly editorial: EditorialService,
    private readonly resources: CatalogService,
    private readonly resourceDelivery: CatalogPublicResourceService,
  ) {}

  async upload(input: {
    readonly altText: string;
    readonly bytes: Uint8Array;
    readonly context: ExecutionContext;
    readonly declaredMimeType: string;
    readonly editorialEntryId: string;
    readonly originalFilename: string;
    readonly placement: EditorialImagePlacement;
    readonly width: EditorialImageWidth;
  }) {
    const current = await this.editorial.getAdmin(input.editorialEntryId);
    const resourceClass = ['COMIC_CHAPTER', 'COMIC_SERIES'].includes(current.item.type)
      ? 'COMIC_PAGE'
      : 'CONTENT_IMAGE';
    const uploaded = await this.resources.ingestAndAttachEditorialImage({
      ...input,
      resourceClass,
    });
    return { ...uploaded, ...(await this.editorial.getAdmin(input.editorialEntryId)) };
  }

  prepare(editorialEntryId: string, resourceId: string) {
    return this.resourceDelivery.prepareEditorialAdmin(editorialEntryId, resourceId);
  }
}
