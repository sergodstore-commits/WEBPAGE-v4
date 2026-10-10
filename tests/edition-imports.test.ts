import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import sharp from 'sharp';
import baseline from '../public/editions/betb/cards.json';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-editions-${randomUUID()}`);
for (const key of ['DATABASE_URL', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'test' });

test('Ediciones: preparación reanudable, español oficial, publicación revisada y recursos compartidos', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const imports = await import('../lib/server/edition-imports');
  const { getWebNews } = await import('../lib/server/web-news');
  const { getProducts, saveProduct } = await import('../lib/server/catalog');
  const { spanishPlain, spanishCard, sourceBytes, editionManifest } =
    await import('../lib/server/ygo-source');
  t.after(closeDb);
  const requests: string[] = [];
  const jpeg = await sharp({
    create: { width: 400, height: 580, channels: 3, background: '#923b26' },
  })
    .jpeg()
    .toBuffer();
  let spanishAvailable = true,
    hostileImage = false;
  const date = new Date().toISOString().slice(0, 10);
  const sets = [
    { set_name: 'Test Edition', set_code: 'TEST', num_of_cards: 2, tcg_date: date },
    { set_name: 'Shared Reprint', set_code: 'RPT', num_of_cards: 1, tcg_date: date },
    { set_name: 'Future Edition', set_code: 'FTR', num_of_cards: 1, tcg_date: date },
    { set_name: 'Incomplete Edition', set_code: 'INC', num_of_cards: 2, tcg_date: date },
    { set_name: 'Old Edition', set_code: 'OLD', num_of_cards: 1, tcg_date: '2000-01-01' },
  ];
  function sourceCard(name: string, id: number, code: string) {
    return {
      id,
      name: `English card ${id}`,
      type: 'Link Monster',
      attribute: 'DARK',
      atk: 1200,
      def: null,
      level: null,
      linkval: 2,
      card_sets: [{ set_name: name, set_code: code, set_rarity: 'Ultra Rare' }],
      misc_info: [{ konami_id: 12345 }],
      card_images: [
        {
          image_url: hostileImage
            ? 'https://evil.test/image.jpg'
            : `https://images.ygoprodeck.com/images/cards/${id}.jpg`,
        },
      ],
    };
  }
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('cardsets.php')) return Response.json(sets);
    if (url.includes('cardinfo.php')) {
      const name = new URL(url).searchParams.get('cardset')!;
      const cards =
        name === 'Test Edition'
          ? [
              sourceCard(name, baseline.cards[0].id, 'TEST-EN001'),
              sourceCard(name, 123456789, 'TEST-EN002'),
            ]
          : [
              sourceCard(
                name,
                name === 'Future Edition' ? 123456790 : 123456789,
                `${name === 'Shared Reprint' ? 'RPT' : name === 'Future Edition' ? 'FTR' : 'INC'}-EN001`,
              ),
            ];
      return Response.json({ data: cards });
    }
    if (url.includes('card_search.action'))
      return new Response(
        spanishAvailable
          ? '<title>Dragón &amp; Fénix | Detalles</title>Texto de la Carta<div class="text_linebreak">Invoca esta carta.&amp;lt;br&amp;gt;Destruye 1 carta &amp;aacute;gil.</div><div class="CardLanguage"><div class="text_linebreak">English ignored.</div>'
          : '<title>English only | Details</title><div class="text_linebreak">English effect only.</div>',
      );
    if (url.startsWith('https://images.ygoprodeck.com/')) return new Response(new Uint8Array(jpeg));
    throw new Error(`Unexpected source: ${url}`);
  });
  assert.equal(spanishPlain('&#xA1;Drag&oacute;n!&amp;lt;br&amp;gt;&#241;'), '¡Dragón!\nñ');
  assert.throws(() => spanishCard('<title>English | Details</title>'), /español/);
  await assert.rejects(() => sourceBytes('https://localhost/private', 100), /autorizada/);
  await assert.rejects(
    () => sourceBytes('https://secret@db.ygoprodeck.com/api/v7/cardsets.php', 100),
    /autorizada/,
  );
  const first = await imports.searchEditions();
  assert.equal(first.discoveries.length, 4);
  await imports.searchEditions();
  assert.equal(
    requests.filter((url) => url.endsWith('cardsets.php')).length,
    1,
    'Discovery cache avoids redundant network',
  );
  await assert.rejects(() => imports.prepareEdition('unknown'), /Selecciona/);
  await assert.rejects(() => imports.prepareEdition('https://evil.test'), /Invalid/);
  let state = await imports.prepareEdition('test');
  assert.equal(state.total, 2);
  assert.equal(state.ready, 0);
  await assert.rejects(() => imports.previewEdition('test'), /Completa/);
  await assert.rejects(() => imports.publishEdition('test', true), /Completa/);
  await assert.rejects(() => imports.publicEdition('test'), /no está publicada/);
  state = await imports.importEditionBatch('test');
  assert.equal(state.ready, 1);
  assert.equal(
    (await imports.editionPanel()).storage_bytes,
    0,
    'Baseline images are reused without storage',
  );
  state = await imports.importEditionBatch('test');
  assert.equal(state.complete, true);
  const document = await imports.previewEdition('test');
  assert.equal(document.cards.length, 2);
  assert.equal(document.cards[1].name, 'Dragón & Fénix');
  assert.deepEqual(document.cards[1].effects, ['Invoca esta carta.\nDestruye 1 carta ágil.']);
  assert.match(document.cards[1].image, /^\/api\/media\/.+\.webp$/);
  assert.equal((await readdir(path.join(process.env.LOCAL_DATA_DIR!, 'objects'))).length, 2);
  const bytes = (await imports.editionPanel()).storage_bytes;
  assert.ok(bytes > 0 && bytes < 350000);
  const before = requests.length;
  await imports.importEditionBatch('test');
  assert.equal(requests.length, before, 'Complete retries do not redownload');
  await imports.prepareEdition('rpt');
  assert.equal((await imports.previewEdition('rpt')).cards[0].image, document.cards[1].image);
  assert.equal((await imports.previewEdition('rpt')).cards[0].printings[0].code, 'RPT-EN001');
  assert.equal((await imports.editionPanel()).storage_bytes, bytes);
  assert.equal((await imports.publishedEditions()).length, 0);
  await imports.publishEdition('test', true);
  const published = await imports.publicEdition('test');
  assert.equal(
    (await getWebNews()).find((news) => news.id === 'edition-test')?.article_path,
    '/noticias/ediciones/test',
  );
  const product = await saveProduct(
    { id: null },
    {
      name: 'Test display',
      sku: 'edition-test',
      price: 1000,
      stock: 1,
      kind: 'store',
      catalog_group: 'ygo-test-edition',
      catalog_name: 'Test Edition',
    },
  );
  await (await getDb()).query("UPDATE products SET status='published' WHERE id=$1", [product.id]);
  assert.equal(
    (await getProducts()).find((item) => item.id === product.id)?.edition_guide?.url,
    '/noticias/ediciones/test',
  );
  await imports.editEdition('test', {
    title: 'Título del borrador actualizado',
    summary: 'Resumen nuevo reservado hasta publicar.',
    body: 'Este texto solo aparecerá en público al publicar los cambios revisados.',
  });
  assert.deepEqual(
    await imports.publicEdition('test'),
    published,
    'Draft edits do not alter the public snapshot',
  );
  await imports.publishEdition('test', true);
  assert.equal((await imports.publicEdition('test')).title, 'Título del borrador actualizado');
  await imports.publishEdition('test', false);
  await assert.rejects(() => imports.publicEdition('test'), /no está publicada/);
  assert.deepEqual(
    await imports.publishedEditions(),
    [],
    'Withdrawal stores SQL null, not JSON null',
  );
  assert.equal(
    (await getWebNews()).some((news) => news.id === 'edition-test'),
    false,
  );
  assert.equal(
    (await imports.previewEdition('test')).cards.length,
    2,
    'Withdrawal preserves the draft',
  );
  assert.equal(
    (await getProducts()).find((item) => item.id === product.id)?.edition_guide,
    undefined,
  );
  const db = await getDb();
  await db.query("UPDATE ygo_import_state SET lease_until=now()+interval '1 minute' WHERE id=1");
  await assert.rejects(() => imports.searchEditions(), /curso/);
  await db.query('UPDATE ygo_import_state SET lease_until=NULL WHERE id=1');
  state = await imports.prepareEdition('inc');
  assert.equal(state.source_complete, false);
  assert.match(state.last_error, /todas las cartas/);
  await assert.rejects(() => imports.publishEdition('inc', true), /Completa/);
  hostileImage = true;
  await assert.rejects(() => editionManifest('Future Edition'), /verificable/);
  hostileImage = false;
  await imports.prepareEdition('ftr');
  spanishAvailable = false;
  const imageRequests = () =>
    requests.filter((url) => url.startsWith('https://images.ygoprodeck.com/')).length;
  const initialImages = imageRequests();
  state = await imports.importEditionBatch('ftr');
  assert.match(state.last_error, /español/);
  assert.equal(state.ready, 0);
  assert.equal(
    imageRequests(),
    initialImages,
    'Missing Spanish does not download images or invent translations',
  );
  spanishAvailable = true;
  await db.query('UPDATE ygo_card_cache SET bytes=$1 WHERE id=$2', [
    imports.EDITION_STORAGE_LIMIT,
    123456789,
  ]);
  state = await imports.importEditionBatch('ftr');
  assert.match(state.last_error, /100 MB/);
  assert.equal(state.ready, 0);
  assert.equal((await readdir(path.join(process.env.LOCAL_DATA_DIR!, 'objects'))).length, 2);
  await db.query('UPDATE ygo_card_cache SET bytes=$1 WHERE id=$2', [bytes, 123456789]);
  state = await imports.importEditionBatch('ftr');
  assert.equal(state.complete, true, 'Resume after source/quota recovery');
  await closeDb();
  assert.equal(
    (await imports.previewEdition('ftr')).cards.length,
    1,
    'Preparation survives reopening the database',
  );
});
