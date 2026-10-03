import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import sharp from 'sharp';

// Keep the supplied originals untouched. These are delivery copies, not new artwork.
const cards = ['yugioh-front', 'yugioh-back', 'mitos-front', 'mitos-back'];
const summary = [];
for (const name of cards) {
  const source = `public/art/hero/${name}.png`;
  const original = await readFile(source);
  const hash = createHash('sha256').update(original).digest('hex');
  const metadata = await sharp(original).metadata();
  const full = `public/art/hero/${name}.webp`;
  const small = `public/art/hero/${name}-320.webp`;
  await sharp(original).webp({ quality: 92, effort: 6, smartSubsample: true }).toFile(full);
  await sharp(original)
    .resize({ width: 320, withoutEnlargement: true })
    .webp({ quality: 92, effort: 6, smartSubsample: true })
    .toFile(small);
  if (
    createHash('sha256')
      .update(await readFile(source))
      .digest('hex') !== hash
  ) {
    throw new Error(`Original changed: ${source}`);
  }
  summary.push({
    name,
    width: metadata.width,
    originalBytes: original.length,
    fullBytes: (await stat(full)).size,
    smallBytes: (await stat(small)).size,
    originalPreserved: true,
  });
}

const logo = await readFile('public/brand/sergod-logo.webp');
await sharp(logo)
  .resize({ width: 480, withoutEnlargement: true })
  .webp({ quality: 95, effort: 6, smartSubsample: true })
  .toFile('public/brand/sergod-logo-480.webp');
if (!(await readFile('public/brand/sergod-logo.webp')).equals(logo))
  throw new Error('Logo original changed');
console.log(
  JSON.stringify(
    {
      cards: summary,
      totals: {
        originalBytes: summary.reduce((total, card) => total + card.originalBytes, 0),
        fullBytes: summary.reduce((total, card) => total + card.fullBytes, 0),
        smallBytes: summary.reduce((total, card) => total + card.smallBytes, 0),
      },
      logo: {
        originalBytes: logo.length,
        optimizedBytes: (await stat('public/brand/sergod-logo-480.webp')).size,
      },
    },
    null,
    2,
  ),
);
