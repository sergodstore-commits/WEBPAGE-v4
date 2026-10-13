import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';
import { AppError, body, fail, rateLimit, sameOrigin } from '@/lib/server/core';
import { runDailyContent } from '@/lib/server/content-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Exceptional operator recovery; the scheduled cron remains once per day.
export async function POST(request: Request) {
  try {
    const user = await requireUser(request, true);
    sameOrigin(request);
    if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production')
      fail(403, 'La actualización solo se ejecuta en producción.');
    z.object({})
      .strict()
      .parse(await body(request));
    await rateLimit(`content-recovery:${user.id}`, 3, 60);
    return Response.json(await runDailyContent({}, 220_000, true), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : 'No se completó la recuperación. El avance guardado se conserva.',
      },
      {
        status: error instanceof AppError ? error.status : error instanceof z.ZodError ? 400 : 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
