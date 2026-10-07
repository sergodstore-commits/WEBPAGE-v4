import { z } from 'zod';
import { getDb, type Db } from './db';
import { fail, uuid } from './core';
import { validateImages } from './catalog';
import { youtubeVideoId, youtubeWatchUrl } from '../youtube';

const videoId = z
  .string()
  .max(1000)
  .transform((value, ctx) => {
    const id = youtubeVideoId(value);
    if (!id) {
      ctx.addIssue({
        code: 'custom',
        message: 'Ingresa un enlace válido de un video o directo de YouTube.',
      });
      return z.NEVER;
    }
    return id;
  });
const schema = z.object({
  video_id: videoId,
  title: z.string().trim().min(1).max(180),
  recorded_at: z.iso.datetime({ offset: true }),
  custom_thumbnail: z.string().max(1000).default(''),
  tournament_id: z.uuid().nullable().default(null),
  status: z.enum(['draft', 'published', 'withdrawn']).default('draft'),
});
async function validateTournament(db: Db, id: string | null) {
  if (
    id &&
    !(await db.query("SELECT id FROM posts WHERE id=$1 AND kind='tournament'", [id])).rows.length
  )
    fail(400, 'Selecciona un torneo existente.');
}
export async function youtubeSettings() {
  return (await (await getDb()).query('SELECT * FROM youtube_settings WHERE id=1')).rows[0];
}
export async function reviewYouTube(input: unknown) {
  const id = videoId.parse(z.object({ url: z.string() }).parse(input).url);
  let response: Response;
  try {
    response = await fetch(
      `https://www.youtube.com/oembed?${new URLSearchParams({ url: youtubeWatchUrl(id), format: 'json' })}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    fail(502, 'YouTube no respondió. Tus transmisiones guardadas se conservan.');
  }
  if (!response.ok)
    fail(
      400,
      'YouTube no permite consultar este video. Comprueba que sea público o no listado y permita insertarse en otras páginas.',
    );
  let remote;
  try {
    remote = z
      .object({
        title: z.string().min(1),
        author_url: z.string().url(),
        thumbnail_url: z.string().url(),
      })
      .parse(await response.json());
  } catch {
    fail(502, 'YouTube entregó una respuesta incompleta.');
  }
  const settings = await youtubeSettings();
  const normalize = (s: string) =>
    s.toLowerCase().replace(/\/$/, '').replace('https://youtube.com/', 'https://www.youtube.com/');
  if (
    ![settings.channel_url, `https://www.youtube.com/channel/${settings.channel_id}`].some(
      (s) => normalize(s) === normalize(remote.author_url),
    )
  )
    fail(400, 'El video no pertenece al canal de YouTube de SERGOD STORE.');
  return {
    video_id: id,
    title: remote.title.slice(0, 180),
    youtube_thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}
export async function saveYouTubeVideo(input: unknown, id?: string) {
  const d = schema.parse(input);
  // Withdrawal and metadata edits must remain available if the provider is down.
  if (!id || d.status === 'published') await reviewYouTube({ url: d.video_id });
  const source = { youtube_thumbnail: `https://i.ytimg.com/vi/${d.video_id}/hqdefault.jpg` };
  return (await getDb()).transaction(async (tx) => {
    await validateTournament(tx, d.tournament_id);
    if (d.custom_thumbnail) await validateImages(tx, [d.custom_thumbnail]);
    if (id) {
      const old = (
        await tx.query('SELECT video_id FROM youtube_videos WHERE id=$1 FOR UPDATE', [
          z.uuid().parse(id),
        ])
      ).rows[0];
      if (!old) fail(404, 'Transmisión no encontrada.');
      if (old.video_id !== d.video_id)
        fail(400, 'El video guardado no se puede sustituir; incorpora una nueva transmisión.');
      return (
        await tx.query(
          'UPDATE youtube_videos SET title=$1,recorded_at=$2,custom_thumbnail=$3,tournament_id=$4,status=$5,youtube_thumbnail=$6,updated_at=now() WHERE id=$7 RETURNING *',
          [
            d.title,
            d.recorded_at,
            d.custom_thumbnail,
            d.tournament_id,
            d.status,
            source.youtube_thumbnail,
            id,
          ],
        )
      ).rows[0];
    }
    const r = await tx.query(
      'INSERT INTO youtube_videos(id,video_id,title,recorded_at,youtube_thumbnail,custom_thumbnail,tournament_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(video_id) DO NOTHING RETURNING *',
      [
        uuid(),
        d.video_id,
        d.title,
        d.recorded_at,
        source.youtube_thumbnail,
        d.custom_thumbnail,
        d.tournament_id,
        d.status,
      ],
    );
    if (!r.rows.length)
      fail(409, 'Esta transmisión ya está guardada. Edítala desde Transmisiones.');
    return r.rows[0];
  });
}
export async function saveYouTubeLive(input: unknown) {
  const d = z
    .object({
      enabled: z.boolean(),
      video_id: z.string().max(1000).default(''),
      title: z.string().trim().max(180).default(''),
      stage: z.enum(['scheduled', 'live']).default('scheduled'),
      tournament_id: z.uuid().nullable().default(null),
    })
    .parse(input);
  const normalized = d.video_id ? videoId.parse(d.video_id) : '';
  const source = d.enabled && normalized ? await reviewYouTube({ url: normalized }) : null;
  if (d.enabled && !source) fail(400, 'Ingresa el enlace del directo antes de mostrarlo.');
  return (await getDb()).transaction(async (tx) => {
    await validateTournament(tx, d.tournament_id);
    return (
      await tx.query(
        'UPDATE youtube_settings SET enabled=$1,video_id=$2,title=$3,stage=$4,tournament_id=$5,updated_at=now() WHERE id=1 RETURNING *',
        [d.enabled, normalized, d.title || source?.title || '', d.stage, d.tournament_id],
      )
    ).rows[0];
  });
}
export async function finishYouTubeLive(input: unknown) {
  const recordedAt = z
    .object({ recorded_at: z.iso.datetime({ offset: true }) })
    .parse(input).recorded_at;
  const current = await youtubeSettings();
  if (!current.video_id) fail(400, 'No hay un directo guardado para incorporar al archivo.');
  await reviewYouTube({ url: current.video_id });
  return (await getDb()).transaction(async (tx) => {
    const live = (await tx.query('SELECT * FROM youtube_settings WHERE id=1 FOR UPDATE')).rows[0];
    if (
      live.video_id !== current.video_id ||
      live.updated_at.toString() !== current.updated_at.toString()
    )
      fail(409, 'El directo cambió. Recarga antes de finalizar.');
    await tx.query(
      "INSERT INTO youtube_videos(id,video_id,title,recorded_at,youtube_thumbnail,tournament_id,status) VALUES($1,$2,$3,$4,$5,$6,'published') ON CONFLICT(video_id) DO UPDATE SET status='published',updated_at=now()",
      [
        uuid(),
        live.video_id,
        live.title,
        recordedAt,
        `https://i.ytimg.com/vi/${live.video_id}/hqdefault.jpg`,
        live.tournament_id,
      ],
    );
    await tx.query('UPDATE youtube_settings SET enabled=false,updated_at=now() WHERE id=1');
    return { ok: true };
  });
}
export async function listYouTubeVideos() {
  return (
    await (
      await getDb()
    ).query('SELECT * FROM youtube_videos ORDER BY recorded_at DESC,id LIMIT 500')
  ).rows;
}
export async function deleteYouTubeVideo(id: string) {
  const r = await (
    await getDb()
  ).query('DELETE FROM youtube_videos WHERE id=$1 RETURNING id', [z.uuid().parse(id)]);
  if (!r.rows.length) fail(404, 'Transmisión no encontrada.');
  return { ok: true };
}
export async function publicYouTubeTournaments(offset = 0) {
  const db = await getDb(),
    settings = await youtubeSettings();
  const videos = (
    await db.query(
      "SELECT id,video_id,title,recorded_at,youtube_thumbnail,custom_thumbnail,tournament_id FROM youtube_videos WHERE status='published' ORDER BY recorded_at DESC,id LIMIT 6 OFFSET $1",
      [offset],
    )
  ).rows;
  const total = Number(
    (await db.query("SELECT count(*) AS total FROM youtube_videos WHERE status='published'"))
      .rows[0].total,
  );
  return {
    provider: 'youtube',
    channel_url: settings.channel_url,
    live: settings.enabled
      ? {
          enabled: true,
          video_id: settings.video_id,
          title: settings.title,
          stage: settings.stage,
          tournament_id: settings.tournament_id,
        }
      : null,
    videos,
    total,
  };
}
