import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getDb } from './db';
import { appUrl, boundedBytes, fail, hash, token, uuid } from './core';
import { integrationKeyReady, openIntegration, sealIntegration } from './integration-crypto';
import type { InstagramCandidate, NewsAsset, NewsItem } from '../news';

const callback = () => `${appUrl()}/api/admin/integrations/instagram/callback`;
const loginMode = () => {
  const mode = process.env.INSTAGRAM_LOGIN_MODE || 'instagram';
  if (mode !== 'instagram' && mode !== 'facebook')
    fail(503, 'La modalidad de Instagram no es válida.');
  return mode;
};
const facebookPage = () => {
  const id = process.env.INSTAGRAM_FACEBOOK_PAGE_ID || '';
  if (!/^\d{1,30}$/.test(id))
    fail(503, 'Configura el identificador de la página de Facebook de la tienda.');
  return id;
};
const configured = () =>
  Boolean(
    process.env.INSTAGRAM_APP_ID &&
    process.env.INSTAGRAM_APP_SECRET &&
    integrationKeyReady() &&
    (loginMode() !== 'facebook' || /^\d{1,30}$/.test(process.env.INSTAGRAM_FACEBOOK_PAGE_ID || '')),
  );
function config() {
  if (loginMode() === 'facebook') facebookPage();
  if (!configured())
    fail(
      503,
      'Configura INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET y la clave de cifrado para conectar Instagram.',
    );
  return {
    client_id: process.env.INSTAGRAM_APP_ID!,
    client_secret: process.env.INSTAGRAM_APP_SECRET!,
  };
}
function version() {
  const v = process.env.INSTAGRAM_API_VERSION || 'v25.0';
  if (!/^v\d{1,2}\.0$/.test(v)) fail(503, 'La versión de API Instagram no es válida.');
  return v;
}
async function provider(url: string, init: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    fail(502, 'Instagram no respondió. Tus noticias guardadas se conservan.');
  }
  if (!r.ok)
    fail(
      r.status === 401 || r.status === 400 ? 409 : 502,
      'Instagram no pudo completar la consulta. Revisa la autorización y los permisos de la cuenta.',
    );
  try {
    const data = JSON.parse(new TextDecoder().decode(await boundedBytes(r, 2_000_000)));
    if (data.error) throw Error();
    return data;
  } catch {
    fail(502, 'Instagram devolvió una respuesta inválida. No se modificaron las noticias.');
  }
}
const graph = (
  resource: string,
  access: string,
  params: Record<string, string> = {},
  mode = loginMode(),
) =>
  provider(
    `https://graph.${mode === 'facebook' ? 'facebook' : 'instagram'}.com/${version()}/${resource}?${new URLSearchParams(params)}`,
    {
      headers: { Authorization: `Bearer ${access}` },
    },
  );
const identitySchema = z.object({
  user_id: z
    .string()
    .regex(/^\d{1,30}$/)
    .optional(),
  id: z
    .string()
    .regex(/^\d{1,30}$/)
    .optional(),
  username: z.string().min(1).max(100),
});
async function identity(access: string, expected?: string) {
  const p = identitySchema.parse(
    await graph(loginMode() === 'facebook' ? expected! : 'me', access, {
      fields: loginMode() === 'facebook' ? 'id,username' : 'user_id,username',
    }),
  );
  const id = p.user_id || p.id;
  if (!id || (expected && id !== expected))
    fail(403, 'La autorización no corresponde a la cuenta conectada.');
  return { id, username: p.username };
}
const accessSchema = z.object({
  access_token: z.string().min(1).max(4000),
  expires_in: z.number().int().positive().max(100_000_000),
});
const stateHash = (raw: string) =>
  hash(
    `${loginMode()}:${config().client_id}:${loginMode() === 'facebook' ? facebookPage() : ''}:${raw}`,
  );
