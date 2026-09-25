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
  return (await (await getDb()).query(sql + ' ORDER BY created_at DESC LIMIT 500', params)).rows;
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
  if (d.status === 'published' && (!d.body.trim() || !d.image))
    fail(400, 'Agrega el texto y una imagen antes de publicar.');
  if (d.kind === 'tournament' && d.status === 'published' && (!d.event_at || !d.location.trim()))
    fail(400, 'Indica la fecha y el lugar del torneo.');
  const db = await getDb();
  const postId = id || uuid();
  return db.transaction(async (tx) => {
    if (d.image) await validateImages(tx, [d.image]);
    const old = id ? (await tx.query('SELECT * FROM posts WHERE id=$1', [id])).rows[0] : null;
    if (id && !old) fail(404, 'Publicación no encontrada.');
    return (
      await tx.query(
        `INSERT INTO posts(id,slug,kind,title,body,image,event_at,location,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET kind=EXCLUDED.kind,title=EXCLUDED.title,body=EXCLUDED.body,image=EXCLUDED.image,event_at=EXCLUDED.event_at,location=EXCLUDED.location,status=EXCLUDED.status,updated_at=now() RETURNING *`,
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
