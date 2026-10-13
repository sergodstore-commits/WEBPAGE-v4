import { getDb } from './db';
import { withLease } from './edition-imports';
import { getWebNews } from './web-news';
import { latestNews } from '../news-retention';
import { initialWebNews } from '../web-news';
import { hash } from './core';

async function preserveBanlistCards() {
  const db = await getDb();
  const row = (
    await db.query(
      "SELECT data->'myl_banlists' AS state,data->'myl_banlist_draft' AS draft FROM settings WHERE id=1",
    )
  ).rows[0];
  for (const state of [row?.state, row?.draft].filter(Boolean)) {
    // Hash the actual cards, excluding the daily check timestamp, so unchanged lists reuse one archive.
    const data = { formats: state.formats };
    await db.query(
      'INSERT INTO news_card_archives(url,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING',
      [`banlist-myl:${hash(JSON.stringify(data))}`, JSON.stringify(data)],
    );
  }
}

/** Retire articles, keeping their inline galleries/text available for future card tools. */
export async function rotateWebNews(retireDraftIds: string[] = []) {
  return withLease(async () => {
    const db = await getDb();
    return db.transaction(async (tx) => {
      const row = (await tx.query('SELECT data FROM settings WHERE id=1 FOR UPDATE')).rows[0];
      const items = (row?.data?.web_news ?? initialWebNews) as Awaited<
        ReturnType<typeof getWebNews>
      >;
      const keep = new Set(latestNews(items.filter((i) => i.visible)).map((i) => i.id));
      const retired = items.filter(
        (i) => (i.visible && !keep.has(i.id)) || retireDraftIds.includes(i.id),
      );
      for (const item of retired) {
        const keepCover =
          item.category === 'reveals' ||
          !item.source_image ||
          /\/(?:cards?|cartas?)\//i.test(item.source_image);
        if (
          item.media?.length ||
          item.content_blocks?.some((b) => b.kind === 'image') ||
          (keepCover && item.image)
        ) {
          await tx.query(
            `INSERT INTO news_card_archives(url,data) VALUES($1,$2::jsonb)
            ON CONFLICT(url) DO UPDATE SET data=excluded.data`,
            [
              item.url,
              JSON.stringify({
                id: item.id,
                title: item.title,
                published_on: item.published_on,
                boards: item.boards,
                media: item.media || [],
                ...(keepCover ? { image: item.image } : {}),
                content_blocks: item.content_blocks || [],
              }),
            ],
          );
        }
        // Tombstones prevent tomorrow's discovery from re-importing a retired article.
        await tx.query(
          `INSERT INTO content_news_jobs(url,id,provider,published_on,phase,header_done)
          VALUES($1,$2,$3,$4,'retired',true) ON CONFLICT(url) DO UPDATE SET phase='retired',candidate=NULL,updated_at=now()`,
          [item.url, item.id, 'existing', item.published_on],
        );
        if (item.image)
          await tx.query(
            'INSERT INTO content_retired_covers(image) VALUES($1) ON CONFLICT DO NOTHING',
            [item.image],
          );
      }
      if (retired.length)
        await tx.query(
          "UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1",
          [JSON.stringify(items.filter((i) => !retired.includes(i)))],
        );
      return retired.length;
    });
  });
}

/** Only delete owned, exclusive covers. Inline cards, libraries and shared objects are protected. */
export async function cleanupRetiredCovers() {
  return withLease(async () => {
    const db = await getDb();
    await preserveBanlistCards();
    const row = (
      await db.query(`SELECT data->'web_news_media_cache' AS cache,
      jsonb_build_object('settings',data-'web_news_media_cache',
        'cards',(SELECT coalesce(jsonb_agg(data),'[]'::jsonb) FROM news_card_archives),
        'products',(SELECT coalesce(jsonb_agg(jsonb_build_array(images,options,description)),'[]'::jsonb) FROM products),
        'posts',(SELECT coalesce(jsonb_agg(jsonb_build_array(image,body)),'[]'::jsonb) FROM posts),
        'uploads',(SELECT coalesce(jsonb_agg(url),'[]'::jsonb) FROM uploads),
        'ygo',(SELECT coalesce(jsonb_agg(data),'[]'::jsonb) FROM ygo_card_cache),
        'editions',(SELECT coalesce(jsonb_agg(jsonb_build_array(manifest,published)),'[]'::jsonb) FROM ygo_editions)
      ) AS refs FROM settings WHERE id=1`)
    ).rows[0];
    const references = JSON.stringify(row?.refs || {});
    const cache = row?.cache || {};
    const candidates = (
      await db.query('SELECT image FROM content_retired_covers ORDER BY created_at LIMIT 20')
    ).rows;
    let freed = 0;
    for (const { image } of candidates) {
      const entries = Object.entries(cache).filter(([, value]: any) => value.image === image);
      // Anything without exact ownership metadata, with a thumbnail or in a library is retained.
      if (
        !entries.length ||
        entries.some(([, v]: any) => v.scope || v.thumbnail || v.landscape !== true) ||
        references.includes(image)
      ) {
        await db.query('DELETE FROM content_retired_covers WHERE image=$1', [image]);
        continue;
      }
      const key = ownedCoverKey(image);
      if (!key) continue;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const response = await fetch(
          `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(process.env.SUPABASE_STORAGE_BUCKET || 'product-images')}/${key}`,
          {
            method: 'DELETE',
            signal: AbortSignal.timeout(10000),
            headers: {
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            },
          },
        );
        if (!response.ok && response.status !== 404) continue;
      } else {
        // Local fixture files are not production storage and are never removed by this job.
        continue;
      }
      for (const [hash, value] of entries as [string, { image_bytes: number }][]) {
        freed += value.image_bytes;
        delete cache[hash];
      }
      // Keep quota accounting unchanged if deletion fails; a later daily run retries.
      await db.transaction(async (tx) => {
        await tx.query(
          "UPDATE settings SET data=jsonb_set(data,'{web_news_media_cache}',$1::jsonb,true) WHERE id=1",
          [JSON.stringify(cache)],
        );
        await tx.query('DELETE FROM content_retired_covers WHERE image=$1', [image]);
      });
    }
    return freed;
  });
}

export function ownedCoverKey(image: string): string | null {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const prefix = base
    ? `${base}/storage/v1/object/public/${encodeURIComponent(process.env.SUPABASE_STORAGE_BUCKET || 'product-images')}/`
    : '/api/media/';
  if (!image.startsWith(prefix)) return null;
  const key = image.slice(prefix.length);
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(key)
    ? key
    : null;
}
