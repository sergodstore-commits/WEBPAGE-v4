import test from 'node:test';
import assert from 'node:assert/strict';
import { editionCatalogKeys, productEdition } from '../lib/edition-connections';

test('Ediciones: un mismo código conecta presentaciones inglesas y españolas, sin coincidencias parciales', () => {
  const editions = [
    { code: 'cori', name: 'Chaos Origins' },
    { code: 'betb', name: 'Beyond the Brave' },
  ];
  for (const catalog_name of ['Orígenes del Caos', 'Origenes del Caos', ' CHAOS ORIGINS ']) {
    const product = { catalog_group: '', catalog_name };
    const edition = productEdition(product, editions)!;
    assert.equal(edition.code, 'cori');
    assert.ok(editionCatalogKeys(edition).names.includes(catalog_name.trim().toLowerCase()));
  }
  assert.equal(
    productEdition({ catalog_group: 'ygo-chaos-origins', catalog_name: '' }, editions)?.code,
    'cori',
  );
  assert.equal(
    productEdition({ catalog_group: '', catalog_name: 'Chaos Origins II' }, editions),
    undefined,
  );
  assert.equal(
    productEdition({ catalog_group: 'ygo-beyond-the-brave', catalog_name: '' }, editions)?.code,
    'betb',
  );
});
