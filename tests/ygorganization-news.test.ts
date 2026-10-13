import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
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
    if (
      url.startsWith('https://ygorganization.com/?page=') ||
      url === 'https://ygorganization.com/'
    ) {
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
