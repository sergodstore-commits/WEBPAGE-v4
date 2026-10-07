import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getDb, type Db } from './db';
import { appUrl, fail, hash, token, uuid } from './core';
import { validateImages } from './catalog';

const callback = () => `${appUrl()}/api/admin/integrations/twitch/callback`;
const configured = () =>
  Boolean(
    process.env.TWITCH_CLIENT_ID &&
    process.env.TWITCH_CLIENT_SECRET &&
    /^[a-fA-F0-9]{64}$/.test(process.env.INTEGRATIONS_ENCRYPTION_KEY || ''),
  );
function config() {
  if (!configured())
    fail(
      503,
      'Configura TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET e INTEGRATIONS_ENCRYPTION_KEY en el servidor para conectar Twitch.',
    );
  return {
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
  };
}
export function encryptTwitch(value: unknown) {
  config();
  const iv = randomBytes(12),
    cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.INTEGRATIONS_ENCRYPTION_KEY!, 'hex'),
      iv,
    );
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64')).join('.');
}
function decrypt(value: string): { access_token: string; refresh_token: string } {
  config();
  try {
    const [iv, tag, data] = value.split('.').map((v) => Buffer.from(v, 'base64'));
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(process.env.INTEGRATIONS_ENCRYPTION_KEY!, 'hex'),
      iv,
    );
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString());
  } catch {
    fail(503, 'No se pudo leer la conexión de Twitch. Revisa la clave de cifrado del servidor.');
  }
}
async function provider(url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  } catch {
    fail(
      502,
      'Twitch no respondió. Intenta revisar nuevamente; tus publicaciones guardadas se conservan.',
    );
  }
  if (!response.ok) {
    if (response.status === 401)
      fail(401, 'La conexión de Twitch ya no está autorizada. Vuelve a conectar el canal.');
    fail(502, 'Twitch no pudo completar la consulta. Intenta nuevamente.');
  }
  try {
    return await response.json();
  } catch {
    fail(502, 'Twitch devolvió una respuesta no válida.');
  }
}
async function exchange(fields: Record<string, string>) {
  const result = await provider('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({ ...config(), ...fields }),
  });
  if (!result.access_token || !result.refresh_token || !(result.expires_in > 0))
    fail(502, 'Twitch no entregó una autorización válida.');
  return result as { access_token: string; refresh_token: string; expires_in: number };
}
async function validate(access: string, expected?: string) {
  const result = await provider('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${access}` },
  });
  if (
    result.client_id !== config().client_id ||
    !result.user_id ||
    (expected && result.user_id !== expected)
  )
    fail(403, 'La autorización no corresponde a este canal y aplicación.');
  return result as { user_id: string; login: string };
}
export async function startTwitch(adminId: string) {
  const raw = token(),
    db = await getDb();
  config();
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM twitch_oauth_states WHERE admin_id=$1 OR expires_at<now()', [
      adminId,
    ]);
    await tx.query(
      "INSERT INTO twitch_oauth_states(state_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
      [hash(raw), adminId],
    );
  });
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: config().client_id,
    redirect_uri: callback(),
    response_type: 'code',
    scope: '',
    state: raw,
    force_verify: 'true',
  }).toString();
  return {
    url: url.toString(),
    cookie: `sergod_twitch_state=${raw}; Path=/api/admin/integrations/twitch; HttpOnly; SameSite=Lax; Max-Age=600${appUrl().startsWith('https://') ? '; Secure' : ''}`,
  };
}
export async function finishTwitch(adminId: string, request: Request) {
  const params = new URL(request.url).searchParams,
    state = params.get('state') || '';
  const cookie =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('sergod_twitch_state='))
      ?.slice(20) || '';
  if (
    !/^[a-f0-9]{64}$/.test(state) ||
    !timingSafeEqual(Buffer.from(hash(state)), Buffer.from(hash(cookie)))
  )
    fail(
      400,
      'La autorización de Twitch venció o no corresponde a este navegador. Inicia la conexión nuevamente.',
    );
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('twitch-connection'))");
    const consumed = await tx.query(
      'DELETE FROM twitch_oauth_states WHERE state_hash=$1 AND admin_id=$2 AND expires_at>now() RETURNING state_hash',
      [hash(state), adminId],
    );
    if (!consumed.rows.length) fail(400, 'Esta autorización de Twitch venció o ya se utilizó.');
    if (params.has('error')) fail(400, 'Se canceló la autorización de Twitch.');
    const code = params.get('code');
    if (!code || code.length > 1000)
      fail(400, 'Twitch no entregó un código de autorización válido.');
    const credentials = await exchange({
      code,
      grant_type: 'authorization_code',
      redirect_uri: callback(),
    });
    const identity = await validate(credentials.access_token);
    await tx.query(
      `INSERT INTO twitch_connection(id,user_id,login,display_name,credentials,expires_at) VALUES(1,$1,$2,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,login=EXCLUDED.login,display_name=EXCLUDED.display_name,credentials=EXCLUDED.credentials,expires_at=EXCLUDED.expires_at,validated_at=now(),updated_at=now()`,
      [
        identity.user_id,
        identity.login,
        encryptTwitch({
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token,
        }),
        new Date(Date.now() + credentials.expires_in * 1000).toISOString(),
      ],
    );
    await tx.query("UPDATE twitch_live SET enabled=false,channel='',updated_at=now() WHERE id=1");
  });
}
async function connected<T>(
  action: (tx: Db, connection: any, access: string) => Promise<T>,
): Promise<T> {
  config();
  const db = await getDb();
  const ready = await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('twitch-connection'))");
    const c = (await tx.query('SELECT * FROM twitch_connection WHERE id=1 FOR UPDATE')).rows[0];
    if (!c) fail(409, 'Conecta el canal de Twitch para consultar sus transmisiones.');
    let credentials = decrypt(c.credentials);
    if (new Date(c.expires_at).getTime() < Date.now() + 60000) {
      const refreshed = await exchange({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
      });
      await validate(refreshed.access_token, c.user_id);
      credentials = refreshed;
      c.credentials = encryptTwitch(credentials);
      await tx.query(
        'UPDATE twitch_connection SET credentials=$1,expires_at=$2,validated_at=now(),updated_at=now() WHERE id=1',
        [c.credentials, new Date(Date.now() + refreshed.expires_in * 1000).toISOString()],
      );
    } else {
      // Every explicit review validates authorization; no stale user session is trusted.
      await validate(credentials.access_token, c.user_id);
      await tx.query('UPDATE twitch_connection SET validated_at=now() WHERE id=1');
    }
    return { connection: c, access: credentials.access_token };
  });
  // Commit rotated refresh tokens before downstream queries, which can fail.
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('twitch-connection'))");
    const current = (await tx.query('SELECT credentials FROM twitch_connection WHERE id=1'))
      .rows[0];
    if (!current || current.credentials !== ready.connection.credentials)
      fail(409, 'La conexión de Twitch cambió. Revisa nuevamente.');
    return action(tx, ready.connection, ready.access);
  });
}
async function helix(resource: string, access: string) {
  return provider(`https://api.twitch.tv/helix/${resource}`, {
    headers: { Authorization: `Bearer ${access}`, 'Client-Id': config().client_id },
  });
}
export async function twitchStatus() {
  const db = await getDb();
  const c = (
    await db.query('SELECT login,display_name,validated_at FROM twitch_connection WHERE id=1')
  ).rows[0];
  const live = (
    await db.query('SELECT enabled,title,tournament_id,channel FROM twitch_live WHERE id=1')
  ).rows[0];
  return {
    configured: configured(),
    connected: Boolean(c),
    channel: c?.login || '',
    validated_at: c?.validated_at || null,
    live,
    callback_url: callback(),
  };
}
export async function disconnectTwitch() {
  await (
    await getDb()
  ).transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('twitch-connection'))");
    const c = (await tx.query('SELECT credentials FROM twitch_connection WHERE id=1')).rows[0];
    if (c && configured()) {
      try {
        const credentials = decrypt(c.credentials);
        await fetch('https://id.twitch.tv/oauth2/revoke', {
          method: 'POST',
          body: new URLSearchParams({
            client_id: config().client_id,
            token: credentials.access_token,
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        /* Local disconnect must work even if Twitch is unavailable. */
      }
    }
    await tx.query('DELETE FROM twitch_connection');
    await tx.query('DELETE FROM twitch_oauth_states');
    await tx.query("UPDATE twitch_live SET enabled=false,channel='',updated_at=now() WHERE id=1");
  });
  return { ok: true };
}
export function twitchThumbnail(url: string) {
  try {
    const u = new URL(url.replace(/%\{width\}/g, '640').replace(/%\{height\}/g, '360'));
    return u.protocol === 'https:' &&
      ['static-cdn.jtvnw.net', 'static-cdn.twitch.tv'].includes(u.hostname)
      ? u.toString()
      : '';
  } catch {
    return '';
  }
}
function video(v: any) {
  if (!/^\d{1,30}$/.test(v.id) || !v.title || !Number.isFinite(Date.parse(v.created_at)))
    fail(502, 'Twitch entregó una transmisión incompleta.');
  return {
    video_id: v.id,
    title: String(v.title).slice(0, 180),
    recorded_at: v.created_at,
    twitch_thumbnail: twitchThumbnail(v.thumbnail_url || ''),
  };
}
export async function reviewTwitch(cursor?: string) {
  if (cursor && !/^[\w=+/\-]{1,500}$/.test(cursor)) fail(400, 'La página de Twitch no es válida.');
  return connected(async (tx, c, access) => {
    const result = await helix(
      `videos?${new URLSearchParams({ user_id: c.user_id, first: '20', sort: 'time', ...(cursor ? { after: cursor } : {}) })}`,
      access,
    );
    const saved = (await tx.query('SELECT video_id FROM twitch_videos')).rows.map(
      (v) => v.video_id,
    );
    return {
      videos: result.data.map((v: any) => ({ ...video(v), imported: saved.includes(v.id) })),
      cursor: result.pagination?.cursor || null,
    };
  });
}
const liveSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().max(180).default(''),
  tournament_id: z.uuid().nullable().default(null),
});
async function validTournament(tx: Db, id: string | null) {
  if (
    id &&
    !(await tx.query("SELECT id FROM posts WHERE id=$1 AND kind='tournament'", [id])).rows.length
  )
    fail(400, 'Selecciona un torneo existente.');
}
export async function saveLive(input: unknown) {
  const d = liveSchema.parse(input);
  if (!d.enabled) {
    await (await getDb()).query('UPDATE twitch_live SET enabled=false,updated_at=now() WHERE id=1');
    return { ok: true };
  }
  return connected(async (tx, c, access) => {
    await validTournament(tx, d.tournament_id);
    const streams = await helix(`streams?user_id=${encodeURIComponent(c.user_id)}`, access);
    if (!streams.data?.length)
      fail(
        409,
        'El canal no está transmitiendo en vivo. Vuelve a revisar cuando comience la transmisión.',
      );
    await tx.query(
      'UPDATE twitch_live SET enabled=true,channel=$1,title=$2,tournament_id=$3,updated_at=now() WHERE id=1',
      [c.login, d.title || String(streams.data[0].title).slice(0, 180), d.tournament_id],
    );
    return { ok: true };
  });
}
const vodSchema = z.object({
  video_id: z.string().regex(/^\d{1,30}$/),
  title: z.string().trim().min(1).max(180),
  recorded_at: z.iso.datetime({ offset: true }),
  custom_thumbnail: z.string().max(1000).default(''),
  tournament_id: z.uuid().nullable().default(null),
  status: z.enum(['draft', 'published', 'withdrawn']).default('draft'),
});
export async function saveTwitchVideo(input: unknown, id?: string) {
  const d = vodSchema.parse(input);
  const persist = async (tx: Db, source?: any, channel?: string) => {
    await validTournament(tx, d.tournament_id);
    if (d.custom_thumbnail) await validateImages(tx, [d.custom_thumbnail]);
    if (id) {
      const old = (
        await tx.query('SELECT * FROM twitch_videos WHERE id=$1 FOR UPDATE', [z.uuid().parse(id)])
      ).rows[0];
      if (!old) fail(404, 'Transmisión no encontrada.');
      if (old.video_id !== d.video_id)
        fail(400, 'El VOD de una transmisión guardada no se puede cambiar.');
      return (
        await tx.query(
          'UPDATE twitch_videos SET title=$1,recorded_at=$2,custom_thumbnail=$3,tournament_id=$4,status=$5,updated_at=now() WHERE id=$6 RETURNING *',
          [d.title, d.recorded_at, d.custom_thumbnail, d.tournament_id, d.status, id],
        )
      ).rows[0];
    }
    const result = await tx.query(
      'INSERT INTO twitch_videos(id,video_id,channel,title,recorded_at,twitch_thumbnail,custom_thumbnail,tournament_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(video_id) DO NOTHING RETURNING *',
      [
        uuid(),
        d.video_id,
        channel,
        d.title,
        d.recorded_at,
        source.twitch_thumbnail,
        d.custom_thumbnail,
        d.tournament_id,
        d.status,
      ],
    );
    if (!result.rows.length)
      fail(409, 'Esta transmisión ya fue incorporada. Puedes editarla en Transmisiones.');
    return result.rows[0];
  };
  if (id) return (await getDb()).transaction((tx) => persist(tx));
  return connected(async (tx, c, access) => {
    const result = await helix(`videos?id=${encodeURIComponent(d.video_id)}`, access);
    const v = result.data?.[0];
    if (!v || v.user_id !== c.user_id)
      fail(400, 'Este VOD no existe o no pertenece al canal conectado.');
    return persist(tx, video(v), c.login);
  });
}
export async function deleteTwitchVideo(id: string) {
  const result = await (
    await getDb()
  ).query('DELETE FROM twitch_videos WHERE id=$1 RETURNING id', [z.uuid().parse(id)]);
  if (!result.rows.length) fail(404, 'Transmisión no encontrada.');
  return { ok: true };
}
export async function listTwitchVideos() {
  return (
    await (
      await getDb()
    ).query('SELECT * FROM twitch_videos ORDER BY recorded_at DESC,id LIMIT 500')
  ).rows;
}
export async function publicTournaments(offset = 0) {
  const db = await getDb();
  const live = (
    await db.query('SELECT enabled,channel,title,tournament_id FROM twitch_live WHERE id=1')
  ).rows[0];
  const videos = (
    await db.query(
      "SELECT id,video_id,channel,title,recorded_at,twitch_thumbnail,custom_thumbnail,tournament_id FROM twitch_videos WHERE status='published' ORDER BY recorded_at DESC,id LIMIT 6 OFFSET $1",
      [offset],
    )
  ).rows;
  const total = Number(
    (await db.query("SELECT count(*) AS total FROM twitch_videos WHERE status='published'")).rows[0]
      .total,
  );
  return { live: live?.enabled ? live : null, videos, total };
}
