import sharp from 'sharp';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDb, dataDir } from './db';
import { boundedBytes, fail, isProd, uuid } from './core';
export async function uploadImage(user: any, request: Request) {
  const bytes = await boundedBytes(request, 4 * 1024 * 1024 + 65536);
  const form = await new Response(bytes, {
    headers: { 'Content-Type': request.headers.get('content-type') || '' },
  }).formData();
  const file = form.get('file');
  if (!(file instanceof File)) fail(400, 'Selecciona una imagen.');
  if (file.size > 4 * 1024 * 1024 || file.size === 0)
    fail(400, 'La imagen debe pesar entre 1 byte y 4 MB.');
  let output: Buffer;
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input, { limitInputPixels: 30_000_000 }).metadata();
    if (!['jpeg', 'png', 'webp', 'avif'].includes(metadata.format || ''))
      fail(400, 'Usa imágenes JPG, PNG, WebP o AVIF.');
    output = await sharp(input, { limitInputPixels: 30_000_000 })
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    fail(400, 'No se pudo leer la imagen. Usa JPG, PNG, WebP o AVIF de hasta 4 MB.');
  }
  const id = uuid(),
    key = `${id}.webp`;
  let url: string;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const base = process.env.SUPABASE_URL.replace(/\/$/, '');
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
    const res = await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'image/webp',
        'Cache-Control': 'max-age=31536000',
      },
      body: new Uint8Array(output!),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok)
      fail(502, 'El almacenamiento no pudo guardar la imagen. Revisa la conexión del servicio.');
    url = `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${key}`;
  } else {
    if (isProd()) fail(503, 'Falta configurar el almacenamiento de imágenes.');
    const dir = path.join(dataDir(), 'objects');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, key), output!);
    url = `/api/media/${key}`;
  }
  await (
    await getDb()
  ).query('INSERT INTO uploads(id,object_key,url,created_by) VALUES($1,$2,$3,$4)', [
    id,
    key,
    url,
    user.id,
  ]);
  return { url };
}
export async function localImage(key: string) {
  if (isProd() || !/^[a-f0-9-]{36}\.webp$/.test(key)) fail(404, 'Imagen no encontrada.');
  try {
    return await readFile(path.join(dataDir(), 'objects', key));
  } catch {
    fail(404, 'Imagen no encontrada.');
  }
}