async function facebookAccount(access: string, expected?: string) {
  const pageId = facebookPage();
  // Business-owned pages may be absent from /me/accounts despite an explicit grant.
  // Ask Meta for this exact configured resource; require its ID and linked Instagram identity.
  // Meta enforces page access on this request. Never select a different page as a fallback.
  const page = await graph(pageId, access, { fields: 'id,instagram_business_account' }, 'facebook');
  const account = z
    .object({
      id: z.string().regex(/^\d{1,30}$/),
      instagram_business_account: z.object({ id: z.string().regex(/^\d{1,30}$/) }).optional(),
    })
    .parse(page);
  if (account.id !== pageId || !account.instagram_business_account)
    fail(409, 'Vincula el Instagram profesional de la tienda a su página de Facebook.');
  return identity(access, expected || account.instagram_business_account.id).then((person) => {
    if (person.id !== account.instagram_business_account!.id)
      fail(403, 'Cambió la cuenta de Instagram vinculada. Vuelve a conectar.');
    return person;
  });
}
async function exchange(code: string) {
  const c = config();
  if (loginMode() === 'facebook') {
    const endpoint = `https://graph.facebook.com/${version()}/oauth/access_token`;
    const short = accessSchema.parse(
      await provider(endpoint, {
        method: 'POST',
        body: new URLSearchParams({ ...c, code, redirect_uri: callback() }),
      }),
    );
    const long = accessSchema.parse(
      await provider(endpoint, {
        method: 'POST',
        body: new URLSearchParams({
          ...c,
          grant_type: 'fb_exchange_token',
          fb_exchange_token: short.access_token,
        }),
      }),
    );
    return { long, person: await facebookAccount(long.access_token) };
  }
  const short = await provider('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    body: new URLSearchParams({
      ...c,
      code,
      grant_type: 'authorization_code',
      redirect_uri: callback(),
    }),
  });
  const entry = short.data
    ? Array.isArray(short.data) && short.data.length === 1 && !short.access_token
      ? short.data[0]
      : null
    : short;
  if (!entry?.access_token || !entry.user_id)
    fail(502, 'Instagram no entregó una autorización válida.');
  const long = accessSchema.parse(
    await provider(
      `https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: c.client_secret, access_token: entry.access_token })}`,
    ),
  );
  return { long, person: await identity(long.access_token, String(entry.user_id)) };
}
export async function startInstagram(adminId: string) {
  const c = config(),
    raw = token(),
    db = await getDb();
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM instagram_oauth_states WHERE admin_id=$1 OR expires_at<now()', [
      adminId,
    ]);
    await tx.query(
      "INSERT INTO instagram_oauth_states(state_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [stateHash(raw), adminId],
    );
  });
  const url = new URL(
    loginMode() === 'facebook'
      ? `https://www.facebook.com/${version()}/dialog/oauth`
      : 'https://www.instagram.com/oauth/authorize',
  );
  url.search = new URLSearchParams({
    client_id: c.client_id,
    redirect_uri: callback(),
    response_type: 'code',
    scope:
      loginMode() === 'facebook'
        ? 'instagram_basic,pages_show_list,pages_read_engagement'
        : 'instagram_business_basic',
    state: raw,
    ...(loginMode() === 'instagram' ? { enable_fb_login: '0', force_authentication: '1' } : {}),
  }).toString();
  return {
    url: url.toString(),
    cookie: `sergod_instagram_state=${raw}; Path=/api/admin/integrations/instagram; HttpOnly; SameSite=Lax; Max-Age=600${appUrl().startsWith('https://') ? '; Secure' : ''}`,
  };
}
export async function finishInstagram(adminId: string, request: Request) {
  const params = new URL(request.url).searchParams,
    state = params.get('state') || '';
  const cookie =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('sergod_instagram_state='))
      ?.split('=')[1] || '';
  if (
    !/^[a-f0-9]{64}$/.test(state) ||
    !timingSafeEqual(Buffer.from(hash(state)), Buffer.from(hash(cookie)))
  )
    fail(
      400,
      'La autorización venció o no corresponde a este navegador. Inicia la conexión nuevamente.',
    );
  const db = await getDb();
  // Consume state in its own transaction: even failed exchanges cannot replay it.
  const consumed = await db.query(
    'DELETE FROM instagram_oauth_states WHERE state_hash=$1 AND admin_id=$2 AND expires_at>now() RETURNING state_hash',
    [stateHash(state), adminId],
  );
  if (!consumed.rows.length) fail(400, 'Esta autorización venció o ya se utilizó.');
  if (params.has('error')) fail(400, 'Se canceló la autorización de Instagram.');
  const code = params.get('code');
  if (!code || code.length > 2000)
    fail(400, 'Instagram no entregó un código de autorización válido.');
  const { long, person } = await exchange(code);
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('instagram-connection'))");
    await tx.query(
      `INSERT INTO instagram_connection(id,user_id,username,credentials,expires_at) VALUES(1,$1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,username=EXCLUDED.username,credentials=EXCLUDED.credentials,expires_at=EXCLUDED.expires_at,refreshed_at=now(),updated_at=now()`,
      [
        person.id,
        person.username,
        sealIntegration({
          access_token: long.access_token,
          login_mode: loginMode(),
          app_id: config().client_id,
          ...(loginMode() === 'facebook' ? { page_id: facebookPage() } : {}),
        }),
        new Date(Date.now() + long.expires_in * 1000).toISOString(),
      ],
    );
    await tx.query('DELETE FROM instagram_previews');
  });
}
async function ready() {
  config();
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('instagram-connection'))");
    const c = (await tx.query('SELECT * FROM instagram_connection WHERE id=1 FOR UPDATE')).rows[0];
    if (!c) fail(409, 'Conecta Instagram para revisar publicaciones.');
    if (new Date(c.expires_at).getTime() <= Date.now())
      fail(409, 'La conexión de Instagram venció. Vuelve a conectar la cuenta.');
    const credentials = openIntegration<{
      access_token: string;
      login_mode?: string;
      app_id?: string;
      page_id?: string;
    }>(c.credentials);
    let access = credentials.access_token;
    if (
      (credentials.login_mode || 'instagram') !== loginMode() ||
      (credentials.app_id && credentials.app_id !== config().client_id) ||
      (loginMode() === 'facebook' && credentials.page_id !== facebookPage())
    )
      fail(409, 'La configuración de conexión cambió. Vuelve a conectar Instagram.');
    if (loginMode() === 'facebook') {
      await facebookAccount(access, c.user_id);
      return { c, access };
    }
    if (
      new Date(c.expires_at).getTime() < Date.now() + 7 * 86400000 &&
      new Date(c.refreshed_at).getTime() < Date.now() - 86400000
    ) {
      const r = accessSchema.parse(
        await provider(
          `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: access })}`,
        ),
      );
      await identity(r.access_token, c.user_id);
      access = r.access_token;
      c.credentials = sealIntegration({ ...credentials, access_token: access });
      await tx.query(
        'UPDATE instagram_connection SET credentials=$1,expires_at=$2,refreshed_at=now(),updated_at=now() WHERE id=1',
        [c.credentials, new Date(Date.now() + r.expires_in * 1000).toISOString()],
      );
    } else await identity(access, c.user_id);
    return { c, access };
  });
}
export async function instagramStatus() {
  const db = await getDb();
  const c = (await db.query('SELECT username,expires_at FROM instagram_connection WHERE id=1'))
    .rows[0];
  const setting = (await db.query('SELECT hashtag FROM instagram_settings WHERE id=1')).rows[0];
  return {
    configured: configured(),
    connected: Boolean(c),
    username: c?.username || '',
    expires_at: c?.expires_at || null,
    expired: c ? new Date(c.expires_at).getTime() <= Date.now() : false,
    hashtag: setting.hashtag,
    callback_url: callback(),
    login_mode: loginMode(),
  };
}
export async function saveInstagramSettings(input: unknown) {
  const d = z
    .object({
      hashtag: z
        .string()
        .trim()
        .transform((v) => v.replace(/^#/, ''))
        .pipe(
          z
            .string()
            .min(1)
            .max(60)
            .regex(/^[\p{L}\p{M}\p{N}_]+$/u),
        ),
    })
    .parse(input);
  await (
    await getDb()
  ).transaction(async (tx) => {
    await tx.query('UPDATE instagram_settings SET hashtag=$1 WHERE id=1', [d.hashtag]);
    await tx.query('DELETE FROM instagram_previews');
  });
  return instagramStatus();
}
export async function disconnectInstagram() {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('instagram-connection'))");
    await tx.query('DELETE FROM instagram_connection');
    await tx.query('DELETE FROM instagram_oauth_states');
    await tx.query('DELETE FROM instagram_previews');
  });
  return { ok: true };
}
const tagPattern = (tag: string) =>
  new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])#${tag}(?![\\p{L}\\p{M}\\p{N}_])`, 'giu');
