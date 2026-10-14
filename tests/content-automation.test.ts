import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { latestNews } from '../lib/news-retention';
import type { WebNewsItem, WebNewsCandidate } from '../lib/web-news';
import {
  authorizedContentCron,
  claimContentDay,
  contentDay,
  reserveDailyTranslation,
  runDailyContent,
  splitTranslationBlocks,
  mylNewsGroups,
} from '../lib/server/content-automation';
import { getDb, closeDb } from '../lib/server/db';
import { cleanupRetiredCovers, ownedCoverKey, rotateWebNews } from '../lib/server/news-cleanup';
import { getWebNews, publicWebArticle } from '../lib/server/web-news';
import { NEWS_DISCOVERY_POLICY_VERSION } from '../lib/server/news-editorial';
import { getBanlist, publishBanlistDraft } from '../lib/server/banlist';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-content-auto-${randomUUID()}`);
for (const key of ['DATABASE_URL', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  delete process.env[key];
Object.assign(process.env, { NODE_ENV: 'test' });

const article = (
  id: number,
  myl = false,
): WebNewsItem & { category: NonNullable<WebNewsItem['category']> } => ({
  id: `${myl ? 'myl' : 'ygo'}-${id}`,
  title: `Noticia ${id}`,
  summary: 'Contenido publicado completo',
  url: myl ? `https://blog.myl.cl/noticia-${id}/` : `https://ygorganization.com/noticia-${id}`,
  boards: [myl ? (id % 2 ? 'myl-first-era' : 'myl-first-block') : 'yugioh'],
  published_on: `2026-09-${String(id).padStart(2, '0')}`,
  visible: true,
  category: 'reveals',
});
const key = (id: number) => `${String(id).padStart(8, '0')}-0000-0000-0000-000000000000.webp`;
const asset = (id: number) =>
  `https://storage.example.test/storage/v1/object/public/product-images/${key(id)}`;

