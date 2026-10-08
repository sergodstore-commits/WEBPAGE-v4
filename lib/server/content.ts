import { z } from 'zod';
import { getDb } from './db';
import { fail, slugify, uuid } from './core';
import { validateImages } from './catalog';
import {
  addDays,
  chileInstant,
  chileLocal,
  expandSchedule,
  isOccurrence,
  occurrence,
  validDay,
} from '../tournament-schedule';
const daySchema = z.string().refine(validDay, 'Indica una fecha válida.');
const columns =
  "*,to_char(repeat_until,'YYYY-MM-DD') AS repeat_until,to_char(exception_day,'YYYY-MM-DD') AS exception_day";
const schema = z.object({
  title: z.string().trim().min(2).max(180),
  body: z.string().max(30000).default(''),
  kind: z.enum(['news', 'community', 'tournament']),
  status: z.enum(['draft', 'published', 'withdrawn']).default('draft'),
  image: z.string().max(1000).default(''),
  event_at: z
    .union([z.iso.datetime({ offset: true }), z.literal(''), z.null()])
    .optional()
    .transform((v) => v || null),
  event_level: z.enum(['normal', 'featured', 'major']).optional(),
  event_local: z.string().optional(),
  entry_price: z.number().int().min(0).max(10000000).nullable().optional(),
  repeat_weekly: z.boolean().optional(),
  repeat_until: daySchema.nullable().optional(),
  excluded_dates: z.array(daySchema).max(600).optional(),
  exception_parent_id: z.uuid().nullable().optional(),
  exception_day: daySchema.nullable().optional(),
  location: z.string().max(400).default(''),
});
export async function getPosts(admin = false, kind?: string, range?: { from: string; to: string }) {
  if (
    range &&
    (!validDay(range.from) ||
      !validDay(range.to) ||
      range.to < range.from ||
      Date.parse(range.to) - Date.parse(range.from) > 366 * 86400000)
  )
    fail(400, 'Consulta un período válido de hasta un año.');
  const params: any[] = [];
  let sql = `SELECT ${columns} FROM posts WHERE true`;
  if (!admin) sql += " AND status='published'";
  if (kind && ['news', 'community', 'tournament'].includes(kind)) {
    params.push(kind);
    sql += ' AND kind=$1';
  }
  const db = await getDb();
  const raw = (await db.query(sql + ' ORDER BY created_at DESC LIMIT 500', params)).rows;
  const today = chileLocal(new Date()).slice(0, 10);
  const rows = admin
    ? raw
    : expandSchedule(
        raw,
        range?.from || addDays(today, -31),
        range?.to || addDays(today, 365),
        !!range,
      );
  if (!admin && (!kind || kind === 'news')) {
    const news = (
      await db.query(
        "SELECT id,caption,assets,recorded_at FROM instagram_news WHERE status='published' ORDER BY recorded_at DESC LIMIT 500",
      )
    ).rows.map((n) => ({
      id: n.id,
      slug: `instagram-${n.id}`,
      kind: 'news',
      title: n.caption.split('\n')[0].slice(0, 100) || 'En SERGOD STORE',
      body: n.caption,
      image: n.assets[0]?.type === 'image' ? n.assets[0].url : n.assets[0]?.poster || '',
      event_at: null,
      location: '',
      status: 'published',
      created_at: n.recorded_at,
      updated_at: n.recorded_at,
    }));
    return [...rows, ...news]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 500);
  }
  return rows;
}
export async function getPost(slug: string) {
  const match = slug.match(/^(.*)--on-(\d{4}-\d{2}-\d{2})$/);
  const p = (
    await (
      await getDb()
    ).query(`SELECT ${columns} FROM posts WHERE slug=$1 AND status='published'`, [
      match?.[1] || slug,
    ])
  ).rows[0];
  if (!p) fail(404, 'Esta publicación no está disponible.');
  if (match) {
    if (!isOccurrence(p, match[2])) fail(404, 'Esta fecha no está disponible.');
    return occurrence(p, match[2]);
  }
  if (p.repeat_weekly) {
    const today = chileLocal(new Date()).slice(0, 10);
    const next = expandSchedule([p], today, addDays(today, 365))[0];
    if (!next) fail(404, 'No hay próximas fechas publicadas para esta programación.');
    return next;
  }
  return p;
}
export async function savePost(input: unknown, id?: string) {
  const d = schema.parse(input);
  if (d.kind === 'tournament' && d.event_local) {
    try {
      d.event_at = chileInstant(d.event_local);
    } catch (error) {
      fail(400, (error as Error).message);
    }
  }
  if (d.kind !== 'tournament' && d.status === 'published' && (!d.body.trim() || !d.image))
    fail(400, 'Agrega el texto y una imagen antes de publicar.');
  if (d.kind === 'tournament' && d.status === 'published' && !d.event_at)
    fail(400, 'Indica la fecha y hora del torneo.');
  const db = await getDb();
  const postId = id || uuid();
  return db.transaction(async (tx) => {
    if (d.image) await validateImages(tx, [d.image]);
    const old = id
      ? (await tx.query(`SELECT ${columns} FROM posts WHERE id=$1 FOR UPDATE`, [id])).rows[0]
      : null;
    if (id && !old) fail(404, 'Publicación no encontrada.');
    // Older clients omit this field. Keep an existing tournament's level on edit.
    const eventLevel =
      d.kind === 'tournament' ? (d.event_level ?? old?.event_level ?? 'normal') : 'normal';
    const tournament = d.kind === 'tournament';
    const weekly = tournament && (d.repeat_weekly ?? old?.repeat_weekly ?? false);
    const until = weekly
      ? d.repeat_until === undefined
        ? (old?.repeat_until ?? null)
        : d.repeat_until
      : null;
    const excluded = weekly ? [...new Set(d.excluded_dates ?? old?.excluded_dates ?? [])] : [];
    if (id && weekly) {
      const exceptions = (
        await tx.query(
          "SELECT to_char(exception_day,'YYYY-MM-DD') AS day FROM posts WHERE exception_parent_id=$1 AND status<>'draft'",
          [id],
        )
      ).rows;
      for (const exception of exceptions)
        if (!excluded.includes(exception.day)) excluded.push(exception.day);
    }
    const entryPrice = tournament
      ? d.entry_price === undefined
        ? (old?.entry_price ?? null)
        : d.entry_price
      : null;
    if (weekly && (!d.event_at || (until && until < chileLocal(d.event_at).slice(0, 10))))
      fail(400, 'La repetición necesita una fecha inicial y un cierre posterior o igual.');
    let parent = old?.exception_parent_id || null;
    let exceptionDay = old?.exception_day || null;
    if ((!id && d.exception_parent_id) || (id && parent && d.status === 'published')) {
      const series = (
        await tx.query(`SELECT ${columns} FROM posts WHERE id=$1 FOR UPDATE`, [
          parent || d.exception_parent_id,
        ])
      ).rows[0];
      if (
        !series ||
        !(exceptionDay || d.exception_day) ||
        !isOccurrence(
          id ? { ...series, excluded_dates: [] } : series,
          (exceptionDay || d.exception_day)!,
        ) ||
        !tournament ||
        weekly
      )
        fail(400, 'Esta fecha no pertenece a una programación semanal disponible.');
      parent = series.id;
      exceptionDay = exceptionDay || d.exception_day;
      if (d.status !== 'draft' && !series.excluded_dates.includes(exceptionDay))
        await tx.query(
          'UPDATE posts SET excluded_dates=excluded_dates || jsonb_build_array($2::text),updated_at=now() WHERE id=$1',
          [parent, exceptionDay],
        );
    }
    return (
      await tx.query(
        `INSERT INTO posts(id,slug,kind,title,body,image,event_at,location,status,event_level,entry_price,repeat_weekly,repeat_until,excluded_dates,exception_parent_id,exception_day) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,body=EXCLUDED.body,image=EXCLUDED.image,event_at=EXCLUDED.event_at,location=EXCLUDED.location,status=EXCLUDED.status,event_level=EXCLUDED.event_level,entry_price=EXCLUDED.entry_price,repeat_weekly=EXCLUDED.repeat_weekly,repeat_until=EXCLUDED.repeat_until,excluded_dates=EXCLUDED.excluded_dates,updated_at=now() RETURNING ${columns}`,
        [
          postId,
          old?.slug || `${slugify(d.title)}-${postId.slice(0, 8)}`,
          d.kind,
          d.title,
          d.body,
          d.image,
          d.event_at,
          d.location,
          d.status,
          eventLevel,
          entryPrice,
          weekly,
          until,
          JSON.stringify(excluded),
          parent,
          exceptionDay,
        ],
      )
    ).rows[0];
  });
}
export async function deletePost(id: string) {
  const r = await (await getDb()).query('DELETE FROM posts WHERE id=$1 RETURNING id', [id]);
  if (!r.rows.length) fail(404, 'Publicación no encontrada.');
  return { ok: true };
}
