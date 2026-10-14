import test from 'node:test';
import assert from 'node:assert/strict';
import { posMenuMatches, posPromoMatches, posAccessorySection } from '../lib/pos-browse';
import type { PosMenuItem } from '../lib/pos-menu';
import type { Product } from '../lib/types';

const menu: PosMenuItem[] = [
  {
    id: 'lemon',
    code: 'LIMON',
    name: 'Limón Soda',
    kind: 'beverage',
    alcoholic: false,
    price: 1500,
    stock: 0,
    version: 1,
  },
  {
    id: 'pepsi',
    code: 'PEPSI',
    name: 'Pepsi',
    kind: 'beverage',
    alcoholic: false,
    price: 1500,
    stock: 2,
    version: 1,
  },
  {
    id: 'zero',
    code: 'PEPSI-ZERO',
    name: 'Pepsi Zero',
    kind: 'beverage',
    alcoholic: false,
    price: 1500,
    stock: 1,
    version: 1,
  },
  {
    id: 'beer',
    code: 'CERVEZA',
    name: 'Cerveza',
    kind: 'beverage',
    alcoholic: true,
    price: 1500,
    stock: 2,
    version: 1,
  },
  {
    id: 'food',
    code: 'COMPLETO',
    name: 'Completo',
    kind: 'food',
    alcoholic: false,
    price: 2000,
    stock: 1,
    version: 1,
  },
];
const ids = (items: PosMenuItem[]) => items.map((i) => i.id);
test('POS browse: accent-insensitive name/SKU search spans food and drinks, including zero stock', () => {
  assert.deepEqual(ids(posMenuMatches(menu, 'limon', 'all')), ['lemon']);
  assert.deepEqual(ids(posMenuMatches(menu, 'MENU-PEPSI', 'all')), ['pepsi', 'zero']);
  assert.deepEqual(ids(posMenuMatches(menu, 'completo', 'all')), ['food']);
  assert.deepEqual(ids(posMenuMatches(menu, 'sin azucar', 'beverages')), ['zero']);
});
test('POS browse: drink subcategories are disjoint and food/promos do not leak into them', () => {
  assert.deepEqual(ids(posMenuMatches(menu, '', 'beverages', 'soft')), ['lemon', 'pepsi']);
  assert.deepEqual(ids(posMenuMatches(menu, '', 'beverages', 'zero')), ['zero']);
  assert.deepEqual(ids(posMenuMatches(menu, '', 'beverages', 'beer')), ['beer']);
  assert.deepEqual(ids(posMenuMatches(menu, '', 'food')), ['food']);
  assert.deepEqual(posMenuMatches(menu, '', 'promos'), []);
  assert.deepEqual(posMenuMatches(menu, 'Pepsi', 'food'), []);
});
test('POS browse: promo search includes eligible drinks but never suggests beer in the combo', () => {
  for (const query of ['', 'promo', 'completo', 'Pepsi', 'limon'])
    assert.ok(posPromoMatches(menu, query));
  assert.equal(posPromoMatches(menu, 'cerveza'), false);
  assert.equal(posPromoMatches(menu, 'Fortuna'), false);
});
test('POS browse: accessory subcategories classify sleeve families and playmat carriers correctly', () => {
  const classify = (name: string) =>
    posAccessorySection({ name, category: 'Accesorios', catalog_name: '' } as Product);
  assert.equal(classify('Fortuna Matte'), 'sleeves');
  assert.equal(classify('Vitrum Fit Inner Sleeves'), 'sleeves');
  assert.equal(classify('Deckbox Fortaleza'), 'deckboxes');
  assert.equal(classify('Porta playmats hexagonal'), 'playmats');
  assert.equal(classify('Dados Destino'), 'dice');
  assert.equal(classify('Accesorio especial'), 'other');
});
