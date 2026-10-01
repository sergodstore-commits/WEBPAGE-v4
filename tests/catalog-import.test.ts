import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  catalogImageUrl,
  catalogImportManifestSchema,
  catalogImportProductSchema,
  catalogSourceUrl,
  resolveCatalogImageRedirect,
} from '../scripts/catalog-import-schema';

const product = (overrides: Record<string, unknown> = {}) => ({
  sku: 'TCG-TEST-001',
  name: 'Artículo de prueba',
  description: 'Información comprobada para la importación de prueba.',
  price: 5000,
  category: 'Yu-Gi-Oh!',
  brand: 'Konami',
  source_url: 'https://www.geekers.cl/producto',
  images: ['https://cdnx.jumpseller.com/tienda/imagen.webp'],
  ...overrides,
});
const manifest = (products = [product()]) => ({
  version: 1,
  source: 'sergod-selected-tcg-20260927',
  collected_at: '2026-09-27T00:00:00.000Z',
  products,
});

test('el manifiesto Zero Mulligan existente conserva publicación en Tienda y sus 72 variantes', async () => {
  const original = JSON.parse(await readFile('data/catalogs/zero-mulligan.json', 'utf8'));
  const parsed = catalogImportManifestSchema.parse(original);
  assert.equal(parsed.products.length, 72);
  assert.equal(parsed.source, 'https://zeromulligan.cl/catalogo/');
  for (const entry of parsed.products) {
    assert.equal(entry.kind, 'store');
    assert.equal(entry.publish, true);
    assert.equal(entry.opens_at, null);
    assert.equal(entry.closes_at, null);
    assert.equal(entry.max_per_customer, null);
    assert.equal(entry.delivery_terms, '');
    assert.deepEqual(entry.images, original.products.find((p: any) => p.sku === entry.sku).images);
  }
});

test('el borrador de preventa admite precio cero sin inventar fechas, cupos ni máximo por cliente', () => {
  const draft = catalogImportProductSchema.parse(
    product({ kind: 'preorder', publish: false, price: 0 }),
  );
  assert.equal(draft.price, 0);
  assert.equal(draft.publish, false);
  assert.equal(draft.kind, 'preorder');
  assert.equal(draft.opens_at, null);
  assert.equal(draft.closes_at, null);
  assert.equal(draft.max_per_customer, null);
  assert.equal(draft.delivery_terms, '');
  assert.equal('stock' in draft, false);
  assert.equal(draft.catalog_group, '');
  assert.equal(draft.catalog_name, '');
  assert.deepEqual(draft.options, {});
});

test('el precio cero solo se admite si el artículo queda como borrador', () => {
  assert.equal(catalogImportProductSchema.safeParse(product({ price: 0 })).success, false);
  assert.equal(
    catalogImportProductSchema.safeParse(product({ price: 0, publish: false })).success,
    true,
  );
  assert.equal(
    catalogImportProductSchema.safeParse(product({ price: -1, publish: false })).success,
    false,
  );
  assert.equal(catalogImportProductSchema.safeParse(product({ price: 100000001 })).success, false);
});

test('una preventa se valida antes de importar: apertura, cierre futuro, máximo y entrega obligatorios al publicar', () => {
  const opensAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const closesAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const valid = product({
    kind: 'preorder',
    opens_at: opensAt,
    closes_at: closesAt,
    max_per_customer: 2,
    delivery_terms: 'Retiro según fecha confirmada por el local.',
  });
  assert.equal(catalogImportProductSchema.safeParse(valid).success, true);
  for (const missing of ['opens_at', 'closes_at', 'max_per_customer', 'delivery_terms']) {
    const incomplete: Record<string, unknown> = { ...valid };
    delete incomplete[missing];
    assert.equal(catalogImportProductSchema.safeParse(incomplete).success, false, missing);
  }
  assert.equal(
    catalogImportProductSchema.safeParse({ ...valid, max_per_customer: 0 }).success,
    false,
  );
  assert.equal(
    catalogImportProductSchema.safeParse({ ...valid, closes_at: '2020-01-01T00:00:00Z' }).success,
    false,
  );
  assert.equal(
    catalogImportProductSchema.safeParse({
      ...valid,
      publish: false,
      opens_at: closesAt,
      closes_at: opensAt,
    }).success,
    false,
  );
});

