import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-rankings-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test' });
process.env.TOR_STORE_ID = '501';

test('Archivos de ranking: CSV/TSV, encabezados, identidades y errores explícitos', async () => {
  const { parseRankingFile } = await import('../lib/server/ranking-files');
  const base = { title: 'Liga prueba', played_on: '2026-10-07' };
  const r = parseRankingFile({
    ...base,
    text: '\uFEFFPosición;Jugador;Puntos;Konami ID\r\n1;"Ana, \"\"A\"\"";9;0000000001\r\n2;José Pérez;6;0000000002',
  });
  assert.equal(r.results[0].name, 'Ana, "A"');
  assert.equal(r.results[1].points, 6);
  assert.equal(r.warnings.length, 0);
  const tab = parseRankingFile({
    ...base,
    text: 'First Name\tLast Name\tMatch Points\nAna\tPérez\t12\n李\t王\t6',
  });
  assert.equal(tab.results[0].name, 'Ana Pérez');
  assert.equal(tab.warnings.length, 2);
  assert.equal(
    parseRankingFile({ ...base, text: 'Jugador,Puntos\nJosé Pérez,9' }).results[0].player_key,
    parseRankingFile({ ...base, text: 'Jugador,Puntos\nJose Perez,12' }).results[0].player_key,
  );
  assert.notEqual(tab.results[0].player_key, tab.results[1].player_key);
  for (const text of [
    'Jugador,Puntos\nAna,-3',
    'Jugador,Puntos\nAna,1.5',
    'Jugador,Puntos\nAna,9\nAna,6',
    'Nombre,Jugador,Puntos\nAna,Ana,9',
    'Jugador,Puntos\n"Ana,9',
    'Jugador,Puntos\n"Ana"oops,9',
    'Jugador,Puntos\nAna,9,extra',
    'Jugador,Puntos,ID\nAna,9,',
  ])
    assert.throws(() => parseRankingFile({ ...base, text }));
});

test('CSV Konami: preámbulo, Ganador, ceros del ID y puntos definidos explícitamente', async () => {
  const { parseRankingFile } = await import('../lib/server/ranking-files');
  const base = {
    title: 'Torneo CSV Konami',
    played_on: '2026-10-07',
    text: 'Lista de Resultados del Torneo,E26-TEST,\n,,\nRangos,El ID de Card Game,Nombre de Acceso\nGanador,0000000001,Ana P?rez\n2,0000000002,Juan Canto\n',
  };
  assert.throws(() => parseRankingFile(base), /no incluye puntos/);
  assert.throws(() => parseRankingFile({ ...base, position_points: '1=10' }), /puesto 2/);
  assert.throws(() => parseRankingFile({ ...base, position_points: '1=10\n1=8\n2=0' }), /únicos/);
  assert.throws(() => parseRankingFile({ ...base, position_points: '1=-1\n2=0' }), /enteros/);
  assert.throws(
    () => parseRankingFile({ ...base, event_id: 'OTRO', position_points: '1=10\n2=0' }),
    /no coincide/,
  );
  const parsed = parseRankingFile({ ...base, position_points: '1=10\n2=0' });
  assert.equal(parsed.external_id, 'E26-TEST');
  assert.deepEqual(
    parsed.results.map(({ name, position, points }) => ({ name, position, points })),
    [
      { name: 'Ana P?rez', position: 1, points: 10 },
      { name: 'Juan Canto', position: 2, points: 0 },
    ],
  );
  assert.equal(parsed.warnings.length, 2);
  const ordinary = parseRankingFile({
    ...base,
    text: 'Posicion,Jugador,Puntos,Konami ID\n1,Ana P?rez,10,0000000001\n2,Juan Canto,0,0000000002',
  });
  assert.deepEqual(parsed.results, ordinary.results);
  const withoutZeros = parseRankingFile({
    ...base,
    position_points: '1=10\n2=0',
    text: base.text.replace('0000000001', '1'),
  });
  assert.notEqual(parsed.results[0].player_key, withoutZeros.results[0].player_key);
  assert.throws(
    () => parseRankingFile({ ...base, text: 'Jugador,Puntos\nAna,8', position_points: '1=10' }),
    /ya incluye puntos/,
  );
});

