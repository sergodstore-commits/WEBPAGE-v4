import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

Object.assign(process.env, {
  LOCAL_DATA_DIR: path.resolve('.data', `test-instagram-fb-${randomUUID()}`),
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  INSTAGRAM_APP_ID: 'fb-app',
  INSTAGRAM_APP_SECRET: 'fb-private',
  INSTAGRAM_LOGIN_MODE: 'facebook',
  INSTAGRAM_FACEBOOK_PAGE_ID: '123',
  INTEGRATIONS_ENCRYPTION_KEY: '56'.repeat(32),
});
for (const name of ['DATABASE_URL', 'VERCEL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  delete process.env[name];

test('Instagram mediante Facebook: página propia, OAuth, persistencia y rechazo de cambios', async (t) => {
  const ig = await import('../lib/server/instagram');
  const { getDb, closeDb } = await import('../lib/server/db');
  const { openIntegration } = await import('../lib/server/integration-crypto');
  const db = await getDb(),
    admin = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,'test','Admin','admin',true)",
    [admin, `${admin}@example.test`],
  );
  const original = globalThis.fetch;
  let pagePresent = true,
    linked = '42',
    apiCalls = 0;
  globalThis.fetch = async (input, init) => {
    apiCalls++;
    const u = new URL(String(input));
    assert.equal(u.host, 'graph.facebook.com');
    assert.ok(!u.searchParams.has('access_token'));
    assert.ok(!u.searchParams.has('client_secret'));
    if (u.pathname.endsWith('/oauth/access_token')) {
      assert.equal(init?.method, 'POST');
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('client_secret'), 'fb-private');
      return Response.json({
        access_token: body.has('fb_exchange_token') ? 'fb-long-private' : 'fb-short',
        expires_in: 5184000,
      });
    }
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fb-long-private');
    if (u.pathname.endsWith('/me/accounts')) {
      throw Error('Do not depend on the incomplete business page listing');
    }
    if (u.pathname.endsWith('/123'))
      return !pagePresent
        ? new Response(null, { status: 403 })
        : Response.json({
            id: '123',
            ...(linked ? { instagram_business_account: { id: linked } } : {}),
          });
    if (u.pathname.endsWith('/42')) return Response.json({ id: '42', username: 'sergod_test' });
    if (u.pathname.endsWith('/42/media'))
      return Response.json({
        data: [
          {
            id: '111',
            caption: '#SergodWeb noticia',
            media_type: 'IMAGE',
            media_product_type: 'FEED',
            timestamp: '2026-10-01T19:00:00+0000',
            permalink: 'https://www.instagram.com/p/TEST/',
          },
        ],
      });
    throw Error(`Unexpected resource ${u.pathname}`);
  };
  t.after(async () => {
    globalThis.fetch = original;
    await closeDb();
  });
  async function authorization() {
    const s = await ig.startInstagram(admin),
      u = new URL(s.url),
      state = u.searchParams.get('state')!;
    assert.equal(u.hostname, 'www.facebook.com');
    assert.equal(
      u.searchParams.get('scope'),
      'instagram_basic,pages_show_list,pages_read_engagement',
    );
    assert.ok(!s.url.includes('fb-private'));
    return new Request(`http://localhost:3000/callback?code=code&state=${state}`, {
      headers: { cookie: `sergod_instagram_state=${state}` },
    });
  }
  const r = await authorization();
  await ig.finishInstagram(admin, r);
  await assert.rejects(() => ig.finishInstagram(admin, r), /ya se utilizó/);
  const row = (await db.query('SELECT * FROM instagram_connection')).rows[0];
  assert.ok(!row.credentials.includes('fb-long-private'));
  assert.equal(openIntegration<any>(row.credentials).page_id, '123');
  assert.equal(row.user_id, '42');
  assert.equal((await ig.instagramStatus()).login_mode, 'facebook');
  await db.query(
    "UPDATE instagram_connection SET expires_at=now()+interval '2 days',refreshed_at=now()-interval '2 days'",
  );
  assert.equal((await ig.reviewInstagram(admin)).candidates.length, 1); // Never calls Instagram token refresh.
  await closeDb();
  const reopened = await getDb();
  assert.equal((await ig.reviewInstagram(admin)).candidates.length, 1);
  pagePresent = false;
  await assert.rejects(() => ig.reviewInstagram(admin), /consulta/);
  await assert.rejects(() => ig.finishInstagram(admin, authorizationRequestDummy()), /navegador/);
  pagePresent = true;
  linked = '';
  await assert.rejects(async () => ig.finishInstagram(admin, await authorization()), /Vincula/);
  assert.equal(
    (await reopened.query('SELECT user_id FROM instagram_connection')).rows[0].user_id,
    '42',
  );
  linked = '99';
  await assert.rejects(() => ig.reviewInstagram(admin), /Cambió la cuenta/);
  linked = '42';
  process.env.INSTAGRAM_FACEBOOK_PAGE_ID = '456';
  const before = apiCalls;
  await assert.rejects(() => ig.reviewInstagram(admin), /configuración/);
  assert.equal(apiCalls, before);
  process.env.INSTAGRAM_FACEBOOK_PAGE_ID = '123';
  const pending = await authorization();
  process.env.INSTAGRAM_LOGIN_MODE = 'instagram';
  await assert.rejects(() => ig.finishInstagram(admin, pending), /venció/);
});
function authorizationRequestDummy() {
  return new Request('http://localhost:3000/callback?state=bad');
}
