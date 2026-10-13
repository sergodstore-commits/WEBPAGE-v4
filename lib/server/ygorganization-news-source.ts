import { z } from 'zod';
import { boundedBytes, fail, hash } from './core';
import { getDb } from './db';
import { withLease } from './edition-imports';
import { NEWS_DISCOVERY_POLICY_VERSION } from './news-editorial';
import { newsText, newsHtmlTree, extractNewsBlocks, type NewsNode } from './news-content';
import {
  ygorganizationArticle,
  ygorganizationImage,
  type WebNewsCandidate,
  type WebNewsMedia,
} from '../web-news';
import { validDay } from '../tournament-schedule';

async function read(url: string) {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error();
    return Buffer.from(await boundedBytes(response, 2_000_000)).toString();
  } catch {
    fail(502, 'YGOrganization no respondió correctamente. Tus noticias y borradores se conservan.');
  }
}

const post = z.object({
  title: z.string().min(3).max(500),
  slug: z.string().max(250),
  excerpt: z.string().max(10000),
  date: z.string().max(40),
  categories: z.array(z.object({ slug: z.string().max(100) })).max(50),
  featuredImage: z.object({ src: z.string().max(1000) }).nullish(),
});

function editorialCategory(title: string, categories: string[]) {
  // The source's "OCG & TCG" category mixes formats. Require an explicit TCG title.
  if (
    !/^\[TCG\]|^TCG\s*:/i.test(title) ||
    /\bOCG\b|rush duel|master duel|duel links/i.test(title) ||
    categories.some((c) => /rush-duel|duel-links|video-games|master-duel|deck|lore/.test(c)) ||
    /ban[\s-]*list|forbidden|genesys|point adjustment|decklist|playmat|game mat|sleeves/i.test(
      title,
    )
  )
    return null;
  if (
    categories.some((c) => ['spoilers', 'new-cards', 'alternate-art'].includes(c)) ||
    /reveal|unveil|first look|world premiere|support/i.test(title)
  )
    return 'reveals';
  if (
    categories.some((c) => ['product-news', 'misc-product'].includes(c)) ||
    /booster|pack|box|release|product|collection|announced/i.test(title)
  )
    return 'releases';
  return null;
}

export function parseYGOrganizationNews(html: string): WebNewsCandidate[] {
  // Read JSON embedded in the public page, never execute its scripts or HTML.
  const script = [
    ...html.matchAll(/<script\b[^>]*data-url="\/api\/posts\?[^\"]*"[^>]*>([\s\S]*?)<\/script>/gi),
  ][0];
  try {
    if (!script) throw Error();
    const envelope = JSON.parse(script[1]);
    const payload = z
      .object({ data: z.object({ posts: z.array(post).max(100) }) })
      .parse(JSON.parse(envelope.body));
    const items = new Map<string, WebNewsCandidate>();
    for (const p of payload.data.posts) {
      const title = newsText(p.title),
        category = editorialCategory(
          title,
          p.categories.map((c) => c.slug),
        );
      const url = ygorganizationArticle(`https://ygorganization.com/${p.slug}`);
      const published_on = p.date.slice(0, 10);
      if (!category || !url || !validDay(published_on) || !Number.isFinite(Date.parse(p.date)))
        continue;
      items.set(url, {
        id: `ygorg-${hash(url).slice(0, 24)}`,
        url,
        title: title.slice(0, 160),
        summary: newsText(p.excerpt).slice(0, 600),
        published_on,
        category,
        source_image: ygorganizationImage(p.featuredImage?.src || '') || '',
        boards: ['yugioh'],
      });
    }
    return [...items.values()];
  } catch {
    fail(502, 'Cambió el listado de YGOrganization. No se modificaron tus noticias.');
  }
}

