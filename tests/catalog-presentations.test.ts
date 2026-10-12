import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogPresentation, readCatalogPresentation } from '../lib/catalog-presentations';

test('presentation uses explicit metadata before a product title and does not confuse deck boxes', () => {
  const product = {
    name: 'Display + promo',
    category: 'Yu-Gi-Oh!',
    options: { Formato: 'Sobre' },
    specifications: [],
  };
  assert.equal(catalogPresentation(product), 'packs');
  assert.equal(catalogPresentation({ ...product, options: {}, name: 'Token Box' }), 'token-box');
  assert.equal(
    catalogPresentation({ ...product, options: {}, name: 'Deck Box Zero Mulligan' }),
    'accessories',
  );
  assert.equal(
    catalogPresentation({ ...product, options: {}, name: 'Producto sin formato' }),
    'other',
  );
  assert.equal(readCatalogPresentation('unknown'), '');
});
