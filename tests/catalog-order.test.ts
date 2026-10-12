import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogReleaseDay, compareCatalogLaunch } from '../lib/catalog-order';

const product = (
  id: string,
  date: string | null,
  format = 'Sobre',
  language = 'Español',
  group = 'edicion',
) => ({
  id,
  name: `${format} ${language}`,
  sku: id,
  catalog_group: group,
  catalog_name: group,
  category: 'Yu-Gi-Oh!',
  options: { Formato: format, Idioma: language },
  specifications: [],
  release_date: date,
});
test('Fechas: mismo día para texto, ISO y DATE de PostgreSQL, sin usar creación', () => {
  assert.equal(catalogReleaseDay('2026-07-03T00:00:00.000Z'), '2026-07-03');
  assert.equal(catalogReleaseDay(new Date(2026, 6, 3)), '2026-07-03');
  assert.equal(catalogReleaseDay('fecha desconocida'), '');
  const list = [
    product('sin-fecha', null),
    product('antiguo', '2025-09-05'),
    product('nuevo', '2026-10-09'),
  ];
  assert.deepEqual(
    [...list].sort(compareCatalogLaunch).map((p) => p.id),
    ['nuevo', 'antiguo', 'sin-fecha'],
  );
  assert.deepEqual(
    [...list].sort((a, b) => compareCatalogLaunch(a, b, 'asc')).map((p) => p.id),
    ['antiguo', 'nuevo', 'sin-fecha'],
  );
});
test('Una edición queda junta con tarjetas separadas: single, sobre, token box, display y pack; español antes de inglés', () => {
  const date = '2026-10-09';
  const list = [
    product('pack', date, '3 displays + 3 Buy a Box'),
    product('display-en', date, 'Display', 'Inglés'),
    product('token', date, 'Token Box'),
    product('single', date, 'Single'),
    product('display-es', date, 'Display'),
    product('sobre-en', date, 'Sobre', 'Inglés'),
    product('sobre-es', date),
    product('otra', date, 'Sobre', 'Español', 'otra-edicion'),
  ];
  assert.deepEqual(
    list.sort(compareCatalogLaunch).map((p) => p.id),
    ['single', 'sobre-es', 'sobre-en', 'token', 'display-es', 'display-en', 'pack', 'otra'],
  );
  assert.equal(list.length, 8);
  assert.ok(
    compareCatalogLaunch(
      product('booster', date, 'Booster Pack'),
      product('display', date, 'Display'),
    ) < 0,
  );
  assert.ok(
    compareCatalogLaunch(product('ten', date, '10 displays'), product('display', date, 'Display')) >
      0,
  );
});