export async function reviewYGOrganizationNews() {
  return withLease(async () => {
    const db = await getDb();
    const old = (
      await db.query(
        "SELECT data->'ygorganization_news_discovery' AS discovery FROM settings WHERE id=1",
      )
    ).rows[0]?.discovery;
    if (
      old?.policy_version === NEWS_DISCOVERY_POLICY_VERSION &&
      Date.now() - Date.parse(old.checked_at) < 5 * 60000
    )
      return old;
    // Three recent public pages; bounded work, no crawl of the entire archive.
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        read(`https://ygorganization.com/${page === 1 ? '' : `?page=${page}`}`),
      ),
    );
    const unique = new Map(pages.flatMap(parseYGOrganizationNews).map((item) => [item.url, item]));
    const result = {
      checked_at: new Date().toISOString(),
      policy_version: NEWS_DISCOVERY_POLICY_VERSION,
      items: [...unique.values()].sort(
        (a, b) => b.published_on.localeCompare(a.published_on) || a.id.localeCompare(b.id),
      ),
    };
    await db.query(
      "UPDATE settings SET data=jsonb_set(data,'{ygorganization_news_discovery}',$1::jsonb,true) WHERE id=1",
      [JSON.stringify(result)],
    );
    return result;
  });
}

export function parseYGOrganizationArticle(html: string, url: string) {
  let metadata: { headline: string; datePublished: string } | undefined;
  for (const script of html.matchAll(
    /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const value = JSON.parse(script[1]);
      if (value['@type'] === 'Article') {
        const parsed = z
          .object({ headline: z.string().max(500), datePublished: z.string().max(40) })
          .safeParse(value);
        if (parsed.success) metadata = parsed.data;
      }
    } catch {
      /* Ignore unrelated metadata; the required article is checked below. */
    }
  }
  if (
    !metadata ||
    !editorialCategory(newsText(metadata.headline || ''), ['new-cards']) ||
    !validDay(metadata.datePublished?.slice(0, 10) || '')
  )
    fail(409, 'No pudimos verificar que el artículo siga siendo una revelación o producto TCG.');
  const tree = newsHtmlTree(html);
  let content: NewsNode | undefined;
  const find = (nodes: NewsNode[]) => {
    for (const node of nodes) {
      if (
        typeof node.attrs?.class === 'string' &&
        /\bpost-content\b/.test(node.attrs.class) &&
        /\bprose\b/.test(node.attrs.class)
      )
        content = node;
      else find(node.children || []);
    }
  };
  find(tree);
  if (!content)
    fail(409, 'Cambió la estructura de YGOrganization. No se importó una noticia incompleta.');
  // The source renders raw paragraphs in generic spans. Give those spans block semantics
  // while retaining tables, lists and the exact sequence of all article images.
  const normalize = (nodes: NewsNode[]): NewsNode[] =>
    nodes.flatMap((node) => {
      if (node.attrs?.['data-freestar-ad']) return [];
      const children = normalize(node.children || []);
      if (node.attrs?.['data-content-role'] === 'generic') {
        const paragraphs: NewsNode[] = [];
        let inline: NewsNode[] = [];
        const flush = () => {
          if (inline.length) paragraphs.push({ name: 'p', children: inline });
          inline = [];
        };
        for (const child of children) {
          if (/^(?:p|h[1-6]|ul|ol|table|div|figure)$/.test(child.name || '')) {
            flush();
            paragraphs.push(child);
          } else inline.push(child);
        }
        flush();
        return paragraphs;
      }
      return [{ ...node, children }];
    });
  const blocks = extractNewsBlocks(normalize(content.children || []), ygorganizationImage);
  if (!blocks.some((b) => b.kind !== 'image' && b.text.length > 20))
    fail(409, 'El artículo no incluye contenido verificable.');
  const media = new Map<string, WebNewsMedia>();
  for (const block of blocks)
    if (block.kind === 'image' && block.source)
      media.set(block.source, {
        source: block.source,
        name: block.text.slice(0, 200) || 'Imagen de la noticia',
      });
  if (media.size > 100)
    fail(409, 'La noticia supera el límite de imágenes. No se importó parcialmente.');
  // URL is checked before fetching and remains the article attribution.
  if (!ygorganizationArticle(url)) fail(400, 'Artículo de YGOrganization no válido.');
  return { blocks, media: [...media.values()] };
}

export async function ygorganizationArticleContent(value: string) {
  const url = ygorganizationArticle(value);
  if (!url) fail(400, 'Artículo de YGOrganization no válido.');
  return parseYGOrganizationArticle(await read(url), url);
}
