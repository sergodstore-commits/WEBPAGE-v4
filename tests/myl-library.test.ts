import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { mylPresentationForProduct } from '../lib/myl-library';
import { editionCatalogKeys } from '../lib/edition-connections';
process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-myl-library-${randomUUID()}`);
for (const key of ['DATABASE_URL', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'test' });
const image = (file: string) =>
  `<img src="https://blog.myl.cl/wp-content/uploads/2026/05/${file}.png" alt=""/>`;
const blockHtml = `<h1>Novedades: Cartas Premium</h1>${image('LPB4-039')}<h2>Listado de cartas Primer Bloque 4.0</h2><p>Secretas</p>${image('LPB4-001-1')}${image('LPB4-001-2')}<p>Set Clásico</p>${image('SCLPB4-01')}${image('LPB4-321')}<h1>Sorpresa adicional: Cartas Secretas Manga</h1>${image('LPB4-001-Manga')}`;

test('MyL: manifiesto oficial, duplicados, reserva separada y asociación exacta al producto', async () => {
  const { parseMylLibrary } = await import('../lib/server/myl-library');
  const cards = parseMylLibrary('myl-lpb4', blockHtml);
  assert.deepEqual(
    cards.map((c) => c.code),
    ['LPB4-001', 'LPB4-039', 'SCLPB4-001'],
  );
  assert.ok(cards.find((c) => c.code === 'LPB4-001')?.source.endsWith('LPB4-001-2.png'));
  assert.ok(!cards.some((c) => c.code === 'LPB4-321'));
  const promos = parseMylLibrary(
    'myl-lpe4',
    `<h1>Novedades: Cartas Mega Reales</h1>${image('04_megareal_1_LPE4_08')}<h2>Display de Sobres</h2>${image('LPE4_322')}<h1>Beneficio de reserva de 3 Display</h1>${image('LPE4_321')}`,
  );
  assert.deepEqual(
    promos.filter((c) => c.role === 'reserve').map((c) => [c.code, c.role, c.presentation]),
    [
      ['LPE4-P321', 'reserve', 'tres-displays'],
      ['LPE4-P322', 'reserve', undefined],
    ],
  );
  assert.throws(() => parseMylLibrary('myl-lpb4', '<img src="https://localhost/private.png"/>'));
  assert.throws(() => parseMylLibrary('myl-lpb4', '<h2>Listado nuevo sin cartas</h2>'));
  assert.throws(() =>
    parseMylLibrary(
      'myl-ra',
      '<h2>Cartas producto Relatos Dominios de Ra: Amanecer.</h2>' + image('ARAX_01'),
    ),
  );
  const halloween = parseMylLibrary(
    'myl-ultratumba',
    `<p>spoilers del producto Tinieblas</p>${image('03-Endriago')}<p>inclusiones del producto Abismo</p>${image('28-Ilo-la-Comadreja')}<h3>Beneficios de Reservas</h3>${image('Bayard-Buy-a-Box')}${image('Midgard-Buy-a-Box')}`,
  );
  assert.deepEqual(
    halloween.map((c) => [c.name, c.presentation, c.role]),
    [
      ['Endriago', 'tinieblas', 'fixed'],
      ['Ilo la Comadreja', 'abismo', 'fixed'],
      ['Bayard', 'tinieblas', 'reserve'],
      ['Midgard', 'abismo', 'reserve'],
    ],
  );
  assert.equal(
    mylPresentationForProduct({
      catalog_group: 'myl-halloween-leyendas-ultratumba',
      sku: 'SG-MYL-HALLOWEEN-ABISMO',
      options: { Idioma: 'Español' },
    }),
    'abismo',
  );
  assert.equal(
    mylPresentationForProduct({
      catalog_group: 'ygo-beyond-the-brave',
      sku: 'ABISMO',
      options: {},
    }),
    undefined,
  );
  assert.deepEqual(
    editionCatalogKeys({ code: 'myl-lpb4', name: 'Leyendas Primer Bloque 4.0' }).groups,
    ['myl-leyendas-primer-bloque-4-0'],
  );
});

test('MyL: preparación reanudable, miniaturas compartidas, aislamiento, publicación y retiro', async (t) => {
  const { getDb, closeDb, dataDir } = await import('../lib/server/db');
  const { prepareMylLibrary, publishMylLibrary, publicMylLibrary, mylLibraryPanel } =
    await import('../lib/server/myl-library');
  const { communityEditions } = await import('../lib/server/edition-imports');
  const { getSettings, editionProducts } = await import('../lib/server/catalog');
  const { archiveMetaNewsCover, newsMediaUsage } = await import('../lib/server/meta-news-source');
  const { withLease } = await import('../lib/server/edition-imports');
  const { saveWebNews, publicWebArticle, getWebNews } = await import('../lib/server/web-news');
  const original = globalThis.fetch;
  const png = await sharp({
    create: { width: 700, height: 1000, channels: 3, background: '#294b35' },
  })
    .png()
    .toBuffer();
  let fail = false,
    html = blockHtml;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (fail) return new Response('', { status: 503 });
    if (url.includes('/wp-json/'))
      return Response.json([
        { link: 'https://blog.myl.cl/leyendas-primer-bloque-4-0/', content: { rendered: html } },
      ]);
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
  };
  t.after(async () => {
    globalThis.fetch = original;
    await closeDb();
  });
  const db = await getDb();
  await assert.rejects(() => publicMylLibrary('myl-lpb4'));
  await assert.rejects(() => publishMylLibrary('myl-lpb4', true));
  let panel = await prepareMylLibrary('myl-lpb4', true);
  assert.equal(panel.items[0].total, 3);
  assert.equal(panel.items[0].ready, 0);
  await prepareMylLibrary('myl-lpb4');
  await assert.rejects(() => publishMylLibrary('myl-lpb4', true));
  for (let i = 0; i < 2; i++) panel = await prepareMylLibrary('myl-lpb4');
  assert.equal(panel.items[0].ready, 3);
  assert.ok(panel.storage_bytes > 0);
  const before = requests.length;
  await prepareMylLibrary('myl-lpb4');
  assert.equal(requests.length, before);
  await publishMylLibrary('myl-lpb4', true);
  const publicDoc = await publicMylLibrary('myl-lpb4');
  assert.equal(publicDoc.cards.length, 3);
  assert.ok(publicDoc.cards.every((c) => c.image && c.thumbnail && c.image !== c.thumbnail));
  assert.equal(
    (await communityEditions()).find((c) => c.code === 'myl-lpb4')?.game,
    'myl-first-block',
  );
  assert.ok(!('myl_library' in (await getSettings())));
  assert.equal(await newsMediaUsage(), 0, 'The library does not consume the news quota');
  assert.equal((await editionProducts('myl-lpb4')).edition.code, 'myl-lpb4');
  const files = await readdir(path.join(dataDir(), 'objects'));
  assert.equal(files.length, 6);
  await withLease(() => archiveMetaNewsCover(publicDoc.cards[0].source));
  assert.equal(
    requests.length,
    before,
    'News reuses the library file instead of downloading again',
  );
  const article = {
    id: 'myl-library-link',
    title: 'Contenido de Leyendas',
    summary: 'Descubre las cartas de Primer Bloque.',
    url: 'https://blog.myl.cl/leyendas-primer-bloque-4-0/',
    published_on: '2026-05-09',
    visible: true,
    category: 'reveals',
    boards: ['myl-first-block'],
    body: 'Contenido de la edición.',
    edition_code: 'myl-lpb4',
  };
  await saveWebNews([article]);
  assert.equal((await publicWebArticle(article.id)).edition_code, 'myl-lpb4');
  assert.equal((await getWebNews())[0].edition_code, 'myl-lpb4');
  await assert.rejects(() => saveWebNews([{ ...article, boards: ['myl-first-era'] }]));
  const snapshot = JSON.stringify(publicDoc);
  fail = true;
  await assert.rejects(() => prepareMylLibrary('myl-lpb4', true));
  assert.equal(JSON.stringify(await publicMylLibrary('myl-lpb4')), snapshot);
  fail = false;
  html = blockHtml.replace('<p>Secretas</p>', `<p>Secretas</p>${image('LPB4-320')}`);
  await prepareMylLibrary('myl-lpb4', true);
  assert.equal(
    JSON.stringify(await publicMylLibrary('myl-lpb4')),
    snapshot,
    'Refresh does not replace published data',
  );
  await publishMylLibrary('myl-lpb4', false);
  await assert.rejects(() => publicMylLibrary('myl-lpb4'));
  assert.ok(!(await communityEditions()).some((c) => c.code === 'myl-lpb4'));
  assert.equal((await mylLibraryPanel()).items[0].ready, 3);
  assert.ok(
    (await db.query("SELECT data->'myl_library' AS library FROM settings WHERE id=1")).rows[0]
      .library,
  );
});
