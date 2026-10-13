import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { hash } from '../lib/server/core';
import { isEditorialNewsCandidate } from '../lib/server/news-editorial';
import {
  ygorganizationArticle,
  ygorganizationImage,
  possibleNewsDuplicate,
  type WebNewsItem,
} from '../lib/web-news';
import {
  parseYGOrganizationNews,
  parseYGOrganizationArticle,
  reviewYGOrganizationNews,
} from '../lib/server/ygorganization-news-source';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-ygorg-${randomUUID()}`);
for (const key of ['DATABASE_URL', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'test' });

const image = 'https://cdn.ygorganization.com/2026/10/cards.jpg';
const entry = {
  title: '[TCG] Magnificent Maestros Grandmaster Rares First Look',
  slug: 'maestros-first-look',
  excerpt: 'The first look at the new cards and release date.',
  date: '2026-10-08T17:00:00Z',
  categories: [{ slug: 'spoilers' }],
  featuredImage: { src: image },
};
const listing = (posts: unknown[]) =>
  `<script type="application/json" data-sveltekit-fetched data-url="/api/posts?">${JSON.stringify({ body: JSON.stringify({ data: { posts } }) })}</script>`;
const article = (
  title = entry.title,
) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'Article', headline: title, datePublished: entry.date })}</script>
<h1>Do not import site chrome</h1><div class="post-content prose prose-lg">
<span data-content-role="generic">Release on November 13, 2026.<br><br><strong>Card A</strong><br>Summon this card once per turn.</span>
<button><img src="${image}" alt="Card A"></button>
<div data-freestar-ad="banner"><p>Advertisement excluded</p></div>
<span data-content-role="generic">Important condition before the table.<p>Card B requires 2 monsters.</p><table><tr><td>Rarity</td><td>Ultra Rare</td></tr></table>Important condition after the table.</span>
<img src="https://cdn.ygorganization.com/2026/10/card-b.png" alt="Card B">
<span data-content-role="generic">The final paragraph contains the release information.</span></div>`;

test('YGOrganization: solo TCG editorial, URLs seguras y posibles coincidencias sin ocultar novedades', () => {
  const items = parseYGOrganizationNews(
    listing([
      entry,
      entry,
      { ...entry, title: '[OCG] New cards', slug: 'ocg' },
      { ...entry, title: 'Unmarked card support [RV02]', slug: 'unmarked' },
      { ...entry, title: '[TCG] Rush Duel cards', slug: 'rush' },
      { ...entry, title: '[TCG] Forbidden & Limited List', slug: 'banlist' },
      {
        ...entry,
        title: '[TCG] Tournament results',
        slug: 'tournament',
        categories: [{ slug: 'news' }],
      },
    ]),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].published_on, '2026-10-08');
  assert.equal(items[0].category, 'reveals');
  assert.deepEqual(parseYGOrganizationNews(listing([])), []);
  assert.throws(() => parseYGOrganizationNews('<h1>Changed</h1>'), /Cambió/);
  for (const value of [
    'http://ygorganization.com/post',
    'https://ygorganization.com.evil.test/post',
    'https://x@ygorganization.com/post',
    'https://ygorganization.com/api/posts',
    'https://ygorganization.com/post?secret=1',
    'https://ygorganization.com:444/post',
  ])
    assert.equal(ygorganizationArticle(value), null);
  for (const value of [
    'https://cdn.ygorganization.com.evil.test/2026/10/a.jpg',
    'https://cdn.ygorganization.com/2026/10/a.svg',
    'https://cdn.ygorganization.com/2026/10/a.jpg?x=1',
    'https://cdn.ygorganization.com/2026/10/%2e%2e%2fprivate.jpg',
  ])
    assert.equal(ygorganizationImage(value), null);
  const stored: WebNewsItem = {
    ...items[0],
    id: 'meta-existing',
    visible: false,
    url: 'https://www.yugiohmeta.com/articles/news/maestros',
    title: 'Título traducido',
    original_title: 'TCG: Magnificent Maestros Grandmaster Rares First Look Revealed',
  };
  assert.equal(possibleNewsDuplicate(items[0], [stored])?.id, stored.id);
  assert.equal(
    possibleNewsDuplicate(
      { ...items[0], title: '[TCG] Magnificent Maestros reveals a different new card' },
      [stored],
    ),
    undefined,
  );
  assert.equal(
    possibleNewsDuplicate(items[0], [{ ...stored, published_on: '2025-01-01' }]),
    undefined,
  );
});

