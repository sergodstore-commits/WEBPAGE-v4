import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { youtubeVideoId } from '../lib/youtube';
process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-youtube-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test' });
const id = 'SergodTes01';
test('YouTube: enlaces seguros, canal, guardado, lectura, publicación y archivo idempotente', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const y = await import('../lib/server/youtube');
  const db = await getDb();
  const realFetch = globalThis.fetch;
  let author = 'https://www.youtube.com/@SergodStore',
    offline = false,
    calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://www.youtube.com');
    assert.equal(url.pathname, '/oembed');
    if (offline) throw Error('Offline');
    return Response.json({
      title: 'Liga de prueba',
      author_url: author,
      thumbnail_url: 'https://i.ytimg.com/test.jpg',
    });
  };
  t.after(async () => {
    globalThis.fetch = realFetch;
    await closeDb();
  });
  for (const url of [
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/watch?v=${id}`,
    id,
  ])
    assert.equal(youtubeVideoId(url), id);
  for (const url of [
    'https://youtube.com.evil.test/watch?v=' + id,
    'http://www.youtube.com/watch?v=' + id,
    'https://www.youtube.com@evil.test/watch?v=' + id,
    'https://localhost/live/' + id,
    'https://youtu.be/' + id + '/extra',
  ])
    assert.equal(youtubeVideoId(url), null);
  const before = calls;
  await assert.rejects(() => y.reviewYouTube({ url: 'https://localhost/private' }));
  assert.equal(calls, before);
  author = 'https://www.youtube.com/@another';
  await assert.rejects(() => y.reviewYouTube({ url: id }), /no pertenece/);
  author = 'https://www.youtube.com/@SergodStore';
  const input = {
    video_id: id,
    title: 'Liga revisada',
    recorded_at: '2026-10-07T18:00:00Z',
    status: 'draft',
  };
  const saved = await y.saveYouTubeVideo(input);
  assert.equal((await y.publicYouTubeTournaments()).total, 0);
  await assert.rejects(
    () => y.saveYouTubeVideo({ ...input, tournament_id: randomUUID() }),
    /torneo/,
  );
  await y.saveYouTubeVideo({ ...input, status: 'published' }, saved.id);
  let media = await y.publicYouTubeTournaments();
  assert.equal(media.provider, 'youtube');
  assert.equal(media.videos[0].title, 'Liga revisada');
  await closeDb();
  assert.equal((await y.listYouTubeVideos())[0].id, saved.id);
  await assert.rejects(() => y.saveYouTubeVideo(input), /ya está guardada/);
  await y.saveYouTubeLive({
    enabled: true,
    video_id: 'https://youtu.be/' + id,
    stage: 'scheduled',
  });
  assert.equal((await y.publicYouTubeTournaments()).live?.stage, 'scheduled');
  await y.saveYouTubeLive({ enabled: true, video_id: id, stage: 'live', title: 'En vivo' });
  assert.equal((await y.publicYouTubeTournaments()).live?.video_id, id);
  await y.finishYouTubeLive({ recorded_at: input.recorded_at });
  await y.finishYouTubeLive({ recorded_at: input.recorded_at });
  media = await y.publicYouTubeTournaments();
  assert.equal(media.live, null);
  assert.equal(media.total, 1);
  offline = true;
  await y.saveYouTubeVideo({ ...input, status: 'withdrawn' }, saved.id);
  assert.equal((await y.publicYouTubeTournaments()).total, 0);
  await y.saveYouTubeLive({ enabled: false, video_id: id, title: 'Oculto' });
  assert.equal((await y.youtubeSettings()).enabled, false);
  await y.deleteYouTubeVideo(saved.id);
  assert.equal((await y.listYouTubeVideos()).length, 0);
  assert.equal(
    Number((await (await getDb()).query('SELECT count(*) AS n FROM twitch_videos')).rows[0].n),
    0,
  );
});
