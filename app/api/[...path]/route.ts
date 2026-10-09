import { after, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { getDb } from '@/lib/server/db';
import { moveReleasedPreorders } from '@/lib/server/preorder-release';
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
import { getWebNews, saveWebNews } from '@/lib/server/web-news';
import {
  commercialOrderStats,
  completePos,
  getOrder,
  listOrders,
  updateDelivery,
} from '@/lib/server/commerce';
import {
  checkout,
  expireOrders,
  flowConfigured,
  refreshPayment,
  verifyToken,
} from '@/lib/server/flow';
import { localImage, uploadImage } from '@/lib/server/storage';
import { localNewsVideo } from '@/lib/server/news-storage';
import {
  startInstagram,
  finishInstagram,
  instagramStatus,
  saveInstagramSettings,
  disconnectInstagram,
  reviewInstagram,
  importInstagram,
  listInstagramNews,
  editInstagramNews,
  deleteInstagramNews,
  publicNews,
  publicNewsThumbnail,
} from '@/lib/server/instagram';
import { flushMail } from '@/lib/server/mail';
import {
  rankingBoardSchema,
  publicRanking,
  publicLeagueResults,
  listLeagueTournaments,
  reviewTor,
  previewTor,
  previewRankingFile,
  commitRanking,
  deleteLeagueTournament,
  selectLeagueTournaments,
  collectLeagueTournaments,
  archiveLeagueTournament,
} from '@/lib/server/rankings';
import { torStoreId } from '@/lib/server/tor';
import { getDuelThresholds, saveDuelThresholds } from '@/lib/server/duel-academy';
import {
  startTwitch,
  finishTwitch,
  twitchStatus,
  disconnectTwitch,
  reviewTwitch,
  saveLive,
  saveTwitchVideo,
  deleteTwitchVideo,
  listTwitchVideos,
} from '@/lib/server/twitch';
import {
  youtubeSettings,
  reviewYouTube,
  saveYouTubeLive,
  finishYouTubeLive,
  saveYouTubeVideo,
  listYouTubeVideos,
  deleteYouTubeVideo,
  publicYouTubeTournaments,
} from '@/lib/server/youtube';
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
    if (path[0] === 'news-video' && path.length === 2 && method === 'GET')
      return localNewsVideo(path[1], request.headers.get('range'));
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
      const moved_preorders = await moveReleasedPreorders();
      await flushMail();
      const db = await getDb();
      await db.query('DELETE FROM sessions WHERE expires_at<now()');
      await db.query('DELETE FROM auth_tokens WHERE expires_at<now()');
      await db.query('DELETE FROM rate_limits WHERE expires_at<now()');
      return json({ ...result, moved_preorders });
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
      return json(
        await getPosts(
          false,
          url.searchParams.get('kind') || undefined,
          url.searchParams.has('from') || url.searchParams.has('to')
            ? { from: url.searchParams.get('from') || '', to: url.searchParams.get('to') || '' }
            : undefined,
        ),
      );
    if (route === 'news' && method === 'GET') return json(await publicNews());
    if (route === 'news/web-sources' && method === 'GET') return json(await getWebNews());
    if (path[0] === 'news' && path.length === 3 && path[2] === 'thumbnail' && method === 'GET') {
      const thumbnail = await publicNewsThumbnail(path[1]);
      return new Response(null, {
        status: 302,
        headers: {
          Location: thumbnail,
          'Cache-Control': 'public, max-age=60',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }
    if (route === 'tournaments' && method === 'GET') {
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(10000)
        .parse(url.searchParams.get('offset') || 0);
      return json(await publicYouTubeTournaments(offset));
    }
    if (route === 'rankings' && method === 'GET')
      return json(
        await publicRanking(
          rankingBoardSchema.parse(url.searchParams.get('board') || 'myl-first-era'),
        ),
      );
    if (path[0] === 'rankings' && path.length === 3 && method === 'GET')
      return json(await publicLeagueResults(rankingBoardSchema.parse(path[1]), path[2]));
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
      if (route === 'admin/integrations/instagram' && method === 'GET')
        return json(await instagramStatus());
      if (route === 'admin/integrations/instagram' && method === 'PATCH')
        return json(await saveInstagramSettings(await body(request)));
      if (route === 'admin/integrations/instagram/connect' && method === 'POST') {
        await rateLimit(`instagram-connect:${user.id}`, 10, 15);
        const result = await startInstagram(user.id),
          response = json({ url: result.url });
        response.headers.set('Set-Cookie', result.cookie);
        return response;
      }
      if (route === 'admin/integrations/instagram/callback' && method === 'GET') {
        let outcome = 'connected';
        try {
          await finishInstagram(user.id, request);
        } catch (e) {
          outcome =
            e instanceof AppError ? e.message : 'No se pudo completar la conexión de Instagram.';
        }
        const response = NextResponse.redirect(
          `${appUrl()}/admin/integraciones?${new URLSearchParams({ instagram: outcome })}`,
          303,
        );
        response.headers.set(
          'Set-Cookie',
          `sergod_instagram_state=; Path=/api/admin/integrations/instagram; HttpOnly; SameSite=Lax; Max-Age=0${appUrl().startsWith('https://') ? '; Secure' : ''}`,
        );
        return response;
      }
      if (route === 'admin/integrations/instagram/disconnect' && method === 'POST')
        return json(await disconnectInstagram());
      if (route === 'admin/integrations/instagram/review' && method === 'POST') {
        await rateLimit(`instagram-review:${user.id}`, 30, 15);
        const input = z
          .object({ cursor: z.string().max(1000).optional() })
          .parse(await body(request));
        return json(await reviewInstagram(user.id, input.cursor));
      }
      if (route === 'admin/news' && method === 'GET') return json(await listInstagramNews());
      if (route === 'admin/news/web-sources' && method === 'GET')
        return json(await getWebNews(true));
      if (route === 'admin/news/web-sources' && method === 'PATCH')
        return json(await saveWebNews(await body(request)));
      if (route === 'admin/news' && method === 'POST') {
        await rateLimit(`instagram-import:${user.id}`, 30, 15);
        return json(await importInstagram(user.id, await body(request)), 201);
      }
      if (path[1] === 'news' && path.length === 3 && method === 'PATCH')
        return json(await editInstagramNews(path[2], await body(request)));
      if (path[1] === 'news' && path.length === 3 && method === 'DELETE')
        return json(await deleteInstagramNews(path[2]));
      if (route === 'admin/integrations/tor' && method === 'GET')
        return json({ store_id: torStoreId() });
      if (route === 'admin/league' && method === 'GET') return json(await listLeagueTournaments());
      if (route === 'admin/league/academy' && method === 'GET')
        return json(await getDuelThresholds());
      if (route === 'admin/league/academy' && method === 'PATCH')
        return json(await saveDuelThresholds(await body(request)));
      if (route === 'admin/league/collect' && method === 'POST') {
        await rateLimit(`league-collect:${user.id}`, 300, 15);
        return json(await collectLeagueTournaments(user.id, await body(request)));
      }
      if (
        path[1] === 'league' &&
        path.length === 3 &&
        path[2] !== 'selection' &&
        method === 'PATCH'
      )
        return json(await archiveLeagueTournament(path[2], await body(request)));
      if (route === 'admin/league/selection' && method === 'PATCH') {
        await rateLimit(`league:${user.id}`, 60, 15);
        return json(await selectLeagueTournaments(await body(request)));
      }
      if (route.startsWith('admin/league/') && method === 'POST') {
        await rateLimit(`league:${user.id}`, 60, 15);
        const input = await body(request);
        if (route === 'admin/league/tor/review')
          return json(
            await reviewTor(
              z
                .number()
                .int()
                .min(1)
                .max(1000)
                .parse(input.page || 1),
            ),
          );
        if (route === 'admin/league/tor/preview')
          return json(await previewTor(user.id, input.tournament_id));
        if (route === 'admin/league/file/preview')
          return json(await previewRankingFile(user.id, input));
        if (route === 'admin/league/commit') return json(await commitRanking(user.id, input));
      }
      if (path[1] === 'league' && path.length === 3 && method === 'DELETE')
        return json(await deleteLeagueTournament(path[2]));
      if (route === 'admin/integrations/twitch' && method === 'GET')
        return json(await twitchStatus());
      if (route === 'admin/integrations/youtube' && method === 'GET')
        return json(await youtubeSettings());
      if (route === 'admin/integrations/youtube/review' && method === 'POST') {
        await rateLimit(`youtube-review:${user.id}`, 30, 15);
        return json(await reviewYouTube(await body(request)));
      }
      if (route === 'admin/integrations/youtube/live' && method === 'PATCH')
        return json(await saveYouTubeLive(await body(request)));
      if (route === 'admin/integrations/youtube/finish' && method === 'POST')
        return json(await finishYouTubeLive(await body(request)));
      if (route === 'admin/youtube/transmissions' && method === 'GET')
        return json(await listYouTubeVideos());
      if (route === 'admin/youtube/transmissions' && method === 'POST')
        return json(await saveYouTubeVideo(await body(request)), 201);
      if (
        path[1] === 'youtube' &&
        path[2] === 'transmissions' &&
        path.length === 4 &&
        method === 'PATCH'
      )
        return json(await saveYouTubeVideo(await body(request), path[3]));
      if (
        path[1] === 'youtube' &&
        path[2] === 'transmissions' &&
        path.length === 4 &&
        method === 'DELETE'
      )
        return json(await deleteYouTubeVideo(path[3]));
      if (route === 'admin/integrations/twitch/connect' && method === 'POST') {
        await rateLimit(`twitch-connect:${user.id}`, 10, 15);
        const result = await startTwitch(user.id);
        const response = json({ url: result.url });
        response.headers.set('Set-Cookie', result.cookie);
        return response;
      }
      if (route === 'admin/integrations/twitch/callback' && method === 'GET') {
        let outcome = 'connected';
        try {
          await finishTwitch(user.id, request);
        } catch (e) {
          outcome =
            e instanceof AppError
              ? e.message
              : 'No se pudo completar la conexión. Intenta nuevamente.';
        }
        const response = NextResponse.redirect(
          `${appUrl()}/admin/integraciones?${new URLSearchParams({ twitch: outcome })}`,
          303,
        );
        response.headers.set(
          'Set-Cookie',
          `sergod_twitch_state=; Path=/api/admin/integrations/twitch; HttpOnly; SameSite=Lax; Max-Age=0${appUrl().startsWith('https://') ? '; Secure' : ''}`,
        );
        return response;
      }
      if (route === 'admin/integrations/twitch/disconnect' && method === 'POST')
        return json(await disconnectTwitch());
      if (route === 'admin/integrations/twitch/review' && method === 'POST') {
        await rateLimit(`twitch-review:${user.id}`, 30, 15);
        const input = z
          .object({ cursor: z.string().max(500).optional() })
          .parse(await body(request));
        return json(await reviewTwitch(input.cursor));
      }
      if (route === 'admin/integrations/twitch/live' && method === 'PATCH')
        return json(await saveLive(await body(request)));
      if (route === 'admin/transmissions' && method === 'GET')
        return json(await listTwitchVideos());
      if (route === 'admin/transmissions' && method === 'POST')
        return json(await saveTwitchVideo(await body(request)), 201);
      if (path[1] === 'transmissions' && path.length === 3 && method === 'PATCH')
        return json(await saveTwitchVideo(await body(request), path[2]));
      if (path[1] === 'transmissions' && path.length === 3 && method === 'DELETE')
        return json(await deleteTwitchVideo(path[2]));
      if (route === 'admin/dashboard' && method === 'GET') {
        const rows = (
          await db.query(
            `SELECT (SELECT count(*) FROM products WHERE deleted_at IS NULL)::integer AS products,(SELECT count(*) FROM products WHERE deleted_at IS NULL AND stock-reserved<=3)::integer AS low_stock`,
          )
        ).rows[0];
        return json({
          ...rows,
          ...(await commercialOrderStats()),
          development: !isProd(),
          flow_configured: flowConfigured(),
          recent_orders: (await listOrders(user, true))
            .filter((o) => o.payment_environment !== 'sandbox')
            .slice(0, 6),
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
        if (path[3] === 'publish' && method === 'POST') {
          const input = z
            .object({ expected_version: z.number().int().min(1).optional() })
            .parse(await body(request));
          return json(await publishProduct(path[2], input.expected_version));
        }
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
      if (route === 'admin/posts' && method === 'GET')
        return json(await getPosts(true, url.searchParams.get('kind') || undefined));
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
