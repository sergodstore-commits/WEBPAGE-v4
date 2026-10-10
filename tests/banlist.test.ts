import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-banlist-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
Object.assign(process.env, { NODE_ENV: 'test' });

function fixture(day = '2020-01-01') {
  const formatted = day.split('-').reverse().join('/');
  const row = (cid: number, name: string, change = '') =>
    `<div class="t_row c_simple"><span class="name">${name}</span><input class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=${cid}">${change ? `<p>${change}</p>` : ''}</div>`;
  return `Lista de Cartas Prohibidas torneo oficial de Yu-Gi-Oh! TCG
  <select id="forbiddenLimitedDate"><option value="2099-01-01">Futura</option><option value="2020-01-01">Vigente</option></select>
  <div id="list_update"><h4>Cartas que se han Actualizado: 1 Cartas</h4>Actualizado en ${formatted}${row(4, 'Retorno', 'Limitada -&gt; Ya no est&aacute; en la Lista')}
  <div id="list_forbidden"><span class="mai">1 Carta(s)</span>${row(1, 'Drag&oacute;n &amp; F&eacute;nix')}
  <div id="list_limited"><span class="mai">1 Carta(s)</span>${row(2, 'Maliss &lt;Q&gt;')}
  <div id="list_semi_limited"><span class="mai">0 Carta(s)</span>
  <div id="list_release_of_restricted"><span class="mai">1 Carta(s)</span>${row(4, 'Retorno')}`;
}