test('YGOrganization: texto hasta el final, cartas e imágenes en contexto, fallos sin importaciones parciales', () => {
  const content = parseYGOrganizationArticle(
    article(),
    'https://ygorganization.com/maestros-first-look',
  );
  assert.equal(content.media.length, 2);
  assert.ok(content.blocks.some((b) => b.text.includes('once per turn')));
  assert.ok(content.blocks.some((b) => b.text === 'Rarity | Ultra Rare'));
  assert.ok(content.blocks.some((b) => b.text.includes('condition before')));
  assert.ok(content.blocks.some((b) => b.text.includes('condition after')));
  assert.match(content.blocks.at(-1)!.text, /final paragraph/);
  assert.ok(!content.blocks.some((b) => /Advertisement|site chrome/.test(b.text)));
  assert.throws(
    () =>
      parseYGOrganizationArticle(article('[OCG] Maestros'), 'https://ygorganization.com/maestros'),
    /TCG/,
  );
  assert.throws(
    () =>
      parseYGOrganizationArticle(
        article().replace(image, 'http://localhost/private'),
        'https://ygorganization.com/maestros',
      ),
    /fuente no admitida/,
  );
});

test('YGOrganization: TCG al final del título, reediciones sin prefijo, erratas y rechazo de códigos japoneses', () => {
  const reprint = {
    ...entry,
    title: 'Structure Deck: Yugi Muto & Seto Kaiba REPRINT',
    slug: 'reprint',
    categories: [{ slug: 'structure-deck' }, { slug: 'reprints' }],
  };
  const errata = {
    ...entry,
    title: 'Forbidden Droplet card text correction [TCG]',
    slug: 'errata',
    categories: [{ slug: 'errata' }],
  };
  const japanese = {
    ...entry,
    title: 'The Ars Magna Return Home [IMPH]',
    slug: 'japanese',
    categories: [{ slug: 'new-cards' }],
  };
  const unverified = { ...reprint, slug: 'unverified' };
  const result = parseYGOrganizationNews(listing([reprint, errata, japanese, unverified]), {
    [hash('https://ygorganization.com/reprint')]: {
      checked_at: new Date().toISOString(),
      tcg: true,
    },
    [hash('https://ygorganization.com/japanese')]: {
      checked_at: new Date().toISOString(),
      tcg: false,
    },
  });
  assert.equal(result.length, 2);
  assert.equal(result.find((i) => i.url.endsWith('/reprint'))?.category, 'releases');
  assert.equal(result.find((i) => i.url.endsWith('/errata'))?.category, 'news');
  assert.ok(result.every(isEditorialNewsCandidate));
  const european = article(reprint.title).replace(
    'Release on November 13, 2026.',
    '<a href="https://www.yugioh-card.com/eu/products/example">Official European release</a>',
  );
  assert.ok(
    parseYGOrganizationArticle(european, 'https://ygorganization.com/reprint').media.length,
  );
  const wrongDomain = european.replace(
    'www.yugioh-card.com/eu/',
    'www.yugioh-card.com.evil.test/eu/',
  );
  assert.throws(
    () => parseYGOrganizationArticle(wrongDomain, 'https://ygorganization.com/reprint'),
    /TCG/,
  );
  const jp = article(japanese.title).replace(
    'Release on November 13, 2026.',
    'IMPH-JP045, a Japanese reveal. <a href="https://www.yugioh-card.com/eu/products/example">TCG future release</a>',
  );
  assert.throws(() => parseYGOrganizationArticle(jp, 'https://ygorganization.com/japanese'), /TCG/);
  assert.throws(
    () =>
      parseYGOrganizationArticle(article('Symbols [RD/CA01]'), 'https://ygorganization.com/rush'),
    /TCG/,
  );
  assert.throws(
    () =>
      parseYGOrganizationArticle(
        article('Cards [CR13-AE]').replace('Release on November 13, 2026.', 'Future TCG release.'),
        'https://ygorganization.com/asian-english',
      ),
    /TCG/,
  );
});

