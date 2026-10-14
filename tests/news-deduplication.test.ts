import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { newsIdentity, newsRelationship, firstNewsReport } from '../lib/news-deduplication';
import {
  instagramNewsArticle,
  instagramNewsImage,
  publicNewsContent,
  type WebNewsItem,
} from '../lib/web-news';
import { parseYugiohInstagram } from '../lib/server/yugioh-instagram-source';
import { suppressDuplicateNews } from '../lib/server/news-deduplication';
import { getDb, closeDb } from '../lib/server/db';
import { getWebNews } from '../lib/server/web-news';
import { runDailyContent } from '../lib/server/content-automation';
import { AppError } from '../lib/server/core';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-news-dedupe-${randomUUID()}`);
for (const key of ['DATABASE_URL', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'test' });
const text =
  'Magnificent Maestros introduces the Grandmaster Rares with exclusive artwork. The booster contains powerful monsters, spells and traps for collectors and competitive duelists.';
const report = (id: string, url = `https://ygorganization.com/${id}`): WebNewsItem => ({
  id,
  url,
  title: '[TCG] Magnificent Maestros Grandmaster Rares First Look',
  summary: text,
  body: text,
  content_blocks: [{ kind: 'paragraph', text }],
  published_on: '2026-10-10',
  visible: true,
  boards: ['yugioh'],
  format: 'TCG',
  category: 'reveals',
  media_checked: true,
});

test('same announcement across three sources; original timestamps win over import order', () => {
  const first = { ...report('first'), source_published_at: '2026-10-10T08:00:00Z' };
  const second = {
    ...report('second', 'https://www.yugiohmeta.com/articles/news/maestros'),
    source_published_at: '2026-10-10T12:00:00Z',
  };
  const third = {
    ...report('third', 'https://www.instagram.com/p/ApprovedPost/'),
    source_published_at: '2026-10-10T16:00:00Z',
  };
  assert.equal(newsRelationship(first, second), 'duplicate');
  assert.equal(newsRelationship(second, third), 'duplicate');
  assert.equal(firstNewsReport([third, second, first]).id, 'first');
  assert.equal(
    firstNewsReport([second, { ...first, source_published_at: undefined }]).id,
    'second',
    'No fabricated publication hour',
  );
  assert.equal(newsRelationship(first, { ...second, format: 'OCG' }), 'different');
  assert.equal(
    firstNewsReport([
      { ...second, published_on: '2026-10-10', source_published_at: '2026-10-10T23:00:00-10:00' },
      { ...first, published_on: '2026-10-11', source_published_at: '2026-10-11T01:00:00+14:00' },
    ]).id,
    'first',
    'Timestamp order survives different source time zones',
  );
});
test('new cards, numbers and substantive details are updates, not duplicates', () => {
  const first = {
    ...report('first'),
    media: [
      { source: 'a', name: 'Dark Magician' },
      { source: 'b', name: 'Blue Eyes White Dragon' },
    ],
  };
  assert.equal(
    newsRelationship(first, {
      ...report('second'),
      media: [...first.media, { source: 'c', name: 'Red Eyes Black Dragon' }],
    }),
    'update',
  );
  assert.equal(
    newsRelationship(report('first'), {
      ...report('second'),
      body: `${text} Available November 15 with 24 booster packs.`,
      content_blocks: undefined,
    }),
    'update',
  );
  assert.equal(
    newsRelationship(report('first'), {
      ...report('second'),
      body: `${text} Additional support lets players summon dragons, recover banished resources, change battle positions, negate monster effects and equip powerful weapons.`,
      content_blocks: undefined,
    }),
    'update',
  );
  assert.equal(
    newsRelationship(report('first'), {
      ...report('other'),
      title: 'Chaos Origins Yugi monsters and sacred beasts',
      summary: 'Completely separate announcement for another expansion.',
    }),
    'different',
  );
});
test('saved original evidence survives Spanish translation without enlarging public payload', () => {
  const first = report('first');
  const translated = {
    ...first,
    title: 'Maestros magníficos: primeras imágenes',
    summary: 'Nueva información en español.',
    body: 'Una traducción completamente distinta.',
    content_blocks: undefined,
    dedupe_identity: newsIdentity(first),
  };
  assert.equal(newsRelationship(translated, report('second')), 'duplicate');
  assert.equal(publicNewsContent(translated).dedupe_identity, undefined);
});
test('official Instagram accepts complete photo carousels; rejects unsafe URLs and partial data', () => {
  const image = 'https://scontent.test.cdninstagram.com/v/a.jpg?signature=provider';
  const post = {
    id: '123',
    caption: 'First look at Magnificent Maestros! Discover the new cards inside this booster.',
    permalink: 'https://www.instagram.com/p/OfficialTest/?hl=es',
    timestamp: '2026-10-10T08:00:00+0000',
    media_type: 'CAROUSEL_ALBUM',
    children: {
      data: [
        { id: '1', media_type: 'IMAGE', media_url: image },
        { id: '2', media_type: 'IMAGE', media_url: image.replace('a.jpg', 'b.jpg') },
      ],
    },
  };
  const response = (posts: unknown[], username = 'yugiohcardeu') => ({
    business_discovery: { username, media: { data: posts } },
  });
  const entries = parseYugiohInstagram(response([post]));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].media.length, 2);
  assert.equal(entries[0].candidate.source_published_at, '2026-10-10T08:00:00.000Z');
  assert.equal(entries[0].candidate.url, 'https://www.instagram.com/p/OfficialTest/');
  assert.equal(
    parseYugiohInstagram(
      response([{ ...post, children: { ...post.children, paging: { next: 'more' } } }]),
    ).length,
    0,
  );
  assert.throws(() => parseYugiohInstagram(response([post], 'another-account')));
  for (const url of [
    'https://www.instagram.com/yugiohcardeu/',
    'http://instagram.com/p/a/',
    'https://instagram.com.evil.test/p/a/',
    'https://x@instagram.com/p/a/',
    'https://instagram.com:444/p/a/',
  ])
    assert.equal(instagramNewsArticle(url), null);
  for (const url of [
    'https://cdninstagram.com.evil.test/a.jpg',
    'https://private.test/a.jpg',
    'https://x@scontent.test.cdninstagram.com/a.jpg',
    'https://scontent.test.cdninstagram.com/a.mp4',
  ])
    assert.equal(instagramNewsImage(url), null);
});
test('deduplication preserves the first live article until replacement is ready and archives cards', async () => {
  const db = await getDb();
  try {
    const late = {
      ...report('late'),
      published_on: '2026-10-11',
      media: [
        {
          source: 'https://cdn.ygorganization.com/2026/10/a.jpg',
          name: 'Image',
          image: '/api/media/00000000-0000-0000-0000-000000000001.webp',
        },
      ],
    };
    const early = {
      ...report('early', 'https://www.yugiohmeta.com/articles/news/early'),
      visible: false,
    };
    await db.query(
      "UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1",
      [JSON.stringify([late, early])],
    );
    assert.equal(await suppressDuplicateNews(early), false);
    assert.equal(
      (await getWebNews(true)).some((n) => n.id === 'late' && n.visible),
      true,
    );
    const published = { ...early, visible: true };
    await db.query(
      "UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1",
      [JSON.stringify([late, published])],
    );
    assert.equal(await suppressDuplicateNews(published, true), false);
    assert.deepEqual(
      (await getWebNews(true)).map((n) => n.id),
      ['early'],
    );
    assert.equal(
      (await db.query('SELECT phase FROM content_news_jobs WHERE url=$1', [late.url])).rows[0]
        .phase,
      'duplicate',
    );
    assert.equal(
      (await db.query('SELECT data FROM news_card_archives WHERE url=$1', [late.url])).rows[0].data
        .media[0].image,
      late.media[0].image,
    );
    const later = { ...report('later'), published_on: '2026-10-12', visible: false };
    await db.query(
      "UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1",
      [JSON.stringify([published, later])],
    );
    assert.equal(await suppressDuplicateNews(later), true);
    assert.deepEqual(
      (await getWebNews(true)).map((n) => n.id),
      ['early'],
    );
  } finally {
    await closeDb();
  }
});

