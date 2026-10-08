import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { chileInstant, chileLocal } from '../lib/tournament-schedule';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-schedule-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test' });

test('Hora chilena conserva el horario de pared al cambiar el horario de invierno', () => {
  assert.equal(chileInstant('2026-10-10T17:30'), '2026-10-10T20:30:00.000Z');
  assert.equal(chileInstant('2027-06-05T17:30'), '2027-06-05T21:30:00.000Z');
  assert.throws(() => chileInstant('2026-02-30T19:30'));
  assert.throws(() => chileInstant('2026-09-06T00:30'), /no existe/);
});

test('Agenda persistente: repetición, excepciones, pausa y precio opcional', async () => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { savePost, getPosts, getPost } = await import('../lib/server/content');
  try {
    await getDb();
    const base = {
      kind: 'tournament',
      title: 'Liga Primera Era',
      status: 'published',
      event_local: '2026-10-13T19:30',
      repeat_weekly: true,
      entry_price: 6000,
      location: 'Los Carrera 5142, Copiapó',
    };
    let series = await savePost(base);
    const october = { from: '2026-10-01', to: '2026-10-31' };
    let publicPosts = await getPosts(false, 'tournament', october);
    assert.deepEqual(
      publicPosts.map((p) => chileLocal(p.event_at).slice(0, 10)),
      ['2026-10-13', '2026-10-20', '2026-10-27'],
    );
    assert.ok(
      publicPosts.every((p) => chileLocal(p.event_at).endsWith('19:30') && p.entry_price === 6000),
    );
    const virtual = publicPosts[1];
    assert.equal((await getPost(virtual.slug)).event_at, virtual.event_at);
    const changed = await savePost({
      ...base,
      title: 'Liga trasladada',
      repeat_weekly: false,
      event_local: '2026-10-22T19:30',
      exception_parent_id: series.id,
      exception_day: '2026-10-20',
    });
    publicPosts = await getPosts(false, 'tournament', october);
    assert.deepEqual(publicPosts.map((p) => chileLocal(p.event_at).slice(0, 10)).sort(), [
      '2026-10-13',
      '2026-10-22',
      '2026-10-27',
    ]);
    await assert.rejects(() => getPost(virtual.slug), /no está disponible/);
    await assert.rejects(
      () =>
        savePost({
          ...base,
          repeat_weekly: false,
          exception_parent_id: series.id,
          exception_day: '2026-10-20',
        }),
      /no pertenece/,
    );
    // An outdated editor cannot restore the habitual event alongside its replacement.
    series = await savePost({ ...base, excluded_dates: [] }, series.id);
    assert.deepEqual(series.excluded_dates, ['2026-10-20']);
    assert.equal((await getPosts(false, 'tournament', october)).length, 3);
    await closeDb();
    const stored = await getPosts(true, 'tournament');
    assert.equal(stored.find((p) => p.id === series.id)?.entry_price, 6000);
    assert.equal(stored.find((p) => p.id === changed.id)?.exception_day, '2026-10-20');
    await savePost({ ...base, status: 'withdrawn' }, series.id);
    assert.equal((await getPosts(false, 'tournament', october)).length, 1);
    await savePost({ ...base, repeat_until: '2026-10-20' }, series.id);
    assert.equal(
      (await getPosts(false, 'tournament', october)).filter((p) => p.series_id).length,
      1,
    );
    await savePost({ ...base, repeat_until: null }, series.id);
    assert.equal(
      (await getPosts(false, 'tournament', { from: '2027-06-01', to: '2027-06-30' })).length,
      5,
    );
    const summer = await getPosts(false, 'tournament', { from: '2027-06-01', to: '2027-06-30' });
    assert.ok(summer.every((p) => chileLocal(p.event_at).endsWith('19:30')));
    const yugi = await savePost({
      kind: 'tournament',
      title: 'Yu-Gi-Oh!',
      status: 'published',
      event_local: '2026-10-10T17:30',
    });
    assert.equal(yugi.entry_price, null);
    await assert.rejects(() => savePost({ ...base, entry_price: -1 }));
    await assert.rejects(() => savePost({ ...base, repeat_until: '2026-10-01' }), /cierre/);
    await assert.rejects(
      () => getPosts(false, 'tournament', { from: '2026-01-01', to: '2030-01-01' }),
      /período/,
    );
    const news = await savePost({ kind: 'news', title: 'Borrador', event_local: 'invalid' });
    assert.equal(news.repeat_weekly, false);
    assert.equal(
      (await (await getDb()).query('SELECT count(*)::int AS n FROM posts')).rows[0].n,
      4,
    );
  } finally {
    await closeDb();
  }
});

test('Una excepción en borrador no retira la fecha habitual hasta publicarla', async () => {
  const { closeDb } = await import('../lib/server/db');
  const { savePost, getPosts } = await import('../lib/server/content');
  try {
    const base = {
      kind: 'tournament',
      title: 'Liga borrador',
      status: 'published',
      event_local: '2026-11-03T19:30',
      repeat_weekly: true,
    };
    const series = await savePost(base);
    const draft = await savePost({
      kind: 'tournament',
      title: 'Reemplazo borrador',
      status: 'draft',
      event_local: '2026-11-05T19:30',
      exception_parent_id: series.id,
      exception_day: '2026-11-03',
    });
    const range = { from: '2026-11-01', to: '2026-11-07' };
    let rows = await getPosts(false, 'tournament', range);
    assert.equal(rows.filter((p) => p.series_id === series.id).length, 1);
    assert.equal(rows.filter((p) => p.id === draft.id).length, 0);
    await savePost({ ...JSON.parse(JSON.stringify(draft)), status: 'published' }, draft.id);
    rows = await getPosts(false, 'tournament', range);
    assert.equal(rows.filter((p) => p.series_id === series.id).length, 0);
    assert.equal(rows.filter((p) => p.id === draft.id).length, 1);
  } finally {
    await closeDb();
  }
});
