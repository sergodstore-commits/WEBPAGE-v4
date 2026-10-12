import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { rm } from 'node:fs/promises';
const root = path.resolve('.data'),
  dir = path.join(root, `test-ranking-standings-${randomUUID()}`);
process.env.LOCAL_DATA_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test' });

test('Las tres ligas usan standings, puestos consecutivos y solo torneos seleccionados; el historial no cambia', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { publicRanking, selectLeagueTournaments, archiveLeagueTournament } =
    await import('../lib/server/rankings');
  const db = await getDb();
  t.after(async () => {
    await closeDb();
    assert.equal(path.dirname(dir), root);
    await rm(dir, { recursive: true, force: true });
  });
  for (const board of ['myl-first-era', 'myl-first-block', 'yugioh'] as const) {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of ids.entries()) {
      await db.query(
        'INSERT INTO league_tournaments(id,source,external_id,board,title,played_on,included_in_ranking) VALUES($1,$2,$6,$3,$3,$4,$5)',
        [
          id,
          board === 'yugioh' ? 'file' : 'tor',
          board,
          index === 0 ? '2026-10-01' : '2026-10-08',
          index < 2,
          id,
        ],
      );
      const positions = index === 0 ? [1, 2, 3, 4] : [2, 1, 4, 3];
      for (const [i, name] of ['Ana', 'Zoe', 'Abel', 'Tina'].entries())
        await db.query(
          'INSERT INTO league_results(tournament_id,player_key,name,position,points) VALUES($1,$2,$3,$4,$5)',
          [
            id,
            `private-${board}-${i}`,
            name,
            positions[i],
            index === 2 ? 999 : i === 3 ? (index === 0 ? 0 : 15) : 6,
          ],
        );
    }
    const snapshot = (
      await db.query(
        'SELECT * FROM league_results WHERE tournament_id=ANY($1::uuid[]) ORDER BY tournament_id,player_key',
        [ids],
      )
    ).rows;
    const ranking = await publicRanking(board);
    assert.deepEqual(
      ranking.rows.map((r) => [r.name, r.position, r.points]),
      [
        ['Tina', 1, 15],
        ['Zoe', 2, 12],
        ['Ana', 3, 12],
        ['Abel', 4, 12],
      ],
    );
    assert.ok(!ranking.rows.some((r) => r.provisional));
    assert.ok(!JSON.stringify(ranking).includes('private-'));
    assert.equal(ranking.rows[0].contributions?.length, board === 'yugioh' ? 2 : undefined);
    await selectLeagueTournaments({ board, tournament_ids: [ids[0]] });
    assert.deepEqual(
      (await publicRanking(board)).rows.map((r) => r.name),
      ['Ana', 'Zoe', 'Abel', 'Tina'],
    );
    await selectLeagueTournaments({ board, tournament_ids: ids.slice(0, 2) });
    await archiveLeagueTournament(ids[0], { archived: true });
    assert.deepEqual(
      (await publicRanking(board)).rows.map((r) => r.name),
      ['Tina', 'Zoe', 'Ana', 'Abel'],
    );
    assert.deepEqual(
      (
        await db.query(
          'SELECT * FROM league_results WHERE tournament_id=ANY($1::uuid[]) ORDER BY tournament_id,player_key',
          [ids],
        )
      ).rows,
      snapshot,
    );
    await archiveLeagueTournament(ids[0], { archived: false });
    await selectLeagueTournaments({ board, tournament_ids: ids.slice(0, 2) });
  }
  await closeDb();
  await getDb();
  assert.deepEqual(
    (await publicRanking('yugioh')).rows.map((r) => r.name),
    ['Tina', 'Zoe', 'Ana', 'Abel'],
  );
});
