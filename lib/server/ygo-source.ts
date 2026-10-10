import { z } from 'zod';
import { boundedBytes, fail } from './core';

const entities: Record<string, string> = {
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
export function spanishPlain(html: string) {
  let text = html;
  for (let i = 0; i < 3; i++)
    text = text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity] ?? match;
      const number = parseInt(
        entity.slice(entity[1].toLowerCase() === 'x' ? 2 : 1),
        entity[1].toLowerCase() === 'x' ? 16 : 10,
      );
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    });
  return text
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}
export function spanishCard(html: string) {
  const name = spanishPlain(html.match(/<title>([^|]+)\|/)?.[1] ?? '');
  const effects = [
    ...html
      .split('class="CardLanguage')[0]
      .matchAll(/<div class="text_linebreak">([\s\S]*?)<\/div>/g),
  ].map((match) => spanishPlain(match[1]));
  if (
    !html.includes('Texto de la Carta') ||
    !name ||
    !effects.length ||
    effects.some((effect) => effect.length < 10 || /&\w+;|<[^>]+>/.test(effect))
  )
    fail(
      409,
      'Falta el texto oficial en español de una carta. Podrás reanudar cuando esté disponible.',
    );
  return { name, effects };
}
export async function sourceBytes(url: string, limit: number, timeout = 12000) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !['db.ygoprodeck.com', 'images.ygoprodeck.com', 'www.db.yugioh-card.com'].includes(
      parsed.hostname,
    )
  )
    fail(400, 'Fuente no autorizada.');
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store',
    });
    if (!response.ok)
      fail(502, 'La fuente no está disponible. Conservamos el avance; intenta más tarde.');
    return Buffer.from(await boundedBytes(response, limit));
  } catch (error) {
    if (error instanceof Error && 'status' in error) throw error;
    fail(
      502,
      'La fuente tardó demasiado o no respondió. Conservamos el avance; intenta más tarde.',
    );
  }
}
const printing = z.object({
  set_name: z.string().max(200),
  set_code: z.string().max(50),
  set_rarity: z.string().max(60),
});
const sourceCard = z.object({
  id: z.number().int().positive().max(9999999999),
  name: z.string().min(1).max(200),
  type: z.string().max(80),
  attribute: z.string().max(30).nullish(),
  atk: z.number().nullish(),
  def: z.number().nullish(),
  level: z.number().nullish(),
  linkval: z.number().nullish(),
  card_sets: z.array(printing).max(300),
  misc_info: z
    .array(z.object({ konami_id: z.number().int().positive().max(999999).nullish() }))
    .optional(),
  card_images: z
    .array(z.object({ image_url: z.string().url().max(500) }))
    .min(1)
    .max(50),
});
export type ManifestCard = {
  id: number;
  cid: number | null;
  englishName: string;
  printings: { code: string; rarity: string }[];
  imageSource: string;
  type: string;
  attribute: string;
  atk: number | null;
  def: number | null;
  level: number | null;
  link: number | null;
};
export async function editionManifest(name: string): Promise<ManifestCard[]> {
  const bytes = await sourceBytes(
    `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(name)}&misc=yes`,
    4_000_000,
  );
  const result = z
    .object({ data: z.array(sourceCard).min(1).max(500) })
    .safeParse(JSON.parse(bytes.toString()));
  if (!result.success)
    fail(409, 'El catálogo de esta edición todavía no está completo o cambió de formato.');
  const seen = new Set<number>();
  return result.data.data
    .filter((card) => !seen.has(card.id) && Boolean(seen.add(card.id)))
    .map((card) => {
      const printings = card.card_sets
        .filter((set) => set.set_name === name)
        .map((set) => ({ code: set.set_code, rarity: set.set_rarity }));
      const imageSource = card.card_images[0].image_url;
      if (
        !printings.length ||
        !/^https:\/\/images\.ygoprodeck\.com\/images\/cards\/\d+\.jpg$/.test(imageSource)
      )
        fail(409, 'La fuente devolvió una carta sin edición o imagen verificable.');
      return {
        id: card.id,
        cid: card.misc_info?.[0]?.konami_id ?? null,
        englishName: card.name,
        printings,
        imageSource,
        type: card.type,
        attribute: card.attribute ?? '',
        atk: card.atk ?? null,
        def: card.def ?? null,
        level: card.level ?? null,
        link: card.linkval ?? null,
      };
    });
}
export async function discoverSets() {
  const bytes = await sourceBytes('https://db.ygoprodeck.com/api/v7/cardsets.php', 2_000_000);
  const rows = z
    .array(
      z.object({
        set_name: z.string().min(1).max(200),
        set_code: z.string().regex(/^[A-Z0-9-]{2,20}$/),
        num_of_cards: z.number().int().positive(),
        tcg_date: z.string().optional(),
      }),
    )
    .parse(JSON.parse(bytes.toString()));
  const start = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  return rows
    .filter(
      (row) =>
        row.tcg_date &&
        /^\d{4}-\d{2}-\d{2}$/.test(row.tcg_date) &&
        row.tcg_date >= start &&
        row.num_of_cards <= 500,
    )
    .sort((a, b) => b.tcg_date!.localeCompare(a.tcg_date!))
    .slice(0, 60)
    .map((row) => ({
      code: row.set_code.toLowerCase(),
      name: row.set_name,
      expected: row.num_of_cards,
      release_date: row.tcg_date!,
    }));
}