test('Tabla Konami: tres puntos por victoria, pérdidas sin puntos y puestos conservados', async () => {
  const { parseRankingFile } = await import('../lib/server/ranking-files');
  const base = {
    title: 'Tabla Konami',
    played_on: '2026-10-03',
    text: 'Rangos\tID de Card Game\tNombre de Acceso\tVictoria\tDerrota\tEmpate\tTie-Breaker\nGanador\t0000000001\tAna\t4\t0\t0\t125625310000\n2\t0000000002\tBruno\t3\t1\t0\t95005310001\n3\t0000000003\tCarla\t3\t1\t0\t93755460004\n4\t0000000004\tDaniel\t0\t4\t0\t4374210030',
  };
  const result = parseRankingFile(base);
  assert.deepEqual(
    result.results.map((r) => [r.position, r.points]),
    [
      [1, 12],
      [2, 9],
      [3, 9],
      [4, 0],
    ],
  );
  assert.match(result.warnings[0], /3 puntos por victoria/);
  assert.equal(result.warnings.length, 1);
  assert.throws(
    () => parseRankingFile({ ...base, position_points: '1=99' }),
    /ya incluye puntos o victorias/,
  );
  assert.throws(
    () =>
      parseRankingFile({ ...base, text: base.text.replace('\t3\t1\t0\t950', '\t3\t1\t1\t950') }),
    /no admite empates/,
  );
  for (const value of ['-1', '1.5', '=4', '', '33334'])
    assert.throws(
      () =>
        parseRankingFile({
          ...base,
          text: base.text.replace('\t4\t0\t0\t125', `\t${value}\t0\t0\t125`),
        }),
      /victorias/,
    );
});

