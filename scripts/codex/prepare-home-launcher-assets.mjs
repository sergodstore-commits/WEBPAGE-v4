import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = `${root}design/`;
const canonicalSourceRoot = `${root}design/source-existing/home-launcher/`;
const approvedRoot = `${root}design/approved/home-launcher/`;
const publicRoot = `${root}apps/web/public/assets/sergod/home-launcher/`;

const sources = {
  comics: 'ChatGPT Image 18 ago 2026, 03_43_06 p.m. (7).png',
  community: 'ChatGPT Image 18 ago 2026, 03_43_06 p.m. (2).png',
  loyalty: 'ChatGPT Image 18 ago 2026, 03_43_06 p.m. (5).png',
  news: 'ChatGPT Image 18 ago 2026, 03_43_06 p.m. (1).png',
  preorders: 'ChatGPT Image 18 ago 2026, 03_43_06 p.m. (4).png',
  quests: 'ChatGPT Image 18 ago 2026, 03_43_06 p.m. (6).png',
  shop: 'ChatGPT Image 18 ago 2026, 03_41_05 p.m.png',
  tournaments: 'ChatGPT Image 18 ago 2026, 03_43_06 p.m. (3).png',
};

await mkdir(approvedRoot, { recursive: true });
await mkdir(canonicalSourceRoot, { recursive: true });
await mkdir(publicRoot, { recursive: true });

const assets = [];
for (const [name, sourceName] of Object.entries(sources)) {
  const sourcePath = `${sourceRoot}${sourceName}`;
  const canonicalSourcePath = `${canonicalSourceRoot}${name}.png`;
  try {
    await copyFile(sourcePath, canonicalSourcePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const output = await sharp(canonicalSourcePath)
    .resize({ width: 1086, withoutEnlargement: true })
    .webp({ alphaQuality: 100, effort: 3, quality: 90 })
    .toBuffer();
  const metadata = await sharp(output).metadata();
  const approvedPath = `${approvedRoot}${name}.webp`;
  await writeFile(approvedPath, output);
  await writeFile(`${publicRoot}${name}.webp`, output);
  assets.push({
    bytes: output.byteLength,
    height: metadata.height,
    id: `home-launcher-${name}`,
    path: `design/approved/home-launcher/${name}.webp`,
    publicPath: `/assets/sergod/home-launcher/${name}.webp`,
    sha256: createHash('sha256').update(output).digest('hex'),
    sourcePath: `design/source-existing/home-launcher/${name}.png`,
    width: metadata.width,
  });
}

const manifest = {
  approvalBasis: 'Explicit owner approval for linked home access artwork on 2026-09-14',
  assets,
  schemaVersion: 1,
};
await writeFile(
  `${root}design/manifest/APPROVED-HOME-LAUNCHER-ASSETS.json`,
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

// Guard against a partially generated library.
for (const asset of assets) await readFile(`${root}${asset.path}`);
