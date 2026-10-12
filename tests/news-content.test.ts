import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { contentBody, extractNewsBlocks, newsHtmlTree } from '../lib/server/news-content';
import { compactMylBanlist } from '../lib/server/myl-news-source';
import {
  parseMylBanlist,
  applyMylNotice,
  refreshMylBanlists,
  getMylBanlists,
} from '../lib/server/myl-banlist';
import { mylBanlistSources, mylCardKey } from '../lib/myl-banlist';
import { mylNewsImage, metaNewsImage } from '../lib/web-news';
process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-news-content-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
Object.assign(process.env, { NODE_ENV: 'test' });
const fixture = (name: string) => readFile(path.resolve('tests/fixtures', name), 'utf8');

test('Banlist real de octubre: conserva los 19 cambios, límites anteriores, formatos y vigencias sin introducción', async () => {
  const html = await fixture('myl-banlist-october.html');
  const parsed = compactMylBanlist(
    extractNewsBlocks(newsHtmlTree(html), mylNewsImage),
    '2026-10-07',
  );
  assert.equal(parsed.blocks.filter((b) => b.kind === 'list').length, 19);
  assert.deepEqual(parsed.effective_dates, {
    'myl-first-era': '2026-10-08',
    'myl-first-block': '2026-10-11',
  });
  const body = contentBody(parsed.blocks);
  for (const text of [
    'César Augusto: prohibida (antes: 1)',
    'Mosquete Puritano: prohibida (antes: 1)',
    'Trauco: 2 copias (antes: 0)',
    'Kanillu: 1 copia (antes: 0)',
    'Sin cambios.',
  ])
    assert.ok(body.includes(text), text);
  assert.doesNotMatch(body, /Imperio|Furia|Hola, jugadores/);
});

test('Contenido: conserva orden, condiciones, tablas, documentos y todas las imágenes, sin HTML ejecutable', () => {
  const img = 'https://blog.myl.cl/wp-content/uploads/2026/10/card.png';
  const blocks = extractNewsBlocks(
    newsHtmlTree(
      `<p>¡Hola, jugadores!</p><h2>Carta nueva</h2><p>Si controlas un Aliado de Coste 2, roba una carta.<br>Solo una vez por turno.</p><figure><img data-src="${img}" src="${img}" alt="Carta"><figcaption>Efecto confirmado</figcaption></figure><table><tr><th>Fecha</th><th>Premio</th></tr><tr><td>20/10/2026</td><td>3 sobres</td></tr></table><p><a href="https://blog.myl.cl/wp-content/uploads/2026/10/reglas.pdf">Reglamento</a></p><script>alert(1)</script>`,
    ),
    mylNewsImage,
  );
  assert.equal(blocks[0].text, 'Carta nueva');
  assert.equal(blocks[2].source, img);
  const body = contentBody(blocks);
  assert.match(body, /Coste 2/);
  assert.match(body, /Solo una vez por turno/);
  assert.match(body, /20\/10\/2026 \| 3 sobres/);
  assert.match(body, /reglas.pdf/);
  assert.doesNotMatch(body, /Hola|alert/);
  const meta = extractNewsBlocks(
    [
      {
        name: 'p',
        children: [
          { content: 'Summon ' },
          { name: 'component', attrs: { id: 'link' } },
          { content: ' once per turn.' },
        ],
      },
      { name: 'component', attrs: { id: 'cards' } },
    ],
    metaNewsImage,
    {
      link: { type: 'CardLink', props: { name: 'Exact card name' } },
      cards: {
        type: 'CardContainer',
        props: { cards: [{ card: { _id: '1234567890abcdef12345678', name: 'Exact card name' } }] },
      },
    },
  );
  assert.match(contentBody(meta), /Summon Exact card name once per turn/);
  assert.equal(meta[1].kind, 'image');
  assert.throws(
    () => extractNewsBlocks(newsHtmlTree('<img src="http://localhost/private.png">'), mylNewsImage),
    /fuente no admitida/,
  );
  assert.throws(
    () => extractNewsBlocks(newsHtmlTree(`<p>${'a'.repeat(60001)}</p>`), mylNewsImage),
    /No se guardó una noticia recortada/,
  );
});

