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
  const info = await sharp(original)
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toFile(path.join(destination, `${name}.webp`));
  await sharp(original)
    .resize({ width: 320, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(path.join(destination, `${name}-320.webp`));
  decks[game].push({
    front: `/art/hero/rotation/${name}.webp`,
    frontSmall: `/art/hero/rotation/${name}-320.webp`,
    frontWidth: info.width,
    frontHeight: info.height,
  });
  mapping.push({ source: file, game, file: `${name}.webp` });
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
