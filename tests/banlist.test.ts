import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-banlist-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
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
  const { parseBanlist, refreshBanlist, getBanlist } = await import('../lib/server/banlist');
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
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
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