test('Daily content: retention, safe cleanup, leases, publication and recovery', async (t) => {
  const db = await getDb();
  t.after(closeDb);
  await t.test('cron authorization fails closed, including preview deployments', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('../app/api/admin/news/automation/retry/route');
    const unauthorized = await POST(
      new Request('https://example.test/api/admin/news/automation/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    assert.equal(unauthorized.status, 401, 'Recovery cannot be triggered without an admin session');
    assert.equal(authorizedContentCron(new Request('https://example.test')), false);
    process.env.CRON_SECRET = 'test-only-secret';
    const request = new Request('https://example.test', {
      headers: { authorization: 'Bearer test-only-secret' },
    });
    assert.equal(authorizedContentCron(request), true);
    assert.equal(
      authorizedContentCron(
        new Request('https://example.test', { headers: { authorization: 'Bearer wrong' } }),
      ),
      false,
    );
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    assert.equal(authorizedContentCron(request), false);
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.CRON_SECRET;
  });
  await t.test(
    '20 Yu-Gi-Oh and 10 MyL by release date; MyL formats combined; long blocks lose no text',
    () => {
      const items = Array.from({ length: 23 }, (_, i) => article(i + 1));
      const myl = Array.from({ length: 13 }, (_, i) => article(i + 1, true));
      const result = latestNews([...items.reverse(), ...myl]);
      assert.equal(result.length, 30);
      assert.equal(result.filter((i) => i.boards?.includes('yugioh')).length, 20);
      assert.equal(result[0].published_on, '2026-09-23');
      assert.ok(result.every((i) => i.published_on >= '2026-09-04'));
      const text = 'A line with important effects.\n'.repeat(100);
      const blocks = splitTranslationBlocks([{ kind: 'paragraph', text, original_text: text }]);
      assert.equal(blocks.map((b) => b.original_text).join(''), text);
      assert.ok(blocks.every((b) => b.text.length <= 900));
      const groups = mylNewsGroups([
        { id: 'block-new', candidate: { boards: ['myl-first-block'] } },
        { id: 'era', candidate: { boards: ['myl-first-era'] } },
        { id: 'both', candidate: { boards: ['myl-first-era', 'myl-first-block'] } },
        { id: 'block-old', candidate: { boards: ['myl-first-block'] } },
      ]);
      assert.deepEqual(
        groups.map((group) => group.map((job) => job.id)),
        [
          ['era', 'both'],
          ['block-new', 'block-old'],
        ],
      );
      assert.equal(groups.flat().length, 4, 'Both-format articles are processed only once');
    },
  );
  await t.test(
    'exclusive covers removed; card galleries, shared/library files and commercial data retained',
    async () => {
      const items = [
        ...Array.from({ length: 22 }, (_, i) => article(i + 1)),
        ...Array.from({ length: 11 }, (_, i) => article(i + 1, true)),
      ];
      items[0].image = asset(1);
      items[0].category = 'releases';
      items[0].source_image = 'https://cdn.ygorganization.com/2026/10/news-cover.png';
      items[0].media = [
        {
          name: 'Carta conservada',
          source: 'https://cdn.ygorganization.com/2026/10/card.png',
          image: asset(2),
          bytes: 100,
        },
      ];
      items[0].content_blocks = [
        { kind: 'image', text: 'Carta conservada', source: items[0].media![0].source },
        { kind: 'paragraph', text: 'Efecto de la carta que permanece.' },
      ];
      items[1].image = asset(2); // Also used by the retired card gallery.
      items[22].image = asset(3); // Existing protected library scope.
      const cache = Object.fromEntries(
        [1, 2, 3].map((id) => [
          String(id),
          {
            image: asset(id),
            image_bytes: 100,
            landscape: true,
            ...(id === 3 ? { scope: 'myl-library' } : {}),
          },
        ]),
      );
      const commercial = (await db.query('SELECT count(*) AS n FROM products')).rows[0].n;
      await db.query(
        "UPDATE settings SET data=jsonb_set(jsonb_set(data,'{web_news}',$1::jsonb,true),'{web_news_media_cache}',$2::jsonb,true) WHERE id=1",
        [JSON.stringify(items), JSON.stringify(cache)],
      );
      assert.equal(await rotateWebNews(), 3);
      assert.equal((await getWebNews(true)).length, 30);
      assert.equal((await db.query('SELECT count(*) AS n FROM news_card_archives')).rows[0].n, 3);
      assert.match(
        JSON.stringify((await db.query('SELECT data FROM news_card_archives')).rows[0].data),
        /Efecto de la carta/,
      );
      process.env.SUPABASE_URL = 'https://storage.example.test';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
      const originalFetch = globalThis.fetch;
      let fails = true,
        deletions = 0;
      globalThis.fetch = async (input, options) => {
        assert.equal(
          String(input),
          `https://storage.example.test/storage/v1/object/product-images/${key(1)}`,
        );
        assert.equal(options?.method, 'DELETE');
        deletions++;
        return new Response(null, { status: fails ? 503 : 204 });
      };
      try {
        assert.equal(
          await cleanupRetiredCovers(),
          0,
          'A failed object deletion does not free quota',
        );
        fails = false;
        assert.equal(await cleanupRetiredCovers(), 100);
        assert.equal(deletions, 2, 'Card and library objects never reach DELETE');
        const saved = (
          await db.query("SELECT data->'web_news_media_cache' AS cache FROM settings WHERE id=1")
        ).rows[0].cache;
        assert.equal(saved['1'], undefined);
        assert.equal(saved['2'].image, asset(2));
        assert.equal(saved['3'].image, asset(3));
      } finally {
        globalThis.fetch = originalFetch;
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      }
      assert.equal((await db.query('SELECT count(*) AS n FROM products')).rows[0].n, commercial);
      assert.equal(ownedCoverKey(`/api/media/../${key(1)}`), null);
      assert.equal(ownedCoverKey('https://evil.test/' + key(1)), null);
    },
  );
  await t.test(
    'daily leases exclude overlap, survive a crash and preserve translation quota',
    async () => {
      assert.equal(await claimContentDay('2026-01-01', 'first'), true);
      assert.equal(await claimContentDay('2026-01-01', 'second'), false);
      assert.equal(
        await claimContentDay('2026-01-02', 'next-day'),
        false,
        'Overlap blocked across Chile midnight',
      );
      await reserveDailyTranslation('2026-01-01', 'first', 4400);
      await assert.rejects(reserveDailyTranslation('2026-01-01', 'first', 101), /próxima/);
      await db.query("UPDATE content_daily_runs SET lease_until=now()-interval '1 second'");
      assert.equal(await claimContentDay('2026-01-01', 'recovery'), true);
      await assert.rejects(reserveDailyTranslation('2026-01-01', 'first', 1), /próxima/);
      await reserveDailyTranslation('2026-01-01', 'recovery', 100);
      assert.equal(
        (
          await db.query('SELECT translation_chars FROM content_daily_runs WHERE day=$1', [
            '2026-01-01',
          ])
        ).rows[0].translation_chars,
        4500,
      );
      await db.query(
        "UPDATE content_daily_runs SET status='partial',finished_at=now(),lease_until=now()-interval '1 second'",
      );
      assert.equal(
        await claimContentDay('2026-01-01', 'duplicate'),
        false,
        'Scheduled duplicates still skip',
      );
      assert.equal(await claimContentDay('2026-01-01', 'explicit-retry', true), true);
      await assert.rejects(
        reserveDailyTranslation('2026-01-01', 'explicit-retry', 1),
        /próxima/,
        'Recovery never resets the daily translation budget',
      );
      assert.equal(await claimContentDay('2026-01-01', 'overlap', true), false);
      await db.query(
        "UPDATE content_daily_runs SET status='complete',finished_at=now(),lease_until=now()-interval '1 second'",
      );
      assert.equal(await claimContentDay('2026-01-01', 'completed-retry', true), false);
      await db.query(
        "UPDATE content_daily_runs SET status='partial',started_at='2026-01-01T04:59:00Z',finished_at='2026-01-01T05:00:00Z',lease_until=now()-interval '1 second' WHERE day='2026-01-01'",
      );
      assert.equal(
        await claimContentDay('2026-01-01', 'morning-cron', false, true),
        true,
        'An early recovery does not consume the scheduled morning slot',
      );
      assert.equal(await claimContentDay('2026-01-01', 'overlapping-cron', false, true), false);
      assert.equal(
        (await db.query("SELECT translation_chars FROM content_daily_runs WHERE day='2026-01-01'"))
          .rows[0].translation_chars,
        4500,
        'The scheduled continuation preserves the free daily quota',
      );
      await db.query(
        "UPDATE content_daily_runs SET status='partial',finished_at=now(),lease_until=now()-interval '1 second'",
      );
      assert.equal(
        await claimContentDay('2026-01-01', 'duplicate-cron', false, true),
        false,
        'A second scheduled request cannot re-run the morning slot',
      );
      await db.query(
        "UPDATE content_daily_runs SET status='complete',started_at='2026-01-01T04:59:00Z',finished_at='2026-01-01T05:00:00Z' WHERE day='2026-01-01'",
      );
      assert.equal(
        await claimContentDay('2026-01-01', 'morning-after-early-complete', false, true),
        true,
        'Even an early completed check must not hide news published later that morning',
      );
      await db.query('DELETE FROM content_daily_runs');
    },
  );
  await t.test(
    'a staged banlist never replaces the public list before its cards finish',
    async () => {
      const state = {
        checked_at: new Date().toISOString(),
        current: {
          effective_on: '2026-01-01',
          cards: [{ cid: 999998, name: 'Prueba', copies: 0 }],
        },
        upcoming: null,
      };
      await db.query(
        "UPDATE settings SET data=jsonb_set(jsonb_set(data,'{ygo_banlist}',$1::jsonb,true),'{ygo_banlist_draft}',$2::jsonb,true) WHERE id=1",
        [
          JSON.stringify(state),
          JSON.stringify({ ...state, current: { ...state.current, effective_on: '2026-02-01' } }),
        ],
      );
      await assert.rejects(publishBanlistDraft(), /preparando/);
      assert.equal((await getBanlist())!.current.effective_on, '2026-01-01');
    },
  );
  await t.test(
    'MyL auto-publishes complete local content while a Yu-Gi-Oh! source fails; duplicate daily calls skip',
    async () => {
      await db.query(
        "UPDATE settings SET data=jsonb_set(data,'{web_news}','[]'::jsonb,true)-'ygo_banlist_draft'-'myl_banlist_draft' WHERE id=1",
      );
      await db.query('DELETE FROM content_news_jobs');
      const candidate: WebNewsCandidate = {
        ...article(13, true),
        id: 'auto-myl',
        url: 'https://blog.myl.cl/nuevo-toolkit-primera-era/',
        title: 'Nuevo toolkit Primera Era',
        source_image: 'https://blog.myl.cl/wp-content/uploads/2026/10/cover.png',
      };
      const discover = async () => {
        const found = {
          checked_at: new Date().toISOString(),
          policy_version: NEWS_DISCOVERY_POLICY_VERSION,
          items: [candidate],
        };
        await db.query(
          "UPDATE settings SET data=jsonb_set(data,'{myl_news_discovery}',$1::jsonb,true) WHERE id=1",
          [JSON.stringify(found)],
        );
        return found;
      };
      const original = globalThis.fetch;
      const image = await sharp({
        create: { width: 400, height: 600, channels: 3, background: '#123456' },
      })
        .png()
        .toBuffer();
      const card = 'https://blog.myl.cl/wp-content/uploads/2026/10/card.png';
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes('/wp-json/'))
          return Response.json([
            {
              link: candidate.url,
              content: {
                rendered: `<h2>Contenido del toolkit</h2><p>Información completa en español: esta carta incluye un efecto.</p><img src="${card}" alt="Carta del toolkit"><p>Detalles finales imprescindibles.</p>`,
              },
            },
          ]);
        if (url.includes('/wp-content/')) return new Response(image);
        throw Error('Unexpected network call');
      };
      try {
        const empty = async () => ({ items: [] });
        const result = await runDailyContent(
          {
            discover: {
              myl: discover,
              tcg: async () => {
                throw Error('offline');
              },
              ygorganization: empty,
            },
            ygoBanlist: async () => {},
            mylBanlist: async () => {},
          },
          20_000,
        );
        assert.equal(result.skipped, false);
        assert.equal('published' in result && result.published, 1);
        assert.equal((await getWebNews(true))[0].visible, true);
        assert.match((await getWebNews(true))[0].body!, /Detalles finales/);
        assert.ok((await getWebNews(true))[0].media?.every((m) => m.image?.endsWith('.webp')));
        assert.equal((await runDailyContent()).skipped, true);
        assert.equal(
          (await db.query('SELECT status FROM content_daily_runs WHERE day=$1', [contentDay()]))
            .rows[0].status,
          'partial',
        );
        // Operator recovery adopts only a complete, verified source draft, without another image download.
        const prepared = (await getWebNews(true))[0];
        await db.query(
          "UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1",
          [JSON.stringify([{ ...prepared, visible: false }])],
        );
        await db.query(
          "UPDATE content_news_jobs SET phase='existing',provider='existing' WHERE id=$1",
          [candidate.id],
        );
        const resumed = await runDailyContent(
          {
            discover: { myl: discover, tcg: empty, ygorganization: empty },
            ygoBanlist: async () => {},
            mylBanlist: async () => {},
          },
          20_000,
          true,
        );
        assert.equal('published' in resumed && resumed.published, 1);
        const published = (await getWebNews(true))[0];
        assert.equal(published.visible, true);
        assert.deepEqual(published.media, prepared.media);
        assert.equal(published.body, prepared.body);
        assert.equal(
          (await runDailyContent({}, 20_000, true)).skipped,
          true,
          'A completed day is not rerun',
        );
        await db.query('DELETE FROM content_daily_runs'); // A later day still respects retired jobs.
        await db.query(
          "UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1",
          [JSON.stringify([{ ...published, visible: false }])],
        );
        await db.query("UPDATE content_news_jobs SET phase='retired' WHERE id=$1", [candidate.id]);
        const retired = await runDailyContent(
          {
            discover: { myl: discover, tcg: empty, ygorganization: empty },
            ygoBanlist: async () => {},
            mylBanlist: async () => {},
          },
          20_000,
          true,
        );
        assert.equal('published' in retired && retired.published, 0);
        assert.equal(
          (await getWebNews(true))[0].visible,
          false,
          'Retired articles are never restored by recovery',
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'English articles resume translation tomorrow even after they disappear from discovery',
    async () => {
      await db.query('DELETE FROM content_daily_runs');
      await db.query('DELETE FROM content_news_jobs');
      await db.query(
        "UPDATE settings SET data=jsonb_set(data,'{web_news}','[]'::jsonb,true)-'ygo_banlist_draft' WHERE id=1",
      );
      const candidate: WebNewsCandidate = {
        ...article(13),
        id: 'auto-long-ygo',
        url: 'https://ygorganization.com/long-tcg-reveal',
        title: '[TCG] New card release revealed',
        source_image: '',
      };
      const content = 'Summon this card once per turn. '.repeat(190);
      let discoveries = 0;
      const discover = async () => {
        const result = {
          checked_at: new Date().toISOString(),
          policy_version: NEWS_DISCOVERY_POLICY_VERSION,
          items: discoveries++ ? [] : [candidate],
        };
        await db.query(
          "UPDATE settings SET data=jsonb_set(data,'{ygorganization_news_discovery}',$1::jsonb,true) WHERE id=1",
          [JSON.stringify(result)],
        );
        return result;
      };
      const empty = async () => ({ items: [] });
      const original = globalThis.fetch;
      let translations = 0;
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url === candidate.url)
          return new Response(
            `<script type="application/ld+json">${JSON.stringify({ '@type': 'Article', headline: candidate.title, datePublished: '2026-09-13' })}</script><div class="post-content prose prose-lg"><p>${content}</p></div>`,
          );
        if (url.startsWith('https://api.mymemory.translated.net/get')) {
          translations++;
          return Response.json({
            responseStatus: 200,
            responseData: {
              translatedText: new URL(url).searchParams.get('q')!.replaceAll('Summon', 'Invoca'),
            },
          });
        }
        throw Error('Unexpected network call');
      };
      try {
        const options = {
          discover: { myl: empty, tcg: empty, ygorganization: discover },
          ygoBanlist: async () => {},
          mylBanlist: async () => {},
        };
        const first = await runDailyContent(options, 30_000);
        assert.equal('published' in first && first.published, 1);
        const draft = (await getWebNews(true))[0];
        assert.equal(draft.visible, true);
        assert.equal(draft.translation_pending, true);
        const sourceVersion = await publicWebArticle(draft.id);
        assert.equal(sourceVersion.title, candidate.title);
        assert.equal(sourceVersion.body, content.trim());
        assert.equal(sourceVersion.content_language, 'en');
        assert.ok(!sourceVersion.body?.includes('Invoca'));
        assert.equal(sourceVersion.original_content_blocks, undefined);
        assert.equal((await getWebNews()).find((i) => i.id === draft.id)?.title, candidate.title);
        assert.equal(
          (await db.query('SELECT phase FROM content_news_jobs')).rows[0].phase,
          'translating',
        );
        assert.ok(draft.content_blocks?.some((b) => !b.original_text));
        assert.ok(draft.content_blocks?.some((b) => b.original_text));
        const used = (await db.query('SELECT translation_chars FROM content_daily_runs')).rows[0]
          .translation_chars;
        assert.ok(used <= 4500 && used > 3000);
        const before = translations;
        await db.query('DELETE FROM content_daily_runs'); // Simulate tomorrow's fresh daily budget.
        const second = await runDailyContent(options, 30_000);
        assert.equal(
          'published' in second && second.published,
          0,
          'Translation updates the same published article',
        );
        assert.equal((await getWebNews(true))[0].visible, true);
        assert.equal((await getWebNews(true))[0].translation_pending, false);
        assert.equal((await getWebNews(true)).length, 1);
        assert.equal((await publicWebArticle(draft.id)).content_language, 'es');
        assert.match((await publicWebArticle(draft.id)).body!, /Invoca/);
        assert.ok(!(await getWebNews(true))[0].content_blocks?.some((b) => b.original_text));
        assert.ok(translations > before);
        assert.equal(
          (await db.query('SELECT header_done FROM content_news_jobs')).rows[0].header_done,
          true,
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
  await t.test(
    'A failed free translator still publishes multiple complete original galleries',
    async () => {
      await db.query('DELETE FROM content_daily_runs');
      await db.query('DELETE FROM content_news_jobs');
      await db.query(
        "UPDATE settings SET data=jsonb_set(data,'{web_news}','[]'::jsonb,true) WHERE id=1",
      );
      const candidates: WebNewsCandidate[] = [1, 2].map((i) => ({
        ...article(13),
        id: 'original-fallback-' + i,
        url: 'https://ygorganization.com/original-fallback-' + i,
        title: '[TCG] New card ' + i + ' revealed',
        summary: 'Original English card information.',
        source_image: '',
      }));
      const empty = async () => ({ items: [] });
      const image = await sharp({
        create: { width: 400, height: 600, channels: 3, background: '#456789' },
      })
        .png()
        .toBuffer();
      const original = globalThis.fetch;
      let translationCalls = 0,
        imageCalls = 0;
      globalThis.fetch = async (input) => {
        const url = String(input);
        const candidate = candidates.find((c) => c.url === url);
        if (candidate)
          return new Response(
            '<script type="application/ld+json">' +
              JSON.stringify({
                '@type': 'Article',
                headline: candidate.title,
                datePublished: '2026-09-13',
              }) +
              '</script><div class="post-content prose prose-lg"><p>Draw one card. This effect can only be used once per turn.</p><img src="https://cdn.ygorganization.com/2026/10/' +
              candidate.id +
              '.png" alt="Original card"></div>',
          );
        if (url.startsWith('https://cdn.ygorganization.com/')) {
          imageCalls++;
          return new Response(image);
        }
        if (url.startsWith('https://api.mymemory.translated.net/get')) {
          translationCalls++;
          return new Response(null, { status: 503 });
        }
        throw Error('Unexpected network call');
      };
      try {
        const result = await runDailyContent(
          {
            discover: {
              myl: empty,
              tcg: empty,
              ygorganization: async () => ({ items: candidates }),
            },
            ygoBanlist: async () => {},
            mylBanlist: async () => {},
          },
          30_000,
        );
        assert.equal('published' in result && result.published, 2);
        assert.equal(imageCalls, 2, 'Images are prepared even after the translator fails');
        assert.equal(
          translationCalls,
          1,
          'The failing translator is not hammered for every following job',
        );
        for (const candidate of candidates) {
          const item = await publicWebArticle(candidate.id);
          assert.equal(item.visible, true);
          assert.equal(item.translation_pending, true);
          assert.equal(item.title, candidate.title);
          assert.match(item.body!, /Draw one card/);
          assert.ok(item.media?.every((m) => m.image?.endsWith('.webp')));
          assert.ok(!item.content_blocks?.some((b) => b.original_text));
        }
        const stored = (await getWebNews(true))[0];
        const { saveWebNews } = await import('../lib/server/web-news');
        await assert.rejects(
          () => saveWebNews({ ...stored, original_content_blocks: undefined }, stored.id),
          /original completo/,
        );
        assert.equal(
          (await db.query("SELECT count(*) AS n FROM content_news_jobs WHERE phase='translating'"))
            .rows[0].n,
          2,
        );
      } finally {
        globalThis.fetch = original;
      }
    },
  );
});
