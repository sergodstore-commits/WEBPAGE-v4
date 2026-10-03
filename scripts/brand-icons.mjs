import sharp from 'sharp';

// Crop the existing S from the supplied logo. No redrawing or generated artwork.
const monogram = await sharp('public/brand/sergod-logo.webp')
  .extract({ left: 40, top: 175, width: 430, height: 455 })
  .resize(432, 432, { fit: 'contain', background: '#080a0d' })
  .png()
  .toBuffer();
for (const [name, size] of [
  ['favicon-32', 32],
  ['favicon-192', 192],
  ['apple-touch-icon', 180],
]) {
  await sharp(monogram).resize(size, size).png().toFile(`public/brand/${name}.png`);
}
