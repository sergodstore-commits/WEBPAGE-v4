// Run manually when reviewing this edition. Visitors never call these providers.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const cache = '.data/betb-import';
const output = 'public/editions/betb';
await fs.mkdir(cache, { recursive: true });
await fs.mkdir(output, { recursive: true });
const entities = {
  iexcl: '¡',
  iquest: '¿',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  bull: '•',
  middot: '·',
};
const plain = (html) => {
  let text = html;
  for (let i = 0; i < 3; i++)
    text = text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) =>
      entity.startsWith('#')
        ? String.fromCodePoint(
            parseInt(entity.slice(entity[1] === 'x' ? 2 : 1), entity[1] === 'x' ? 16 : 10),
          )
        : (entities[entity] ?? match),
    );
  return text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
};
async function cached(file, url) {
  try {
    return await fs.readFile(file);
  } catch {}
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Source returned ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(file, bytes);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return bytes;
}
const data = JSON.parse(
  await cached(
    `${cache}/cards.json`,
    'https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=Beyond%20the%20Brave&misc=yes',
  ),
);
if (data.data?.length !== 100)
  throw new Error('Review the complete edition before changing its expected 100 cards.');
const cards = [];
for (const card of data.data) {
  const cid = card.misc_info[0].konami_id;
  const source = `https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${cid}&request_locale=es`;
  const html = (await cached(`${cache}/${cid}-es.html`, source)).toString('utf8');
  const name = plain(html.match(/<title>([^|]+)\|/)?.[1] ?? '');
  const effects = [
    ...html
      .split('class="CardLanguage')[0]
      .matchAll(/<div class="text_linebreak">([\s\S]*?)<\/div>/g),
  ].map((match) => plain(match[1]));
  if (
    !name ||
    !effects.length ||
    effects.some((effect) => effect.length < 10 || /&\w+;|<[^>]+>/.test(effect))
  )
    throw new Error(`Missing or malformed Spanish text: ${card.name}`);
  const imageUrl = card.card_images[0].image_url;
  if (!imageUrl.startsWith('https://images.ygoprodeck.com/images/cards/'))
    throw new Error('Unexpected image source');
  const image = await cached(`${cache}/${card.id}.jpg`, imageUrl);
  await sharp(image)
    .rotate()
    .resize({ width: 600, withoutEnlargement: true })
    .webp({ quality: 83 })
    .toFile(`${output}/${card.id}.webp`);
  await sharp(image)
    .rotate()
    .resize({ width: 220, withoutEnlargement: true })
    .webp({ quality: 76 })
    .toFile(`${output}/${card.id}-thumb.webp`);
  const printings = card.card_sets
    .filter((set) => set.set_name === 'Beyond the Brave')
    .map((set) => ({ code: set.set_code, rarity: set.set_rarity }));
  cards.push({
    id: card.id,
    name,
    englishName: card.name,
    effects,
    printings,
    source,
    image: `/editions/betb/${card.id}.webp`,
    thumbnail: `/editions/betb/${card.id}-thumb.webp`,
    type: card.type,
    attribute: card.attribute ?? '',
    atk: card.atk ?? null,
    def: card.def ?? null,
    level: card.level ?? null,
    link: card.linkval ?? null,
  });
  if (cards.length % 10 === 0) console.log(`${cards.length}/100 Spanish cards and images prepared`);
}
cards.sort((a, b) => a.printings[0].code.localeCompare(b.printings[0].code));
await fs.writeFile(`${output}/cards.json`, JSON.stringify({ updated: '2026-10-09', cards }));
const files = await fs.readdir(output);
const sizes = await Promise.all(
  files.map(async (file) => (await fs.stat(path.join(output, file))).size),
);
console.log(
  JSON.stringify({
    cards: cards.length,
    files: files.length,
    bytes: sizes.reduce((a, b) => a + b, 0),
    largest: Math.max(...sizes),
  }),
);
