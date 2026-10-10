import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { dataDir, getDb } from './db';
import { boundedBytes, fail, hash, isProd } from './core';
import { withLease } from './edition-imports';
import {
  metaNewsImage,
  newsSourceImage,
  yugiohMetaArticle,
  type WebNewsCandidate,
  type WebNewsMedia,
} from '../web-news';

const sourceUrl = new URL('https://www.yugiohmeta.com/api/v1/articles');
sourceUrl.search = new URLSearchParams({
  'ocg[$ne]': 'true',
  'hidden[$ne]': 'true',
  'category[$in][0]': 'tcg-news',
  'category[$in][1]': 'tcg-set-release',
  'category[$in][2]': 'tcg-tournament',
  'sort[date]': '-1',
  'fields[markdown]': '0',
  'fields[authors]': '0',
  limit: '36',
}).toString();

async function source(url: string, limit: number) {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
    });
    if (!response.ok)
      fail(502, 'La fuente de noticias no está disponible. Tu selección se conserva.');
    return Buffer.from(await boundedBytes(response, limit));
  } catch (error) {
    if (error instanceof Error && 'status' in error) throw error;
    fail(502, 'La fuente no respondió a tiempo. Tu selección se conserva; intenta más tarde.');
  }
}

const entry = z.object({
  title: z.string().min(3).max(300),
  url: z.string().max(1000),
  description: z.string().max(3000).nullish(),
  date: z.string().max(40),
  category: z.string().max(50),
  subCategory: z.string().max(50).optional(),
  image: z.string().max(1000).optional(),
  ocg: z.boolean().optional(),
  hidden: z.boolean().optional(),
});
export function parseMetaNews(input: unknown): WebNewsCandidate[] {
  if (!Array.isArray(input) || input.length > 100)
    fail(502, 'El listado de la fuente cambió de formato.');
  const found = new Map<string, WebNewsCandidate>();
  for (const raw of input) {
    const parsed = entry.safeParse(raw);
    if (!parsed.success) continue;
    const item = parsed.data;
    if (
      item.ocg === true ||
      item.hidden === true ||
      !['tcg-news', 'tcg-set-release', 'tcg-tournament'].includes(item.category) ||
      /^OCG\b/i.test(item.title)
    )
      continue;
    const url = yugiohMetaArticle(`https://www.yugiohmeta.com/articles${item.url}`);
    const published_on = item.date.slice(0, 10);
    if (
      !url ||
      !/^\d{4}-\d{2}-\d{2}$/.test(published_on) ||
      !Number.isFinite(Date.parse(item.date))
    )
      continue;
    found.set(url, {
      id: `meta-${hash(url).slice(0, 24)}`,
      url,
      title: item.title,
      summary: (item.description || '').slice(0, 600),
      published_on,
      category:
        item.subCategory === 'card-reveals'
          ? 'reveals'
          : item.category === 'tcg-set-release'
            ? 'releases'
            : item.category === 'tcg-tournament'
              ? 'tournaments'
              : 'news',
      source_image: metaNewsImage(item.image || '') || '',
    });
  }
  if (input.length && !found.size)
    fail(502, 'No pudimos verificar noticias TCG en el listado. No se modificó tu selección.');
  return [...found.values()].sort((a, b) => b.published_on.localeCompare(a.published_on));
}

export async function reviewMetaNews() {
  return withLease(async () => {
    const db = await getDb();
    const saved = (
      await db.query("SELECT data->'web_news_discovery' AS discovery FROM settings WHERE id=1")
    ).rows[0]?.discovery;
    if (saved && Date.now() - Date.parse(saved.checked_at) < 5 * 60_000) return saved;
    const items = parseMetaNews(
      JSON.parse((await source(sourceUrl.toString(), 800_000)).toString()),
    );
    const result = { checked_at: new Date().toISOString(), items };
    await db.query(
      "UPDATE settings SET data=jsonb_set(data,'{web_news_discovery}',$1::jsonb,true) WHERE id=1",
      [JSON.stringify(result)],
    );
    return result;
  });
}

