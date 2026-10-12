import test from 'node:test';
import assert from 'node:assert/strict';
import { orderLeaguePlayers, type RankingCandidate } from '../lib/server/ranking-order';

function player(key: string, points: number, positions: number[], name = key): RankingCandidate {
  return {
    player_key: key,
    name,
    points,
    tournaments: positions.length,
    contributions: positions.map((position, i) => ({
      tournament_id: `${key}-${i}`,
      title: `Torneo ${i}`,
      played_on: `2026-10-${String(i + 1).padStart(2, '0')}`,
      position,
      points: 0,
    })),
  };
}
const names = (input: RankingCandidate[]) => orderLeaguePlayers(input, false).map((p) => p.name);

test('Desempates: puntos, cantidad de mejores puestos y standing reciente, sin orden alfabético', () => {
  assert.deepEqual(names([player('ganador', 9, [1]), player('puntos', 12, [30])]), [
    'puntos',
    'ganador',
  ]);
  assert.deepEqual(names([player('Ana', 12, [1, 2]), player('Zoe', 12, [1, 1])]), ['Zoe', 'Ana']);
  assert.deepEqual(names([player('Ana', 12, [1, 3, 4]), player('Zoe', 12, [1, 2, 6])]), [
    'Zoe',
    'Ana',
  ]);
  assert.deepEqual(names([player('Ana', 12, [1]), player('Zoe', 12, [1, 2])]), ['Zoe', 'Ana']);
  assert.deepEqual(names([player('Ana', 12, [1, 2]), player('Zoe', 12, [2, 1])]), ['Zoe', 'Ana']);
  assert.deepEqual(names([player('Ana', 12, [1, 2, 3]), player('Zoe', 12, [2, 1, 3])]), [
    'Zoe',
    'Ana',
  ]);
  assert.deepEqual(names([player('Ana', 12, [999999]), player('Zoe', 12, [999998])]), [
    'Zoe',
    'Ana',
  ]);
});

test('Igualdad completa: puestos únicos, provisionales y estables sin publicar identidades', () => {
  const a = player('private-a', 9, [1, 2], 'Zoe'),
    b = player('private-b', 9, [1, 2], 'Ana');
  const original = JSON.stringify([a, b]);
  const first = orderLeaguePlayers([b, a], false);
  assert.deepEqual(first, orderLeaguePlayers([a, b], false));
  assert.deepEqual(
    first.map((p) => [p.name, p.position, p.provisional]),
    [
      ['Zoe', 1, true],
      ['Ana', 2, true],
    ],
  );
  assert.ok(!JSON.stringify(first).includes('private-'));
  assert.ok(!JSON.stringify(first).includes('contributions'));
  assert.equal(JSON.stringify([a, b]), original);
  assert.equal(orderLeaguePlayers([a, b], true)[0].contributions?.length, 2);
  assert.deepEqual(orderLeaguePlayers([], false), []);
});

test('Mismo día: ni el orden de importación ni el ID del torneo inventan una cronología', () => {
  const a = player('a', 12, [2, 1]),
    b = player('b', 12, [1, 2]);
  for (const p of [a, b]) for (const c of p.contributions) c.played_on = '2026-10-01';
  const before = orderLeaguePlayers([a, b], true);
  a.contributions.reverse();
  b.contributions.reverse();
  const after = orderLeaguePlayers([b, a], true);
  assert.deepEqual(
    before.map(({ contributions, ...r }) => r),
    after.map(({ contributions, ...r }) => r),
  );
  assert.ok(after.every((r) => r.provisional));
});
