import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = path.resolve('ij');
const destination = path.resolve('public/art/hero/rotation');
await mkdir(destination, { recursive: true });
const files = (await readdir(source))
  .filter((file) => file.endsWith('.webp'))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
const decks = { yugioh: [], mitos: [] };
const mapping = [];
for (const file of files) {
  const game = file.startsWith('719')
    ? 'mitos'
    : file.startsWith('1918') || file.startsWith('rn-image_picker_')
      ? 'yugioh'
      : null;
  if (!game) throw Error(`Clasificación pendiente: ${file}`);
  const name = `${game}-${String(decks[game].length + 1).padStart(2, '0')}`;
  const original = path.join(source, file);
  // The supplied scans include dark/transparent margins outside the card.
  // Crop that empty canvas before resizing so every card fills its plane.
  const { data, info: raw } = await sharp(original)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let left = raw.width,
    top = raw.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < raw.height; y++)
    for (let x = 0; x < raw.width; x++) {
      const i = (y * raw.width + x) * 4;
      if (data[i + 3] > 20 && Math.max(data[i], data[i + 1], data[i + 2]) > 30) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left) throw Error(`Carta vacía: ${file}`);
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const info = await sharp(original)
    .extract(bounds)
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(path.join(destination, `${name}.webp`));
  await sharp(original)
    .extract(bounds)
    .resize({ width: 320, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(path.join(destination, `${name}-320.webp`));
  decks[game].push({
    front: `/art/hero/rotation/${name}.webp`,
    frontSmall: `/art/hero/rotation/${name}-320.webp`,
    frontWidth: info.width,
    frontHeight: info.height,
  });
  mapping.push({ source: file, game, file: `${name}.webp`, bounds });
}
await writeFile('lib/hero/rotation-assets.json', JSON.stringify(decks, null, 2) + '\n');
await writeFile(path.join(destination, 'sources.json'), JSON.stringify(mapping, null, 2) + '\n');
console.log(
  JSON.stringify({
    yugioh: decks.yugioh.length,
    mitos: decks.mitos.length,
    originalsUnchanged: true,
  }),
);
