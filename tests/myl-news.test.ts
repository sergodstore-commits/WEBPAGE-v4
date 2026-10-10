import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { mylArticle, mylNewsImage } from '../lib/web-news';
import { parseMylNews, mylImageManifest, mylText } from '../lib/server/myl-news-source';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-myl-news-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
Object.assign(process.env, { NODE_ENV: 'test' });
const image = 'https://blog.myl.cl/wp-content/uploads/2026/10/test.png';
const fixture = (id: number, title: string, categories: number[]) => ({
  id,
  title: { rendered: title },
  date: '2026-10-07T12:00:00',
  link: `https://blog.myl.cl/noticia-${id}/`,
  excerpt: { rendered: '<p>Referencia oficial para revisar.</p>' },
  categories,
  _embedded: { 'wp:featuredmedia': [{ source_url: image }] },
});

test('MyL: clasificación por formato, banlist general, fechas originales y fuentes acotadas', () => {
  const items = parseMylNews(
    [
      fixture(1, 'Torneo Primera Era', [728]), // Bad source tag must not override the title.
      fixture(2, 'Torneo Primer Bloque', [614]),
      fixture(3, 'Banlist General Mitos y Leyendas', [728]),
      fixture(4, 'Imperio tiene a su campeón', [728]),
      fixture(5, 'Furia Extendido', [614]),
      fixture(3, 'Banlist General Mitos y Leyendas', [728]),
      { ...fixture(6, 'Primera Era', [614]), link: 'http://localhost/private' },
      { ...fixture(7, 'Primera Era', [614]), date: '2026-02-31' },
    ],
    { era: new Set([614]), block: new Set([728]) },
  );
  assert.equal(items.length, 3);
  assert.deepEqual(items.find((p) => p.title === 'Torneo Primera Era')?.boards, ['myl-first-era']);
  assert.deepEqual(items.find((p) => p.title === 'Torneo Primer Bloque')?.boards, [
    'myl-first-block',
  ]);
  assert.deepEqual(items.find((p) => p.category === 'banlist')?.boards, [
    'myl-first-era',
    'myl-first-block',
  ]);
  assert.equal(items[0].published_on, '2026-10-07');
  assert.equal(
    mylText('<script>bad()</script><b>Primera</b> Era &#8211; edici&oacute;n'),
    'Primera Era – edición',
  );
  assert.equal(
    mylImageManifest(`<img src="${image}" alt="Carta"><img src='${image}' alt='Otra'>`).length,
    1,
  );
  assert.throws(() => mylImageManifest('<img src="http://localhost/private">'), /externas/);
  for (const url of [
    'https://blog.myl.cl.evil.test/test/',
    'https://secret@blog.myl.cl/test/',
    'https://blog.myl.cl/test/?private=1',
    'https://blog.myl.cl/wp-json/',
  ])
    assert.equal(mylArticle(url), null);
  for (const url of [
    'https://blog.myl.cl.evil.test/wp-content/uploads/x.png',
    'https://blog.myl.cl/wp-content/uploads/x.svg',
    'https://blog.myl.cl/wp-content/uploads/%2e%2e/private.png',
  ])
    assert.equal(mylNewsImage(url), null);
});

test('MyL: discovery cached, protected publication, resumable WebP, shared storage and persistent dates', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { reviewMylNews } = await import('../lib/server/myl-news-source');
  const { getWebNews, saveWebNews, prepareWebNewsImages, publicWebArticle } =
    await import('../lib/server/web-news');
  const { newsMediaUsage } = await import('../lib/server/meta-news-source');
  const originalFetch = globalThis.fetch;
  const png = await sharp({
    create: { width: 640, height: 400, channels: 3, background: '#315647' },
  })
    .png()
    .toBuffer();
  let reviews = 0,
    downloads = 0,
    unavailable = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'blog.myl.cl');
    if (unavailable) return new Response('', { status: 503 });
    if (url.pathname.endsWith('/categories'))
      return Response.json([
        { id: 614, slug: 'primera-era', parent: 0 },
        { id: 728, slug: 'primer-bloque', parent: 0 },
      ]);
    if (url.pathname.endsWith('/posts') && url.searchParams.has('slug'))
      return Response.json([
        {
          link: 'https://blog.myl.cl/noticia-3/',
          content: {
            rendered: `<img src="${image}" alt="Banlist"><img src="${image}" alt="Repetida">`,
          },
        },
      ]);
    if (url.pathname.endsWith('/posts')) {
      reviews++;
      return Response.json([fixture(3, 'Banlist General Mitos y Leyendas', [728])]);
    }
    if (url.toString() === image) {
      downloads++;
      return new Response(new Uint8Array(png));
    }
    throw Error('Unexpected source URL');
  };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await closeDb();
  });
  const discovery = await reviewMylNews();
  assert.equal(discovery.items.length, 1);
  await reviewMylNews();
  assert.equal(reviews, 3, 'Repeated discovery reuses the five-minute result');
  const c = discovery.items[0];
  const draft = {
    ...c,
    title: 'Cambios de banlist revisados',
    summary: 'Consulta los cambios y la fecha de aplicación de cada formato.',
    original_title: c.title,
    visible: false,
    effective_dates: { 'myl-first-era': '2026-10-08', 'myl-first-block': '2026-10-11' },
  };
  await saveWebNews([draft]);
  assert.deepEqual(await getWebNews(), []);
  await assert.rejects(() => publicWebArticle(c.id));
  await assert.rejects(() => saveWebNews([{ ...draft, boards: ['yugioh'] }]));
  await assert.rejects(() => saveWebNews([{ ...draft, visible: true }]));
  assert.equal(downloads, 0, 'No images downloaded until the editor prepares the draft');
  let prepared = await prepareWebNewsImages(c.id);
  prepared = await prepareWebNewsImages(c.id, true);
  assert.equal(prepared.ready, prepared.total);
  assert.equal(downloads, 1, 'Cover and inline image share one stored WebP');
  assert.ok((await newsMediaUsage()) < 160_000);
  await saveWebNews(prepared.items.map((p) => ({ ...p, visible: true })));
  const published = await publicWebArticle(c.id);
  assert.equal(published.published_on, '2026-10-07');
  assert.deepEqual(published.effective_dates, draft.effective_dates);
  assert.equal((await getWebNews())[0].article_path, `/noticias/myl/${c.id}`);
  assert.equal('source_image' in published, false);
  await closeDb();
  assert.equal((await publicWebArticle(c.id)).published_on, '2026-10-07');
  unavailable = true;
  await (await getDb()).query("UPDATE settings SET data=data-'myl_news_discovery' WHERE id=1");
  await assert.rejects(reviewMylNews, /selección se conserva/);
  assert.equal((await publicWebArticle(c.id)).visible, true);
});
