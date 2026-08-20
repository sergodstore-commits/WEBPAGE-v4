import { createHash } from 'node:crypto';
import { extname } from 'node:path';

import sharp from 'sharp';

import type { CatalogResourceValidationPort } from '../application/ports.js';
import {
  catalogImageLimits,
  CatalogError,
  type CatalogImageMimeType,
  type ValidatedResourceDescriptor,
} from '../domain/catalog.js';

const extensionMimeTypes = new Map<string, CatalogImageMimeType>([
  ['.avif', 'image/avif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

export class SharpCatalogImageValidator implements CatalogResourceValidationPort {
  async validate(
    input: Parameters<CatalogResourceValidationPort['validate']>[0],
  ): Promise<ValidatedResourceDescriptor> {
    const bytes = Buffer.from(input.bytes);
    if (bytes.byteLength === 0) throw validationError('CATALOG_RESOURCE_EMPTY');
    if (bytes.byteLength > catalogImageLimits.maximumByteSize) {
      throw validationError('CATALOG_RESOURCE_TOO_LARGE');
    }

    const signatureMimeType = detectCatalogImageMimeTypeBySignature(bytes);
    if (input.declaredMimeType !== signatureMimeType) {
      throw validationError('CATALOG_RESOURCE_MIME_MISMATCH');
    }
    assertFilenameExtension(input.originalFilenameSafe, signatureMimeType);

    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    try {
      metadata = await sharp(bytes, {
        animated: true,
        failOn: 'error',
        limitInputPixels: false,
        sequentialRead: true,
      }).metadata();
    } catch {
      throw validationError('CATALOG_RESOURCE_DECODE_FAILED');
    }

    if (metadata.mediaType !== signatureMimeType) {
      throw validationError('CATALOG_RESOURCE_MIME_MISMATCH');
    }
    const width = metadata.width;
    const height = metadata.pageHeight ?? metadata.height;
    if (width === undefined || height === undefined || width <= 0 || height <= 0) {
      throw validationError('CATALOG_RESOURCE_DIMENSIONS_INVALID');
    }
    if (
      width < catalogImageLimits.minimumDimensionPx ||
      height < catalogImageLimits.minimumDimensionPx ||
      width > catalogImageLimits.maximumDimensionPx ||
      height > catalogImageLimits.maximumDimensionPx
    ) {
      throw validationError('CATALOG_RESOURCE_DIMENSIONS_OUT_OF_RANGE');
    }
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || pixels > catalogImageLimits.maximumPixels) {
      throw validationError('CATALOG_RESOURCE_MEGAPIXELS_EXCEEDED');
    }

    try {
      await sharp(bytes, {
        animated: true,
        failOn: 'error',
        limitInputPixels: catalogImageLimits.maximumPixels,
        sequentialRead: true,
      }).stats();
    } catch {
      throw validationError('CATALOG_RESOURCE_DECODE_FAILED');
    }

    return {
      byteSize: bytes.byteLength,
      heightPx: height,
      megapixels: pixels / 1_000_000,
      mimeTypeReal: signatureMimeType,
      originalFilenameSafe: input.originalFilenameSafe,
      secureStorageKey: input.secureStorageKey,
      sha256Hex: createHash('sha256').update(bytes).digest('hex'),
      widthPx: width,
    };
  }
}

export function detectCatalogImageMimeTypeBySignature(bytes: Buffer): CatalogImageMimeType {
  if (isJpeg(bytes)) return 'image/jpeg';
  if (isPng(bytes)) return 'image/png';
  if (isWebp(bytes)) return 'image/webp';
  if (isAvif(bytes)) return 'image/avif';
  throw validationError('CATALOG_RESOURCE_FORMAT_UNSUPPORTED');
}

function assertFilenameExtension(filename: string, detectedMimeType: CatalogImageMimeType): void {
  const extension = extname(filename).toLowerCase();
  if (extension === '' || extensionMimeTypes.get(extension) !== detectedMimeType) {
    throw validationError('CATALOG_RESOURCE_EXTENSION_MISMATCH');
  }
}

function isJpeg(bytes: Buffer): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  );
}

function isPng(bytes: Buffer): boolean {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.byteLength < 33 || !bytes.subarray(0, 8).equals(signature)) return false;
  let offset = 8;
  let first = true;
  while (offset + 12 <= bytes.byteLength) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.byteLength) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (first && (type !== 'IHDR' || length !== 13)) return false;
    first = false;
    offset = end;
    if (type === 'IEND') return length === 0 && offset === bytes.byteLength;
  }
  return false;
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.byteLength >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' &&
    bytes.readUInt32LE(4) + 8 === bytes.byteLength
  );
}

function isAvif(bytes: Buffer): boolean {
  if (bytes.byteLength < 16 || bytes.toString('ascii', 4, 8) !== 'ftyp') return false;
  const ftypSize = bytes.readUInt32BE(0);
  if (ftypSize < 16 || ftypSize > bytes.byteLength) return false;
  const brands: string[] = [bytes.toString('ascii', 8, 12)];
  for (let offset = 16; offset + 4 <= ftypSize; offset += 4) {
    brands.push(bytes.toString('ascii', offset, offset + 4));
  }
  if (!brands.some((brand) => brand === 'avif' || brand === 'avis')) return false;

  let offset = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) return false;
    const size32 = bytes.readUInt32BE(offset);
    let boxSize: number;
    let headerSize = 8;
    if (size32 === 0) boxSize = bytes.byteLength - offset;
    else if (size32 === 1) {
      if (offset + 16 > bytes.byteLength) return false;
      const size64 = bytes.readBigUInt64BE(offset + 8);
      if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      boxSize = Number(size64);
      headerSize = 16;
    } else boxSize = size32;
    if (boxSize < headerSize || offset + boxSize > bytes.byteLength) return false;
    offset += boxSize;
  }
  return offset === bytes.byteLength;
}

function validationError(code: string): CatalogError {
  return new CatalogError(
    code,
    'VALIDATION',
    'Catalog image failed the current catalog image contract.',
  );
}
