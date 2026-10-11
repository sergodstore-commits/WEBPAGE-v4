import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-web-news-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test' });

test('Noticias web: selección persistente, enlaces seguros y aislamiento de configuración', async (t) => {
  const { closeDb } = await import('../lib/server/db');
  const { getWebNews, saveWebNews, publicWebArticle } = await import('../lib/server/web-news');
  const { getSettings, saveSettings } = await import('../lib/server/catalog');
  const { initialWebNews, yugiohMetaArticle } = await import('../lib/web-news');
  t.after(closeDb);
  const settings = await getSettings();
  assert.equal((await getWebNews()).length, 1);
  assert.equal(yugiohMetaArticle('https://www.yugiohmeta.com.evil.test/articles/test'), null);
  assert.equal(yugiohMetaArticle('https://secret@www.yugiohmeta.com/articles/test'), null);
  assert.equal(yugiohMetaArticle('javascript:alert(1)'), null);
  await assert.rejects(() => saveWebNews([{ ...initialWebNews[0], url: 'http://localhost/test' }]));
  await assert.rejects(() => saveWebNews([initialWebNews[0], initialWebNews[0]]));
  const hidden = { ...initialWebNews[0], visible: false, title: 'Título español reservado' };
  await saveWebNews([hidden]);
  assert.deepEqual(await getWebNews(), []);
  assert.equal((await getWebNews(true))[0].title, hidden.title);
  assert.equal('web_news' in (await getSettings()), false);
  assert.equal((await getSettings()).name, settings.name);
  await saveSettings(settings);
  assert.equal((await getWebNews(true))[0].visible, false);
  await saveWebNews([{ ...hidden, visible: true }]);
  await saveWebNews([{ ...hidden, visible: true, edition_code: 'betb' }]);
  assert.equal((await publicWebArticle(hidden.id)).edition_code, 'betb');
  assert.equal((await getWebNews())[0].edition_code, 'betb');
  await assert.rejects(() => saveWebNews([{ ...hidden, edition_code: '../private' }]));
  await saveWebNews([{ ...hidden, visible: true, edition_code: 'unpublished' }]);
  assert.equal(
    (await publicWebArticle(hidden.id)).edition_code,
    undefined,
    'Unpublished guides never get public connections',
  );
  assert.equal(
    (await getWebNews(true))[0].edition_code,
    'unpublished',
    'The admin keeps its association for later publication',
  );
  await saveWebNews([{ ...hidden, visible: true, edition_code: '' }]);
  assert.equal(
    (await getWebNews(true))[0].edition_code,
    undefined,
    'An association can be removed',
  );
  await closeDb();
  assert.equal((await getWebNews())[0].title, hidden.title);
  await saveWebNews([]);
  assert.deepEqual(await getWebNews(), []);
});
