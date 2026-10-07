import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError, boundedBytes, fail, isProd, uuid } from './core';
import { dataDir } from './db';
import { uploadImage } from './storage';

// Only provider-owned CDN URLs obtained by the server may be downloaded.
export function instagramCdn(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    fail(502, 'Instagram devolvió una dirección de archivo inválida.');
  }
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !['cdninstagram.com', 'fbcdn.net'].some((h) => u.hostname.endsWith('.' + h))
  )
    fail(502, 'La dirección de archivo no pertenece al almacenamiento de Instagram.');
  return u.toString();
}
export async function archiveInstagramAsset(
  userId: string,
  source: string,
  video = false,
): Promise<string> {
  const url = instagramCdn(source);
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
  } catch {
    fail(
      502,
      'No se pudo descargar el archivo de Instagram. Revisa nuevamente; la noticia no se publicó.',
    );
  }
  if (!response.ok) fail(502, 'El archivo de Instagram ya no está disponible. Revisa nuevamente.');
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await boundedBytes(response, video ? 32 * 1024 * 1024 : 4 * 1024 * 1024);
  } catch (e) {
    if (e instanceof AppError && e.status === 413)
      fail(
        413,
        video
          ? 'El video supera 32 MB. No se guardó la noticia.'
          : 'La imagen supera 4 MB. No se guardó la noticia.',
      );
    throw e;
  }
  if (!video) {
    const form = new FormData();
    form.append('file', new File([bytes], 'instagram.jpg'));
    const saved = await uploadImage(
      { id: userId },
      new Request('http://local/upload', { method: 'POST', body: form }),
    );
    return saved.url;
  }
  // Preserve MP4 source; do not accept arbitrary HTML or another file format as video.
  if (bytes.length < 12 || new TextDecoder().decode(bytes.slice(4, 8)) !== 'ftyp')
    fail(400, 'Este video no es un MP4 compatible. No se guardó la noticia.');
  const key = `${uuid()}.mp4`;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const base = process.env.SUPABASE_URL.replace(/\/$/, ''),
      bucket = process.env.SUPABASE_NEWS_STORAGE_BUCKET || 'news-media';
    const r = await fetch(`${base}/storage/v1/object/${encodeURIComponent(bucket)}/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'max-age=31536000',
      },
      body: bytes,
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      fail(502, 'No se pudo guardar el video. Revisa el bucket news-media del almacenamiento.');
    return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${key}`;
  }
  if (isProd()) fail(503, 'Falta configurar el almacenamiento de videos de Noticias.');
  await mkdir(path.join(dataDir(), 'news-objects'), { recursive: true });
  await writeFile(path.join(dataDir(), 'news-objects', key), bytes);
  return `/api/news-video/${key}`;
}
export async function localNewsVideo(key: string, range: string | null) {
  if (isProd() || !/^[a-f0-9-]{36}\.mp4$/.test(key)) fail(404, 'Video no encontrado.');
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(dataDir(), 'news-objects', key));
  } catch {
    fail(404, 'Video no encontrado.');
  }
  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  if (!range) return new Response(new Uint8Array(bytes), { headers });
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  const start = m ? (m[1] ? Number(m[1]) : Math.max(0, bytes.length - Number(m[2]))) : -1;
  const end = m?.[1] && m[2] ? Math.min(Number(m[2]), bytes.length - 1) : bytes.length - 1;
  if (start < 0 || start >= bytes.length || end < start || !m || (!m[1] && !m[2]))
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'Content-Range': `bytes */${bytes.length}` },
    });
  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
      'Content-Length': String(end - start + 1),
    },
  });
}