test('daily importer suppresses a repeated report before image/translation calls; denied Instagram does not block other sources', async () => {
  const db = await getDb();
  const originalFetch = globalThis.fetch;
  try {
    const first = {
      ...report('first', 'https://www.yugiohmeta.com/articles/news/first'),
      published_on: '2026-10-09',
      dedupe_identity: newsIdentity(report('first')),
    };
    const repeated = {
      ...report('daily-repeat'),
      source_image: 'https://cdn.ygorganization.com/2026/10/duplicate.jpg',
    };
    await db.query(
      "UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true)-'ygo_banlist_draft'-'myl_banlist_draft' WHERE id=1",
      [JSON.stringify([first])],
    );
    await db.query('DELETE FROM content_daily_runs');
    await db.query('DELETE FROM content_news_jobs');
    let articleCalls = 0;
    globalThis.fetch = async (input) => {
      assert.equal(String(input), repeated.url, 'No duplicate image or translation request');
      articleCalls++;
      return new Response(
        `<script type="application/ld+json">${JSON.stringify({ '@type': 'Article', headline: repeated.title, datePublished: '2026-10-10T10:00:00Z' })}</script><div class="post-content prose prose-lg"><p>${text}</p></div>`,
      );
    };
    const empty = async () => ({ items: [] });
    const result = await runDailyContent(
      {
        discover: {
          myl: empty,
          tcg: empty,
          ygorganization: async () => ({ items: [repeated] }),
          'yugioh-instagram': async () => {
            throw new AppError(409, 'Business Discovery pendiente de autorización de Meta');
          },
        },
        ygoBanlist: async () => {},
        mylBanlist: async () => {},
      },
      10_000,
    );
    assert.equal(result.skipped, false);
    assert.equal('published' in result && result.published, 0);
    assert.ok('errors' in result && result.errors.some((e) => e.includes('Business Discovery')));
    assert.equal(articleCalls, 1);
    assert.deepEqual(
      (await getWebNews(true)).map((n) => n.id),
      ['first'],
    );
    assert.equal(
      (await db.query('SELECT phase FROM content_news_jobs WHERE url=$1', [repeated.url])).rows[0]
        .phase,
      'duplicate',
    );
  } finally {
    globalThis.fetch = originalFetch;
    await closeDb();
  }
});