test('Banlist TCG: nombres oficiales, lista completa, fechas futuras y conservación ante fallos', async (t) => {
  const { parseBanlist, refreshBanlist, getBanlist, banlistPanel, importBanlistCard } =
    await import('../lib/server/banlist');
  const { getDb, closeDb } = await import('../lib/server/db');
  const { getSettings } = await import('../lib/server/catalog');
  t.after(closeDb);
  const parsed = parseBanlist(fixture());
  assert.equal(parsed.cards[0].name, 'Dragón & Fénix');
  assert.equal(parsed.cards[1].name, 'Maliss <Q>');
  assert.equal(parsed.cards[2].copies, 3);
  assert.equal(parsed.cards[2].change, 'Limitada → Ya no está en la Lista');
  for (const broken of [
    fixture().replace('1 Carta(s)', '2 Carta(s)'),
    fixture().replace('cid=2', 'cid=1'),
    fixture().replace('01/01/2020', '31/02/2020'),
    fixture().replace('TCG', 'OCG'),
    fixture().replace('Actualizado: 1', 'Actualizado: 2'),
    fixture().replace('cid=4', 'cid=99'),
  ])
    assert.throws(() => parseBanlist(broken), /incompleta/);
  const db = await getDb();
  assert.equal(await getBanlist(), null);
  let mode = 'valid',
    calls = 0;
  let imageCalls = 0,
    invalidIdentity = false;
  const jpeg = await sharp({
    create: { width: 400, height: 580, channels: 3, background: '#223b59' },
  })
    .jpeg()
    .toBuffer();
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('https://db.ygoprodeck.com/')) {
      const cid = Number(new URL(url).searchParams.get('konami_id'));
      return Response.json({
        data: [
          {
            id: 100000000 + cid,
            name: `English ${cid}`,
            type: 'Spell Card',
            card_sets: [],
            misc_info: [{ konami_id: invalidIdentity ? 99 : cid }],
            card_images: [
              { image_url: `https://images.ygoprodeck.com/images/cards/${100000000 + cid}.jpg` },
            ],
          },
        ],
      });
    }
    if (url.startsWith('https://images.ygoprodeck.com/')) {
      imageCalls++;
      return new Response(new Uint8Array(jpeg));
    }
    if (url.includes('card_search.action'))
      return new Response(
        '<title>Maliss &lt;Q&gt; | Ficha</title>Texto de la Carta<div class="text_linebreak">Invoca a &quot;Maliss &lt;Q&gt;&quot;.&lt;br&gt;Destruye 1 carta.</div>',
      );
    calls++;
    assert.ok(String(input).startsWith('https://www.db.yugioh-card.com/'));
    if (mode === 'error') throw Error('offline');
    if (mode === 'broken') return new Response('Formato nuevo incompleto');
    return new Response(
      fixture(
        mode === 'future' && !String(input).includes('forbiddenLimitedDate=')
          ? '2099-01-01'
          : '2020-01-01',
      ),
    );
  });
  const saved = await refreshBanlist();
  assert.equal(saved.current.cards.length, 3);
  await refreshBanlist();
  assert.equal(calls, 1, 'Reuses recent refresh without calling the source again');
  assert.equal(Object.hasOwn(await getSettings(), 'ygo_banlist'), false);
  assert.equal((await banlistPanel()).ready, 0);
  let panel = await importBanlistCard();
  assert.equal(panel.ready, 1);
  assert.equal(panel.state?.current.cards[0].detail?.name, 'Maliss <Q>');
  assert.deepEqual(panel.state?.current.cards[0].detail?.effects, [
    'Invoca a "Maliss <Q>".\nDestruye 1 carta.',
  ]);
  assert.match(panel.state!.current.cards[0].detail!.image, /\.webp$/);
  assert.ok(panel.storage_bytes > 0 && panel.storage_bytes < 350000);
  invalidIdentity = true;
  await assert.rejects(importBanlistCard, /verificar/);
  assert.equal((await banlistPanel()).ready, 1);
  assert.equal(imageCalls, 1, 'Invalid identity does not download the wrong image');
  invalidIdentity = false;
  await db.query('UPDATE ygo_card_cache SET bytes=100000000');
  await assert.rejects(importBanlistCard, /100 MB/);
  await db.query('UPDATE ygo_card_cache SET bytes=$1', [panel.storage_bytes]);
  panel = await importBanlistCard();
  assert.equal(panel.ready, 2);
  // A previously imported gallery card is reused by its official cid, without any source call.
  const cached = panel.state!.current.cards[0].detail!;
  await db.query('INSERT INTO ygo_card_cache(id,data,bytes) VALUES($1,$2::jsonb,0)', [
    100000004,
    JSON.stringify({
      ...cached,
      id: 100000004,
      source:
        'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4&request_locale=es',
    }),
  ]);
  const beforeReuse = imageCalls;
  panel = await importBanlistCard();
  assert.equal(panel.ready, 3);
  assert.equal(imageCalls, beforeReuse);
  await db.query("UPDATE ygo_import_state SET lease_until=now()+interval '1 minute' WHERE id=1");
  await assert.rejects(importBanlistCard, /curso/);
  await db.query('UPDATE ygo_import_state SET lease_until=NULL WHERE id=1');
  async function expire() {
    await db.query(
      "UPDATE settings SET data=jsonb_set(data,'{ygo_banlist,checked_at}','\"2000-01-01T00:00:00.000Z\"') WHERE id=1",
    );
  }
  await expire();
  mode = 'error';
  const previous = await getBanlist();
  await assert.rejects(refreshBanlist, /no respondió/);
  assert.deepEqual(await getBanlist(), previous);
  mode = 'broken';
  await assert.rejects(refreshBanlist, /incompleta/);
  assert.deepEqual(await getBanlist(), previous);
  mode = 'future';
  const scheduled = await refreshBanlist();
  assert.equal(scheduled.current.effective_on, '2020-01-01');
  assert.equal(scheduled.upcoming?.effective_on, '2099-01-01');
  const ready = { ...scheduled, upcoming: { ...scheduled.current, effective_on: '2021-01-01' } };
  await db.query("UPDATE settings SET data=jsonb_set(data,'{ygo_banlist}',$1::jsonb) WHERE id=1", [
    JSON.stringify(ready),
  ]);
  assert.equal((await getBanlist())?.current.effective_on, '2021-01-01');
  assert.equal((await getBanlist())?.upcoming, null);
});
