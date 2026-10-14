import { z } from 'zod';
import { officialYugiohInstagram } from './instagram';
import { getDb } from './db';
import { fail, hash } from './core';
import { NEWS_DISCOVERY_POLICY_VERSION } from './news-editorial';
import {
  instagramNewsArticle,
  instagramNewsImage,
  type WebNewsCandidate,
  type WebNewsBlock,
  type WebNewsMedia,
} from '../web-news';

export const yugiohInstagramProfile = 'https://www.instagram.com/yugiohcardeu/';
const media = z.object({
  id: z.string().regex(/^\d{1,30}$/),
  caption: z.string().max(30000).default(''),
  permalink: z.string().max(1000),
  timestamp: z.string().max(40),
  media_type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']),
  media_url: z.string().max(1000).optional(),
  thumbnail_url: z.string().max(1000).optional(),
  children: z
    .object({
      data: z
        .array(
          z.object({
            id: z.string(),
            media_type: z.enum(['IMAGE', 'VIDEO']),
            media_url: z.string().max(1000).optional(),
            thumbnail_url: z.string().max(1000).optional(),
          }),
        )
        .max(25),
      paging: z.object({ next: z.string().optional() }).optional(),
    })
    .optional(),
});
export function parseYugiohInstagram(raw: unknown) {
  const posts = z
    .object({
      business_discovery: z.object({
        username: z.literal('yugiohcardeu'),
        media: z.object({ data: z.array(z.unknown()).max(25) }),
      }),
    })
    .parse(raw);
  const entries: { candidate: WebNewsCandidate; blocks: WebNewsBlock[]; media: WebNewsMedia[] }[] =
    [];
  for (const value of posts.business_discovery.media.data) {
    const parsed = media.safeParse(value);
    if (!parsed.success) continue;
    const post = parsed.data;
    const url = instagramNewsArticle(post.permalink);
    const caption = post.caption.replace(/\r/g, '').trim();
    if (
      !url ||
      caption.length < 30 ||
      !Number.isFinite(Date.parse(post.timestamp)) ||
      post.children?.paging?.next
    )
      continue;
    if (
      /rush[\s-]*duel|master[\s-]*duel|duel[\s-]*links|forbidden.*limited|ban[\s-]*list/i.test(
        caption,
      )
    )
      continue;
    const category = /reveal|unveil|first look|new cards?|new support|world premiere/i.test(caption)
      ? 'reveals'
      : /booster|structure deck|release|new product|new set|collection|available.*(?:pack|box)/i.test(
            caption,
          )
        ? 'releases'
        : null;
    if (!category) continue;
    const assets = post.media_type === 'CAROUSEL_ALBUM' ? post.children?.data : [post];
    if (
      !assets?.length ||
      assets.some((a) => a.media_type === 'IMAGE' && !instagramNewsImage(a.media_url || ''))
    )
      continue;
    const images = assets.flatMap((a, index) => {
      const source = instagramNewsImage(
        (a.media_type === 'VIDEO' ? a.thumbnail_url : a.media_url) || '',
      );
      return source ? [{ source, name: `Imagen oficial ${index + 1}`, caption: '' }] : [];
    });
    const title = caption
      .split('\n')
      .find((line) => line.trim())!
      .slice(0, 160);
    entries.push({
      candidate: {
        id: `ygoig-${hash(url).slice(0, 24)}`,
        url,
        title,
        summary: caption.slice(0, 600),
        source_image: images[0]?.source || '',
        published_on: post.timestamp.slice(0, 10),
        source_published_at: new Date(post.timestamp).toISOString(),
        category,
        boards: ['yugioh'],
        format: /\bOCG\b/i.test(caption) && !/\bTCG\b/i.test(caption) ? 'OCG' : 'TCG',
      },
      blocks: [
        { kind: 'paragraph', text: caption },
        ...images.map((image): WebNewsBlock => ({
          kind: 'image',
          text: image.name,
          source: image.source,
        })),
      ],
      media: images,
    });
  }
  return entries;
}
export async function reviewYugiohInstagram() {
  const db = await getDb();
  const old = (
    await db.query(
      "SELECT data->'yugioh_instagram_discovery' AS discovery FROM settings WHERE id=1",
    )
  ).rows[0]?.discovery;
  if (
    old?.policy_version === NEWS_DISCOVERY_POLICY_VERSION &&
    Date.now() - Date.parse(old.checked_at) < 5 * 60000
  )
    return old;
  const entries = parseYugiohInstagram(await officialYugiohInstagram());
  const discovery = {
    checked_at: new Date().toISOString(),
    policy_version: NEWS_DISCOVERY_POLICY_VERSION,
    items: entries.map((e) => e.candidate),
    entries,
  };
  await db.query(
    "UPDATE settings SET data=jsonb_set(data,'{yugioh_instagram_discovery}',$1::jsonb,true) WHERE id=1",
    [JSON.stringify(discovery)],
  );
  return discovery;
}
export async function yugiohInstagramContent(url: string) {
  const canonical = instagramNewsArticle(url);
  if (!canonical) fail(400, 'Publicación oficial no válida.');
  const discovery = await reviewYugiohInstagram();
  const entry = (discovery.entries as ReturnType<typeof parseYugiohInstagram>).find(
    (e) => e.candidate.url === canonical,
  );
  if (!entry)
    fail(
      409,
      'La publicación ya no está disponible en el perfil oficial; se conserva el borrador.',
    );
  return { blocks: entry.blocks, media: entry.media, format: entry.candidate.format };
}