test('Liga: TOR dinámico, snapshots, duplicados, correcciones, aislamiento y persistencia', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const league = await import('../lib/server/rankings');
  const { torBoard } = await import('../lib/server/tor');
  const db = await getDb(),
    admin = randomUUID(),
    other = randomUUID();
  for (const id of [admin, other])
    await db.query(
      "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,'test','Admin','admin',true)",
      [id, `${id}@example.test`],
    );
  const realFetch = globalThis.fetch;
  let calls = 0,
    failed = false,
    correction = 12;
  const askedRounds: number[] = [];
  const meta = (id: number) => ({
    id,
    name: `Nombre variable ${id}`,
    storeId: id === 7999 ? 999 : 501,
    startDate: '2026-10-02T03:00:00Z',
    statusId: 6,
    isPrivate: false,
    TournamentType: { name: 'Liga' },
    Game: { name: id === 7003 ? 'Primer Bloque' : 'Primera Era' },
  });
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = String(input);
    if (failed) return new Response('Unavailable', { status: 503 });
    if (url === 'https://torneos.myl.cl')
      return new Response('<script src="/assets/index-public.js"></script>');
    if (url.endsWith('index-public.js'))
      return new Response(
        'const context={secret_key:"public-test-context",secret_iv:"public-test-iv"}',
      );
    assert.equal(url, 'https://api2.myl.cl/graphql');
    const { operationName, variables } = JSON.parse(String(init?.body));
    assert.ok(new Headers(init?.headers).get('jiatan'));
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    if (operationName === 'TournamentListV2') {
      assert.equal(variables.input.storeId, 501);
      return Response.json({
        data: {
          TournamentListV2: {
            status: { success: true },
            hasNextPage: variables.input.page === 1,
            Tournaments: [
              meta(7001),
              meta(7002),
              meta(7003),
              { ...meta(7010), TournamentType: { name: 'Casual' } },
              { ...meta(7011), statusId: 2 },
              { ...meta(7012), isPrivate: true },
            ],
          },
        },
      });
    }
    if (operationName === 'TournamentInfo')
      return Response.json({
        data: {
          TournamentInfo: {
            status: { success: true },
            Tournament: meta(variables.input.tournamentId),
          },
        },
      });
    if (operationName === 'allTournamentRounds') {
      const id = variables.id,
        orders = id === 7002 ? [6, 1, 7] : [2, 1, 3];
      return Response.json({
        data: {
          allTournamentRounds: orders.map((sortOrder) => ({
            id: id * 10 + sortOrder,
            sortOrder,
            tournamentId: id,
            statusId: id === 7004 && sortOrder === 3 ? 1 : 2,
            totalMatchPendings: '0',
          })),
        },
      });
    }
    if (operationName === 'TournamentStanding') {
      const round = variables.input.roundId;
      askedRounds.push(round);
      assert.equal(variables.input.drop, true);
      const id = Math.floor(round / 10);
      return Response.json({
        data: {
          TournamentStanding: {
            status: { success: true },
            Standing: [
              {
                position: 1,
                points: id === 7001 ? correction : 9,
                TournamentPlayer: { Person: { id: 101, fullName: 'Ana Competidora' } },
              },
              {
                position: 2,
                points: 6,
                TournamentPlayer: { Person: { id: 102, fullName: 'Bruno Competidor' } },
              },
            ],
          },
        },
      });
    }
    throw Error('Unexpected TOR operation');
  };
  t.after(async () => {
    globalThis.fetch = realFetch;
    await closeDb();
  });
  let first: any, second: any;
  await t.test(
    'Revisar no escribe, filtros estructurados y última ronda variable (3 y 7)',
    async () => {
      assert.equal(torBoard({ ...meta(1), Game: { name: 'Otro juego' } }), null);
      const review = await league.reviewTor();
      assert.equal(review.tournaments.length, 3);
      assert.equal(review.next_page, 2);
      assert.equal((await league.listLeagueTournaments()).length, 0);
      const preview = await league.previewTor(admin, 7001);
      assert.equal(preview.final_round, 3);
      assert.equal(preview.results[0].points, 12);
      await assert.rejects(() => league.commitRanking(other, { preview_id: preview.id }), /venció/);
      first = await league.commitRanking(admin, { preview_id: preview.id });
      assert.equal(first.included_in_ranking, false);
      await assert.rejects(
        () => league.commitRanking(admin, { preview_id: preview.id }),
        /ya se guardó/,
      );
      const p2 = await league.previewTor(admin, 7002);
      assert.equal(p2.final_round, 7);
      second = await league.commitRanking(admin, { preview_id: p2.id });
      await league.selectLeagueTournaments({
        board: 'myl-first-era',
        tournament_ids: [first.id, second.id],
      });
      assert.deepEqual(askedRounds, [70013, 70027]);
      const before = calls,
        r = await league.publicRanking('myl-first-era');
      assert.equal(calls, before);
      assert.equal(r.rows[0].points, 21);
      assert.equal(r.rows[0].tournaments, 2);
      assert.equal((await league.reviewTor()).tournaments[0].imported, true);
      const duplicate = await league.previewTor(admin, 7001);
      await assert.rejects(
        () => league.commitRanking(admin, { preview_id: duplicate.id }),
        /ya está agregado/,
      );
    },
  );
  await t.test(
    'Actualizar reemplaza; vistas previas obsoletas o vencidas no modifican el ranking',
    async () => {
      const stale = await league.previewTor(admin, 7001);
      correction = 3;
      const update = await league.previewTor(admin, 7001);
      const edited = await league.commitRanking(admin, { preview_id: update.id, replace: true });
      assert.equal(edited.revision, 2);
      assert.equal(
        (await league.publicRanking('myl-first-era')).rows.find((r) => r.name === 'Ana Competidora')
          ?.points,
        12,
      );
      await assert.rejects(
        () => league.commitRanking(admin, { preview_id: stale.id, replace: true }),
        /cambió/,
      );
      const expired = await league.previewTor(admin, 7001);
      await db.query(
        "UPDATE league_previews SET expires_at=now()-interval '1 minute' WHERE id=$1",
        [expired.id],
      );
      await assert.rejects(
        () => league.commitRanking(admin, { preview_id: expired.id, replace: true }),
        /venció/,
      );
      await assert.rejects(() => league.previewTor(admin, 7999), /Store 501/);
      await assert.rejects(() => league.previewTor(admin, 7004), /última ronda/);
      failed = true;
      await assert.rejects(() => league.previewTor(admin, 7001), /TOR/);
      failed = false;
      assert.equal(
        (await league.publicRanking('myl-first-era')).rows.find((r) => r.name === 'Ana Competidora')
          ?.points,
        12,
      );
    },
  );
  await t.test('Primera Era, Primer Bloque y Yu-Gi-Oh! separados; IDs nunca públicos', async () => {
    const pb = await league.previewTor(admin, 7003);
    const block = await league.commitRanking(admin, { preview_id: pb.id });
    await league.selectLeagueTournaments({ board: 'myl-first-block', tournament_ids: [block.id] });
    const f = await league.previewRankingFile(admin, {
      title: 'Liga Yu-Gi-Oh!',
      played_on: '2026-10-07',
      event_id: 'KC-10',
      text: 'Jugador,Puntos,Konami ID\nAna Competidora,15,0000000101\nCarla Jugadora,15,0000000102',
    });
    await league.commitRanking(admin, { preview_id: f.id });
    const ygo = await league.publicRanking('yugioh');
    assert.equal(ygo.rows[0].points, 15);
    assert.equal(ygo.rows[0].position, 1);
    assert.equal(ygo.rows[1].position, 1);
    assert.equal(ygo.rows[0].tournaments, 1);
    assert.equal((await league.publicRanking('myl-first-block')).rows[0].points, 9);
    assert.ok(!JSON.stringify(ygo).includes('0000000101'));
    assert.ok(!JSON.stringify(ygo).includes('player_key'));
    const details = await league.publicLeagueResults('yugioh', ygo.tournaments[0].id);
    assert.equal(details.results.length, 2);
    assert.ok(!JSON.stringify(details).includes('player_key'));
    await assert.rejects(
      () => league.publicLeagueResults('myl-first-era', ygo.tournaments[0].id),
      /no está disponible/,
    );
  });
  await t.test(
    'Archivos repetidos no duplican puntos; corrección y otro día son torneos distintos',
    async () => {
      const input = {
        title: 'Otro nombre',
        played_on: '2026-10-07',
        event_id: 'OTHER',
        text: 'Jugador,Puntos,Konami ID\nAna Competidora,15,0000000101\nCarla Jugadora,15,0000000102',
      };
      const same = await league.previewRankingFile(admin, input);
      await assert.rejects(
        () => league.commitRanking(admin, { preview_id: same.id }),
        /mismo standing/,
      );
      const tomorrow = await league.previewRankingFile(admin, {
        ...input,
        played_on: '2026-10-08',
      });
      await league.commitRanking(admin, { preview_id: tomorrow.id });
      const corrected = await league.previewRankingFile(admin, {
        ...input,
        event_id: 'KC-10',
        text: 'Jugador,Puntos,Konami ID\nAna Competidora,6,0000000101\nCarla Jugadora,3,0000000102',
      });
      await league.commitRanking(admin, { preview_id: corrected.id, replace: true });
      assert.equal((await league.publicRanking('yugioh')).rows[0].points, 21);
    },
  );
  await t.test(
    'Confirmaciones concurrentes solo guardan una versión y eliminar recalcula',
    async () => {
      const input = {
        title: 'Liga concurrente',
        played_on: '2026-10-09',
        event_id: 'race',
        text: 'Jugador,Puntos\nDiego Jugador,12',
      };
      const p1 = await league.previewRankingFile(admin, input),
        p2 = await league.previewRankingFile(admin, input);
      const commits = await Promise.allSettled([
        league.commitRanking(admin, { preview_id: p1.id }),
        league.commitRanking(admin, { preview_id: p2.id }),
      ]);
      assert.equal(commits.filter((r) => r.status === 'fulfilled').length, 1);
      await league.deleteLeagueTournament(second.id);
      const board = await league.publicRanking('myl-first-era');
      assert.equal(board.rows.find((r) => r.name === 'Ana Competidora')?.points, 3);
      assert.equal(board.tournaments.length, 1);
    },
  );
  await t.test('Cerrar y reabrir PostgreSQL conserva resultados finales y revisiones', async () => {
    await closeDb();
    await getDb();
    const saved = await league.listLeagueTournaments();
    assert.equal(saved.find((s) => s.id === first.id)?.revision, 2);
    assert.equal(
      (await league.publicRanking('myl-first-era')).rows.find((r) => r.name === 'Ana Competidora')
        ?.points,
      3,
    );
    assert.equal((await league.publicRanking('yugioh')).tournaments.length, 3);
  });
});
