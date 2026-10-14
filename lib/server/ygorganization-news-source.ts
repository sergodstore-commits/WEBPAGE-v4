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

const FORMAT_POLICY_VERSION = 3;
export const ygorganizationListing =
  'https://ygorganization.com/?categories=errata&categories=f-and-l&categories=ocg-tcg';
export const ygorganizationNewCardsListing = 'https://ygorganization.com/category/news/new-cards';
type FormatCheck = { checked_at: string; format?: 'TCG' | 'OCG' };
const explicitTcg = (title: string) => /\bTCG\b/i.test(title);
const excludedFormat = (text: string) =>
  /rush[\s-]*duel|master[\s-]*duel|duel[\s-]*links|\bRD\/[A-Z0-9]/i.test(text);
const explicitOcg = (text: string) =>
  /\bOCG\b|\b[A-Z0-9]{2,8}-(?:JP|AE)\d{2,3}\b|\[[A-Z0-9]{2,8}-(?:JP|AE)\]/i.test(text);

function editorialCategory(title: string, categories: string[]) {
  if (
    excludedFormat(title) ||
    categories.some((c) =>
      /rush-duel|duel-links|video-games|master-duel|deck-profile|decklist|lore/.test(c),
    ) ||
    /ban[\s-]*list|forbidden.*(?:limited|list)|genesys|point adjustment|decklist|playmat|game mat|sleeves/i.test(
      title,
    )
  )
    return null;
  if (categories.includes('errata') || /\berrata\b|card text (?:update|correction)/i.test(title))
    return 'news';
  if (
    categories.some((c) => ['spoilers', 'new-cards', 'alternate-art'].includes(c)) ||
    /reveal|unveil|first look|world premiere|support/i.test(title)
  )
    return 'reveals';
  if (
    categories.some((c) =>
      ['product-news', 'misc-product', 'reprints', 'structure-deck'].includes(c),
    ) ||
    /booster|pack|box|release|product|collection|announced|reprint|structure deck/i.test(title)
  )
    return 'releases';
  return null;
}

function listingPosts(html: string): z.infer<typeof post>[] {
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
    return payload.data.posts;
  } catch {
    fail(502, 'Cambió el listado de YGOrganization. No se modificaron tus noticias.');
  }
}

