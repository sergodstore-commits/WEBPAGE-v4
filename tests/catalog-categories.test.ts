import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogCategory, matchesCatalogCategory } from '../lib/catalog-categories';
test('Categorías públicas agrupan variantes sin modificar categorías ni enlaces antiguos', () => {
  for (const category of ['Dados', 'Protectores', 'Accesorios', 'Fundas Japanese', 'Tapetes']) {
    const p = { category };
    assert.equal(catalogCategory(p), 'Accesorios');
    assert.equal(matchesCatalogCategory(p, 'Accesorios'), true);
    assert.equal(matchesCatalogCategory(p, category), true);
    assert.equal(p.category, category);
  }
  for (const category of ['Mitos y Leyendas', 'MyL Primera Era', 'MyL Primer Bloque'])
    assert.equal(catalogCategory({ category }), 'Mitos y Leyendas');
  assert.equal(catalogCategory({ category: 'Yu-Gi-Oh!' }), 'Yu-Gi-Oh!');
  assert.equal(catalogCategory({ category: 'Otro juego' }), 'Otros');
  assert.equal(matchesCatalogCategory({ category: 'Dados' }, 'Yu-Gi-Oh!'), false);
});
