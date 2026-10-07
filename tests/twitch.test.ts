import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const directory = path.resolve('.data', `test-twitch-${randomUUID()}`);
process.env.LOCAL_DATA_DIR = directory;
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  TWITCH_CLIENT_ID: 'test-client',
  TWITCH_CLIENT_SECRET: 'test-secret',
  INTEGRATIONS_ENCRYPTION_KEY: '12'.repeat(32),
});

test('Twitch: OAuth, cifrado, importación selectiva, persistencia y desconexión', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const twitch = await import('../lib/server/twitch');
  const { savePost } = await import('../lib/server/content');
  const db = await getDb(),
    admin = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,'test','Admin','admin',true)",
    [admin, `${admin}@example.test`],
  );
  const realFetch = globalThis.fetch;
  let failed = false,
    online = true,
    rotation = 0,
    calls = 0;
  const remoteVideo = {
    id: '123456',
    title: 'Liga de prueba',
    created_at: '2026-10-01T20:00:00Z',
    thumbnail_url: 'https://static-cdn.jtvnw.net/test/%{width}x%{height}.jpg',
    user_id: '42',
  };
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    if (url.pathname === '/oauth2/token') {
      const refresh = String(init?.body).includes('refresh_token');
      if (refresh) rotation++;
      return Response.json({
        access_token: `private-access-${rotation}`,
        refresh_token: `private-refresh-${rotation}`,
        expires_in: 3600,
      });
    }
    if (url.pathname === '/oauth2/validate')
      return Response.json({ client_id: 'test-client', user_id: '42', login: 'sergod_test' });
    if (url.pathname === '/oauth2/revoke') return new Response(null, { status: 200 });
    if (failed) return new Response(null, { status: 503 });
    if (url.pathname === '/helix/streams')
      return Response.json({ data: online ? [{ title: 'Directo de prueba' }] : [] });
    if (url.pathname === '/helix/videos')
      return Response.json({
        data:
          url.searchParams.get('id') === '999'
            ? [{ ...remoteVideo, id: '999', user_id: 'different' }]
            : [remoteVideo],
        pagination: {},
      });
    throw Error('Unexpected external call');
  };
  t.after(async () => {
    globalThis.fetch = realFetch;
    await closeDb();
  });
  let connectedState = '';
  await t.test(
    'Nonce ligado al navegador y administrador, consumido una sola vez; tokens cifrados',
    async () => {
      const start = await twitch.startTwitch(admin);
      connectedState = new URL(start.url).searchParams.get('state')!;
      const request = (cookie: string) =>
        new Request(
          `http://localhost:3000/api/admin/integrations/twitch/callback?code=test&state=${connectedState}`,
          { headers: { cookie: `sergod_twitch_state=${cookie}` } },
        );
      await assert.rejects(() => twitch.finishTwitch(admin, request('wrong')), /navegador/);
      await assert.rejects(
        () => twitch.finishTwitch(randomUUID(), request(connectedState)),
        /venció/,
      );
      await twitch.finishTwitch(admin, request(connectedState));
      await assert.rejects(
        () => twitch.finishTwitch(admin, request(connectedState)),
        /ya se utilizó/,
      );
      const stored = (await db.query('SELECT credentials FROM twitch_connection')).rows[0]
        .credentials;
      assert.ok(!stored.includes('private-access'));
      assert.ok(!stored.includes('private-refresh'));
      const status = await twitch.twitchStatus();
      assert.equal(status.connected, true);
      assert.equal(status.channel, 'sergod_test');
      assert.ok(!JSON.stringify(status).includes('private-'));
    },
  );
  const data = {
    video_id: '123456',
    title: 'Liga guardada',
    recorded_at: '2026-10-01T20:00:00Z',
    status: 'published',
    custom_thumbnail: '',
    tournament_id: null,
  };
  let saved: any;
  await t.test(
    'Revisar es de solo lectura; importar verifica canal, evita duplicados y admite torneo sin imagen',
    async () => {
      const review = await twitch.reviewTwitch();
      assert.equal(review.videos.length, 1);
      assert.equal((await twitch.listTwitchVideos()).length, 0);
      assert.match(review.videos[0].twitch_thumbnail, /640x360/);
      await assert.rejects(
        () => twitch.saveTwitchVideo({ ...data, video_id: '999' }),
        /no pertenece/,
      );
      const tournament = await savePost({
        kind: 'tournament',
        title: 'Liga simple',
        event_at: '2030-10-01T20:00:00Z',
        status: 'published',
      });
      saved = await twitch.saveTwitchVideo({ ...data, tournament_id: tournament.id });
      await assert.rejects(() => twitch.saveTwitchVideo(data), /ya fue incorporada/);
      assert.equal((await twitch.reviewTwitch()).videos[0].imported, true);
      const count = calls;
      const publicData = await twitch.publicTournaments();
      assert.equal(calls, count);
      assert.equal(publicData.total, 1);
      assert.equal(publicData.live, null);
      assert.equal(publicData.videos[0].title, 'Liga guardada');
      await assert.rejects(() =>
        twitch.saveTwitchVideo(
          { ...data, custom_thumbnail: 'https://example.test/unregistered.jpg' },
          saved.id,
        ),
      );
    },
  );
  await t.test(
    'Directo comprueba canal activo; ocultar, retirada y errores conservan datos',
    async () => {
      online = false;
      await assert.rejects(() => twitch.saveLive({ enabled: true }), /no está transmitiendo/);
      online = true;
      await twitch.saveLive({ enabled: true, title: 'Liga en directo' });
      assert.equal((await twitch.publicTournaments()).live?.title, 'Liga en directo');
      failed = true;
      await assert.rejects(() => twitch.reviewTwitch(), /Twitch no pudo/);
      assert.equal((await twitch.publicTournaments()).total, 1);
      failed = false;
      await twitch.saveLive({ enabled: false });
      assert.equal((await twitch.publicTournaments()).live, null);
      await twitch.saveTwitchVideo({ ...data, status: 'withdrawn' }, saved.id);
      assert.equal((await twitch.publicTournaments()).total, 0);
      await twitch.saveTwitchVideo({ ...data, title: 'Corregida' }, saved.id);
      assert.equal((await twitch.publicTournaments()).videos[0].title, 'Corregida');
    },
  );
  await t.test('Refresh rotado se conserva incluso si la consulta siguiente falla', async () => {
    await db.query("UPDATE twitch_connection SET expires_at=now()-interval '1 minute'");
    failed = true;
    await assert.rejects(() => twitch.reviewTwitch());
    failed = false;
    assert.equal(rotation, 1);
    await twitch.reviewTwitch();
    assert.equal(rotation, 1);
  });
  await t.test('Recarga real de BD, desconexión sin borrar VOD y borrado explícito', async () => {
    await closeDb();
    const db2 = await getDb();
    assert.equal((await twitch.publicTournaments()).total, 1);
    // Losing the old encryption key must not prevent removing the local connection.
    const originalKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'b'.repeat(64);
    await twitch.disconnectTwitch();
    process.env.INTEGRATIONS_ENCRYPTION_KEY = originalKey;
    assert.equal((await twitch.twitchStatus()).connected, false);
    assert.equal((await twitch.publicTournaments()).total, 1);
    assert.equal((await db2.query('SELECT * FROM twitch_connection')).rows.length, 0);
    await twitch.deleteTwitchVideo(saved.id);
    assert.equal((await twitch.publicTournaments()).total, 0);
    assert.equal(twitch.twitchThumbnail('https://evil.example/image.jpg'), '');
  });
});
