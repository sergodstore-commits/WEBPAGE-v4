import { createHash, timingSafeEqual } from 'node:crypto';

import { catalogImageLimits, CatalogError, type CatalogImageMimeType } from '../domain/catalog.js';
import type { CatalogPrivateStoragePort } from './ports.js';
import type {
  CatalogPublicResourceQueryPort,
  CatalogPublicResourceRecord,
} from './catalog-public-ports.js';

export class CatalogPublicResourceDelivery {
  readonly byteSize: number;
  readonly etag: string;
  readonly mimeType: CatalogImageMimeType;
  readonly resourceId: string;
  readonly #record: CatalogPublicResourceRecord;
  readonly #storage: CatalogPrivateStoragePort;

  constructor(record: CatalogPublicResourceRecord, storage: CatalogPrivateStoragePort) {
    this.#record = record;
    this.#storage = storage;
    this.byteSize = record.byteSize;
    this.etag = opaqueStrongEtag(record.sha256Hex);
    this.mimeType = record.mimeTypeReal;
    this.resourceId = record.resourceId;
  }

  async loadValidatedBytes(): Promise<Uint8Array> {
    const bytes = await this.#storage.downloadPrivateObject(this.#record.secureStorageKey);
    if (
      bytes.byteLength > catalogImageLimits.maximumByteSize ||
      bytes.byteLength !== this.#record.byteSize
    ) {
      throw dependencyFailure('CATALOG_PUBLIC_RESOURCE_SIZE_MISMATCH');
    }
    const actualHash = createHash('sha256').update(bytes).digest();
    const expectedHash = Buffer.from(this.#record.sha256Hex, 'hex');
    if (expectedHash.length !== actualHash.length || !timingSafeEqual(actualHash, expectedHash)) {
      throw dependencyFailure('CATALOG_PUBLIC_RESOURCE_HASH_MISMATCH');
    }
    return bytes;
  }
}

export class CatalogPublicResourceService {
  constructor(
    private readonly repository: CatalogPublicResourceQueryPort,
    private readonly storage: CatalogPrivateStoragePort,
  ) {}

  async prepare(resourceId: string): Promise<CatalogPublicResourceDelivery> {
    const record = await this.repository.findPublicResource(resourceId);
    if (record === null) {
      throw new CatalogError(
        'CATALOG_RESOURCE_NOT_FOUND',
        'NOT_FOUND',
        'Public catalog resource was not found.',
      );
    }
    if (
      !Number.isSafeInteger(record.byteSize) ||
      record.byteSize <= 0 ||
      record.byteSize > catalogImageLimits.maximumByteSize ||
      !/^[0-9a-f]{64}$/u.test(record.sha256Hex)
    ) {
      throw dependencyFailure('CATALOG_PUBLIC_RESOURCE_METADATA_INVALID');
    }
    return new CatalogPublicResourceDelivery(record, this.storage);
  }
}

function opaqueStrongEtag(sha256Hex: string): string {
  const opaque = createHash('sha256')
    .update('sergod-catalog-public-resource-etag-v1\0', 'utf8')
    .update(sha256Hex, 'utf8')
    .digest('base64url');
  return `"${opaque}"`;
}

function dependencyFailure(code: string): CatalogError {
  return new CatalogError(code, 'INFRASTRUCTURE', 'Public catalog resource dependency failed.');
}