export function articleImageManifest(article: unknown): WebNewsMedia[] {
  const value = z
    .object({
      parsedMarkdown: z.object({
        htmlTree: z.array(z.unknown()).max(5000),
        customComponents: z.record(z.string(), z.unknown()).optional(),
      }),
    })
    .safeParse(article);
  if (!value.success)
    fail(409, 'La estructura de imágenes de esta noticia cambió. Conservamos el borrador.');
  const media = new Map<string, WebNewsMedia>();
  const add = (raw: unknown, name: unknown) => {
    const url = typeof raw === 'string' ? metaNewsImage(raw) : null;
    if (raw && !url)
      fail(
        409,
        'La noticia incluye una imagen fuera de la fuente admitida. Conservamos el borrador.',
      );
    if (url && !media.has(url))
      media.set(url, {
        source: url,
        name:
          typeof name === 'string' && name.trim()
            ? name.trim().slice(0, 200)
            : 'Imagen de la noticia',
        caption: '',
      });
  };
  const walk = (nodes: unknown[], depth = 0) => {
    if (depth > 30) fail(409, 'Esta noticia supera la estructura admitida.');
    for (const node of nodes) {
      const n = z
        .object({
          name: z.string().optional(),
          attrs: z.record(z.string(), z.unknown()).optional(),
          children: z.array(z.unknown()).optional(),
        })
        .safeParse(node);
      if (!n.success) continue;
      if (n.data.name === 'img') add(n.data.attrs?.src, n.data.attrs?.alt);
      if (n.data.children) walk(n.data.children, depth + 1);
    }
  };
  walk(value.data.parsedMarkdown.htmlTree);
  for (const raw of Object.values(value.data.parsedMarkdown.customComponents || {})) {
    const c = z
      .object({ type: z.string(), props: z.record(z.string(), z.unknown()) })
      .safeParse(raw);
    if (!c.success) continue;
    if (c.data.type === 'CardContainer' && Array.isArray(c.data.props.cards)) {
      for (const rawCard of c.data.props.cards) {
        const card = z
          .object({
            card: z.object({ _id: z.string().regex(/^[a-f0-9]{24}$/), name: z.string().max(200) }),
          })
          .safeParse(rawCard);
        if (!card.success) fail(409, 'Cambió la estructura de una carta. Conservamos el borrador.');
        add(`/cards/${card.data.card._id}_w420.webp`, card.data.card.name);
      }
    }
    if (['Image', 'CardImage'].includes(c.data.type))
      add(c.data.props.src, c.data.props.alt || c.data.props.name);
  }
  if (media.size > 100)
    fail(
      409,
      'La noticia contiene más de 100 imágenes. Usa una guía de edición para este contenido.',
    );
  return [...media.values()];
}

export async function articleImages(url: string) {
  const canonical = yugiohMetaArticle(url);
  if (!canonical) fail(400, 'Artículo no válido.');
  const query = new URL('https://www.yugiohmeta.com/api/v1/articles');
  query.search = new URLSearchParams({
    url: new URL(canonical).pathname.replace(/^\/articles/, '') + '/',
    limit: '1',
    'fields[authors]': '0',
  }).toString();
  const data = JSON.parse((await source(query.toString(), 2_000_000)).toString());
  if (
    !Array.isArray(data) ||
    data.length !== 1 ||
    !parseMetaNews(data).some((item) => item.url === canonical)
  )
    fail(409, 'No se pudo verificar esta noticia como TCG.');
  return articleImageManifest(data[0]);
}

export const NEWS_MEDIA_LIMIT = 15_000_000;
type CachedImage = { image: string; image_bytes: number };
async function mediaCache(): Promise<Record<string, CachedImage>> {
  const row = (
    await (
      await getDb()
    ).query("SELECT data->'web_news_media_cache' AS media FROM settings WHERE id=1")
  ).rows[0];
  return row?.media || {};
}
export async function newsMediaUsage() {
  return Object.values(await mediaCache()).reduce((sum, item) => sum + item.image_bytes, 0);
}

// Persisted keys also account for archived images whose articles were later removed.
// Callers hold the shared import lease while checking the quota and saving the image.
export async function archiveMetaNewsCover(value: string) {
  const url = newsSourceImage(value);
  if (!url) fail(400, 'La portada no pertenece a la fuente autorizada.');
  const cache = await mediaCache();
  const cacheKey = hash(url);
  if (cache[cacheKey]) return cache[cacheKey];
  const input = await source(url, 4_000_000);
  let output: Buffer | undefined;
  try {
    const info = await sharp(input, { limitInputPixels: 24_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp', 'avif'].includes(info.format || '')) throw Error();
    for (const quality of [78, 64, 48]) {
      output = await sharp(input, { limitInputPixels: 24_000_000 })
        .rotate()
        .resize(960, 640, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
      if (output.length <= 160_000) break;
    }
  } catch {
    fail(409, 'No pudimos preparar esta portada. La selección anterior se conserva.');
  }
  if (!output || output.length > 160_000)
    fail(409, 'La portada supera el límite de 160 KB después de comprimirla.');
  if (
    Object.values(cache).reduce((sum, item) => sum + item.image_bytes, 0) + output.length >
    NEWS_MEDIA_LIMIT
  )
    fail(
      409,
      'Noticias alcanzó su límite de 15 MB. El avance está guardado; no se contrató almacenamiento.',
    );
  const digest = hash(url).slice(0, 32);
  const key = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20)}.webp`;
  let image: string;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
    const response = await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}/${key}`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'image/webp',
        'Cache-Control': 'max-age=31536000',
        'x-upsert': 'true',
      },
      body: new Uint8Array(output),
    });
    if (!response.ok)
      fail(502, 'No se pudo guardar la portada. La selección anterior se conserva.');
    image = `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${key}`;
  } else {
    if (isProd()) fail(503, 'Falta configurar el almacenamiento de imágenes.');
    await mkdir(path.join(dataDir(), 'objects'), { recursive: true });
    await writeFile(path.join(dataDir(), 'objects', key), output);
    image = `/api/media/${key}`;
  }
  const saved = { image, image_bytes: output.length };
  await (
    await getDb()
  ).query(
    "UPDATE settings SET data=jsonb_set(data,'{web_news_media_cache}',COALESCE(data->'web_news_media_cache','{}'::jsonb) || $1::jsonb,true) WHERE id=1",
    [JSON.stringify({ [cacheKey]: saved })],
  );
  return saved;
}
