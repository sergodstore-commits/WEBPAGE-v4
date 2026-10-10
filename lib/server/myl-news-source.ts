import { z } from 'zod';
import { boundedBytes, fail, hash } from './core';
import { getDb } from './db';
import { withLease } from './edition-imports';
import {
  mylArticle,
  mylNewsImage,
  type MylNewsBoard,
  type WebNewsCandidate,
  type WebNewsMedia,
} from '../web-news';
import { validDay } from '../tournament-schedule';

// WordPress's public API supplies dates and category IDs; never fetch a caller's URL.
const API = 'https://blog.myl.cl/wp-json/wp/v2/';
async function read(resource: string) {
  try {
    const r = await fetch(API + resource, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw Error();
    return JSON.parse(Buffer.from(await boundedBytes(r, 2_500_000)).toString());
  } catch {
    fail(502, 'El blog de MyL no respondió correctamente. Tu selección se conserva.');
  }
}
export function mylText(html: string) {
  const entities: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    lt: '<',
    gt: '>',
    aacute: 'á',
    eacute: 'é',
    iacute: 'í',
    oacute: 'ó',
    uacute: 'ú',
    ntilde: 'ñ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
  };
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, key: string) => {
      if (!key.startsWith('#')) return entities[key.toLowerCase()] || all;
      const number =
        key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}
const post = z.object({
  id: z.number().int().positive(),
  link: z.string().max(1000),
  date: z.string().max(40),
  title: z.object({ rendered: z.string().max(2000) }),
  excerpt: z.object({ rendered: z.string().max(10000) }),
  categories: z.array(z.number().int()).max(100),
  _embedded: z
    .object({
      'wp:featuredmedia': z
        .array(z.object({ source_url: z.string().max(1000).optional() }).passthrough())
        .optional(),
    })
    .passthrough()
    .optional(),
});
export function parseMylNews(
  input: unknown,
  categories: { era: Set<number>; block: Set<number> },
): WebNewsCandidate[] {
  if (!Array.isArray(input) || input.length > 100) fail(502, 'Cambió el listado del blog de MyL.');
  const items = new Map<string, WebNewsCandidate>();
  for (const raw of input) {
    const result = post.safeParse(raw);
    if (!result.success) continue;
    const p = result.data,
      url = mylArticle(p.link),
      title = mylText(p.title.rendered);
    const published_on = p.date.slice(0, 10);
    if (!url || !validDay(published_on) || !title) continue;
    const banlist = /ban\s*list/i.test(title);
    const eraTitle = /primera era|\bPE\b/i.test(title),
      blockTitle = /primer bloque|\bPB\b/i.test(title);
    if (!banlist && /\bimperio\b|furia extendido|nueva era/i.test(title)) continue;
    let boards: MylNewsBoard[] = [];
    if (eraTitle) boards.push('myl-first-era');
    if (blockTitle) boards.push('myl-first-block');
    if (!boards.length) {
      if (p.categories.some((id) => categories.era.has(id))) boards.push('myl-first-era');
      if (p.categories.some((id) => categories.block.has(id))) boards.push('myl-first-block');
    }
    // A general banlist can cover both formats even if WordPress only tags one.
    if (banlist && /general/i.test(title)) boards = ['myl-first-era', 'myl-first-block'];
    if (!boards.length) continue;
    items.set(url, {
      id: `myl-${hash(url).slice(0, 24)}`,
      url,
      title: title.slice(0, 160),
      summary: mylText(p.excerpt.rendered).slice(0, 600),
      published_on,
      boards,
      category: banlist
        ? 'banlist'
        : /torneo|premier|nacional/i.test(title)
          ? 'tournaments'
          : /lanzamiento|producto|toolkit/i.test(title)
            ? 'releases'
            : 'news',
      source_image: mylNewsImage(p._embedded?.['wp:featuredmedia']?.[0]?.source_url || '') || '',
    });
  }
  return [...items.values()].sort(
    (a, b) => b.published_on.localeCompare(a.published_on) || a.id.localeCompare(b.id),
  );
}
export async function reviewMylNews() {
  return withLease(async () => {
    const db = await getDb();
    const old = (
      await db.query("SELECT data->'myl_news_discovery' AS discovery FROM settings WHERE id=1")
    ).rows[0]?.discovery;
    if (old && Date.now() - Date.parse(old.checked_at) < 5 * 60_000) return old;
    const raw = await read('categories?per_page=100&_fields=id,slug,parent');
    const cats = z
      .array(z.object({ id: z.number().int(), slug: z.string(), parent: z.number().int() }))
      .max(100)
      .parse(raw);
    function descendants(slug: string) {
      const root = cats.find((c) => c.slug === slug);
      if (!root) fail(502, 'No se encontró el formato en el blog de MyL.');
      const ids = new Set([root.id]);
      for (let depth = 0; depth < cats.length; depth++)
        for (const c of cats) if (ids.has(c.parent)) ids.add(c.id);
      return ids;
    }
    const categories = { era: descendants('primera-era'), block: descendants('primer-bloque') };
    const fields =
      '&_embed=wp:featuredmedia&_fields=id,link,date,title,excerpt,categories,_links,_embedded';
    const responses = await Promise.all([
      read(`posts?per_page=30&categories=${[...categories.era].join(',')}${fields}`),
      read(`posts?per_page=30&categories=${[...categories.block].join(',')}${fields}`),
      read(`posts?per_page=10&search=banlist${fields}`),
    ]);
    const items = parseMylNews(responses.flat(), categories);
    if (!items.length)
      fail(502, 'No pudimos verificar noticias de estos formatos. Tu selección se conserva.');
    const result = { checked_at: new Date().toISOString(), items };
    await db.query(
      "UPDATE settings SET data=jsonb_set(data,'{myl_news_discovery}',$1::jsonb,true) WHERE id=1",
      [JSON.stringify(result)],
    );
    return result;
  });
}
export function mylImageManifest(html: string): WebNewsMedia[] {
  const media = new Map<string, WebNewsMedia>();
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = new Map(
      [...match[0].matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map((a) => [
        a[1].toLowerCase(),
        a[3],
      ]),
    );
    const raw = attributes.get('src');
    if (!raw) continue;
    const url = mylNewsImage(raw);
    if (!url)
      fail(409, 'El artículo incluye imágenes externas al blog MyL. Conservamos el borrador.');
    media.set(url, {
      source: url,
      name: mylText(attributes.get('alt') || 'Imagen de MyL').slice(0, 200) || 'Imagen de MyL',
      caption: '',
    });
  }
  if (media.size > 100) fail(409, 'Este artículo supera las 100 imágenes admitidas.');
  return [...media.values()];
}
export async function mylArticleImages(value: string) {
  const url = mylArticle(value);
  if (!url) fail(400, 'Artículo MyL no válido.');
  const slug = new URL(url).pathname.split('/')[1];
  const data = await read(`posts?slug=${encodeURIComponent(slug)}&per_page=1&_fields=link,content`);
  const rows = z
    .array(
      z.object({ link: z.string(), content: z.object({ rendered: z.string().max(2_000_000) }) }),
    )
    .length(1)
    .safeParse(data);
  if (!rows.success || mylArticle(rows.data[0].link) !== url)
    fail(409, 'No pudimos verificar el artículo original de MyL.');
  return mylImageManifest(rows.data[0].content.rendered);
}
