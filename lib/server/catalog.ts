import { z } from 'zod';
import { getDb, type Db } from './db';
import { fail, integer, slugify, uuid } from './core';
import type { Settings, Product } from '../types';
const nullableDate = z
  .union([z.iso.datetime({ offset: true }), z.literal(''), z.null()])
  .optional()
  .transform((v) => v || null);
const productSchema = z.object({
  name: z.string().trim().min(2, 'Escribe un nombre de al menos 2 caracteres.').max(180),
  description: z.string().max(12000).default(''),
  sku: z.string().trim().min(1, 'El SKU es obligatorio.').max(80),
  price: integer,
  discount_percent: z.number().int().min(0).max(99).default(0),
  category: z.string().trim().max(80).default(''),
  stock: integer,
  kind: z.enum(['store', 'preorder']),
  status: z.enum(['draft', 'published', 'withdrawn']).default('draft'),
  images: z.array(z.string().max(1000)).max(8).default([]),
  opens_at: nullableDate,
  closes_at: nullableDate,
  max_per_customer: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  delivery_terms: z.string().max(3000).default(''),
});
export async function getSettings(): Promise<Settings> {
  return (await (await getDb()).query('SELECT data FROM settings WHERE id=1')).rows[0].data;
}
export async function saveSettings(input: unknown) {
  const d = z
    .object({
      name: z.string().trim().min(2).max(100),
      description: z.string().max(1000),
      address: z.string().max(400),
      hours: z.string().max(600),
      pickup_instructions: z.string().max(1000),
      phone: z.string().max(40),
      email: z.union([z.email(), z.literal('')]),
      reservation_minutes: z.number().int().min(5).max(120),
      carriers: z
        .array(
          z.object({
            id: z.string().min(1).max(80),
            name: z.string().trim().min(2).max(100),
            enabled: z.boolean(),
            mode: z.enum(['address', 'agency']),
            collect: z.boolean(),
            price: integer,
          }),
        )
        .max(20),
    })
    .parse(input);
  if (new Set(d.carriers.map((c) => c.id)).size !== d.carriers.length)
    fail(400, 'Los transportistas deben tener identificadores distintos.');
  await (await getDb()).query('UPDATE settings SET data=$1 WHERE id=1', [JSON.stringify(d)]);
  return d;
}
export async function validateImages(tx: Db, images: string[]) {
  for (const url of images) {
    if (!(await tx.query('SELECT id FROM uploads WHERE url=$1', [url])).rows.length)
      fail(400, 'Una imagen no está guardada. Vuelve a cargarla antes de publicar.');
  }
}
function validatePublication(p: any) {
  if (
    !p.name ||
    !p.description.trim() ||
    !p.sku ||
    p.price < 1 ||
    !p.category.trim() ||
    !p.images.length
  )
    fail(
      400,
      'Para publicar agrega nombre, descripción, SKU, precio mayor a cero, categoría y al menos una imagen.',
    );
  if (p.kind === 'preorder') {
    if (!p.opens_at || !p.closes_at || !p.max_per_customer || !p.delivery_terms.trim())
      fail(
        400,
        'Completa apertura, cierre, máximo por cliente y condiciones de entrega de la preventa.',
      );
    if (new Date(p.closes_at) <= new Date(p.opens_at))
      fail(400, 'El cierre debe ser posterior a la apertura.');
    if (new Date(p.closes_at) <= new Date())
      fail(400, 'El cierre de la preventa debe ser una fecha futura.');
  }
}
export async function getProducts(
  admin = false,
  query = new URLSearchParams(),
): Promise<Product[]> {
  let sql = 'SELECT *,stock-reserved AS available FROM products WHERE deleted_at IS NULL';
  const params: any[] = [];
  const add = (condition: string, value: any) => {
    params.push(value);
    sql += ' AND ' + condition.replace('?', `$${params.length}`);
  };
  if (!admin) add('status=?', 'published');
  if (['store', 'preorder'].includes(query.get('kind') || '')) add('kind=?', query.get('kind'));
  if (query.get('q'))
    add("(name || ' ' || sku) ILIKE ?", '%' + query.get('q')!.slice(0, 100) + '%');
  if (query.get('category')) add('category=?', query.get('category'));
  sql += ' ORDER BY created_at DESC LIMIT 1000';
  return (await (await getDb()).query<Product>(sql, params)).rows;
}
export async function getProduct(slug: string, admin = false): Promise<Product> {
  const sql = admin
    ? 'SELECT *,stock-reserved AS available FROM products WHERE (slug=$1 OR id::text=$1) AND deleted_at IS NULL'
    : "SELECT *,stock-reserved AS available FROM products WHERE slug=$1 AND status='published' AND deleted_at IS NULL";
  const p = (await (await getDb()).query<Product>(sql, [slug])).rows[0];
  if (!p) fail(404, 'Este artículo no está disponible.');
  return p;
}
export async function saveProduct(user: any, input: unknown, id?: string): Promise<Product> {
  const d = productSchema.parse(input);
  const expected = z
    .object({ expected_version: z.number().int().optional(), version: z.number().int().optional() })
    .parse(input);
  if (d.closes_at && d.opens_at && new Date(d.closes_at) <= new Date(d.opens_at))
    fail(400, 'El cierre debe ser posterior a la apertura.');
  const db = await getDb();
  const productId = id || uuid();
  await db.transaction(async (tx) => {
    const old = id
      ? (
          await tx.query('SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [
            id,
          ])
        ).rows[0]
      : null;
    if (id && !old) fail(404, 'Artículo no encontrado.');
    if (old && (expected.expected_version ?? expected.version) !== old.version)
      fail(
        409,
        'El artículo cambió desde que abriste el formulario, posiblemente por una venta o reserva. Recarga sus datos antes de guardar.',
      );
    if (d.stock < (old?.reserved || 0))
      fail(
        409,
        `Hay ${old.reserved} unidades reservadas. No puedes bajar el stock por debajo de esa cantidad.`,
      );
    if (
      old &&
      old.kind !== d.kind &&
      (
        await tx.query(
          "SELECT id FROM orders WHERE payment_status IN ('pending','approved','review') AND items @> $1::jsonb LIMIT 1",
          [JSON.stringify([{ product_id: id }])],
        )
      ).rows.length
    )
      fail(409, 'Este artículo tiene pedidos. Conserva su tipo o crea un artículo nuevo.');
    await validateImages(tx, d.images);
    const status =
      old?.status === 'published'
        ? 'published'
        : d.status === 'published'
          ? old?.status || 'draft'
          : d.status;
    if (status === 'published') validatePublication(d);
    const slug = old?.slug || `${slugify(d.name)}-${productId.slice(0, 8)}`;
    await tx.query(
      `INSERT INTO products(id,name,slug,description,sku,price,discount_percent,category,stock,kind,status,images,opens_at,closes_at,max_per_customer,delivery_terms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,sku=EXCLUDED.sku,price=EXCLUDED.price,discount_percent=EXCLUDED.discount_percent,category=EXCLUDED.category,stock=EXCLUDED.stock,kind=EXCLUDED.kind,status=EXCLUDED.status,images=EXCLUDED.images,opens_at=EXCLUDED.opens_at,closes_at=EXCLUDED.closes_at,max_per_customer=EXCLUDED.max_per_customer,delivery_terms=EXCLUDED.delivery_terms,updated_at=now()`,
      [
        productId,
        d.name,
        slug,
        d.description,
        d.sku,
        d.price,
        d.discount_percent,
        d.category,
        d.stock,
        d.kind,
        status,
        JSON.stringify(d.images),
        d.opens_at,
        d.closes_at,
        d.max_per_customer,
        d.delivery_terms,
      ],
    );
    const delta = d.stock - (old?.stock || 0);
    if (delta)
      await tx.query(
        'INSERT INTO inventory_movements(id,product_id,delta,reason,actor_id) VALUES($1,$2,$3,$4,$5)',
        [uuid(), productId, delta, old ? 'Edición de existencias' : 'Stock inicial', user.id],
      );
  });
  return getProduct(productId, true);
}
export async function publishProduct(id: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const p = (
      await tx.query('SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id])
    ).rows[0];
    if (!p) fail(404, 'Artículo no encontrado.');
    validatePublication(p);
    await validateImages(tx, p.images);
    await tx.query("UPDATE products SET status='published',updated_at=now() WHERE id=$1", [id]);
  });
  return getProduct(id, true);
}
export async function withdrawProduct(id: string) {
  const db = await getDb();
  const r = await db.query(
    "UPDATE products SET status='withdrawn',updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id",
    [id],
  );
  if (!r.rows.length) fail(404, 'Artículo no encontrado.');
  return getProduct(id, true);
}
export async function deleteProduct(id: string) {
  const r = await (
    await getDb()
  ).query(
    "UPDATE products SET status='withdrawn',deleted_at=now(),updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id",
    [id],
  );
  if (!r.rows.length) fail(404, 'Artículo no encontrado.');
  return { ok: true };
}
export async function inventory(user: any, input: unknown) {
  const d = z
    .object({
      product_id: z.uuid(),
      delta: z
        .number()
        .int()
        .min(-1000000)
        .max(1000000)
        .refine((v) => v !== 0, 'Escribe una cantidad diferente de cero.'),
      reason: z.string().trim().min(3).max(500),
    })
    .parse(input);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const p = (
      await tx.query('SELECT * FROM products WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [
        d.product_id,
      ])
    ).rows[0];
    if (!p) fail(404, 'Artículo no encontrado.');
    if (p.stock + d.delta < p.reserved)
      fail(409, 'El ajuste deja menos unidades que las reservadas.');
    await tx.query('UPDATE products SET stock=stock+$2,updated_at=now() WHERE id=$1', [
      d.product_id,
      d.delta,
    ]);
    await tx.query(
      'INSERT INTO inventory_movements(id,product_id,delta,reason,actor_id) VALUES($1,$2,$3,$4,$5)',
      [uuid(), d.product_id, d.delta, d.reason, user.id],
    );
  });
  return getProduct(d.product_id, true);
}
