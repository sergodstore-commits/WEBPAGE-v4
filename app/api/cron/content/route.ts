import { authorizedContentCron, runDailyContent } from '@/lib/server/content-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!authorizedContentCron(request))
    return Response.json(
      { error: 'Solicitud no autorizada.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    return Response.json(await runDailyContent(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { error: 'No se completó la actualización. El contenido publicado se conserva.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
