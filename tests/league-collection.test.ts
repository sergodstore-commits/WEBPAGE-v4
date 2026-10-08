import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-league-collection-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test', TOR_STORE_ID: '501' });

test('Recolectar todos: guardado real, reintento, selección separada y archivo persistente', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const league = await import('../lib/server/rankings');
  const db = await getDb(),
    admin = randomUUID();
  await db.query(
    "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,'test','Admin','admin',true)",
    [admin, `${admin}@example.test`],
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://torneos.myl.cl')
      return new Response('<script src="/assets/index-test.js"></script>');
    if (url.endsWith('index-test.js'))
      return new Response('secret_key:"test-public",secret_iv:"test-public-iv"');
    const { operationName, variables } = JSON.parse(String(init?.body));
    const id = variables.input?.tournamentId ?? variables.id;
    if (operationName === 'TournamentInfo')
      return Response.json({
        data: {
          TournamentInfo: {
            status: { success: true },
            Tournament: {
              id,
              name: `Liga ${id}`,
              storeId: 501,
              startDate: '2026-10-01T19:00:00Z',
              statusId: 6,
              isPrivate: false,
              TournamentType: { name: 'Liga' },
              Game: { name: id === 2 ? 'Primer Bloque' : 'Primera Era' },
            },
          },
        },
      });
    if (operationName === 'allTournamentRounds')
      return Response.json({
        data: {
          allTournamentRounds: [
            {
              id: id * 10,
              sortOrder: 1,
              tournamentId: id,
              statusId: id === 3 ? 1 : 2,
              totalMatchPendings: 0,
            },
          ],
        },
      });
    return Response.json({
      data: {
        TournamentStanding: {
          status: { success: true },
          Standing: [
            {
              position: 1,
              points: 9,
              TournamentPlayer: { Person: { id: 1, fullName: 'Ana Prueba' } },
            },
          ],
        },
      },
    });
  };
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await closeDb();
  });
  const reports = [1, 2].map((n) => ({
    title: `Konami ${n}`,
    played_on: `2026-10-0${n}`,
    event_id: `E26-TEST-${n}`,
    text: 'Rangos\tID de Card Game\tNombre de Acceso\tVictoria\tEmpate\nGanador\t0000000001\tAna Prueba\t3\t0',
  }));
  let ygo: string[] = [];
  await t.test('Agrega varios archivos sin sumar, con lectura persistente', async () => {
    const r = await league.collectLeagueTournaments(admin, { source: 'file', reports });
    assert.deepEqual(
      r.results.map((r) => r.state),
      ['added', 'added'],
    );
    const saved = await league.listLeagueTournaments();
    ygo = saved.map((s) => s.id);
    assert.equal(saved.length, 2);
    assert.ok(saved.every((s) => !s.included_in_ranking && !s.archived));
    assert.equal((await league.publicRanking('yugioh')).rows.length, 0);
  });
  await t.test('Reintentar conserva resultados, títulos y selección, sin duplicar', async () => {
    await league.selectLeagueTournaments({ board: 'yugioh', tournament_ids: ygo });
    const r = await league.collectLeagueTournaments(admin, {
      source: 'file',
      reports: reports.map((p) => ({
        ...p,
        title: 'Título que no debe reemplazar',
        text: p.text.replace('\t3\t0', '\t4\t0'),
      })),
    });
    assert.deepEqual(
      r.results.map((r) => r.state),
      ['existing', 'existing'],
    );
    assert.equal((await league.publicRanking('yugioh')).rows[0].points, 18);
    assert.ok((await league.listLeagueTournaments()).every((s) => s.title.startsWith('Konami')));
  });
  await t.test(
    'TOR guarda ambas ligas por separado y continúa ante una ronda incompleta',
    async () => {
      const r = await league.collectLeagueTournaments(admin, { source: 'tor', ids: [1, 3, 2] });
      assert.deepEqual(
        r.results.map((r) => r.state),
        ['added', 'error', 'added'],
      );
      assert.match(r.results[1].error!, /última ronda/);
      const saved = await league.listLeagueTournaments();
      for (const board of ['myl-first-era', 'myl-first-block'] as const) {
        const ids = saved.filter((s) => s.board === board).map((s) => s.id);
        assert.equal(ids.length, 1);
        await league.selectLeagueTournaments({ board, tournament_ids: ids });
        assert.equal((await league.publicRanking(board)).rows[0].points, 9);
      }
      assert.equal((await league.publicRanking('yugioh')).rows[0].points, 18);
    },
  );
  await t.test(
    'Archivar quita puntos y lista activa, sobrevive a nueva consulta y se restaura sin sumar',
    async () => {
      await league.archiveLeagueTournament(ygo[0], { archived: true });
      assert.equal((await league.publicRanking('yugioh')).rows[0].points, 9);
      assert.equal((await league.publicLeagueResults('yugioh', ygo[0])).results.length, 1);
      const r = await league.collectLeagueTournaments(admin, { source: 'file', reports });
      assert.deepEqual(r.results.map((r) => r.state).sort(), ['archived', 'existing']);
      assert.ok((await league.listLeagueTournaments()).find((s) => s.id === ygo[0])?.archived);
      await assert.rejects(() =>
        league.selectLeagueTournaments({ board: 'yugioh', tournament_ids: ygo }),
      );
      await league.archiveLeagueTournament(ygo[0], { archived: false });
      assert.equal((await league.publicRanking('yugioh')).rows[0].points, 9);
      await league.selectLeagueTournaments({ board: 'yugioh', tournament_ids: ygo });
      assert.equal((await league.publicRanking('yugioh')).rows[0].points, 18);
    },
  );
  await t.test('Validaciones del servidor mantienen la lista cuando falla un reporte', async () => {
    const result = await league.collectLeagueTournaments(admin, {
      source: 'file',
      reports: [{ text: 'incorrecto' }, reports[0]],
    });
    assert.deepEqual(
      result.results.map((r) => r.state),
      ['error', 'existing'],
    );
    assert.equal((await league.listLeagueTournaments()).length, 4);
    await assert.rejects(() =>
      league.collectLeagueTournaments(admin, { source: 'tor', ids: [-1] }),
    );
    await assert.rejects(() =>
      league.collectLeagueTournaments(admin, { source: 'file', reports: [] }),
    );
  });
});
