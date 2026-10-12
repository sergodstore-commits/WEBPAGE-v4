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
import { newsText, newsHtmlTree, extractNewsBlocks, contentBody } from './news-content';
import type { WebNewsBlock, WebNewsItem } from '../web-news';
import { editorialText, NEWS_DISCOVERY_POLICY_VERSION } from './news-editorial';

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
export const mylText = newsText;
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
type MylNewsCategories = {
  era: Set<number>;
  block: Set<number>;
  products?: Set<number>;
  reveals?: Set<number>;
  excluded?: Set<number>;
};

function mylEditorialCategory(title: string, categoryIds: number[], categories: MylNewsCategories) {
  const text = editorialText(title);
  if (
    /ban\s*list|\b(?:torneos?|premier|nacional|campeon|oraculo|juego organizado|metajuego|decklists?)\b/.test(
      text,
    )
  )
    return null;
  if (categoryIds.some((id) => categories.excluded?.has(id))) return null;
  if (/\brevela|\bspoiler|primer vistazo|\bnuevas? cartas?\b/.test(text)) return 'reveals';
  const product =
    /\b(?:lanzamiento|producto|toolkit|kit|contenido|display|sobres?|preventa|coleccion|edicion|relatos)\b|\bleyendas (?:de |del |primera era|primer bloque|pe\b|pb\b|\d)/.test(
      text,
    );
  if (product) return /[:–]|\s-\s/.test(title) ? 'reveals' : 'releases';
  if (categoryIds.some((id) => categories.reveals?.has(id))) return 'reveals';
  if (categoryIds.some((id) => categories.products?.has(id))) return 'releases';
  return null;
}

