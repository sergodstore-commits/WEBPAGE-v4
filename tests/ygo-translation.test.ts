import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { spanishOrTranslatedCard } from '../lib/server/ygo-translation';
import type { ManifestCard } from '../lib/server/ygo-source';
import { withTranslationBudget } from '../lib/server/news-translation';
import { getDb, closeDb } from '../lib/server/db';
import { cacheYgoCard } from '../lib/server/edition-imports';
import authored from '../data/ygo-card-translations.json';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-card-translation-${randomUUID()}`);
for (const key of ['DATABASE_URL', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'test' });
const original = 'You can destroy 1 card; draw 2 cards.';
const translated = 'Puedes destruir 1 carta; roba 2 cartas.';
const pending: ManifestCard = {
  id: 900000001,
  cid: 999998,
  englishName: 'Test Dragon',
  englishEffects: [original],
  printings: [{ code: 'TEST-EN001', rarity: 'Ultra Rare' }],
  imageSource: 'https://images.ygoprodeck.com/images/cards/900000001.jpg',
  type: 'Effect Monster',
  attribute: 'DARK',
  atk: 1000,
  def: 1000,
  level: 4,
  link: null,
};

test('Card fallback: official first, verified English retained, numerical integrity and reusable images', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await closeDb();
  });
  let official = true,
    badNumbers = false,
    wrongIdentity = false,
    translations = 0,
    images = 0;
  const jpeg = await sharp({
    create: { width: 400, height: 580, channels: 3, background: '#263948' },
  })
    .jpeg()
    .toBuffer();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('card_search.action'))
      return new Response(
        official
          ? '<title>Dragón de prueba | Carta</title>Texto de la Carta<div class="text_linebreak">Puedes destruir 1 carta; roba 2 cartas.</div>'
          : '<title>Unavailable | Card</title>',
      );
    if (url.startsWith('https://db.ygoprodeck.com/'))
      return Response.json({
        data: [{ id: wrongIdentity ? 1 : pending.id, name: pending.englishName, desc: original }],
      });
    if (url.startsWith('https://api.mymemory.translated.net/')) {
      translations++;
      return Response.json({
        responseStatus: 200,
        responseData: { translatedText: badNumbers ? 'Puedes destruir 5 cartas.' : translated },
      });
    }
    if (url === pending.imageSource) {
      images++;
      return new Response(jpeg);
    }
    throw Error('Unexpected network call');
  };
  const spanish = await spanishOrTranslatedCard(pending);
  assert.equal(spanish.text_origin, 'official');
  assert.equal(spanish.name, 'Dragón de prueba');
  assert.equal(translations, 0, 'Official Spanish never consumes translator quota');
  official = false;
  let reserved = 0;
  const fallback = await withTranslationBudget(
    async (chars) => {
      reserved += chars;
    },
    () => spanishOrTranslatedCard(pending),
  );
  assert.equal(reserved, original.length);
  assert.equal(fallback.text_origin, 'translated');
  assert.deepEqual(fallback.englishEffects, [original]);
  assert.deepEqual(fallback.effects, [translated]);
  assert.match(fallback.source, /request_locale=en/);
  const missingCid = await spanishOrTranslatedCard({
    ...pending,
    cid: null,
    englishEffects: undefined,
  });
  assert.deepEqual(missingCid.englishEffects, [original]);
  wrongIdentity = true;
  await assert.rejects(
    spanishOrTranslatedCard({ ...pending, cid: null, englishEffects: undefined }),
    /verificable/,
  );
  wrongIdentity = false;
  badNumbers = true;
  await assert.rejects(spanishOrTranslatedCard(pending), /no coincide/);
  badNumbers = false;
  await assert.rejects(
    withTranslationBudget(
      async () => {
        throw Error('Quota');
      },
      () => spanishOrTranslatedCard(pending),
    ),
    /Quota/,
  );
  const saved = await cacheYgoCard(pending);
  assert.equal(saved.text_origin, 'translated');
  assert.deepEqual(saved.englishEffects, [original]);
  const before = translations;
  await cacheYgoCard(pending);
  assert.equal(
    translations,
    before,
    'Cached card translation never repeats on visits or reimports',
  );
  assert.equal(images, 1);
  const reviewed = authored['21522601'];
  const countBefore = translations;
  const authoredResult = await withTranslationBudget(
    async () => {
      throw Error('A saved translation should not use the translator');
    },
    () =>
      spanishOrTranslatedCard({
        ...pending,
        id: 21522601,
        cid: null,
        englishName: reviewed.name,
        englishEffects: [reviewed.english],
      }),
  );
  assert.equal(authoredResult.translation_method, 'sergod');
  assert.deepEqual(authoredResult.effects, reviewed.effects);
  assert.equal(translations, countBefore);
  await assert.rejects(
    spanishOrTranslatedCard({
      ...pending,
      id: 21522601,
      cid: null,
      englishName: reviewed.name,
      englishEffects: [reviewed.english + ' A new condition.'],
    }),
    /no coincide/,
  );
  assert.equal(
    (await (await getDb()).query('SELECT count(*) AS n FROM ygo_card_cache')).rows[0].n,
    1,
  );
});
