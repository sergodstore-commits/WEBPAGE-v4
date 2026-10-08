import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRankingFile } from '../lib/server/ranking-files';

const kts = (id = 'E26-TEST', wins = '4') => `<?xml version="1.0" encoding="utf-8"?>
<Tournament><ID>${id}</ID><Name>Local - November 3</Name><Date>2026-10-03</Date>
<Finalized>True</Finalized><Staff><Secret>discard me</Secret></Staff><TournamentPlayers>
<TournPlayer><Player><ID>0000000001</ID><FirstName>Ana</FirstName><LastName>Pérez</LastName></Player><Rank>1</Rank><Wins>${wins}</Wins><Points>12562531</Points></TournPlayer>
<TournPlayer><Player><ID>0000000002</ID><FirstName>Bruno</FirstName><LastName>Prueba</LastName></Player><Rank>2</Rank><Wins>0</Wins><Points>437421</Points></TournPlayer>
</TournamentPlayers><PenaltyList><Secret>discard penalties</Secret></PenaltyList></Tournament>`;

test('KTS: fecha e ID automáticos, puntos por victorias y descarte de datos ajenos al ranking', () => {
  const r = parseRankingFile({ text: kts() });
  assert.equal(r.played_on, '2026-10-03');
  assert.equal(r.external_id, 'E26-TEST');
  assert.deepEqual(
    r.results.map((p) => [p.name, p.position, p.points]),
    [
      ['Ana Pérez', 1, 12],
      ['Bruno Prueba', 2, 0],
    ],
  );
  assert.equal(
    r.results[0].player_key,
    parseRankingFile({
      title: 'Local',
      played_on: '2026-10-03',
      text: 'Jugador,Puntos,ID\nAna Pérez,12,0000000001',
    }).results[0].player_key,
  );
  assert.equal(JSON.stringify(r).includes('discard'), false);
  assert.equal(
    parseRankingFile({ text: kts(), title: 'Título corregido' }).title,
    'Título corregido',
  );
});

test('KTS: no publica torneos abiertos, entidades, campos ambiguos ni datos inconsistentes', () => {
  for (const text of [
    kts().replace('True', 'False'),
    kts().replace('<Date>2026-10-03</Date>', ''),
    kts().replace('2026-10-03', '2026-02-30'),
    kts().replace('<ID>E26-TEST</ID>', '<ID>A</ID><ID>B</ID>'),
    kts().replace('<Tournament>', '<Tournament><!ENTITY external SYSTEM "file:///secret">'),
    kts('', '4'),
    kts('E26-TEST', '-1'),
    kts('E26-TEST', '1.5'),
    kts('E26-TEST', '33334'),
    '<Tournament>',
  ]) {
    assert.throws(() => parseRankingFile({ text }));
  }
  assert.throws(() => parseRankingFile({ text: kts(), event_id: 'OTRO' }), /no coincide/);
  assert.throws(() => parseRankingFile({ text: kts(), played_on: '2026-11-03' }), /no coincide/);
  assert.throws(() => parseRankingFile({ text: kts(), position_points: '1=9\n2=0' }), /vacía/);
});
