import sharp from 'sharp';

import type { CatalogImageMimeType } from '../../src/contexts/catalog/domain/catalog.js';

export async function createCatalogImageFixture(
  mimeType: CatalogImageMimeType,
  width = 320,
  height = 320,
): Promise<Uint8Array> {
  const image = sharp({
    create: { background: { b: 90, g: 60, r: 30 }, channels: 3, height, width },
  });
  switch (mimeType) {
    case 'image/avif':
      return image.avif().toBuffer();
    case 'image/jpeg':
      return image.jpeg().toBuffer();
    case 'image/png':
      return image.png().toBuffer();
    case 'image/webp':
      return image.webp().toBuffer();
  }
}
