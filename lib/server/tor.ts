import { createCipheriv, createHash } from 'node:crypto';
import { z } from 'zod';
import { fail } from './core';
import type { RankingBoard, LeagueResult, TorCandidate } from '../rankings';

const origin = 'https://torneos.myl.cl';
const endpoint = 'https://api2.myl.cl/graphql';
export const torStoreId = () =>
  z.coerce
    .number()
    .int()
    .positive()
    .parse(process.env.TOR_STORE_ID || 501);
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
let client: { key: string; iv: string; expires: number } | null = null;
async function read(url: string, limit: number, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  } catch {
    fail(502, 'TOR no respondió. Los rankings guardados se conservan. Intenta nuevamente.');
  }
  if (!response.ok)
    fail(502, 'TOR no pudo completar la consulta. Los datos guardados se conservan.');
  const reader = response.body?.getReader();
  if (!reader) fail(502, 'TOR devolvió una respuesta vacía.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      fail(502, 'La respuesta de TOR supera el tamaño permitido.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function headers() {
  if (!client || client.expires < Date.now()) {
    // Anonymous web-client context, obtained from TOR's public bootstrap; no user token.
    const html = await read(origin, 100000);
    const script = html.match(/<script[^>]+src=["'](\/assets\/index-[\w-]+\.js)["']/)?.[1];
    if (!script)
      fail(
        502,
        'El cliente público de TOR cambió. Revisa el adaptador; los rankings se conservan.',
      );
    const js = await read(origin + script, 4_000_000);
    const key = js.match(/secret_key:\s*["']([^"']+)["']/)?.[1],
      iv = js.match(/secret_iv:\s*["']([^"']+)["']/)?.[1];
    if (!key || !iv) fail(502, 'TOR cambió su contexto público. No se modificaron los rankings.');
    client = { key, iv, expires: Date.now() + 3600_000 };
  }
  const digest = (s: string, n: number) =>
    Buffer.from(createHash('sha512').update(s).digest('hex').slice(0, n));
  const cipher = createCipheriv('aes-256-cbc', digest(client.key, 32), digest(client.iv, 16));
  const context = Buffer.concat([
    cipher.update(`${origin}||${Date.now()}`),
    cipher.final(),
  ]).toString('base64');
  return {
    'Content-Type': 'application/json',
    Origin: origin,
    Referer: origin + '/',
    'app-referer': origin,
    'apollographql-client-name': 'myl-web-2025',
    'apollographql-client-version': '1.0.0',
    seck1: 'bk1k3',
    jiatan: context,
  };
}
async function query(operationName: string, query: string, variables: unknown) {
  let result: any;
  try {
    result = JSON.parse(
      await read(endpoint, 2_000_000, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ operationName, query, variables }),
      }),
    );
  } catch (e) {
    if (e instanceof SyntaxError) fail(502, 'TOR devolvió datos no válidos.');
    throw e;
  }
  if (result.errors?.length || !result.data) {
    client = null;
    fail(
      502,
      'La fuente pública de TOR no está disponible o cambió. Los rankings guardados se conservan.',
    );
  }
  return result.data;
}
export function torBoard(t: any): RankingBoard | null {
  if (
    t.isPrivate ||
    normalize(t.TournamentType?.name || '') !== 'liga' ||
    ![5, 6].includes(t.statusId)
  )
    return null;
  const game = normalize(t.Game?.name || '');
  return game === 'primera era'
    ? 'myl-first-era'
    : game === 'primer bloque'
      ? 'myl-first-block'
      : null;
}
function playedOn(value: string) {
  if (!Number.isFinite(Date.parse(value))) fail(502, 'TOR no entregó una fecha válida.');
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}
const listQuery = `query TournamentListV2($input:TournamentListInputV2!){TournamentListV2(input:$input){status{success} hasNextPage Tournaments{id name startDate statusId isPrivate Game{name} TournamentType{name} TournamentStatus{name}}}}`;
export async function discoverTor(page = 1): Promise<{
  next_page: number | null;
  store_id: number;
  tournaments: Omit<TorCandidate, 'imported' | 'revision'>[];
}> {
  const result = await query('TournamentListV2', listQuery, {
    input: {
      page,
      limit: 50,
      storeId: torStoreId(),
      typeId: 0,
      search: '',
      seasonId: 0,
      gameId: 0,
      statusId: [5, 6],
      isActiveSeason: 2,
    },
  });
  const list = result.TournamentListV2;
  if (!list?.status?.success || !Array.isArray(list.Tournaments))
    fail(502, 'TOR no entregó la lista de torneos.');
  return {
    next_page: list.hasNextPage ? page + 1 : null,
    store_id: torStoreId(),
    tournaments: list.Tournaments.flatMap((t: any) => {
      const board = torBoard(t);
      if (!board) return [];
      return [
        {
          external_id: String(z.number().int().positive().parse(t.id)),
          title: z.string().trim().min(1).max(180).parse(t.name),
          board,
          played_on: playedOn(t.startDate),
          status: t.TournamentStatus?.name || (t.statusId === 6 ? 'Reportado' : 'Terminado'),
        },
      ];
    }),
  };
}
export async function torFinal(tournamentId: number) {
  const data = await query(
    'TournamentInfo',
    `query TournamentInfo($input:TournamentInfoInput!){TournamentInfo(input:$input){status{success} Tournament{id name storeId startDate statusId isPrivate TournamentType{name} Game{name}}}}`,
    { input: { tournamentId } },
  );
  const t = data.TournamentInfo?.Tournament,
    board = torBoard(t || {});
  if (!data.TournamentInfo?.status?.success || !t) fail(404, 'TOR no encontró este torneo.');
  if (t.id !== tournamentId || t.storeId !== torStoreId() || !board)
    fail(
      400,
      'Solo se admiten Ligas públicas terminadas o reportadas de Store ' +
        torStoreId() +
        ', Primera Era o Primer Bloque.',
    );
  const rounds = (
    await query(
      'allTournamentRounds',
      `query allTournamentRounds($id:Int!){allTournamentRounds(filter:{tournamentId:$id},orderBy:sortOrder_ASC,paginate:999){id sortOrder tournamentId statusId totalMatchPendings}}`,
      { id: tournamentId },
    )
  ).allTournamentRounds;
  const roundSchema = z
    .array(
      z.object({
        id: z.number().int().positive(),
        sortOrder: z.number().int().positive(),
        tournamentId: z.literal(tournamentId),
        statusId: z.number().int(),
        totalMatchPendings: z.coerce.number().int().min(0),
      }),
    )
    .min(1)
    .max(999);
  const valid = roundSchema.safeParse(rounds);
  if (!valid.success) fail(502, 'TOR no entregó rondas válidas para este torneo.');
  const sorted = valid.data.sort((a, b) => b.sortOrder - a.sortOrder),
    last = sorted[0];
  if (new Set(sorted.map((r) => r.sortOrder)).size !== sorted.length)
    fail(502, 'TOR entregó números de ronda repetidos.');
  if (last.statusId !== 2 || last.totalMatchPendings !== 0)
    fail(
      400,
      'La última ronda todavía no está terminada y reportada. No se importaron resultados parciales.',
    );
  const response = await query(
    'TournamentStanding',
    `query TournamentStanding($input:TournamentStandingInput!){TournamentStanding(input:$input){status{success} Standing{position points TournamentPlayer{Person{id fullName}}}}}`,
    { input: { roundId: last.id, drop: true } },
  );
  const standings = response.TournamentStanding;
  if (
    !standings?.status?.success ||
    !Array.isArray(standings.Standing) ||
    !standings.Standing.length ||
    standings.Standing.length > 5000
  )
    fail(502, 'TOR no entregó un standing final completo.');
  const results: LeagueResult[] = standings.Standing.map((r: any) => {
    const p = r.TournamentPlayer?.Person;
    return {
      player_key: 'tor:' + z.number().int().positive().parse(p?.id),
      name: z.string().trim().min(1).max(180).parse(p?.fullName),
      position: z.number().int().min(1).max(5000).parse(r.position),
      points: z.number().int().min(0).max(100000).parse(r.points),
    };
  });
  if (new Set(results.map((r) => r.player_key)).size !== results.length)
    fail(502, 'TOR entregó jugadores repetidos. No se guardaron resultados.');
  return {
    source: 'tor' as const,
    external_id: String(t.id),
    board,
    title: z.string().trim().min(1).max(180).parse(t.name),
    played_on: playedOn(t.startDate),
    source_url: `${origin}/tournament/detail/${t.id}/liga`,
    round_id: last.id,
    final_round: last.sortOrder,
    results: results.sort((a, b) => a.position - b.position),
    warnings: [] as string[],
    file_hash: null,
  };
}
