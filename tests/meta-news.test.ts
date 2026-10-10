import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-meta-news-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
Object.assign(process.env, { NODE_ENV: 'test' });

const article = {
  title: 'TCG: New cards',
  url: '/news/cards/',
  date: '2026-10-09T12:00:00Z',
  category: 'tcg-news',
  subCategory: 'card-reveals',
  image: '/mdm_img/test.webp',
  ocg: false,
  hidden: false,
  description: 'Reference in English.',
  parsedMarkdown: {
    htmlTree: [
      {
        name: 'p',
        children: [{ name: 'img', attrs: { src: '/mdm_img/test.webp', alt: 'Portada' } }],
      },
    ],
    customComponents: {
      '0': {
        type: 'CardContainer',
        props: {
          cards: [
            { card: { _id: '1234567890abcdef12345678', name: 'First card' } },
            { card: { _id: '1234567890abcdef12345679', name: 'Second card' } },
            { card: { _id: '1234567890abcdef12345678', name: 'First card' } },
          ],
        },
      },
    },
  },
};

test('TCG news: selection, resumable complete gallery, reuse, quota and private drafts', async (t) => {
  const { parseMetaNews, articleImageManifest, reviewMetaNews, newsMediaUsage } =
    await import('../lib/server/meta-news-source');
  const { saveWebNews, getWebNews, prepareWebNewsImages, publicWebArticle } =
    await import('../lib/server/web-news');
  const { metaNewsImage } = await import('../lib/web-news');
  const { getDb, closeDb } = await import('../lib/server/db');
  const { getSettings } = await import('../lib/server/catalog');
  t.after(closeDb);
  const found = parseMetaNews([
    article,
    article,
    { ...article, ocg: true },
    { ...article, hidden: true },
    { ...article, category: 'ocg-news' },
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].category, 'reveals');
  assert.equal(articleImageManifest(article).length, 3, 'Deduplicates repeated inline cards');
  assert.throws(() => articleImageManifest({}), /estructura/);
  assert.throws(
    () =>
      articleImageManifest({
        ...article,
        parsedMarkdown: { htmlTree: [{ name: 'img', attrs: { src: 'http://localhost/private' } }] },
      }),
    /fuente admitida/,
  );
  for (const unsafe of [
    'http://localhost/a.webp',
    'https://s3.duellinksmeta.com.evil.test/img/a.webp',
    'https://x@s3.duellinksmeta.com/img/a.webp',
    'https://s3.duellinksmeta.com/img/a.webp?q=x',
  ])
    assert.equal(metaNewsImage(unsafe), null);
  const jpeg = await sharp({
    create: { width: 420, height: 600, channels: 3, background: '#345678' },
  })
    .jpeg()
    .toBuffer();
  let downloads = 0,
    reviews = 0,
    failImage = false;
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'www.yugiohmeta.com') {
      if (url.searchParams.has('url')) return Response.json([article]);
      reviews++;
      return Response.json([article]);
    }
    assert.equal(url.hostname, 's3.duellinksmeta.com');
    if (failImage && url.pathname.includes('12345679')) throw Error('offline');
    downloads++;
    return new Response(new Uint8Array(jpeg));
  });
  await reviewMetaNews();
  await reviewMetaNews();
  assert.equal(reviews, 1, 'Repeated refresh reuses the five minute discovery cache');
  const draft = {
    ...found[0],
    visible: false,
    title: 'Nuevas cartas TCG',
    summary: 'Nuestra selección de novedades.',
    original_title: article.title,
    body: 'Texto propio en español.',
  };
  await saveWebNews([draft]);
  assert.deepEqual(await getWebNews(), []);
  await assert.rejects(() => publicWebArticle(draft.id), /no está publicada/);
  await assert.rejects(
    () => saveWebNews([{ ...draft, visible: true, media_checked: true }]),
    /Prepara/,
  );
  let progress = await prepareWebNewsImages(draft.id);
  assert.equal(progress.total, 3);
  assert.equal(downloads, 1, 'Prepares the cover once');
  progress = await prepareWebNewsImages(draft.id, true);
  assert.equal(progress.ready, 1);
  assert.equal(downloads, 1, 'Reuses cover when it is also an inline image');
  progress = await prepareWebNewsImages(draft.id, true);
  assert.equal(progress.ready, 2);
  failImage = true;
  await assert.rejects(() => prepareWebNewsImages(draft.id, true), /no respondió/);
  assert.equal((await getWebNews(true))[0].media!.filter((m) => m.image).length, 2);
  await assert.rejects(
    async () => saveWebNews([{ ...(await getWebNews(true))[0], visible: true }]),
    /Termina/,
  );
  failImage = false;
  progress = await prepareWebNewsImages(draft.id, true);
  assert.equal(progress.ready, 3);
  assert.equal(downloads, 3);
  const prepared = (await getWebNews(true))[0];
  await saveWebNews([
    {
      ...prepared,
      visible: true,
      media: prepared.media!.map((m) => ({ ...m, caption: 'Efecto revisado en español.' })),
    },
  ]);
  const published = await publicWebArticle(draft.id);
  assert.equal(published.media!.length, 3);
  assert.equal(published.media![0].caption, 'Efecto revisado en español.');
  assert.equal('original_title' in published, false);
  assert.equal(
    'body' in (await getWebNews())[0],
    false,
    'Listing does not load full articles and galleries',
  );
  for (const key of ['web_news', 'web_news_discovery', 'web_news_media_cache'])
    assert.equal(key in (await getSettings()), false);
  const usage = await newsMediaUsage();
  assert.ok(usage > 0 && usage < 480000);
  await saveWebNews([]);
  assert.equal(await newsMediaUsage(), usage, 'Removed drafts still count stored images');
  await saveWebNews([draft]);
  await prepareWebNewsImages(draft.id);
  for (let i = 0; i < 3; i++) await prepareWebNewsImages(draft.id, true);
  assert.equal(downloads, 3, 'Restored articles reuse persisted downloads');
  const db = await getDb();
  await db.query(
    "UPDATE settings SET data=jsonb_set(data,'{web_news_media_cache,quota}', $1::jsonb,true) WHERE id=1",
    [JSON.stringify({ image: '/test.webp', image_bytes: 15000000 })],
  );
  const { archiveMetaNewsCover } = await import('../lib/server/meta-news-source');
  await assert.rejects(() => archiveMetaNewsCover('/mdm_img/new.webp'), /15 MB/);
});
