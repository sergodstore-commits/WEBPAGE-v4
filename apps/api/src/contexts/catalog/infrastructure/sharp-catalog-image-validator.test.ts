import { createHash } from 'node:crypto';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { createCatalogImageFixture } from '../../../../tests/support/catalog-image-fixtures.js';
import type { CatalogImageMimeType } from '../domain/catalog.js';
import {
  catalogImageOptimizationMaximumDimensionPx,
  SharpCatalogImageOptimizer,
  SharpCatalogImageValidator,
} from './sharp-catalog-image-validator.js';

const validator = new SharpCatalogImageValidator();
const optimizer = new SharpCatalogImageOptimizer();
const storageKey = '0198a8be-6677-7000-8000-000000000003';

const filenames: Record<CatalogImageMimeType, string> = {
  'image/avif': 'asset.avif',
  'image/jpeg': 'asset.jpg',
  'image/png': 'asset.png',
  'image/webp': 'asset.webp',
};

describe('Sharp catalog image validation', () => {
  for (const mimeType of Object.keys(filenames) as CatalogImageMimeType[]) {
    it(`fully validates ${mimeType}`, async () => {
      const bytes = await createCatalogImageFixture(mimeType);
      const descriptor = await validator.validate({
        bytes,
        declaredMimeType: mimeType,
        originalFilenameSafe: filenames[mimeType],
        secureStorageKey: storageKey,
      });
      expect(descriptor).toMatchObject({
        byteSize: bytes.byteLength,
        heightPx: 320,
        megapixels: 0.1024,
        mimeTypeReal: mimeType,
        originalFilenameSafe: filenames[mimeType],
        secureStorageKey: storageKey,
        widthPx: 320,
      });
      expect(descriptor.sha256Hex).toBe(createHash('sha256').update(bytes).digest('hex'));
    });
  }

  it('rejects declared MIME and filename extension mismatches', async () => {
    const bytes = await createCatalogImageFixture('image/png');
    await expect(validate(bytes, 'image/jpeg', 'asset.png')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_MIME_MISMATCH',
    });
    await expect(validate(bytes, 'image/png', 'asset.exe')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_EXTENSION_MISMATCH',
    });
  });

  it.each([
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['HTML', '<!doctype html><script>alert(1)</script>'],
    ['XML', '<?xml version="1.0"?><root/>'],
    ['JavaScript', 'console.log("unsafe")'],
  ])('rejects %s content', async (_label, source) => {
    await expect(validate(Buffer.from(source), 'image/png', 'asset.png')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_FORMAT_UNSUPPORTED',
    });
  });

  it.each([
    ['ZIP', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
    ['Windows executable', Buffer.from([0x4d, 0x5a, 0x90, 0, 0, 0])],
  ])('rejects %s bytes', async (_label, bytes) => {
    await expect(validate(bytes, 'image/png', 'asset.png')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_FORMAT_UNSUPPORTED',
    });
  });

  it('rejects truncated, corrupt and appended executable content', async () => {
    const png = Buffer.from(await createCatalogImageFixture('image/png'));
    await expect(validate(png.subarray(0, 24), 'image/png', 'asset.png')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_FORMAT_UNSUPPORTED',
    });
    const corrupt = Buffer.from(png);
    const corruptIndex = Math.floor(corrupt.length / 2);
    corrupt[corruptIndex] = (corrupt[corruptIndex] ?? 0) ^ 0xff;
    await expect(validate(corrupt, 'image/png', 'asset.png')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_DECODE_FAILED',
    });
    const jpeg = Buffer.from(await createCatalogImageFixture('image/jpeg'));
    const polyglot = Buffer.concat([jpeg, Buffer.from('MZ executable')]);
    await expect(validate(polyglot, 'image/jpeg', 'asset.jpg')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_FORMAT_UNSUPPORTED',
    });
  });

  it('rejects bytes and dimensions outside the configured limits', async () => {
    await expect(
      validate(Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png', 'asset.png'),
    ).rejects.toMatchObject({ code: 'CATALOG_RESOURCE_TOO_LARGE' });
    const tooSmall = await createCatalogImageFixture('image/png', 319, 320);
    await expect(validate(tooSmall, 'image/png', 'asset.png')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_DIMENSIONS_OUT_OF_RANGE',
    });
    const tooWide = await createCatalogImageFixture('image/png', 8193, 320);
    await expect(validate(tooWide, 'image/png', 'asset.png')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_DIMENSIONS_OUT_OF_RANGE',
    });
    const tooManyPixels = await createCatalogImageFixture('image/png', 7000, 6000);
    await expect(validate(tooManyPixels, 'image/png', 'asset.png')).rejects.toMatchObject({
      code: 'CATALOG_RESOURCE_MEGAPIXELS_EXCEEDED',
    });
  });
});

describe('Sharp catalog image optimization', () => {
  it('reduces oversized images without changing their format or proportions', async () => {
    const bytes = await createCatalogImageFixture('image/jpeg', 2560, 1440);
    const optimized = await optimizer.optimize({
      bytes,
      declaredMimeType: 'image/jpeg',
      originalFilenameSafe: 'asset.jpg',
    });
    const metadata = await sharp(optimized).metadata();

    expect(optimized.byteLength).toBeLessThan(bytes.byteLength);
    expect(metadata).toMatchObject({
      format: 'jpeg',
      height: 1350,
      width: catalogImageOptimizationMaximumDimensionPx,
    });
    await expect(validate(optimized, 'image/jpeg', 'asset.jpg')).resolves.toMatchObject({
      heightPx: 1350,
      widthPx: catalogImageOptimizationMaximumDimensionPx,
    });
  });

  for (const mimeType of Object.keys(filenames) as CatalogImageMimeType[]) {
    it(`keeps an efficient ${mimeType} in its original safe format`, async () => {
      const bytes = await createCatalogImageFixture(mimeType, 640, 480);
      const optimized = await optimizer.optimize({
        bytes,
        declaredMimeType: mimeType,
        originalFilenameSafe: filenames[mimeType],
      });
      const metadata = await sharp(optimized).metadata();

      expect(optimized.byteLength).toBeLessThanOrEqual(bytes.byteLength);
      expect(metadata.format).toBe(mimeType === 'image/avif' ? 'heif' : mimeType.split('/')[1]);
      expect(metadata.width).toBe(640);
      expect(metadata.height).toBe(480);
      await expect(validate(optimized, mimeType, filenames[mimeType])).resolves.toMatchObject({
        heightPx: 480,
        widthPx: 640,
      });
    });
  }

  it('never enlarges an already suitable image', async () => {
    const bytes = await createCatalogImageFixture('image/webp');
    const optimized = await optimizer.optimize({
      bytes,
      declaredMimeType: 'image/webp',
      originalFilenameSafe: 'asset.webp',
    });
    const metadata = await sharp(optimized).metadata();
    expect(metadata).toMatchObject({ height: 320, width: 320 });
    expect(optimized.byteLength).toBeLessThanOrEqual(bytes.byteLength);
  });

  it('rejects a false MIME declaration before optimization', async () => {
    const bytes = await createCatalogImageFixture('image/png');
    await expect(
      optimizer.optimize({
        bytes,
        declaredMimeType: 'image/jpeg',
        originalFilenameSafe: 'asset.jpg',
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_RESOURCE_MIME_MISMATCH' });
  });
});

async function validate(bytes: Uint8Array, declaredMimeType: string, originalFilenameSafe: string) {
  return validator.validate({
    bytes,
    declaredMimeType,
    originalFilenameSafe,
    secureStorageKey: storageKey,
  });
}
