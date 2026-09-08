import type { ExecutionContext } from '@sergod/foundation';
import { describe, expect, it, vi } from 'vitest';

import type { CatalogService } from '../../catalog/application/catalog-service.js';
import type { CatalogPublicResourceService } from '../../catalog/application/catalog-public-resource-service.js';
import { EditorialMediaService } from './editorial-media-service.js';
import type { EditorialService } from './editorial-service.js';

const entryId = '0198a8be-6677-7000-8000-000000000004';
const context: ExecutionContext = {
  actorId: '0198a8be-6677-7000-8000-000000000001',
  actorType: 'USER',
  correlationId: '0198a8be-6677-7000-8000-000000000002',
  idempotencyKey: 'editorial-image-1',
};

describe('Editorial media service', () => {
  it.each([
    ['NEWS', 'news'],
    ['TOURNAMENT', 'tournaments'],
    ['COMMUNITY', 'community'],
    ['COMIC_SERIES', 'comics'],
    ['COMIC_CHAPTER', 'comics'],
    ['QUEST', 'quests'],
    ['HALL_OF_FAME', 'hall-of-fame'],
  ] as const)('organizes %s images in the %s folder', async (type, folder) => {
    const editorial = {
      getAdmin: vi.fn().mockResolvedValue({ item: { type } }),
    } as unknown as EditorialService;
    const resources = {
      ingestAndAttachEditorialImage: vi
        .fn()
        .mockResolvedValue({ replayed: false, resourceId: crypto.randomUUID() }),
    } as unknown as CatalogService;
    const service = new EditorialMediaService(
      editorial,
      resources,
      {} as CatalogPublicResourceService,
    );

    await service.upload({
      altText: 'Descripción real',
      bytes: new Uint8Array([1, 2, 3]),
      context,
      declaredMimeType: 'image/webp',
      editorialEntryId: entryId,
      originalFilename: 'imagen.webp',
      placement: 'CENTER',
      width: 'MEDIUM',
    });

    expect(resources.ingestAndAttachEditorialImage).toHaveBeenCalledWith(
      expect.objectContaining({ storageFolder: `${folder}/${entryId}` }),
    );
  });
});