export const hasImportTag = (caption: string, tag: string) => tagPattern(tag).test(caption);
export const cleanInstagramCaption = (caption: string, tag: string) =>
  caption
    .replace(tagPattern(tag), '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
const mediaSchema = z.object({
  id: z.string().regex(/^\d{1,30}$/),
  caption: z.string().max(30000).default(''),
  media_type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']),
  media_product_type: z.string().optional(),
  timestamp: z.preprocess(
    (value) => (typeof value === 'string' ? value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2') : value),
    z.iso.datetime({ offset: true }),
  ),
  permalink: z.string().url(),
});
function snapshot(raw: unknown, tag: string) {
  const m = mediaSchema.parse(raw),
    u = new URL(m.permalink);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !['instagram.com', 'www.instagram.com'].includes(u.hostname) ||
    !/^\/(p|reel)\/[\w-]+\/?$/.test(u.pathname)
  )
    fail(502, 'Instagram devolvió un enlace de publicación inválido.');
  if (m.media_product_type === 'STORY') fail(400, 'Las Stories no se archivan como Noticias.');
  if (!hasImportTag(m.caption, tag))
    fail(400, 'Esta publicación no contiene el hashtag configurado.');
  const assets: NewsAsset[] = [];
  return {
    media_id: m.id,
    caption: cleanInstagramCaption(m.caption, tag),
    recorded_at: m.timestamp,
    assets,
    permalink: u.toString(),
    media_type: m.media_type,
    import_hashtag: tag,
  };
}
const mediaFields = 'id,caption,media_type,media_product_type,permalink,timestamp';
export async function reviewInstagram(adminId: string, cursor?: string) {
  const after = z
    .string()
    .max(1000)
    .regex(/^[\w=+\/-]*$/)
    .optional()
    .parse(cursor);
  const { c, access } = await ready(),
    db = await getDb();
  const tag = (await instagramStatus()).hashtag;
  const data = await graph(`${c.user_id}/media`, access, {
    fields: mediaFields,
    limit: '25',
    ...(after ? { after } : {}),
  });
  if (!Array.isArray(data.data) || data.data.length > 25)
    fail(502, 'Instagram devolvió una lista inválida.');
  const old = new Set(
    (await db.query('SELECT media_id FROM instagram_news')).rows.map((r) => r.media_id),
  );
  const candidates = data.data
    .filter(
      (m: any) =>
        typeof m.caption === 'string' &&
        hasImportTag(m.caption, tag) &&
        m.media_product_type !== 'STORY' &&
        !old.has(m.id),
    )
    .map((m: unknown) => snapshot(m, tag));
  const next =
    typeof data.paging?.cursors?.after === 'string' && data.paging?.next
      ? data.paging.cursors.after
      : null;
  if (next)
    z.string()
      .max(1000)
      .regex(/^[\w=+\/-]+$/)
      .parse(next);
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('instagram-connection'))");
    const current = (await tx.query('SELECT credentials FROM instagram_connection WHERE id=1'))
      .rows[0];
    const settings = (await tx.query('SELECT hashtag FROM instagram_settings WHERE id=1')).rows[0];
    if (!current || current.credentials !== c.credentials || settings.hashtag !== tag)
      fail(409, 'La conexión o el hashtag cambió. Revisa nuevamente.');
    await tx.query('DELETE FROM instagram_previews WHERE expires_at<now()');
    const rows: InstagramCandidate[] = [];
    for (const p of candidates) {
      const id = uuid(),
        r = (
          await tx.query(
            'INSERT INTO instagram_previews(id,admin_id,user_id,media_id,payload) VALUES($1,$2,$3,$4,$5) RETURNING expires_at',
            [id, adminId, c.user_id, p.media_id, JSON.stringify({ ...p, username: c.username })],
          )
        ).rows[0];
      rows.push({ ...p, preview_id: id, expires_at: r.expires_at });
    }
    return { candidates: rows, next_cursor: next, scanned: data.data.length };
  });
}
async function validRelations(tx: any, tournament: string | null, league: string | null) {
  if (
    tournament &&
    !(await tx.query("SELECT id FROM posts WHERE id=$1 AND kind='tournament'", [tournament])).rows
      .length
  )
    fail(400, 'El torneo relacionado no existe.');
  if (
    league &&
    !(await tx.query('SELECT id FROM league_tournaments WHERE id=$1', [league])).rows.length
  )
    fail(400, 'El torneo de Liga relacionado no existe.');
}
const relations = {
  status: z.enum(['draft', 'published', 'withdrawn']),
  tournament_id: z.uuid().nullable().default(null),
  league_tournament_id: z.uuid().nullable().default(null),
};
export async function importInstagram(adminId: string, input: unknown) {
  const d = z.object({ preview_id: z.uuid(), ...relations }).parse(input),
    db = await getDb();
  const preview = (
    await db.query(
      'SELECT * FROM instagram_previews WHERE id=$1 AND admin_id=$2 AND expires_at>now()',
      [d.preview_id, adminId],
    )
  ).rows[0];
  if (!preview) fail(410, 'La vista previa venció o ya se guardó. Revisa Instagram nuevamente.');
  const p = preview.payload;
  // Only save metadata and the trusted post link. Media stays on Instagram.
  const c = (await db.query('SELECT user_id FROM instagram_connection WHERE id=1')).rows[0];
  if (!c || c.user_id !== preview.user_id)
    fail(409, 'La cuenta conectada cambió. Revisa nuevamente.');
  if ((await db.query('SELECT id FROM instagram_news WHERE media_id=$1', [p.media_id])).rows.length)
    fail(409, 'Esta publicación ya está incorporada.');
  const assets: NewsAsset[] = [];
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('instagram-connection'))");
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`instagram-news:${p.media_id}`]);
    const still = (await tx.query('SELECT user_id FROM instagram_connection WHERE id=1')).rows[0];
    const fresh = (
      await tx.query(
        'SELECT id FROM instagram_previews WHERE id=$1 AND admin_id=$2 AND expires_at>now() FOR UPDATE',
        [d.preview_id, adminId],
      )
    ).rows[0];
    const tag = (await tx.query('SELECT hashtag FROM instagram_settings WHERE id=1')).rows[0];
    if (!fresh || !still || still.user_id !== preview.user_id || tag.hashtag !== p.import_hashtag)
      fail(409, 'La vista previa, cuenta o hashtag cambió. Revisa nuevamente.');
    if (
      (await tx.query('SELECT id FROM instagram_news WHERE media_id=$1', [p.media_id])).rows.length
    )
      fail(409, 'Esta publicación ya está incorporada. No se duplicó.');
    await validRelations(tx, d.tournament_id, d.league_tournament_id);
    const saved = (
      await tx.query(
        `INSERT INTO instagram_news(id,media_id,user_id,username,caption,recorded_at,permalink,media_type,assets,import_hashtag,status,tournament_id,league_tournament_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          uuid(),
          p.media_id,
          preview.user_id,
          p.username,
          p.caption,
          p.recorded_at,
          p.permalink,
          p.media_type,
          JSON.stringify(assets),
          p.import_hashtag,
          d.status,
          d.tournament_id,
          d.league_tournament_id,
        ],
      )
    ).rows[0];
    await tx.query('DELETE FROM instagram_previews WHERE id=$1', [d.preview_id]);
    return saved;
  });
}
export async function listInstagramNews() {
  return (await (await getDb()).query('SELECT * FROM instagram_news ORDER BY recorded_at DESC,id'))
    .rows;
}
export async function editInstagramNews(id: unknown, input: unknown) {
  const key = z.uuid().parse(id),
    d = z.object({ ...relations }).parse(input),
    db = await getDb();
  return db.transaction(async (tx) => {
    await validRelations(tx, d.tournament_id, d.league_tournament_id);
    const r = await tx.query(
      'UPDATE instagram_news SET status=$2,tournament_id=$3,league_tournament_id=$4,updated_at=now() WHERE id=$1 RETURNING *',
      [key, d.status, d.tournament_id, d.league_tournament_id],
    );
    if (!r.rows.length) fail(404, 'Noticia no encontrada.');
    return r.rows[0];
  });
}
export async function deleteInstagramNews(id: unknown) {
  const r = await (
    await getDb()
  ).query('DELETE FROM instagram_news WHERE id=$1 RETURNING id', [z.uuid().parse(id)]);
  if (!r.rows.length) fail(404, 'Noticia no encontrada.');
  return { ok: true };
}
export async function publicNews(): Promise<NewsItem[]> {
  const db = await getDb();
  const imported = (
    await db.query(
      `SELECT n.id,n.caption,n.recorded_at,n.assets,n.permalink,n.username,n.media_type,'instagram' source,n.tournament_id,n.league_tournament_id,l.board ranking_board FROM instagram_news n LEFT JOIN league_tournaments l ON l.id=n.league_tournament_id WHERE n.status='published' ORDER BY n.recorded_at DESC,n.id LIMIT 500`,
    )
  ).rows;
  const manual = (
    await db.query(
      "SELECT id,slug,title,body,image,created_at FROM posts WHERE kind='news' AND status='published' ORDER BY created_at DESC LIMIT 500",
    )
  ).rows.map((p) => ({
    id: p.id,
    title: p.title,
    legacy_slug: p.slug,
    caption: p.body,
    recorded_at: p.created_at,
    assets: p.image ? [{ type: 'image', url: p.image, poster: '' }] : [],
    permalink: '',
    username: '',
    source: 'manual',
    tournament_id: null,
    league_tournament_id: null,
    ranking_board: null,
  }));
  return [...imported, ...manual]
    .sort(
      (a, b) =>
        new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 500);
}
