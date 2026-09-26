import { createHmac } from 'node:crypto';
import { getDb } from './db';
import { appUrl, AppError, event, fail, flowEnvironment, publicOrder } from './core';
import { applyPayment, releaseOrder, releaseUnstartedOrders, reserveOrder } from './commerce';
export function flowSignature(params: Record<string, string | number>, secret: string) {
  return createHmac('sha256', secret)
    .update(
      Object.keys(params)
        .filter((k) => k !== 's')
        .sort()
        .map((k) => k + String(params[k]))
        .join(''),
    )
    .digest('hex');
}
export function flowConfigured() {
  return Boolean(process.env.FLOW_API_KEY && process.env.FLOW_SECRET_KEY);
}
function base() {
  return flowEnvironment() === 'production'
    ? 'https://www.flow.cl/api'
    : 'https://sandbox.flow.cl/api';
}
export async function flowRequest(
  endpoint: string,
  params: Record<string, string | number>,
  method: 'GET' | 'POST' = 'GET',
) {
  if (!flowConfigured())
    fail(503, 'El pago online todavía no está habilitado. La tienda debe conectar Flow.');
  const unsigned = { ...params, apiKey: process.env.FLOW_API_KEY! };
  const form = new URLSearchParams(
    Object.fromEntries(
      Object.entries({ ...unsigned, s: flowSignature(unsigned, process.env.FLOW_SECRET_KEY!) }).map(
        ([k, v]) => [k, String(v)],
      ),
    ),
  );
  let response: Response;
  try {
    response = await fetch(`${base()}/${endpoint}${method === 'GET' ? '?' + form : ''}`, {
      method,
      headers:
        method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
      body: method === 'POST' ? form : undefined,
      signal: AbortSignal.timeout(9000),
      cache: 'no-store',
    });
  } catch {
    fail(
      502,
      'No fue posible consultar a Flow. El pago sigue pendiente; revisa el estado antes de volver a pagar.',
    );
  }
  if (!response!.ok)
    throw new AppError(
      response!.status >= 400 && response!.status < 500 ? 422 : 502,
      'Flow no pudo procesar la solicitud. Revisa el estado del pedido antes de volver a pagar.',
    );
  try {
    return await response!.json();
  } catch {
    fail(502, 'Flow envió una respuesta incompleta. El pedido queda pendiente de verificación.');
  }
}
export async function checkout(user: any, input: unknown) {
  if (!flowConfigured())
    fail(503, 'El pago online todavía no está habilitado. La tienda debe conectar Flow.');
  if (!appUrl().startsWith('https://'))
    fail(503, 'Flow necesita una dirección HTTPS pública para recibir la confirmación del pago.');
  const o = await reserveOrder(user, input);
  if (o.payment_status !== 'pending') return { order: publicOrder(o), payment_url: '' };
  if (o.payment_url?.startsWith('https://'))
    return { order: publicOrder(o), payment_url: o.payment_url };
  // Claim payment creation atomically. An ambiguous request must never be blindly repeated.
  const db = await getDb();
  const claim = await db.query(
    "UPDATE orders SET payment_url='creating' WHERE id=$1 AND payment_url IS NULL AND payment_status='pending' AND expires_at>now() RETURNING id",
    [o.id],
  );
  if (!claim.rows.length)
    fail(
      409,
      'El pago de este pedido ya se está creando, venció o está pendiente de verificación. Revísalo en Mi cuenta.',
    );
  try {
    const seconds = Math.max(1, Math.floor((new Date(o.expires_at).getTime() - Date.now()) / 1000));
    const result = await flowRequest(
      'payment/create',
      {
        commerceOrder: o.id,
        subject: `SERGOD STORE pedido #${o.number}`,
        currency: 'CLP',
        amount: o.total,
        email: o.customer_email,
        urlConfirmation: `${appUrl()}/api/flow/confirmation`,
        urlReturn: `${appUrl()}/api/flow/return`,
        timeout: seconds,
      },
      'POST',
    );
    if (typeof result.token !== 'string' || typeof result.url !== 'string' || !result.flowOrder)
      fail(
        502,
        'Flow no devolvió un enlace de pago válido. Revisa tu pedido antes de volver a pagar.',
      );
    const target = new URL(result.url);
    if (
      target.protocol !== 'https:' ||
      !['www.flow.cl', 'sandbox.flow.cl', 'flow.cl'].includes(target.hostname)
    )
      fail(502, 'Flow devolvió una dirección de pago no válida.');
    target.searchParams.set('token', result.token);
    await db.query(
      'UPDATE orders SET flow_token=$2,flow_order=$3,payment_url=$4,updated_at=now() WHERE id=$1',
      [o.id, result.token, String(result.flowOrder), target.toString()],
    );
    return {
      order: publicOrder({ ...o, payment_url: target.toString() }),
      payment_url: target.toString(),
    };
  } catch (e) {
    await db.transaction(async (tx) => {
      await tx.query(
        "UPDATE orders SET payment_url='uncertain' WHERE id=$1 AND payment_url='creating'",
        [o.id],
      );
      await event(
        tx,
        o.id,
        'No se pudo completar la creación del enlace. El sistema consultará a Flow antes de liberar la reserva.',
      );
    });
    if (e instanceof AppError && e.status === 422)
      await releaseOrder(
        o.id,
        'rejected',
        'Flow rechazó la creación del pago. Se liberaron las unidades.',
      );
    throw e;
  }
}
export async function verifyToken(token: string) {
  if (!token || token.length > 300) fail(400, 'Falta el token de pago.');
  const known = (await (await getDb()).query('SELECT * FROM orders WHERE flow_token=$1', [token]))
    .rows[0];
  if (known && known.payment_environment !== flowEnvironment()) {
    if (known.payment_status !== 'pending') return publicOrder(known);
    fail(409, 'Este pedido pertenece a otro ambiente de pago y requiere revisión de la tienda.');
  }
  const status = await flowRequest('payment/getStatus', { token });
  return applyPayment(token, status);
}
export async function refreshPayment(id: string) {
  const db = await getDb();
  const o = (await db.query("SELECT * FROM orders WHERE id::text=$1 AND source='web'", [id]))
    .rows[0];
  if (!o) fail(404, 'Pedido no encontrado.');
  if (o.payment_environment !== flowEnvironment()) {
    if (o.payment_status !== 'pending') return publicOrder(o);
    fail(409, 'Este pedido pertenece a otro ambiente de pago y requiere revisión de la tienda.');
  }
  if (o.payment_status === 'approved' || o.payment_status === 'review') return publicOrder(o);
  if (o.flow_token) return verifyToken(o.flow_token);
  if (o.payment_status !== 'pending') return publicOrder(o);
  const status = await flowRequest('payment/getStatusByCommerceId', { commerceId: o.id });
  // Recovery can verify and consume by commerce ID even when the original token was lost.
  return applyPayment(o.flow_token || `recovered:${o.id}`, status);
}
export async function expireOrders() {
  const released = await releaseUnstartedOrders();
  const db = await getDb();
  const pending = (
    await db.query(
      `UPDATE orders SET payment_checked_at=now() WHERE id IN (
 SELECT id FROM orders WHERE source='web' AND payment_status='pending'
 AND payment_environment=$1
 AND (payment_checked_at IS NULL OR payment_checked_at<now()-interval '1 minute')
 ORDER BY payment_checked_at NULLS FIRST,created_at LIMIT 6 FOR UPDATE SKIP LOCKED) RETURNING id`,
      [flowEnvironment()],
    )
  ).rows;
  let checked = 0,
    failed = 0;
  for (let start = 0; start < pending.length; start += 3) {
    await Promise.all(
      pending.slice(start, start + 3).map(async (o) => {
        try {
          await refreshPayment(o.id);
          checked++;
        } catch {
          failed++;
        }
      }),
    );
  }
  return { checked, failed, released };
}
