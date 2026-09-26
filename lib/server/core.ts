import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb, type Db } from './db';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new AppError(status, message);
}
export const uuid = () => randomUUID();
export const token = () => randomBytes(32).toString('hex');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
export const isProd = () =>
  Boolean(process.env.VERCEL) ||
  (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_PRODUCTION !== 'true');
export function appUrl() {
  const value = process.env.APP_URL || 'http://localhost:3000';
  if (isProd() && !value.startsWith('https://'))
    throw new Error('APP_URL debe ser HTTPS en producción');
  return value.replace(/\/$/, '');
}
export const integer = z.number().int().min(0).max(100000000);
export async function boundedBytes(request: Request, limit: number) {
  if (Number(request.headers.get('content-length') || 0) > limit)
    fail(413, 'El formulario supera el tamaño permitido.');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      fail(413, 'El formulario supera el tamaño permitido.');
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}
export async function body(request: Request) {
  const bytes = await boundedBytes(request, 1_000_000);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, 'El formulario no es válido.');
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(appUrl()).origin)
    fail(403, 'La solicitud no proviene de esta tienda. Recarga la página.');
}
export async function rateLimit(key: string, max: number, minutes: number) {
  const db = await getDb();
  const { rows } = await db.query(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+($2||' minutes')::interval) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`,
    [key, minutes],
  );
  if (rows[0].count > max)
    fail(429, 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.');
}
export async function event(tx: Db, orderId: string, message: string) {
  await tx.query('INSERT INTO order_events(id,order_id,message) VALUES($1,$2,$3)', [
    uuid(),
    orderId,
    message,
  ]);
}
export const publicUser = (u: any) => {
  if (!u) return null;
  const { password_hash, ...safe } = u;
  return safe;
};
export const publicOrder = (o: any) => {
  if (!o) return null;
  const { flow_token, flow_order, idempotency_key, request_hash, ...safe } = o;
  safe.can_refresh_payment = o.source === 'web' && o.payment_environment === flowEnvironment();
  safe.can_manage_delivery = o.payment_environment !== 'sandbox' || flowEnvironment() === 'sandbox';
  if (!safe.can_refresh_payment) delete safe.payment_url;
  if (safe.payment_url && !safe.payment_url.startsWith('https://')) delete safe.payment_url;
  safe.number = Number(safe.number);
  return safe;
};
export const flowEnvironment = () =>
  process.env.FLOW_ENV === 'production' ? 'production' : 'sandbox';