test('YGOrganization: verifica anuncios sin etiqueta, conserva caché de formato y aísla fallos de fuentes', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await closeDb();
  });
  const db = await getDb();
  await db.query("UPDATE settings SET data=data-'ygorganization_news_discovery' WHERE id=1");
  const reprint = {
    ...entry,
    title: 'Structure Deck REPRINT',
    slug: 'european-reprint',
    categories: [{ slug: 'reprints' }],
  };
  const jp = { ...entry, title: 'The Ars Magna Return Home [IMPH]', slug: 'japanese-reveal' };
  const offline = {
    ...entry,
    title: 'Unlabelled booster announced',
    slug: 'offline',
    categories: [{ slug: 'product-news' }],
  };
  const european = article(reprint.title).replace(
    'Release on November 13, 2026.',
    '<a href="https://www.yugioh-card.com/eu/products/example">European release</a>',
  );
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === '/') {
      assert.deepEqual(url.searchParams.getAll('categories'), ['errata', 'f-and-l', 'ocg-tcg']);
      return new Response(listing([entry, reprint, jp, offline]));
    }
    if (url.pathname === '/european-reprint') return new Response(european);
    if (url.pathname === '/japanese-reveal')
      return new Response(
        article(jp.title).replace('Release on November 13, 2026.', 'IMPH-JP045 revealed in Japan.'),
      );
    if (url.pathname === '/offline') return new Response('unavailable', { status: 503 });
    throw Error('Unexpected image or source request');
  };
  const found = await reviewYGOrganizationNews();
  assert.deepEqual(found.items.map((i: { url: string }) => i.url).sort(), [
    'https://ygorganization.com/european-reprint',
    'https://ygorganization.com/maestros-first-look',
  ]);
  assert.equal(found.format_check_errors, 1);
  assert.equal(found.format_checks[hash('https://ygorganization.com/japanese-reveal')].tcg, false);
  assert.ok(
    !found.format_checks[hash('https://ygorganization.com/offline')],
    'Network failures must be retryable',
  );
  assert.equal(calls.length, 6, 'Three filtered pages and three article probes; no images');
  await reviewYGOrganizationNews();
  assert.equal(calls.length, 6, 'Five-minute listing cache');
  await db.query(
    "UPDATE settings SET data=jsonb_set(data,'{ygorganization_news_discovery,checked_at}','\"2020-01-01T00:00:00Z\"'::jsonb) WHERE id=1",
  );
  await reviewYGOrganizationNews();
  assert.equal(
    calls.filter((p) => p === '/european-reprint').length,
    1,
    'Positive format cache reused',
  );
  assert.equal(
    calls.filter((p) => p === '/japanese-reveal').length,
    1,
    'Negative format cache reused',
  );
  assert.equal(calls.filter((p) => p === '/offline').length, 2, 'Failed article retried');
  await db.query("UPDATE settings SET data=data-'ygorganization_news_discovery' WHERE id=1");
});

test('YGOrganization: búsqueda cacheada sin descargas, borrador privado, imágenes optimizadas y publicación interna', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { getSettings } = await import('../lib/server/catalog');
  const { prepareNewsDraft } = await import('../lib/server/news-translation');
  const { prepareWebNewsImages, getWebNews, saveWebNews, publicWebArticle } =
    await import('../lib/server/web-news');
  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await closeDb();
  });
  const jpeg = await sharp({
    create: { width: 420, height: 600, channels: 3, background: '#345678' },
  })
    .jpeg()
    .toBuffer();
  let lists = 0,
    downloads = 0;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    assert.equal(options?.redirect, 'error');
    if (new URL(url).hostname === 'ygorganization.com' && new URL(url).pathname === '/') {
      assert.deepEqual(new URL(url).searchParams.getAll('categories'), [
        'errata',
        'f-and-l',
        'ocg-tcg',
      ]);
      lists++;
      return new Response(listing([entry]));
    }
    if (url === 'https://ygorganization.com/maestros-first-look') return new Response(article());
    if (url.startsWith('https://cdn.ygorganization.com/')) {
      downloads++;
      return new Response(jpeg);
    }
    throw Error(`Unexpected network call ${url}`);
  };
  const found = await reviewYGOrganizationNews();
  assert.equal(found.items.length, 1);
  assert.equal(lists, 3);
  assert.equal(downloads, 0, 'Searching never archives images');
  await reviewYGOrganizationNews();
  assert.equal(lists, 3, 'Five-minute discovery cache');
  assert.equal(
    'ygorganization_news_discovery' in (await getSettings()),
    false,
    'Discovery is private',
  );
  const candidate = found.items[0];
  await prepareNewsDraft({ id: candidate.id, source: 'ygorganization', translate: false });
  assert.ok(!(await getWebNews()).some((i) => i.id === candidate.id));
  let prepared = await prepareWebNewsImages(candidate.id, false, false, false);
  while (prepared.ready < prepared.total) prepared = await prepareWebNewsImages(candidate.id, true);
  assert.equal(downloads, 2, 'Cover reused for the matching inline image');
  const item = prepared.items.find((i) => i.id === candidate.id)!;
  assert.ok(item.media?.every((m) => m.image?.endsWith('.webp') && m.bytes! <= 160000));
  await saveWebNews({ ...item, visible: true }, item.id);
  const published = await publicWebArticle(item.id);
  assert.equal(published.source_label, 'YGOrganization');
  assert.equal(published.format, 'TCG');
  assert.match(
    (await getWebNews()).find((i) => i.id === item.id)!.article_path!,
    /^\/noticias\/tcg\//,
  );
  assert.match(published.body!, /final paragraph/);
  await (
    await getDb()
  ).query("UPDATE settings SET data=data-'ygorganization_news_discovery' WHERE id=1");
  globalThis.fetch = async () => {
    throw Error('offline');
  };
  await assert.rejects(() => reviewYGOrganizationNews(), /se conservan/);
  assert.ok(
    (await getWebNews()).some((i) => i.id === item.id),
    'A failed refresh preserves publications',
  );
});
