import { z } from 'zod';
import { getDb } from './db';
import { fail, uuid } from './core';
import { discoverTor, torFinal } from './tor';
import { parseRankingFile } from './ranking-files';
import type { LeaguePreview, LeagueTournament, RankingBoard, PublicRanking } from '../rankings';
export const rankingBoardSchema = z.enum(['myl-first-era', 'myl-first-block', 'yugioh']);
const tournamentId = z.number().int().positive().max(2147483647);
type Snapshot = ReturnType<typeof parseRankingFile> | Awaited<ReturnType<typeof torFinal>>;
const columns = `t.id,t.source,t.external_id,t.board,t.title,t.played_on::text,t.source_url,t.round_id,t.final_round,t.revision,t.updated_at,t.included_in_ranking,(SELECT count(*)::int FROM league_results r WHERE r.tournament_id=t.id) players`;
export async function listLeagueTournaments(): Promise<LeagueTournament[]> {
  return (
    await (
      await getDb()
    ).query(`SELECT ${columns} FROM league_tournaments t ORDER BY played_on DESC,created_at DESC`)
  ).rows;
}
export async function reviewTor(page = 1) {
  const r = await discoverTor(page),
    saved = await listLeagueTournaments();
  return {
    ...r,
    tournaments: r.tournaments.map((t) => {
      const old = saved.find((s) => s.source === 'tor' && s.external_id === t.external_id);
      return { ...t, imported: Boolean(old), revision: old?.revision || 0 };
    }),
  };
}
async function stage(adminId: string, snapshot: Snapshot): Promise<LeaguePreview> {
  const db = await getDb();
  const old = (
    await db.query('SELECT revision FROM league_tournaments WHERE source=$1 AND external_id=$2', [
      snapshot.source,
      snapshot.external_id,
    ])
  ).rows[0];
  const payload = { ...snapshot, base_revision: old?.revision || 0 };
  const id = uuid();
  return db.transaction(async (tx) => {
    await tx.query('DELETE FROM league_previews WHERE expires_at<now()');
    const r = (
      await tx.query(
        'INSERT INTO league_previews(id,admin_id,payload) VALUES($1,$2,$3) RETURNING expires_at',
        [id, adminId, JSON.stringify(payload)],
      )
    ).rows[0];
    return { id, ...payload, expires_at: r.expires_at };
  });
}
export const previewTor = async (adminId: string, id: unknown) =>
  stage(adminId, await torFinal(tournamentId.parse(id)));
export const previewRankingFile = async (adminId: string, input: unknown) =>
  stage(adminId, parseRankingFile(input));
