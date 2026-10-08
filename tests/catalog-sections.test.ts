import test from 'node:test';
import assert from 'node:assert/strict';
import type { Product } from '../lib/types';
import { matchesCatalogSection, readCatalogSection } from '../lib/catalog-sections';

const article = (change: Partial<Product>) =>
  ({ category: '', brand: '', name: '', tags: [], ...change }) as Product;
test('Accesos por juego: Primera Era y Primer Bloque, incluidos extendidos, se mantienen separados', () => {
  const era = article({
    category: 'Mitos y Leyendas',
    name: 'Halloween Abismo',
    tags: ['Primera Era Extendido'],
  });
  const block = article({
    category: 'Mitos y Leyendas',
    name: 'Relatos Dominios de Ra',
    tags: ['Primer Bloque Extendido'],
  });
  assert.equal(matchesCatalogSection(era, 'myl-first-era'), true);
  assert.equal(matchesCatalogSection(era, 'myl-first-block'), false);
  assert.equal(matchesCatalogSection(block, 'myl-first-block'), true);
  assert.equal(matchesCatalogSection(block, 'myl-first-era'), false);
  assert.equal(
    matchesCatalogSection(
      article({ category: 'MyL Primera Era', name: 'Sobre nuevo' }),
      'myl-first-era',
    ),
    true,
  );
  assert.equal(
    matchesCatalogSection(
      article({ category: 'Mitos y Leyendas', name: 'Otro formato' }),
      'myl-first-era',
    ),
    false,
  );
  assert.equal(
    matchesCatalogSection(
      article({ category: 'Accesorios', name: 'Fundas para Primera Era', brand: 'Otra marca' }),
      'myl-first-era',
    ),
    false,
  );
});
test('Yu-Gi-Oh! y Zero Mulligan usan categoría y marca, sin confundir accesorios compatibles', () => {
  const zero = article({
    category: 'Protectores',
    name: 'Fundas para Yu-Gi-Oh!',
    brand: 'Zero Mulligan',
  });
  assert.equal(matchesCatalogSection(zero, 'zero-mulligan'), true);
  assert.equal(matchesCatalogSection(zero, 'yugioh'), false);
  assert.equal(
    matchesCatalogSection(article({ category: 'Yu-Gi-Oh!', brand: 'Konami' }), 'yugioh'),
    true,
  );
  assert.equal(
    matchesCatalogSection(article({ category: 'Yu-Gi-Oh!', brand: 'Konami' }), 'zero-mulligan'),
    false,
  );
  assert.equal(
    matchesCatalogSection(
      article({ brand: 'Otra marca', description: 'Zero Mulligan' }),
      'zero-mulligan',
    ),
    false,
  );
  assert.equal(matchesCatalogSection(zero, ''), true);
  assert.equal(readCatalogSection('myl-first-era'), 'myl-first-era');
  assert.equal(readCatalogSection('unknown'), '');
});