export function parseYGOrganizationNews(
  html: string,
  checks: Record<string, FormatCheck> = {},
): WebNewsCandidate[] {
  const items = new Map<string, WebNewsCandidate>();
  for (const p of listingPosts(html)) {
    const title = newsText(p.title),
      category = editorialCategory(
        title,
        p.categories.map((c) => c.slug),
      );
    const url = ygorganizationArticle(`https://ygorganization.com/${p.slug}`);
    const published_on = p.date.slice(0, 10);
    if (!category || !url || !validDay(published_on) || !Number.isFinite(Date.parse(p.date)))
      continue;
    const format = explicitOcg(title)
      ? 'OCG'
      : explicitTcg(title)
        ? 'TCG'
        : checks[hash(url)]?.format;
    if (!format) continue;
    items.set(url, {
      id: `ygorg-${hash(url).slice(0, 24)}`,
      url,
      title: title.slice(0, 160),
      summary: newsText(p.excerpt).slice(0, 600),
      published_on,
      category,
      source_image: ygorganizationImage(p.featuredImage?.src || '') || '',
      boards: ['yugioh'],
      format,
    });
  }
  return [...items.values()];
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
      old?.format_policy_version === FORMAT_POLICY_VERSION &&
      Date.now() - Date.parse(old.checked_at) < 5 * 60000
    )
      return old;
    // Search New Cards directly as well as product/errata categories. Independent failures
    // must not discard a successful listing. Six bounded pages, no image downloads.
    const urls = [ygorganizationNewCardsListing, ygorganizationListing].flatMap((base) =>
      [1, 2, 3].map((page) =>
        page === 1 ? base : `${base}${base.includes('?') ? '&' : '?'}page=${page}`,
      ),
    );
    const fetched = await Promise.allSettled(
      urls.map(async (url) => {
        const html = await read(url);
        listingPosts(html);
        return html;
      }),
    );
    const pages = fetched.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (!pages.length)
      fail(
        502,
        'YGOrganization no respondió correctamente. Tus noticias y borradores se conservan.',
      );
    const checks: Record<string, FormatCheck> =
      old?.format_policy_version === FORMAT_POLICY_VERSION ? { ...old.format_checks } : {};
    const unlabelled = [...new Map(pages.flatMap(listingPosts).map((p) => [p.slug, p])).values()]
      .filter((p) => {
        const url = ygorganizationArticle(`https://ygorganization.com/${p.slug}`);
        const checked = url ? checks[hash(url)] : null;
        return (
          url &&
          !explicitTcg(newsText(p.title)) &&
          !explicitOcg(newsText(p.title)) &&
          editorialCategory(
            newsText(p.title),
            p.categories.map((c) => c.slug),
          ) &&
          (!checked || Date.now() - Date.parse(checked.checked_at) > 7 * 86400000)
        );
      })
      // Inspect never-checked posts first, then expired checks: a repeated recent post
      // must not permanently starve older unlabelled revelations.
      .sort((a, b) => {
        const checked = (p: z.infer<typeof post>) =>
          Boolean(checks[hash(ygorganizationArticle(`https://ygorganization.com/${p.slug}`)!)]);
        return Number(checked(a)) - Number(checked(b)) || b.date.localeCompare(a.date);
      })
      .slice(0, 6);
    const probes = await Promise.allSettled(
      unlabelled.map(async (p) => {
        const url = ygorganizationArticle(`https://ygorganization.com/${p.slug}`)!;
        const html = await read(url); // Source failures are retryable, never cached as an OCG decision.
        const result = inspectArticle(html);
        checks[hash(url)] = { checked_at: new Date().toISOString(), format: result.format };
      }),
    );
    const unique = new Map(
      pages
        .flatMap((page) => parseYGOrganizationNews(page, checks))
        .map((item) => [item.url, item]),
    );
    const result = {
      checked_at: new Date().toISOString(),
      policy_version: NEWS_DISCOVERY_POLICY_VERSION,
      format_policy_version: FORMAT_POLICY_VERSION,
      format_check_errors: probes.filter((p) => p.status === 'rejected').length,
      listing_errors: fetched.filter((p) => p.status === 'rejected').length,
      listings_checked: urls,
      format_checks: Object.fromEntries(
        Object.entries(checks)
          .sort((a, b) => b[1].checked_at.localeCompare(a[1].checked_at))
          .slice(0, 120),
      ),
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

function inspectArticle(html: string) {
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
  if (!metadata || !validDay(metadata.datePublished?.slice(0, 10) || ''))
    fail(409, 'No pudimos verificar la fecha y el título del artículo.');
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
  const text = blocks
    .filter((b) => b.kind !== 'image')
    .map((b) => b.text)
    .join('\n');
  const sourceLinks: string[] = [];
  const collectLinks = (nodes: NewsNode[]) => {
    for (const node of nodes) {
      if (node.name === 'a' && typeof node.attrs?.href === 'string')
        sourceLinks.push(node.attrs.href);
      collectLinks(node.children || []);
    }
  };
  collectLinks(content.children || []);
  const officialTcg = sourceLinks.some((link) => {
    try {
      const u = new URL(link);
      return (
        u.protocol === 'https:' &&
        u.hostname === 'www.yugioh-card.com' &&
        !u.username &&
        !u.password &&
        !u.port &&
        /^\/(?:eu|en)\//.test(u.pathname)
      );
    } catch {
      return false;
    }
  });
  const format = excludedFormat(`${metadata.headline}\n${text}`)
    ? undefined
    : explicitOcg(`${metadata.headline}\n${text}`) ||
        sourceLinks.some((link) => {
          try {
            const u = new URL(link);
            return (
              u.protocol === 'https:' &&
              u.hostname === 'www.yugioh-card.com' &&
              !u.username &&
              !u.password &&
              !u.port &&
              /^\/japan\//.test(u.pathname)
            );
          } catch {
            return false;
          }
        })
      ? ('OCG' as const)
      : explicitTcg(metadata.headline) || /\bTCG\b/i.test(text) || officialTcg
        ? ('TCG' as const)
        : undefined;
  const media = new Map<string, WebNewsMedia>();
  for (const block of blocks)
    if (block.kind === 'image' && block.source)
      media.set(block.source, {
        source: block.source,
        name: block.text.slice(0, 200) || 'Imagen de la noticia',
      });
  if (media.size > 100)
    fail(409, 'La noticia supera el límite de imágenes. No se importó parcialmente.');
  return { blocks, media: [...media.values()], format, headline: metadata.headline };
}

export function parseYGOrganizationArticle(html: string, url: string) {
  if (!ygorganizationArticle(url)) fail(400, 'Artículo de YGOrganization no válido.');
  const result = inspectArticle(html);
  if (!result.format) fail(409, 'No pudimos verificar que el artículo corresponda a TCG u OCG.');
  return { blocks: result.blocks, media: result.media, format: result.format };
}

export async function ygorganizationArticleContent(value: string) {
  const url = ygorganizationArticle(value);
  if (!url) fail(400, 'Artículo de YGOrganization no válido.');
  return parseYGOrganizationArticle(await read(url), url);
}