export async function commitRanking(adminId: string, input: unknown): Promise<LeagueTournament> {
  const d = z.object({ preview_id: z.uuid(), replace: z.boolean().default(false) }).parse(input);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const preview = (
      await tx.query(
        'SELECT payload FROM league_previews WHERE id=$1 AND admin_id=$2 AND expires_at>now() FOR UPDATE',
        [d.preview_id, adminId],
      )
    ).rows[0];
    if (!preview)
      fail(410, 'La vista previa venció o ya se guardó. Revisa los resultados nuevamente.');
    const p = preview.payload as LeaguePreview;
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `league:${p.source}:${p.external_id}`,
    ]);
    const old = (
      await tx.query(
        'SELECT id,revision FROM league_tournaments WHERE source=$1 AND external_id=$2 FOR UPDATE',
        [p.source, p.external_id],
      )
    ).rows[0];
    if ((old?.revision || 0) !== p.base_revision)
      fail(409, 'Este torneo cambió desde la vista previa. Revisa nuevamente antes de guardar.');
    if (old && !d.replace)
      fail(
        409,
        'Este torneo ya está agregado. Utiliza Actualizar resultados para reemplazarlos sin duplicar puntos.',
      );
    if (!old && d.replace)
      fail(409, 'El torneo ya no está guardado. Crea una nueva vista previa para agregarlo.');
    if (p.file_hash) {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`league-file:${p.file_hash}`]);
      if (
        (
          await tx.query('SELECT id FROM league_tournaments WHERE file_hash=$1 AND id<>$2', [
            p.file_hash,
            old?.id || uuid(),
          ])
        ).rows.length
      )
        fail(
          409,
          'Este mismo standing y fecha ya están guardados en otro torneo. No se duplicaron puntos.',
        );
    }
    const id = old?.id || uuid();
    await tx.query(
      `INSERT INTO league_tournaments(id,source,external_id,board,title,played_on,source_url,round_id,final_round,file_hash,included_in_ranking)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET board=EXCLUDED.board,title=EXCLUDED.title,played_on=EXCLUDED.played_on,source_url=EXCLUDED.source_url,round_id=EXCLUDED.round_id,final_round=EXCLUDED.final_round,file_hash=EXCLUDED.file_hash,revision=league_tournaments.revision+1,updated_at=now()`,
      [
        id,
        p.source,
        p.external_id,
        p.board,
        p.title,
        p.played_on,
        p.source_url,
        p.round_id,
        p.final_round,
        p.file_hash,
        p.source === 'file',
      ],
    );
    await tx.query('DELETE FROM league_results WHERE tournament_id=$1', [id]);
    await tx.query(
      `INSERT INTO league_results(tournament_id,player_key,name,position,points)
   SELECT $1,player_key,name,position,points FROM jsonb_to_recordset($2::jsonb) AS x(player_key text,name text,position integer,points integer)`,
      [id, JSON.stringify(p.results)],
    );
    await tx.query('DELETE FROM league_previews WHERE id=$1', [d.preview_id]);
    return (await tx.query(`SELECT ${columns} FROM league_tournaments t WHERE t.id=$1`, [id]))
      .rows[0];
  });
}
export async function deleteLeagueTournament(id: unknown) {
  const key = z.uuid().parse(id);
  await (
    await getDb()
  ).transaction(async (tx) => {
    const old = (
      await tx.query('SELECT source,external_id FROM league_tournaments WHERE id=$1', [key])
    ).rows[0];
    if (!old) fail(404, 'Torneo no encontrado.');
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `league:${old.source}:${old.external_id}`,
    ]);
    await tx.query('DELETE FROM league_tournaments WHERE id=$1', [key]);
  });
  return { ok: true };
}
export async function publicRanking(board: RankingBoard): Promise<PublicRanking> {
  const db = await getDb();
  // One statement keeps totals and contributing tournaments in one snapshot.
  const result = (
    await db.query(
      `WITH selected AS (SELECT * FROM league_tournaments WHERE board=$1 AND included_in_ranking), players AS (
  SELECT r.player_key,(array_agg(r.name ORDER BY t.played_on DESC,t.updated_at DESC,t.id))[1] name,
  count(*)::int tournaments,sum(r.points)::int points
  FROM league_results r JOIN selected t ON t.id=r.tournament_id GROUP BY r.player_key
 ), ranked AS (SELECT dense_rank() OVER(ORDER BY points DESC)::int position,* FROM players)
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('position',position,'name',name,'tournaments',tournaments,'points',points) ORDER BY points DESC,lower(name),player_key) FROM ranked),'[]'::jsonb) rows,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'played_on',played_on::text,'source_url',source_url,'final_round',final_round) ORDER BY played_on DESC,id) FROM selected),'[]'::jsonb) tournaments,
 (SELECT max(updated_at) FROM league_tournaments WHERE board=$1) updated_at`,
      [board],
    )
  ).rows[0];
  return { board, ...result };
}
export async function selectLeagueTournaments(input: unknown) {
  const d = z
    .object({ board: rankingBoardSchema, tournament_ids: z.array(z.uuid()).max(5000) })
    .parse(input);
  if (new Set(d.tournament_ids).size !== d.tournament_ids.length)
    fail(400, 'La selección contiene torneos repetidos.');
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`league-selection:${d.board}`]);
    const known = (
      await tx.query('SELECT id FROM league_tournaments WHERE board=$1 ORDER BY id FOR UPDATE', [
        d.board,
      ])
    ).rows;
    const knownIds = new Set(known.map((t) => t.id));
    if (d.tournament_ids.some((id) => !knownIds.has(id)))
      fail(400, 'Hay torneos que ya no existen o pertenecen a otro ranking. Recarga la lista.');
    await tx.query(
      `UPDATE league_tournaments SET included_in_ranking=(id=ANY($2::uuid[])),updated_at=now()
      WHERE board=$1 AND included_in_ranking IS DISTINCT FROM (id=ANY($2::uuid[]))`,
      [d.board, d.tournament_ids],
    );
  });
  return { board: d.board, tournament_ids: d.tournament_ids };
}
export async function publicLeagueResults(board: RankingBoard, id: unknown) {
  const key = z.uuid().parse(id),
    db = await getDb();
  const t = (
    await db.query(
      'SELECT id,title,played_on::text,source_url,final_round FROM league_tournaments WHERE id=$1 AND board=$2',
      [key, board],
    )
  ).rows[0];
  if (!t) fail(404, 'Este torneo no está disponible en este ranking.');
  return {
    ...t,
    results: (
      await db.query(
        'SELECT name,position,points FROM league_results WHERE tournament_id=$1 ORDER BY position,name',
        [key],
      )
    ).rows,
  };
}
