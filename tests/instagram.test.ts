import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
Object.assign(process.env, {
  LOCAL_DATA_DIR: path.resolve('.data', `test-instagram-${randomUUID()}`),
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  INSTAGRAM_APP_ID: 'test-id',
  INSTAGRAM_APP_SECRET: 'test-secret',
  INTEGRATIONS_ENCRYPTION_KEY: '56'.repeat(32),
});
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

test('Instagram: selección propia, OAuth, archivo persistente, errores y permisos de importación', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db'),
    ig = await import('../lib/server/instagram'),
    storage = await import('../lib/server/news-storage');
  const { getPosts } = await import('../lib/server/content');
  const db = await getDb(),
    admin = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,'test','Admin','admin',true)",
    [admin, `${admin}@example.test`],
  );
  const realFetch = globalThis.fetch;
  const photo = {
    id: '111',
    caption: 'Nueva Liga\n#SergodWeb #Mitos',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    timestamp: '2026-10-01T19:00:00+0000',
    permalink: 'https://www.instagram.com/p/PHOTO/',
    media_url: 'https://a.cdninstagram.com/photo.jpg',
  };
  let feed: any[] = [
      photo,
      { ...photo, id: '112', caption: '#SergodWebExtra no corresponde' },
      { ...photo, id: '113', caption: '#sergodweb', media_product_type: 'STORY' },
      { ...photo, id: '114', caption: undefined },
    ],
    failed = false,
    rotation = 0,
    invalidIdentity = false,
    wrapped = false,
    calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const u = new URL(String(input));
    if (u.host === 'api.instagram.com') {
      assert.equal(init?.method, 'POST');
      assert.ok(String(init?.body).includes('test-secret'));
      return Response.json(
        wrapped
          ? { data: [{ access_token: 'short-private', user_id: '42' }] }
          : { access_token: 'short-private', user_id: '42' },
      );
    }
    if (u.pathname === '/access_token')
      return Response.json({ access_token: 'long-private', expires_in: 5184000 });
    if (u.pathname === '/refresh_access_token') {
      rotation++;
      return Response.json({ access_token: `long-private-${rotation}`, expires_in: 5184000 });
    }
    if (u.pathname.endsWith('/me'))
      return Response.json({ user_id: invalidIdentity ? '99' : '42', username: 'sergod_test' });
    if (u.pathname.endsWith('/media')) {
      assert.ok(u.pathname.includes('/42/'));
      assert.equal(u.searchParams.get('limit'), '25');
      assert.ok((init?.headers as any).Authorization.startsWith('Bearer long-private'));
      return failed
        ? new Response(null, { status: 503 })
        : Response.json({
            data: feed,
            paging: {
              cursors: { after: 'NEXT' },
              next: 'https://graph.instagram.com/next?access_token=private-do-not-follow',
            },
          });
    }
    if (u.pathname.endsWith('/111')) return Response.json(photo);
    if (u.pathname.endsWith('/9991'))
      return Response.json({
        id: '9991',
        media_type: 'VIDEO',
        thumbnail_url: 'https://a.fbcdn.net/reel.jpg',
      });
    if (u.pathname.endsWith('/9992')) return Response.json({ id: '9992', media_type: 'VIDEO' });
    if (u.pathname.endsWith('/9993'))
      return Response.json({
        id: '9993',
        media_type: 'IMAGE',
        media_url: 'https://evil.example/image.jpg',
      });
    if (u.hostname.endsWith('.cdninstagram.com')) {
      throw Error('La tienda no debe descargar medios de Instagram');
    }
    throw Error(`Unexpected provider resource ${u.hostname}${u.pathname}`);
  };
  t.after(async () => {
    globalThis.fetch = realFetch;
    await closeDb();
  });
  async function connect() {
    const s = await ig.startInstagram(admin),
      state = new URL(s.url).searchParams.get('state')!;
    const r = new Request(
      `http://localhost:3000/api/admin/integrations/instagram/callback?code=code&state=${state}`,
      { headers: { cookie: `sergod_instagram_state=${state}` } },
    );
    await ig.finishInstagram(admin, r);
    return { s, state, r };
  }
  await t.test('OAuth admin, cookie, estado de un uso y credenciales cifradas', async () => {
    const start = await ig.startInstagram(admin),
      u = new URL(start.url),
      state = u.searchParams.get('state');
    assert.equal(u.searchParams.get('scope'), 'instagram_business_basic');
    assert.ok(!start.url.includes('test-secret'));
    await assert.rejects(
      () =>
        ig.finishInstagram(
          admin,
          new Request(`http://localhost:3000/callback?state=${state}`, {
            headers: { cookie: 'sergod_instagram_state=wrong' },
          }),
        ),
      /navegador/,
    );
    const { r } = await connect();
    await assert.rejects(() => ig.finishInstagram(admin, r), /ya se utilizó/);
    const stored = (await db.query('SELECT credentials FROM instagram_connection')).rows[0];
    assert.ok(!stored.credentials.includes('long-private'));
    assert.equal((await ig.instagramStatus()).connected, true);
    assert.ok(!JSON.stringify(await ig.instagramStatus()).includes('private'));
  });
  let candidates: any[], saved: any;
  await t.test(
    'Todas las publicaciones de la cuenta, sin hashtag ni texto; paginación segura y sin publicación automática',
    async () => {
      assert.equal(ig.hasImportTag('#SergodWebExtra', 'SergodWeb'), false);
      assert.equal(ig.hasImportTag('#sergodweb', 'SergodWeb'), true);
      const r = await ig.reviewInstagram(admin);
      candidates = r.candidates;
      assert.equal(r.candidates.length, 3);
      assert.equal(r.candidates[0].caption, photo.caption);
      assert.equal(r.candidates[1].media_id, '112');
      assert.equal(r.candidates[2].caption, '');
      assert.equal(r.next_cursor, 'NEXT');
      assert.equal((await ig.publicNews()).length, 0);
      await assert.rejects(
        () =>
          ig.importInstagram(randomUUID(), {
            preview_id: candidates[0].preview_id,
            status: 'published',
          }),
        /venció/,
      );
      await assert.rejects(
        () =>
          ig.importInstagram(admin, {
            preview_id: randomUUID(),
            status: 'published',
            assets: [{ url: 'http://localhost/private' }],
          }),
        /venció/,
      );
    },
  );
  await t.test(
    'Guardar solo metadatos sin descargar medios; API pública sin token y deduplicación',
    async () => {
      const beforeImport = calls;
      saved = await ig.importInstagram(admin, {
        preview_id: candidates[0].preview_id,
        status: 'published',
      });
      assert.equal(calls, beforeImport);
      assert.deepEqual(saved.assets, []);
      assert.equal(saved.permalink, photo.permalink);
      const before = calls,
        pub = await ig.publicNews();
      assert.equal(calls, before);
      assert.equal(pub.length, 1);
      assert.ok(!JSON.stringify(pub).includes('cdninstagram'));
      assert.ok(!JSON.stringify(pub).includes('credentials'));
      assert.equal((await getPosts(false, 'news'))[0].slug, `instagram-${saved.id}`);
      await assert.rejects(
        () =>
          ig.importInstagram(admin, { preview_id: candidates[0].preview_id, status: 'published' }),
        /venció/,
      );
      const reviewed = await ig.reviewInstagram(admin);
      assert.equal(reviewed.candidates.length, 3);
      await assert.rejects(
        () =>
          ig.importInstagram(admin, {
            preview_id: reviewed.candidates[0].preview_id,
            status: 'published',
          }),
        /ya está incorporada/,
      );
    },
  );
  await t.test('Miniatura externa: referencia, caché, renovación y noticia retirada', async () => {
    assert.equal((await ig.publicNews())[0].thumbnail, `/api/news/${saved.id}/thumbnail`);
    assert.equal(await ig.publicNewsThumbnail(saved.id), photo.media_url);
    const before = calls;
    assert.equal(await ig.publicNewsThumbnail(saved.id), photo.media_url);
    assert.equal(calls, before);
    await db.query(
      "UPDATE instagram_news SET thumbnail_checked_at=now()-interval '2 hours' WHERE id=$1",
      [saved.id],
    );
    assert.equal(await ig.publicNewsThumbnail(saved.id), photo.media_url);
    assert.ok(calls > before);
    await db.query("UPDATE instagram_news SET status='withdrawn' WHERE id=$1", [saved.id]);
    await assert.rejects(() => ig.publicNewsThumbnail(saved.id), /no disponible/);
    await db.query("UPDATE instagram_news SET status='published' WHERE id=$1", [saved.id]);
  });
  await t.test(
    'Portada de Reel y ausencia o URL externa insegura, sin descargar medios',
    async () => {
      for (const [media, expected] of [
        ['9991', 'https://a.fbcdn.net/reel.jpg'],
        ['9992', ''],
        ['9993', ''],
      ] as const) {
        const id = randomUUID();
        await db.query(
          "INSERT INTO instagram_news(id,media_id,user_id,username,caption,recorded_at,permalink,media_type,assets,import_hashtag,status) VALUES($1,$2,'42','sergod_test','',now(),'https://www.instagram.com/reel/TEST/','VIDEO','[]','', 'published')",
          [id, media],
        );
        try {
          if (expected) assert.equal(await ig.publicNewsThumbnail(id), expected);
          else {
            await assert.rejects(() => ig.publicNewsThumbnail(id), /no proporcionó/);
            const before = calls;
            await assert.rejects(() => ig.publicNewsThumbnail(id), /no proporcionó/);
            assert.equal(calls, before);
          }
        } finally {
          await db.query('DELETE FROM instagram_news WHERE id=$1', [id]);
        }
      }
    },
  );
  await t.test('Carrusel mixto guarda enlace y tipo sin copiar fotos ni MP4', async () => {
    feed = [
      {
        ...photo,
        id: '222',
        caption: 'Carrusel #SergodWeb',
        media_type: 'CAROUSEL_ALBUM',
        children: {
          data: [
            { id: '223', media_type: 'IMAGE', media_url: photo.media_url },
            {
              id: '224',
              media_type: 'VIDEO',
              media_url: 'https://a.cdninstagram.com/video.mp4',
              thumbnail_url: photo.media_url,
            },
          ],
        },
      },
    ];
    const r = await ig.reviewInstagram(admin),
      p = await ig.importInstagram(admin, {
        preview_id: r.candidates[0].preview_id,
        status: 'draft',
      });
    assert.deepEqual(p.assets, []);
    assert.equal(p.media_type, 'CAROUSEL_ALBUM');
    assert.equal(p.permalink, photo.permalink);
    assert.equal((await ig.publicNews()).length, 1);
    await ig.editInstagramNews(p.id, { status: 'published' });
    assert.equal((await ig.publicNews()).length, 2);
    await assert.rejects(
      () => ig.editInstagramNews(p.id, { status: 'published', tournament_id: randomUUID() }),
      /no existe/,
    );
  });
  await t.test(
    'Errores externos y enlaces peligrosos conservan publicaciones; refresh persiste antes del fallo',
    async () => {
      await db.query(
        "UPDATE instagram_connection SET expires_at=now()+interval '1 day',refreshed_at=now()-interval '2 days'",
      );
      failed = true;
      await assert.rejects(() => ig.reviewInstagram(admin), /consulta/);
      assert.equal(rotation, 1);
      assert.ok(
        new Date(
          (await db.query('SELECT expires_at FROM instagram_connection')).rows[0].expires_at,
        ).getTime() >
          Date.now() + 50 * 86400000,
      );
      assert.equal((await ig.publicNews()).length, 2);
      failed = false;
      assert.throws(
        () => storage.instagramCdn('https://cdninstagram.com.evil.example/x'),
        /almacenamiento/,
      );
      assert.throws(() => storage.instagramCdn('http://127.0.0.1/x'), /almacenamiento/);
      feed = [{ ...photo, id: '333', permalink: 'http://localhost/secret' }];
      await assert.rejects(() => ig.reviewInstagram(admin), /enlace/);
      assert.equal((await ig.publicNews()).length, 2);
    },
  );
  await t.test(
    'Hashtag, vista previa vencida y retirada; desconectar conserva archivo',
    async () => {
      feed = [{ ...photo, id: '444' }];
      let r = await ig.reviewInstagram(admin);
      await ig.saveInstagramSettings({ hashtag: '#OtroTag' });
      await assert.rejects(
        () =>
          ig.importInstagram(admin, {
            preview_id: r.candidates[0].preview_id,
            status: 'published',
          }),
        /venció/,
      );
      assert.equal((await ig.instagramStatus()).hashtag, 'OtroTag');
      await ig.saveInstagramSettings({ hashtag: 'SergodWeb' });
      r = await ig.reviewInstagram(admin);
      await db.query(
        "UPDATE instagram_previews SET expires_at=now()-interval '1 second' WHERE id=$1",
        [r.candidates[0].preview_id],
      );
      await assert.rejects(
        () =>
          ig.importInstagram(admin, {
            preview_id: r.candidates[0].preview_id,
            status: 'published',
          }),
        /venció/,
      );
      await ig.editInstagramNews(saved.id, { status: 'withdrawn' });
      assert.equal((await ig.publicNews()).length, 1);
      await ig.disconnectInstagram();
      assert.equal((await ig.instagramStatus()).connected, false);
      assert.equal((await ig.publicNews()).length, 1);
      await assert.rejects(() => ig.reviewInstagram(admin), /Conecta/);
      wrapped = true;
      await connect();
      invalidIdentity = true;
      await assert.rejects(() => ig.reviewInstagram(admin), /no corresponde/);
      invalidIdentity = false;
    },
  );
  await t.test(
    'Reabrir base conserva enlace y retiro; eliminar no afecta a Instagram',
    async () => {
      await closeDb();
      const again = await getDb();
      assert.equal((await ig.publicNews()).length, 1);
      assert.equal((await ig.listInstagramNews()).length, 2);
      const persisted = (await ig.listInstagramNews()).find((n: any) => n.id === saved.id);
      assert.equal(persisted.permalink, photo.permalink);
      assert.deepEqual(persisted.assets, []);
      await ig.deleteInstagramNews(saved.id);
      assert.equal((await ig.listInstagramNews()).length, 1);
      assert.equal((await again.query('SELECT count(*)::int n FROM instagram_news')).rows[0].n, 1);
    },
  );
});
