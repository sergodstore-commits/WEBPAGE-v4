import { z } from 'zod';
import { getDb } from './db';
import { fail, slugify, uuid } from './core';
import { validateImages } from './catalog';
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
  location: z.string().max(400).default(''),
});
export async function getPosts(admin = false, kind?: string) {
  const params: any[] = [];
  let sql = 'SELECT * FROM posts WHERE true';
  if (!admin) sql += " AND status='published'";
  if (kind && ['news', 'community', 'tournament'].includes(kind)) {
    params.push(kind);
    sql += ' AND kind=$1';
  }
  const db = await getDb();
  const rows = (await db.query(sql + ' ORDER BY created_at DESC LIMIT 500', params)).rows;
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
  const p = (
    await (await getDb()).query("SELECT * FROM posts WHERE slug=$1 AND status='published'", [slug])
  ).rows[0];
  if (!p) fail(404, 'Esta publicación no está disponible.');
  return p;
}
export async function savePost(input: unknown, id?: string) {
  const d = schema.parse(input);
  if (d.kind !== 'tournament' && d.status === 'published' && (!d.body.trim() || !d.image))
    fail(400, 'Agrega el texto y una imagen antes de publicar.');
  if (d.kind === 'tournament' && d.status === 'published' && !d.event_at)
    fail(400, 'Indica la fecha y hora del torneo.');
  const db = await getDb();
  const postId = id || uuid();
  return db.transaction(async (tx) => {
    if (d.image) await validateImages(tx, [d.image]);
    const old = id ? (await tx.query('SELECT * FROM posts WHERE id=$1', [id])).rows[0] : null;
    if (id && !old) fail(404, 'Publicación no encontrada.');
    // Older clients omit this field. Keep an existing tournament's level on edit.
    const eventLevel =
      d.kind === 'tournament' ? (d.event_level ?? old?.event_level ?? 'normal') : 'normal';
    return (
      await tx.query(
        `INSERT INTO posts(id,slug,kind,title,body,image,event_at,location,status,event_level) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,body=EXCLUDED.body,image=EXCLUDED.image,event_at=EXCLUDED.event_at,location=EXCLUDED.location,status=EXCLUDED.status,event_level=EXCLUDED.event_level,updated_at=now() RETURNING *`,
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
