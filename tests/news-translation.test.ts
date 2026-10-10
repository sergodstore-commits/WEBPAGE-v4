import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  translationChunks,
  translateNewsText,
  prepareNewsDraft,
} from '../lib/server/news-translation';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-translation-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test' });

test('Traducción: límite UTF-8, cuota y noticias MyL sin enviar texto al traductor', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { getWebNews, saveWebNews } = await import('../lib/server/web-news');
  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await closeDb();
  });
  const text = 'ñ🙂 una noticia '.repeat(100);
  const chunks = translationChunks(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((c) => Buffer.byteLength(c) <= 480));
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.mymemory.translated.net');
    assert.equal(url.searchParams.get('langpair'), 'en|es');
    assert.ok(Buffer.byteLength(url.searchParams.get('q')!) <= 500);
    return Response.json({
      responseStatus: 200,
      responseData: { translatedText: 'Noticia traducida correctamente.' },
    });
  };
  assert.equal(await translateNewsText('English news'), 'Noticia traducida correctamente.');
  const db = await getDb();
  const myl = {
    id: 'myl-test',
    title: 'Noticias Primera Era',
    summary: 'Resumen original en español con información de MyL.',
    url: 'https://blog.myl.cl/primera-era-test/',
    published_on: '2026-10-07',
    boards: ['myl-first-era'],
    category: 'news',
    source_image: '',
  };
  const tcg = {
    ...myl,
    id: 'meta-test',
    title: 'English title',
    summary: 'An English description of the news.',
    boards: ['yugioh'],
    url: 'https://www.yugiohmeta.com/articles/news/test',
  };
  await db.query('UPDATE settings SET data=data || $1::jsonb WHERE id=1', [
    JSON.stringify({
      myl_news_discovery: { items: [myl] },
      web_news_discovery: { items: [tcg] },
    }),
  ]);
  calls = 0;
  await prepareNewsDraft({ id: myl.id, source: 'myl', translate: true });
  assert.equal(calls, 0);
  assert.equal((await getWebNews(true)).find((i) => i.id === myl.id)?.body, myl.summary);
  await prepareNewsDraft({ id: tcg.id, source: 'tcg' });
  assert.equal(calls, 2);
  assert.equal(
    (await getWebNews(true)).find((i) => i.id === tcg.id)?.title,
    'Noticia traducida correctamente.',
  );
  await prepareNewsDraft({ id: tcg.id, source: 'tcg' });
  assert.equal(calls, 2, 'An existing draft must not consume translation quota again');
  assert.ok(!(await getWebNews()).some((i) => i.id === tcg.id));
  const saved = (await getWebNews(true)).find((i) => i.id === myl.id)!;
  await saveWebNews({ ...saved, title: 'Título actualizado por separado' }, myl.id);
  assert.ok(
    (await getWebNews(true)).some((i) => i.id === tcg.id),
    'Saving one item must preserve other items',
  );
  await assert.rejects(() => saveWebNews(saved, 'wrong-id'), /Identificador/);
  await assert.rejects(
    () => prepareNewsDraft({ id: 'unknown', source: 'tcg' }),
    /Busca las novedades/,
  );
  globalThis.fetch = async () =>
    Response.json({
      responseStatus: 200,
      quotaFinished: true,
      responseData: { translatedText: 'QUOTA FINISHED' },
    });
  await assert.rejects(() => translateNewsText('Some news'), /cuota/);
  globalThis.fetch = async () => {
    throw Error('offline');
  };
  await assert.rejects(() => translateNewsText('Some news'), /no respondió/);
  assert.equal(
    (await getWebNews(true)).find((i) => i.id === myl.id)?.title,
    'Título actualizado por separado',
  );
});
