import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duelHouse } from '../lib/duel-academy';

test('Academia: cada límite pertenece a una sola casa', () => {
  for (const [points, house] of [
    [0, 'slifer'],
    [149, 'slifer'],
    [150, 'ra'],
    [250, 'ra'],
    [251, 'obelisk'],
  ] as const) {
    assert.equal(duelHouse(points), house);
  }
});
