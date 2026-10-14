import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Product } from '../lib/types';
import {
  posCatalogFamilies,
  posCatalogSearch,
  posCatalogSection,
  posVariantLabel,
} from '../lib/pos-catalog';
import { productFamilies } from '../components/store/shared';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'test',
  name: 'Producto',
  slug: 'producto',
  description: '',
  sku: 'TEST',
  price: 5000,
  discount_percent: 0,
  category: 'Accesorios',
  catalog_group: '',
  catalog_name: '',
  brand: '',
  options: {},
  tags: [],
  specifications: [],
  source_url: '',
  stock: 0,
  reserved: 0,
  available: 0,
  kind: 'store',
  status: 'published',
  images: [],
  opens_at: null,
  closes_at: null,
  max_per_customer: null,
  delivery_terms: '',
  created_at: '',
  updated_at: '',
  version: 1,
  ...overrides,
});
test('POS: groups accessory variants only; each selection preserves its exact SKU, price and stock', () => {
  const red = product({
    id: 'red',
    name: 'Fortuna Rojo',
    sku: 'RED',
    catalog_group: 'fortuna',
    catalog_name: 'Fortuna Matte',
    options: { Color: 'Rojo', Formato: 'Standard' },
    available: 2,
  });
  const blue = product({
    ...red,
    id: 'blue',
    name: 'Fortuna Azul',
    sku: 'BLUE',
    options: { Color: 'Azul', Formato: 'Japonés' },
    price: 4000,
    available: 0,
  });
  const families = posCatalogFamilies([red, blue]);
  assert.equal(families.length, 1);
  assert.equal(families[0].name, 'Fortuna Matte');
  assert.equal(families[0].variants.find((p) => p.id === 'blue')?.price, 4000);
  assert.equal(families[0].variants.find((p) => p.id === 'red')?.available, 2);
  assert.match(posVariantLabel(blue), /Color: Azul.*Formato: Japonés.*BLUE/);
  assert.equal(productFamilies([red, blue]).length, 2, 'Public store cards remain independent');
});
test('POS: packs, displays, token boxes, kits and languages never collapse into one accessory family', () => {
  const products = [
    'Sobre',
    'Display de 24 sobres',
    'Token Box',
    'Kit racial',
    'Toolkit',
    'Mazo',
  ].map((name, i) =>
    product({
      id: String(i),
      name,
      category: 'Mitos y Leyendas',
      catalog_group: 'one-edition',
      catalog_name: 'Edición',
      options: { Formato: name, Idioma: 'Español' },
    }),
  );
  assert.deepEqual(products.map(posCatalogSection), [
    'packs',
    'displays',
    'token-box',
    'kits',
    'kits',
    'decks',
  ]);
  assert.equal(posCatalogFamilies(products).length, 6);
  const english = product({
    ...products[0],
    id: 'en',
    options: { Formato: 'Sobre', Idioma: 'Inglés' },
  });
  assert.equal(posCatalogFamilies([...products, english]).length, 7);
});
test('POS: search sees colors, types, SKU and accented names; it cannot add a hidden unmatched variant', () => {
  const products = [
    product({
      id: 'red',
      catalog_group: 'fortuna',
      name: 'Fortuna',
      options: { Color: 'Rojo', Formato: 'Japonés' },
    }),
    product({
      id: 'blue',
      catalog_group: 'fortuna',
      name: 'Fortuna',
      sku: 'BLUE-SKU',
      options: { Color: 'Azul', Formato: 'Standard' },
    }),
  ];
  const families = posCatalogFamilies(products);
  assert.deepEqual(
    posCatalogSearch(families, 'japones')[0].variants.map((p) => p.id),
    ['red'],
  );
  assert.deepEqual(
    posCatalogSearch(families, 'BLUE-SKU')[0].variants.map((p) => p.id),
    ['blue'],
  );
  assert.equal(posCatalogSearch(families, '', 'packs').length, 0);
  assert.equal(posCatalogSearch(families, 'no-existe').length, 0);
});
test('POS: preserve all zero-stock store SKUs, reject drafts/preorders and do not guess families without metadata', () => {
  const products = [
    product({ id: 'one', name: 'Fundas azules' }),
    product({ id: 'two', name: 'Fundas rojas' }),
    product({ id: 'draft', status: 'draft' }),
    product({ id: 'preorder', kind: 'preorder', available: 10 }),
  ];
  assert.equal(posCatalogFamilies(products).length, 2);
  assert.ok(posCatalogFamilies(products).every((f) => f.variants[0].available === 0));
});
test('POS: the actual 72 Zero Mulligan variants occupy their 12 catalog families', () => {
  const imported = JSON.parse(readFileSync('data/catalogs/zero-mulligan.json', 'utf8')).products;
  const products: Product[] = imported.map((p: Partial<Product>, i: number) =>
    product({ ...p, id: `zm-${i}`, kind: 'store', status: 'published' }),
  );
  const families = posCatalogFamilies(products);
  assert.equal(products.length, 72);
  assert.equal(families.length, 12);
  assert.equal(families.flatMap((f) => f.variants).length, 72);
  assert.ok(families.every((f) => f.section === 'accessories'));
});
