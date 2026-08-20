import type { UuidGenerator } from '@sergod/foundation';

import type { CatalogStorageKeyGenerator } from '../application/ports.js';

export class UuidCatalogStorageKeyGenerator implements CatalogStorageKeyGenerator {
  constructor(private readonly uuids: UuidGenerator) {}

  generate(): string {
    return this.uuids.generate();
  }
}
