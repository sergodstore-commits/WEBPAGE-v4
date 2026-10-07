import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-league-selection-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test' });
test('Selección de ligas: ciclos, aislamiento de juegos, validación y persistencia', async (t) => {
  const { getDb, closeDb, migrate } = await import('../lib/server/db');
  const { publicRanking, publicLeagueResults, selectLeagueTournaments, listLeagueTournaments } =
    await import('../lib/server/rankings');
  const db = await getDb();
  t.after(closeDb);
  const era = Array.from({ length: 4 }, () => randomUUID()),
    block = randomUUID(),
    ygo = randomUUID();
  for (const [id, board, points] of [
    ...era.map((id, i) => [id, 'myl-first-era', (i + 1) * 3] as const),
    [block, 'myl-first-block', 100] as const,
    [ygo, 'yugioh', 200] as const,
  ]) {
    await db.query(
      `INSERT INTO league_tournaments(id,source,external_id,board,title,played_on) VALUES($1,$2,$5,$3,$4,'2026-10-07')`,
      [id, board === 'yugioh' ? 'file' : 'tor', board, `Liga ${board} ${id}`, id],
    );
    await db.query(
      "INSERT INTO league_results(tournament_id,player_key,name,position,points) VALUES($1,'same-player','Ana Jugadora',1,$2)",
      [id, points],
    );
  }
  await t.test('Las nuevas ligas no se suman hasta seleccionarlas', async () => {
    assert.deepEqual((await publicRanking('myl-first-era')).rows, []);
    assert.ok((await listLeagueTournaments()).every((t) => !t.included_in_ranking));
  });
  await t.test(
    'Actualizar desde la versión anterior conserva todos los puntos y selecciona sus ligas',
    async () => {
      const before = (
        await db.query(
          'SELECT tournament_id,player_key,name,position,points FROM league_results ORDER BY tournament_id,player_key',
        )
      ).rows;
      // This randomly named PGlite fixture models the schema before migration 011.
      await db.query('ALTER TABLE league_tournaments DROP COLUMN included_in_ranking');
      await db.query("DELETE FROM schema_migrations WHERE name='011_league_selection.sql'");
      await migrate(db);
      assert.deepEqual(
        (
          await db.query(
            'SELECT tournament_id,player_key,name,position,points FROM league_results ORDER BY tournament_id,player_key',
          )
        ).rows,
        before,
      );
      assert.ok((await listLeagueTournaments()).every((t) => t.included_in_ranking));
      assert.equal((await publicRanking('myl-first-era')).rows[0].points, 30);
      assert.equal((await publicRanking('myl-first-block')).rows[0].points, 100);
    },
  );
  await t.test('Una, dos y cuatro ligas aportan una vez y solo a Primera Era', async () => {
    await selectLeagueTournaments({ board: 'myl-first-block', tournament_ids: [block] });
    await selectLeagueTournaments({ board: 'yugioh', tournament_ids: [ygo] });
    for (const [count, points] of [
      [1, 3],
      [2, 9],
      [4, 30],
    ]) {
      await selectLeagueTournaments({
        board: 'myl-first-era',
        tournament_ids: era.slice(0, count),
      });
      const r = await publicRanking('myl-first-era');
      assert.equal(r.rows[0].points, points);
      assert.equal(r.rows[0].tournaments, count);
      assert.equal(r.tournaments.length, count);
    }
    assert.equal((await publicRanking('myl-first-block')).rows[0].points, 100);
    assert.equal((await publicRanking('yugioh')).rows[0].points, 200);
  });
  await t.test(
    'Repetir la selección no duplica puntos ni cambia resultados históricos',
    async () => {
      await selectLeagueTournaments({ board: 'myl-first-era', tournament_ids: era });
      assert.equal((await publicRanking('myl-first-era')).rows[0].points, 30);
      assert.equal((await publicLeagueResults('myl-first-era', era[0])).results[0].points, 3);
    },
  );
  await t.test(
    'No se admiten IDs desconocidos, repetidos o de otro ranking; rollback completo',
    async () => {
      for (const tournament_ids of [[era[0], block], [randomUUID()], [era[0], era[0]]])
        await assert.rejects(() =>
          selectLeagueTournaments({ board: 'myl-first-era', tournament_ids }),
        );
      assert.equal((await publicRanking('myl-first-era')).rows[0].points, 30);
      assert.equal((await publicRanking('myl-first-block')).rows[0].points, 100);
    },
  );
  await t.test('Desmarcar conserva los cuatro torneos y permite iniciar otro ciclo', async () => {
    await selectLeagueTournaments({ board: 'myl-first-era', tournament_ids: [] });
    const empty = await publicRanking('myl-first-era');
    assert.deepEqual(empty.rows, []);
    assert.deepEqual(empty.tournaments, []);
    assert.equal(
      (await listLeagueTournaments()).filter((t) => t.board === 'myl-first-era').length,
      4,
    );
    await selectLeagueTournaments({ board: 'myl-first-era', tournament_ids: [era[3]] });
    await closeDb();
    await getDb();
    assert.equal((await publicRanking('myl-first-era')).rows[0].points, 12);
    assert.equal((await publicRanking('myl-first-block')).rows[0].points, 100);
    assert.equal((await publicLeagueResults('myl-first-era', era[0])).results[0].points, 3);
  });
});
