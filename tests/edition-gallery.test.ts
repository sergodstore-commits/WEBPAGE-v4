import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { localWebArticle } from '../lib/web-news';
test('Beyond the Brave: cobertura completa, textos legibles y archivos locales', () => {
  const { cards } = JSON.parse(readFileSync('public/editions/betb/cards.json', 'utf8'));
  assert.equal(cards.length, 100);
  assert.equal(new Set(cards.map((card: { id: number }) => card.id)).size, 100);
  const codes = new Set<string>();
  for (const card of cards) {
    assert.ok(card.name && card.englishName);
    assert.ok(card.effects.length > 0);
    for (const effect of card.effects) {
      assert.ok(effect.length > 10);
      assert.doesNotMatch(effect, /&\w+;|<[^>]+>/);
    }
    assert.match(
      card.source,
      /^https:\/\/www\.db\.yugioh-card\.com\/yugiohdb\/card_search\.action\?ope=2&cid=\d+&request_locale=es$/,
    );
    for (const file of [card.image, card.thumbnail]) {
      assert.match(file, /^\/editions\/betb\/\d+(?:-thumb)?\.webp$/);
      assert.ok(existsSync(`public${file}`));
    }
    card.printings.forEach((printing: { code: string }) => codes.add(printing.code));
  }
  assert.equal(codes.size, 100);
  for (let number = 1; number <= 100; number++)
    assert.ok(codes.has(`BETB-EN${String(number).padStart(3, '0')}`));
  assert.equal(
    localWebArticle('https://www.yugiohmeta.com/articles/sets/tcg/betb'),
    '/noticias/beyond-the-brave',
  );
  assert.equal(localWebArticle('https://evil.test/articles/sets/tcg/betb'), null);
});