export function parseMylNews(input: unknown, categories: MylNewsCategories): WebNewsCandidate[] {
  if (!Array.isArray(input) || input.length > 100) fail(502, 'Cambió el listado del blog de MyL.');
  const items = new Map<string, WebNewsCandidate>();
  let verified = 0;
  for (const raw of input) {
    const result = post.safeParse(raw);
    if (!result.success) continue;
    const p = result.data,
      url = mylArticle(p.link),
      title = mylText(p.title.rendered);
    const published_on = p.date.slice(0, 10);
    if (!url || !validDay(published_on) || !title) continue;
    verified++;
    const category = mylEditorialCategory(title, p.categories, categories);
    if (!category) continue;
    const eraTitle = /primera era|\bPE\b/i.test(title),
      blockTitle = /primer bloque|\bPB\b/i.test(title);
    if (/\bimperio\b|furia extendido|nueva era/i.test(title)) continue;
    let boards: MylNewsBoard[] = [];
    if (eraTitle) boards.push('myl-first-era');
    if (blockTitle) boards.push('myl-first-block');
    if (!boards.length) {
      if (p.categories.some((id) => categories.era.has(id))) boards.push('myl-first-era');
      if (p.categories.some((id) => categories.block.has(id))) boards.push('myl-first-block');
    }
    if (!boards.length) continue;
    items.set(url, {
      id: `myl-${hash(url).slice(0, 24)}`,
      url,
      title: title.slice(0, 160),
      summary: mylText(p.excerpt.rendered).slice(0, 600),
      published_on,
      boards,
      category,
      source_image: mylNewsImage(p._embedded?.['wp:featuredmedia']?.[0]?.source_url || '') || '',
    });
  }
  if (input.length && !verified)
    fail(502, 'Cambió el listado del blog de MyL. Tu selección se conserva.');
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
    if (
      old?.policy_version === NEWS_DISCOVERY_POLICY_VERSION &&
      Date.now() - Date.parse(old.checked_at) < 5 * 60_000
    )
      return old;
    const raw = await read('categories?per_page=100&_fields=id,slug,parent');
    const cats = z
      .array(z.object({ id: z.number().int(), slug: z.string(), parent: z.number().int() }))
      .max(100)
      .parse(raw);
    function descendants(slug: string, required = true) {
      const root = cats.find((c) => c.slug === slug);
      if (!root) {
        if (required) fail(502, 'No se encontró el formato en el blog de MyL.');
        return new Set<number>();
      }
      const ids = new Set([root.id]);
      for (let depth = 0; depth < cats.length; depth++)
        for (const c of cats) if (ids.has(c.parent)) ids.add(c.id);
      return ids;
    }
    const categories: MylNewsCategories = {
      era: descendants('primera-era'),
      block: descendants('primer-bloque'),
      products: new Set([
        ...descendants('productos-pex', false),
        ...descendants('productos-pbx', false),
      ]),
      reveals: descendants('spoiler', false),
      excluded: descendants('literatura', false),
    };
    const fields =
      '&_embed=wp:featuredmedia&_fields=id,link,date,title,excerpt,categories,_links,_embedded';
    const responses = await Promise.all([
      read(`posts?per_page=30&categories=${[...categories.era].join(',')}${fields}`),
      read(`posts?per_page=30&categories=${[...categories.block].join(',')}${fields}`),
      ...(categories.products!.size
        ? [read(`posts?per_page=20&categories=${[...categories.products!].join(',')}${fields}`)]
        : []),
    ]);
    if (!responses.every(Array.isArray))
      fail(502, 'Cambió el listado del blog de MyL. Tu selección se conserva.');
    const items = parseMylNews(responses.flat(), categories);
    const result = {
      checked_at: new Date().toISOString(),
      policy_version: NEWS_DISCOVERY_POLICY_VERSION,
      items,
    };
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
    const raw = attributes.get('data-src') || attributes.get('src');
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
export function compactMylBanlist(blocks: WebNewsBlock[], publishedOn?: string) {
  const result: WebNewsBlock[] = [];
  const effective_dates: WebNewsItem['effective_dates'] = {};
  let format: MylNewsBoard | undefined;
  let subformat = '';
  const monthNames = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  const allText = contentBody(blocks);
  const year = allText.match(/\b20\d{2}\b/)?.[0] || publishedOn?.slice(0, 4);
  // Dates are read from the source, including the PB clause that omits the year/month.
  for (const [board, label] of [
    ['myl-first-era', 'Primera Era'],
    ['myl-first-block', 'Primer Bloque'],
  ] as const) {
    const fragment = allText.match(
      new RegExp(`${label}[^.]*?(?:vigentes?|vigencia)[^.]*`, 'i'),
    )?.[0];
    const day = fragment?.match(/\b(\d{1,2}) de (\w+)(?: de (20\d{2}))?/i);
    const fallbackMonth = allText.match(/\b\d{1,2} de (\w+) de 20\d{2}/i)?.[1];
    const month = monthNames.indexOf((day?.[2] || fallbackMonth || '').toLowerCase()) + 1;
    const y = day?.[3] || year;
    const date =
      day && month && y ? `${y}-${String(month).padStart(2, '0')}-${day[1].padStart(2, '0')}` : '';
    if (validDay(date)) effective_dates[board] = date;
  }
  for (const block of blocks) {
    for (const line of block.text.split('\n')) {
      const text = line.replace(/^##\s*/, '').trim();
      if (/^(?:actualización banlist formato )?(?:imperio|furia extendido)$/i.test(text)) {
        format = undefined;
        continue;
      }
      const match = text.match(/^(?:actualización banlist formato )?(primer bloque|primera era)$/i);
      if (match) {
        const next = /primer bloque/i.test(match[1]) ? 'myl-first-block' : 'myl-first-era';
        if (format !== next)
          result.push({
            kind: 'heading',
            text: next === 'myl-first-block' ? 'Primer Bloque' : 'Primera Era',
          });
        format = next;
        subformat = '';
        continue;
      }
      if (!format) continue;
      if (/^Cambios en Formato/i.test(text)) {
        subformat = text.replace(/^Cambios en Formato\s*/i, '');
        result.push({ kind: 'heading', text: subformat });
        continue;
      }
      if (block.kind === 'image') {
        result.push(block);
        continue;
      }
      if (/sin cambios en el formato/i.test(text)) {
        result.push({ kind: 'paragraph', text: 'Sin cambios.' });
        continue;
      }
      // Preserve the card name and both limits; only standardize the surrounding prose.
      const change = text
        .replace(/^[✅☢⛔\uFE0F\s]+/u, '')
        .match(
          /^(.+?)\s+(?:se puede utilizar por\s+(\d+)\s+copias?|se encuentra\s+(prohibid[oa]|limitad[oa] a \d+ copias?))\s*(.*)$/i,
        );
      if (change) {
        const name = change[1].trim(),
          current = change[2] || (/prohibid/i.test(change[3]) ? '0' : change[3].match(/\d+/)?.[0]);
        const previous = /antes.*prohibid/i.test(change[4])
          ? '0'
          : change[4].match(/antes[^\d]*(\d+)/i)?.[1];
        result.push({
          kind: 'list',
          text: `${name}: ${current === '0' ? 'prohibida' : `${current} ${current === '1' ? 'copia' : 'copias'}`} ${previous !== undefined ? `(antes: ${previous})` : ''}`.trim(),
        });
      } else if (
        /prohibid|limitad|copias?|vigencia|excepci|permit|restricci/i.test(text) &&
        !/^Para Furia/i.test(text)
      ) {
        result.push({ kind: 'paragraph', text });
      }
    }
  }
  // Unfamiliar banlist layouts must retain their full technical content for review.
  return { blocks: result.some((b) => b.kind === 'list') ? result : blocks, effective_dates };
}
export async function readMylPost(value: string) {
  const url = mylArticle(value);
  if (!url) fail(400, 'Artículo MyL no válido.');
  const slug = new URL(url).pathname.split('/')[1];
  const data = await read(
    `posts?slug=${encodeURIComponent(slug)}&per_page=1&_fields=link,date,modified,content`,
  );
  const rows = z
    .array(
      z.object({
        link: z.string(),
        date: z.string().optional(),
        modified: z.string().optional(),
        content: z.object({ rendered: z.string().max(2_000_000) }),
      }),
    )
    .length(1)
    .safeParse(data);
  if (!rows.success || mylArticle(rows.data[0].link) !== url)
    fail(409, 'No pudimos verificar el artículo original de MyL.');
  return {
    html: rows.data[0].content.rendered,
    date: rows.data[0].date?.slice(0, 10),
    modified: rows.data[0].modified,
  };
}
export async function mylArticleContent(value: string, publishedOn?: string) {
  const { html } = await readMylPost(value);
  const slug = new URL(value).pathname;
  const blocks = extractNewsBlocks(newsHtmlTree(html), mylNewsImage);
  const banlist = /ban\s*list/i.test(slug);
  const selected = banlist
    ? compactMylBanlist(blocks, publishedOn)
    : { blocks, effective_dates: undefined };
  if (!contentBody(selected.blocks).trim() && !selected.blocks.some((b) => b.kind === 'image'))
    fail(409, 'La fuente no incluye contenido verificable.');
  return {
    ...selected,
    media: mylImageManifest(html).map((m) => ({
      ...m,
      name: blocks.find((b) => b.kind === 'image' && b.source === m.source)?.text || m.name,
    })),
  };
}
export async function mylBanlistNotices() {
  const data = await read('posts?search=banlist&per_page=20&_fields=link,date,title,content');
  if (!Array.isArray(data)) fail(502, 'No pudimos verificar los avisos de banlist MyL.');
  return data
    .filter(
      (p) =>
        typeof p.title?.rendered === 'string' &&
        /ban\s*list general/i.test(newsText(p.title.rendered)) &&
        mylArticle(p.link) &&
        validDay(p.date?.slice(0, 10) || '') &&
        typeof p.content?.rendered === 'string',
    )
    .map((p) => ({
      url: p.link as string,
      date: p.date.slice(0, 10) as string,
      html: p.content.rendered as string,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function mylArticleImages(value: string) {
  return (await mylArticleContent(value)).media;
}
