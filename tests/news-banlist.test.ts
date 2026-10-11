import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { banlistOverview } from '../lib/news-banlist';
import type { WebNewsItem } from '../lib/web-news';

const notice = (id: string, date?: string, changes: Partial<WebNewsItem> = {}): WebNewsItem => ({
  id,
  title: id,
  summary: 'Aviso oficial para los jugadores.',
  url: `https://blog.myl.cl/${id}/`,
  published_on: '2026-10-01',
  visible: true,
  category: 'banlist',
  boards: ['myl-first-era'],
  effective_dates: date ? { 'myl-first-era': date } : undefined,
  ...changes,
});

test('Banlist en Noticias: vigencia real por formato, anuncios futuros y fechas no confirmadas', () => {
  const items = [
    notice('current', '2026-10-08'),
    notice('old', '2026-09-01', { published_on: '2026-10-10' }),
    notice('next', '2026-10-15'),
    notice('later', '2026-11-01'),
    notice('unconfirmed', undefined),
    notice('draft', '2026-10-11', { visible: false }),
    notice('not-banlist', '2026-10-11', { category: 'news' }),
    notice('invalid-date', '2026-02-31'),
    notice('wrong-source', '2026-10-11', { url: 'https://evil.test/' }),
    notice('both-formats', '2026-09-10', {
      boards: ['myl-first-era', 'myl-first-block'],
      effective_dates: { 'myl-first-era': '2026-09-10', 'myl-first-block': '2026-10-11' },
    }),
  ];
  const result = banlistOverview(null, items, '2026-10-11');
  assert.equal(result.myl['myl-first-era'].current?.title, 'current');
  assert.equal(result.myl['myl-first-era'].upcoming?.title, 'next');
  assert.equal(result.myl['myl-first-era'].unconfirmed?.effective_on, null);
  assert.equal(result.myl['myl-first-block'].current?.effective_on, '2026-10-11');
  const tcg = {
    checked_at: '',
    current: { effective_on: '2026-09-21' },
    upcoming: { effective_on: '2026-10-15' },
  };
  assert.equal(banlistOverview(tcg, [], '2026-10-14').yugioh?.current.effective_on, '2026-09-21');
  assert.deepEqual(banlistOverview(tcg, [], '2026-10-15').yugioh, {
    ...tcg,
    current: tcg.upcoming,
    upcoming: null,
  });
  assert.equal(banlistOverview(null, [], '2026-10-11').myl['myl-first-era'].current, null);
});

test('Resumen público: una lectura local, solo avisos publicados y sin imágenes, borradores ni textos privados', async (t) => {
  process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-news-banlist-${randomUUID()}`);
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL;
  Object.assign(process.env, { NODE_ENV: 'test' });
  const { getDb, closeDb } = await import('../lib/server/db');
  const { getNewsBanlistOverview } = await import('../lib/server/news-banlist');
  t.after(closeDb);
  const db = await getDb();
  const items = [
    notice('published', '2020-01-01', {
      original_summary: 'PRIVATE REFERENCE',
      media: [{ source: 'PRIVATE URL', name: 'Private media' }],
    }),
    notice('private-draft', '2020-01-02', { visible: false }),
  ];
  await db.query('UPDATE settings SET data=data || $1::jsonb WHERE id=1', [
    JSON.stringify({
      web_news: items,
      ygo_banlist: {
        checked_at: '2026-10-11T03:00:00Z',
        current: { effective_on: '2020-01-01', cards: [{ name: 'FULL CARD DATA' }] },
        upcoming: null,
      },
    }),
  ]);
  t.mock.method(globalThis, 'fetch', async () => {
    throw Error('No external calls expected');
  });
  const result = await getNewsBanlistOverview();
  assert.equal(result.myl['myl-first-era'].current?.href, '/noticias/myl/published');
  assert.equal(result.yugioh?.current.effective_on, '2020-01-01');
  const serialized = JSON.stringify(result);
  for (const hidden of ['PRIVATE', 'private-draft', 'FULL CARD DATA', 'cards', 'storage_bytes'])
    assert.ok(!serialized.includes(hidden));
  assert.ok(serialized.length < 1000);
});
