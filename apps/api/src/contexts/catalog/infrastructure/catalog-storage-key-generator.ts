import type { UuidGenerator } from '@sergod/foundation';

import { CatalogError } from '../domain/catalog.js';
import type { CatalogStorageKeyGenerator } from '../application/ports.js';

const storageFolderPattern =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/u;

export class UuidCatalogStorageKeyGenerator implements CatalogStorageKeyGenerator {
  constructor(private readonly uuids: UuidGenerator) {}

  generate(storageFolder = 'unassigned'): string {
    if (storageFolder.length > 180 || !storageFolderPattern.test(storageFolder)) {
      throw new CatalogError(
        'CATALOG_STORAGE_FOLDER_INVALID',
        'VALIDATION',
        'Catalog storage folder is invalid.',
      );
    }
    return `${storageFolder}/${this.uuids.generate()}`;
  }
}
