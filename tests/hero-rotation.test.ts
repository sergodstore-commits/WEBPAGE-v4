import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { homeHeroCards } from '../lib/hero/presets';
import { rotatingHeroCard } from '../lib/hero/rotation';

test('Rotación: las 20 cartas existen y conservan juego, reverso y posición', async () => {
  const all = new Set<string>();
  for (const card of homeHeroCards) {
    assert.deepEqual(rotatingHeroCard(card, 0), card);
    for (let cycle = 1; cycle <= 25; cycle++) {
      const next = rotatingHeroCard(card, cycle);
      assert.equal(next.game, card.game);
      assert.equal(next.back, card.back);
      assert.equal(next.role, card.role);
      assert.deepEqual(next.rotation, card.rotation);
      await access(`public${next.front}`);
      await access(`public${next.frontSmall}`);
      assert.ok(next.front.includes(`/rotation/${card.game}-`));
      all.add(next.front);
    }
  }
  assert.equal(all.size, 20);
});
