import { after, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getDb } from '@/lib/server/db';
import {
  appUrl,
  AppError,
  body,
  boundedBytes,
  fail,
  hash,
  isProd,
  publicUser,
  rateLimit,
  sameOrigin,
} from '@/lib/server/core';
import {
  consumeToken,
  forgot,
  login,
  logout,
  register,
  requireUser,
  resend,
  sessionCookie,
  sessionUser,
  updateAccount,
} from '@/lib/server/auth';
import {
  deleteProduct,
  getProduct,
  getProducts,
  getSettings,
  inventory,
  publishProduct,
  saveProduct,
  saveSettings,
  withdrawProduct,
} from '@/lib/server/catalog';
import { deletePost, getPost, getPosts, savePost } from '@/lib/server/content';
import { completePos, getOrder, listOrders, updateDelivery } from '@/lib/server/commerce';
import {
  checkout,
  expireOrders,
  flowConfigured,
  refreshPayment,
  verifyToken,
} from '@/lib/server/flow';
import { localImage, uploadImage } from '@/lib/server/storage';
import { flushMail } from '@/lib/server/mail';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const route = path.join('/'),
      method = request.method,
      url = new URL(request.url);
    if (route.startsWith('media/') && method === 'GET') {
      const bytes = await localImage(path[1]);
      return new Response(new Uint8Array(bytes!), {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
    if (route === 'flow/confirmation' || route === 'flow/return') {
      if (method !== 'POST') fail(405, 'Método no permitido.');
      if (Number(request.headers.get('content-length') || 0) > 4096)
        fail(413, 'Notificación demasiado grande.');
      const form = new URLSearchParams(new TextDecoder().decode(await boundedBytes(request, 4096)));
      const token = String(form.get('token') || '');
      try {
        const order = await verifyToken(token);
        after(() => flushMail());
        if (route === 'flow/return')
          return NextResponse.redirect(`${appUrl()}/cuenta/pedidos/${order.id}`, 303);
        return json({ ok: true });
      } catch (e) {
        if (route === 'flow/return')
          return NextResponse.redirect(`${appUrl()}/cuenta?payment=verification_pending`, 303);
        throw e;
      }
    }
    if (route === 'jobs/reconcile') {
      if (
        !process.env.CRON_SECRET ||
        request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`
      )
        fail(401, 'Acceso no autorizado.');
      const result = await expireOrders();
      await flushMail();
      const db = await getDb();
      await db.query('DELETE FROM sessions WHERE expires_at<now()');
      await db.query('DELETE FROM auth_tokens WHERE expires_at<now()');
      await db.query('DELETE FROM rate_limits WHERE expires_at<now()');
      return json(result);
    }
    if (!['GET', 'HEAD'].includes(method)) sameOrigin(request);
    if (route === 'health' && method === 'GET') {
      await (await getDb()).query('SELECT 1');
      return json({ ok: true });
    }
    if (route === 'auth/me' && method === 'GET') return json(await sessionUser(request));
    if (route.startsWith('auth/') && method === 'POST') {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
      await rateLimit(`auth-ip:${hash(ip)}`, 100, 15);
      let result: any;
      if (route === 'auth/register') result = await register(await body(request));
      else if (route === 'auth/login') {
        const result = await login(await body(request));
        const response = json(result.user);
        response.headers.set('Set-Cookie', sessionCookie(result.raw));
        return response;
      } else if (route === 'auth/logout') {
        await logout(request);
        const response = json({ ok: true });
        response.headers.set('Set-Cookie', sessionCookie('', true));
        return response;
      } else if (route === 'auth/forgot') result = await forgot(await body(request));
      else if (route === 'auth/verify') result = await consumeToken(await body(request), 'verify');
      else if (route === 'auth/reset') result = await consumeToken(await body(request), 'reset');
      else if (route === 'auth/resend') result = await resend(await requireUser(request));
      else fail(404, 'Ruta no encontrada.');
      after(() => flushMail());
      return json(result);
    }
    if (route === 'settings' && method === 'GET')
      return json({
        ...(await getSettings()),
        payment_mode: flowConfigured()
          ? process.env.FLOW_ENV === 'production'
            ? 'production'
            : 'sandbox'
          : 'disabled',
      });
    if (route === 'products' && method === 'GET')
      return json(await getProducts(false, url.searchParams));
    if (path[0] === 'products' && path.length === 2 && method === 'GET')
      return json(await getProduct(path[1]));
    if (route === 'posts' && method === 'GET')
      return json(await getPosts(false, url.searchParams.get('kind') || undefined));
    if (path[0] === 'posts' && path.length === 2 && method === 'GET')
      return json(await getPost(path[1]));
    if (route === 'account' && method === 'PATCH')
      return json(await updateAccount(await requireUser(request), await body(request)));
    if (route === 'checkout' && method === 'POST') {
      const u = await requireUser(request);
      await rateLimit(`checkout:${u.id}`, 20, 15);
      const result = await checkout(u, await body(request));
      after(() => flushMail());
      return json(result);
    }
    if (path[0] === 'orders') {
      const u = await requireUser(request);
      if (path.length === 1 && method === 'GET') return json(await listOrders(u));
      if (path.length === 2 && method === 'GET') return json(await getOrder(path[1], u));
      if (path[2] === 'refresh' && method === 'POST') {
        await getOrder(path[1], u);
        await rateLimit(`refresh:${u.id}`, 20, 15);
        await refreshPayment(path[1]);
        after(() => flushMail());
        return json(await getOrder(path[1], u));
      }
    }
    if (path[0] === 'admin') {
      const user = await requireUser(request, true);
      const db = await getDb();
      if (route === 'admin/dashboard' && method === 'GET') {
        const rows = (
          await db.query(
            `SELECT (SELECT count(*) FROM products WHERE deleted_at IS NULL)::integer AS products,(SELECT count(*) FROM orders)::integer AS orders,(SELECT count(*) FROM orders WHERE payment_status='pending')::integer AS pending,(SELECT count(*) FROM products WHERE deleted_at IS NULL AND stock-reserved<=3)::integer AS low_stock,(SELECT COALESCE(sum(total),0) FROM orders WHERE payment_status='approved') AS revenue`,
          )
        ).rows[0];
        return json({
          ...rows,
          revenue: Number(rows.revenue),
          development: !isProd(),
          flow_configured: flowConfigured(),
          recent_orders: (await listOrders(user, true)).slice(0, 6),
        });
      }
      if (route === 'admin/products' && method === 'GET')
        return json(await getProducts(true, url.searchParams));
      if (route === 'admin/products' && method === 'POST')
        return json(await saveProduct(user, await body(request)), 201);
      if (path[1] === 'products' && path[2]) {
        if (path.length === 3 && method === 'GET') return json(await getProduct(path[2], true));
        if (path.length === 3 && method === 'PATCH')
          return json(await saveProduct(user, await body(request), path[2]));
        if (path.length === 3 && method === 'DELETE') return json(await deleteProduct(path[2]));
        if (path[3] === 'publish' && method === 'POST') return json(await publishProduct(path[2]));
        if (path[3] === 'withdraw' && method === 'POST')
          return json(await withdrawProduct(path[2]));
      }
      if (route === 'admin/uploads' && method === 'POST')
        return json(await uploadImage(user, request), 201);
      if (route === 'admin/inventory' && method === 'POST')
        return json(await inventory(user, await body(request)));
      if (route === 'admin/inventory' && method === 'GET')
        return json(
          (
            await db.query(
              'SELECT m.*,p.name,p.sku FROM inventory_movements m JOIN products p ON p.id=m.product_id ORDER BY m.created_at DESC LIMIT 500',
            )
          ).rows,
        );
      if (route === 'admin/orders' && method === 'GET') return json(await listOrders(user, true));
      if (path[1] === 'orders' && path[2]) {
        if (path.length === 3 && method === 'GET') return json(await getOrder(path[2], user, true));
        if (path.length === 3 && method === 'PATCH') {
          const result = await updateDelivery(path[2], await body(request));
          after(() => flushMail());
          return json(result);
        }
        if (path[3] === 'refresh' && method === 'POST') {
          await refreshPayment(path[2]);
          after(() => flushMail());
          return json(await getOrder(path[2], user, true));
        }
      }
      if (route === 'admin/customers' && method === 'GET')
        return json(
          (await db.query('SELECT * FROM users ORDER BY created_at DESC LIMIT 1000')).rows.map(
            publicUser,
          ),
        );
      if (route === 'admin/posts' && method === 'GET') return json(await getPosts(true));
      if (route === 'admin/posts' && method === 'POST')
        return json(await savePost(await body(request)), 201);
      if (path[1] === 'posts' && path.length === 3 && method === 'PATCH')
        return json(await savePost(await body(request), path[2]));
      if (path[1] === 'posts' && path.length === 3 && method === 'DELETE')
        return json(await deletePost(path[2]));
      if (route === 'admin/settings' && method === 'PATCH')
        return json(await saveSettings(await body(request)));
      if (route === 'admin/pos' && method === 'POST')
        return json(await completePos(user, await body(request)), 201);
      if (route === 'admin/mail' && method === 'GET') {
        if (isProd()) fail(404, 'Esta herramienta solo está disponible en desarrollo.');
        return json(
          (
            await db.query(
              'SELECT id,recipient,subject,body,status,created_at FROM mail_outbox ORDER BY created_at DESC LIMIT 100',
            )
          ).rows,
        );
      }
    }
    fail(404, 'No encontramos esta página o acción.');
  } catch (e) {
    if (e instanceof ZodError)
      return json(
        { error: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') },
        400,
      );
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    const code = (e as any)?.code;
    if (code === '23505')
      return json({ error: 'Ya existe un registro con ese SKU, correo o identificador.' }, 409);
    if (code === '22P02')
      return json({ error: 'El identificador o un dato enviado no es válido.' }, 400);
    if (code === '23514')
      return json(
        { error: 'La operación deja cantidades o fechas fuera de los límites permitidos.' },
        409,
      );
    console.error('[sergod-api]', e instanceof Error ? e.message : 'Unexpected error');
    return json(
      {
        error:
          'No se pudo completar la operación. Inténtalo de nuevo; si el problema continúa, contacta a la tienda.',
      },
      500,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