test('solo las URL HTTPS de hosts observados son válidas y no aceptan credenciales ni puertos alternativos', () => {
  for (const host of [
    'zeromulligan.cl',
    'www.zeromulligan.cl',
    'www.geekers.cl',
    'www.oneupstore.cl',
    'casamyl.cl',
    'elreinodelosduelos.cl',
    'www.yugioh-card.com',
    'goldsilver.cl',
    'www.empiregames.es',
    'cdnx.jumpseller.com',
    'dojiw2m9tvv09.cloudfront.net',
  ]) {
    assert.equal(catalogSourceUrl.safeParse(`https://${host}/producto`).success, true);
    assert.equal(catalogImageUrl.safeParse(`https://${host}/imagen.webp`).success, true);
  }
  for (const url of [
    'https://unknown.example/image.webp',
    'https://www.geekers.cl.evil.example/image.webp',
    'https://localhost/image.webp',
    'http://www.geekers.cl/image.webp',
    'https://user:password@www.geekers.cl/image.webp',
    'https://www.geekers.cl:8443/image.webp',
    'javascript:alert(1)',
    'no-es-url',
  ]) {
    assert.equal(catalogSourceUrl.safeParse(url).success, false, url);
    assert.equal(catalogImageUrl.safeParse(url).success, false, url);
  }
});

test('las redirecciones de imágenes rechazan cambios de host que no sean la excepción oficial comprobada', () => {
  const origin = 'https://www.geekers.cl/images/a.webp';
  assert.equal(
    resolveCatalogImageRedirect(origin, '../images/b.webp'),
    'https://www.geekers.cl/images/b.webp',
  );
  assert.throws(
    () => resolveCatalogImageRedirect(origin, 'https://cdnx.jumpseller.com/b.webp'),
    /cambiar de host/,
  );
  assert.throws(() => resolveCatalogImageRedirect(origin, 'https://unknown.example/b.webp'));
  assert.throws(() => resolveCatalogImageRedirect(origin, 'http://www.geekers.cl/b.webp'));
});

test('la redirección oficial de Yu-Gi-Oh! solo permite www a img conservando la ruta y consulta de uploads', () => {
  const source =
    'https://www.yugioh-card.com/eu/wp-content/uploads/2026/07/MAMS-Tuckbox-03-SP.webp';
  const destination =
    'https://img.yugioh-card.com/eu/wp-content/uploads/2026/07/MAMS-Tuckbox-03-SP.webp';
  assert.equal(resolveCatalogImageRedirect(source, destination), destination);
  assert.equal(catalogImageUrl.safeParse(destination).success, true);
  assert.equal(catalogSourceUrl.safeParse(destination).success, false);
  for (const invalid of [
    destination.replace('03-SP', '01-SP'),
    destination + '?redirect=other',
    destination.replace('https:', 'http:'),
    destination.replace('img.yugioh-card.com', 'img.yugioh-card.com.evil.example'),
    destination.replace('img.yugioh-card.com', 'other.yugioh-card.com'),
  ])
    assert.throws(() => resolveCatalogImageRedirect(source, invalid));
  assert.throws(() =>
    resolveCatalogImageRedirect(
      'https://www.yugioh-card.com/eu/product/test/',
      'https://img.yugioh-card.com/eu/product/test/',
    ),
  );
  assert.throws(() => resolveCatalogImageRedirect(destination, source));
});

test('grupos y metadatos respetan el contrato de la API antes de cargar imágenes', () => {
  assert.equal(
    catalogImportProductSchema.safeParse(product({ catalog_group: 'grupo' })).success,
    false,
  );
  assert.equal(
    catalogImportProductSchema.safeParse(product({ catalog_name: 'Nombre' })).success,
    false,
  );
  assert.equal(
    catalogImportProductSchema.safeParse(product({ catalog_group: '-', catalog_name: 'Nombre' }))
      .success,
    false,
  );
  assert.equal(
    catalogImportProductSchema.safeParse(
      product({ catalog_group: 'grupo-valido', catalog_name: 'Nombre' }),
    ).success,
    true,
  );
  assert.equal(
    catalogImportProductSchema.safeParse(
      product({
        options: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`Opción ${i}`, 'Valor'])),
      }),
    ).success,
    false,
  );
  assert.equal(
    catalogImportProductSchema.safeParse(
      product({ tags: Array.from({ length: 31 }, () => 'Etiqueta') }),
    ).success,
    false,
  );
});

test('el lote mixto mantiene tipos y decisiones de publicación y rechaza origen desconocido o SKU duplicado', () => {
  const parsed = catalogImportManifestSchema.parse(
    manifest([
      product(),
      product({ sku: 'TCG-PREORDER', kind: 'preorder', publish: false, price: 0 }),
    ]),
  );
  assert.deepEqual(
    parsed.products.map((p) => [p.kind, p.publish]),
    [
      ['store', true],
      ['preorder', false],
    ],
  );
  assert.equal(
    catalogImportManifestSchema.safeParse({ ...manifest(), source: 'unknown-source' }).success,
    false,
  );
  assert.equal(
    catalogImportManifestSchema.safeParse(manifest([product(), product({ sku: ' TCG-TEST-001 ' })]))
      .success,
    false,
  );
});
