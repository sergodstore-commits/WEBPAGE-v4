import { createClient } from '@supabase/supabase-js';

import type {
  CatalogPrivateStoragePort,
  CatalogStorageInventoryPort,
} from '../application/ports.js';
import { catalogImageMimeTypes, CatalogError } from '../domain/catalog.js';

export const catalogAssetBucketMimeTypes = [...catalogImageMimeTypes, 'application/pdf'] as const;
export const catalogAssetBucketMaximumByteSize = 15 * 1024 * 1024;

interface StorageErrorLike {
  readonly message?: string;
  readonly status?: number;
  readonly statusCode?: number | string;
}

interface StorageFileApi {
  download(path: string): PromiseLike<{ data: Blob | null; error: StorageErrorLike | null }>;
  exists(path: string): Promise<{ data: boolean; error: StorageErrorLike | null }>;
  list(
    path: string,
    options: { limit: number; offset: number; sortBy: { column: 'name'; order: 'asc' } },
  ): Promise<{
    data: readonly { id?: string | null; name: string }[] | null;
    error: StorageErrorLike | null;
  }>;
  upload(
    path: string,
    bytes: Uint8Array,
    options: { contentType: string; upsert: false },
  ): Promise<{ data: unknown; error: StorageErrorLike | null }>;
}

export interface CatalogStorageAdminApi {
  createBucket(
    id: string,
    options: { allowedMimeTypes: string[]; fileSizeLimit: number; public: false },
  ): Promise<{ data: unknown; error: StorageErrorLike | null }>;
  from(bucket: string): StorageFileApi;
  getBucket(id: string): Promise<{
    data: {
      allowed_mime_types?: string[];
      file_size_limit?: number;
      id: string;
      name: string;
      public: boolean;
    } | null;
    error: StorageErrorLike | null;
  }>;
}

export class SupabaseCatalogPrivateStorage implements CatalogStorageInventoryPort {
  constructor(
    private readonly storage: CatalogStorageAdminApi,
    private readonly bucket: string,
  ) {}

  static fromCredentials(input: {
    readonly bucket: string;
    readonly secretKey: string;
    readonly supabaseUrl: string;
  }): SupabaseCatalogPrivateStorage {
    const client = createClient(input.supabaseUrl, input.secretKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    return new SupabaseCatalogPrivateStorage(
      client.storage as unknown as CatalogStorageAdminApi,
      input.bucket,
    );
  }

  async uploadPrivateObject(
    input: Parameters<CatalogPrivateStoragePort['uploadPrivateObject']>[0],
  ): Promise<'ALREADY_EXISTS' | 'CREATED'> {
    const file = this.storage.from(this.bucket);
    const uploaded = await file.upload(input.secureStorageKey, input.bytes, {
      contentType: input.declaredMimeType,
      upsert: false,
    });
    if (uploaded.error === null) return 'CREATED';
    const existing = await file.exists(input.secureStorageKey);
    if (existing.error === null && existing.data) return 'ALREADY_EXISTS';
    throw storageError('CATALOG_STORAGE_UPLOAD_FAILED');
  }

  async privateObjectExists(secureStorageKey: string): Promise<boolean> {
    const result = await this.storage.from(this.bucket).exists(secureStorageKey);
    if (result.error !== null) throw storageError('CATALOG_STORAGE_EXISTENCE_CHECK_FAILED');
    return result.data;
  }

  async downloadPrivateObject(secureStorageKey: string): Promise<Uint8Array> {
    const result = await this.storage.from(this.bucket).download(secureStorageKey);
    if (
      result.error !== null ||
      result.data === null ||
      typeof result.data.arrayBuffer !== 'function'
    ) {
      throw storageError('CATALOG_STORAGE_DOWNLOAD_FAILED');
    }
    try {
      return new Uint8Array(await result.data.arrayBuffer());
    } catch {
      throw storageError('CATALOG_STORAGE_DOWNLOAD_FAILED');
    }
  }

  async listPrivateObjectKeys(): Promise<readonly string[]> {
    const file = this.storage.from(this.bucket);
    const keys: string[] = [];
    const prefixes = [''];
    const limit = 1_000;
    while (prefixes.length > 0) {
      const prefix = prefixes.shift() ?? '';
      for (let offset = 0; ; offset += limit) {
        const result = await file.list(prefix, {
          limit,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (result.error !== null || result.data === null) {
          throw storageError('CATALOG_STORAGE_LIST_FAILED');
        }
        for (const item of result.data) {
          const key = prefix === '' ? item.name : `${prefix}/${item.name}`;
          if (item.id === null) prefixes.push(key);
          else keys.push(key);
        }
        if (result.data.length < limit) break;
      }
    }
    return keys.sort();
  }
}

export async function provisionCatalogAssetBucket(
  storage: CatalogStorageAdminApi,
  bucketName: string,
): Promise<'CREATED' | 'VERIFIED'> {
  const found = await storage.getBucket(bucketName);
  if (found.error !== null && !isNotFound(found.error)) {
    throw storageError('CATALOG_STORAGE_BUCKET_GET_FAILED');
  }
  const existing = found.data;
  if (existing !== null) {
    const actualMimes = [...(existing.allowed_mime_types ?? [])].sort();
    const expectedMimes = [...catalogAssetBucketMimeTypes].sort();
    if (
      existing.public ||
      existing.file_size_limit !== catalogAssetBucketMaximumByteSize ||
      actualMimes.length !== expectedMimes.length ||
      actualMimes.some((mime, index) => mime !== expectedMimes[index])
    ) {
      throw storageError('CATALOG_STORAGE_BUCKET_INCOMPATIBLE');
    }
    return 'VERIFIED';
  }

  const created = await storage.createBucket(bucketName, {
    allowedMimeTypes: [...catalogAssetBucketMimeTypes],
    fileSizeLimit: catalogAssetBucketMaximumByteSize,
    public: false,
  });
  if (created.error !== null) throw storageError('CATALOG_STORAGE_BUCKET_CREATE_FAILED');
  return 'CREATED';
}

export function createCatalogStorageAdminApi(input: {
  readonly secretKey: string;
  readonly supabaseUrl: string;
}): CatalogStorageAdminApi {
  return createClient(input.supabaseUrl, input.secretKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  }).storage as unknown as CatalogStorageAdminApi;
}

function storageError(code: string): CatalogError {
  return new CatalogError(code, 'INFRASTRUCTURE', 'Private catalog storage operation failed.');
}

function isNotFound(error: StorageErrorLike): boolean {
  return error.status === 404 || String(error.statusCode) === '404';
}