test('MyL: tablas completas, imágenes, correcciones posteriores y publicación atómica sin filtrar borradores', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { getSettings } = await import('../lib/server/catalog');
  const { getWebNews, saveWebNews, prepareWebNewsImages, publicWebArticle } =
    await import('../lib/server/web-news');
  const notice = await fixture('myl-banlist-october.html');
  const era = await fixture('myl-first-era.html'),
    block = await fixture('myl-first-block.html');
  for (const [board, html] of [
    ['myl-first-era', era],
    ['myl-first-block', block],
  ] as const) {
    const base = parseMylBanlist(html, mylBanlistSources[board]);
    assert.equal(base.effective_on, '2026-09-05');
    assert.equal(base.images.length, board === 'myl-first-era' ? 14 : 4);
    assert.ok(base.rules.includes('Ediciones incluidas en el formato:'));
    assert.ok(!base.rules.some((r) => /con cartas de cualquier edición/.test(r)));
    assert.equal(new Set(base.images.map((i) => i.name)).size, base.images.length);
    const current = applyMylNotice(
      base,
      notice,
      board,
      '2026-10-07',
      'https://blog.myl.cl/banlist-general-mitos-y-leyendas-07-10-26/',
    );
    if (board === 'myl-first-era') {
      const cards = current.cards.filter((c) => mylCardKey(c.name) === 'kanillu');
      assert.equal(cards.length, 1);
      assert.equal(cards[0].copies, 1);
      assert.equal(current.cards.filter((c) => mylCardKey(c.name) === 'totem de aguila').length, 1);
    } else
      assert.equal(current.cards.find((c) => mylCardKey(c.name) === 'cesar augusto')?.copies, 0);
    const older = applyMylNotice(
      { ...current, effective_on: '2027-01-01' },
      notice,
      board,
      '2026-10-07',
      'https://blog.myl.cl/test/',
    );
    assert.equal(older.effective_on, '2027-01-01');
  }
  const original = globalThis.fetch;
  let downloads = 0,
    offline = false;
  const png = await sharp({
    create: { width: 200, height: 300, channels: 3, background: '#223344' },
  })
    .png()
    .toBuffer();
  globalThis.fetch = async (input) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, 'blog.myl.cl');
    if (offline) return new Response('', { status: 503 });
    if (u.pathname.endsWith('/posts')) {
      if (u.searchParams.has('search'))
        return Response.json([
          {
            link: 'https://blog.myl.cl/banlist-general-mitos-y-leyendas-07-10-26/',
            date: '2026-10-07T12:00:00',
            title: { rendered: 'Banlist General' },
            content: { rendered: notice },
          },
        ]);
      const slug = u.searchParams.get('slug')!;
      return Response.json([
        {
          link: `https://blog.myl.cl/${slug}/`,
          content: {
            rendered:
              slug === 'banlist-racial-edicion-primer-bloque'
                ? block
                : slug === 'ban-list-primera-era-formato-racial-edicion'
                  ? era
                  : notice,
          },
        },
      ]);
    }
    downloads++;
    return new Response(new Uint8Array(png));
  };
  t.after(async () => {
    globalThis.fetch = original;
    await closeDb();
  });
  let panel = await refreshMylBanlists();
  assert.equal(panel.total, 18);
  assert.equal(await getMylBanlists(), null);
  assert.equal(panel.preparing, true);
  offline = true;
  await assert.rejects(() => refreshMylBanlists(true));
  assert.equal(await getMylBanlists(), null);
  offline = false;
  while (panel.preparing) panel = await refreshMylBanlists(true);
  assert.equal(downloads, 18);
  const saved = await getMylBanlists();
  assert.equal(saved?.formats['myl-first-block'].effective_on, '2026-10-11');
  assert.ok(!('myl_banlists' in (await getSettings())));
  assert.ok(!('myl_banlist_draft' in (await getSettings())));
  panel = await refreshMylBanlists();
  assert.equal(panel.preparing, false);
  assert.equal(downloads, 18, 'Reuses all previously archived images');
  const latest = await getMylBanlists();
  offline = true;
  await assert.rejects(() => refreshMylBanlists());
  assert.deepEqual(await getMylBanlists(), latest);
  offline = false;
  // Repair the old excerpt-only news without altering its published state or downloading unrelated pictures.
  const item = {
    id: 'myl-excerpt',
    url: 'https://blog.myl.cl/banlist-general-mitos-y-leyendas-07-10-26/',
    title: 'Banlist General',
    summary: 'Introducción incompleta de la noticia.',
    body: 'Introducción incompleta de la noticia.',
    published_on: '2026-10-07',
    category: 'banlist',
    boards: ['myl-first-era', 'myl-first-block'],
    original_title: 'Banlist General',
    visible: false,
  };
  await saveWebNews([item]);
  await prepareWebNewsImages(item.id);
  const repaired = (await getWebNews(true))[0];
  assert.match(repaired.body!, /Mosquete Puritano/);
  assert.equal(repaired.content_version, 1);
  await saveWebNews({ ...repaired, visible: true }, item.id);
  assert.equal(
    (await publicWebArticle(item.id)).content_blocks?.filter((b) => b.kind === 'list').length,
    19,
  );
  await saveWebNews(
    { ...repaired, body: 'Texto propio revisado por el administrador.', visible: true },
    item.id,
  );
  await prepareWebNewsImages(item.id);
  assert.equal((await getWebNews(true))[0].body, 'Texto propio revisado por el administrador.');
  const translatedItem = {
    ...item,
    id: 'meta-translation-resume',
    url: 'https://www.yugiohmeta.com/articles/news/test-translation',
    boards: ['yugioh'],
    content_version: 1,
    content_language: 'en',
    media_checked: true,
    content_blocks: [
      { kind: 'paragraph', text: 'Draw one card.', original_text: 'Draw one card.' },
      { kind: 'paragraph', text: 'Only once per turn.', original_text: 'Only once per turn.' },
    ],
  };
  await saveWebNews(translatedItem, translatedItem.id);
  // media_checked is server-owned: an editor payload cannot mark images as verified.
  const seeded = await getWebNews(true);
  seeded.find((v) => v.id === translatedItem.id)!.media_checked = true;
  await (
    await getDb()
  ).query("UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1", [
    JSON.stringify(seeded),
  ]);
  let quota = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'api.mymemory.translated.net');
    return Response.json({
      responseStatus: 200,
      quotaFinished: quota,
      responseData: {
        translatedText:
          url.searchParams.get('q') === 'Draw one card.'
            ? 'Roba una carta.'
            : 'Solo una vez por turno.',
      },
    });
  };
  await assert.rejects(
    () => saveWebNews({ ...translatedItem, visible: true }, translatedItem.id),
    /Termina de traducir/,
  );
  await prepareWebNewsImages(translatedItem.id, true);
  quota = true;
  await assert.rejects(() => prepareWebNewsImages(translatedItem.id, true), /cuota/);
  const partial = (await getWebNews(true)).find((v) => v.id === translatedItem.id)!;
  assert.equal(partial.visible, false);
  assert.equal(partial.content_blocks![0].text, 'Roba una carta.');
  assert.equal(partial.content_blocks![1].original_text, 'Only once per turn.');
  quota = false;
  await prepareWebNewsImages(translatedItem.id, true);
  const complete = (await getWebNews(true)).find((v) => v.id === translatedItem.id)!;
  assert.equal(complete.content_language, 'es');
  assert.equal(complete.body, 'Roba una carta.\n\nSolo una vez por turno.');
  await saveWebNews({ ...complete, visible: true }, complete.id);
  assert.ok((await getDb()).query);
});
