import { test, expect } from '@playwright/test';
import type { Product } from '../../lib/types';

const now = new Date().toISOString();
const fixture = (
  id: string,
  name: string,
  category: string,
  brand: string,
  tags: string[],
): Product => ({
  id,
  slug: id,
  name,
  category,
  brand,
  tags,
  description: 'Producto para comprobar filtros.',
  sku: id,
  catalog_group: '',
  catalog_name: '',
  options: {},
  specifications: [],
  source_url: '',
  price: 2500,
  discount_percent: 0,
  stock: 2,
  reserved: 0,
  available: 2,
  kind: 'store',
  status: 'published',
  images: ['/art/hero/yugioh-front.webp'],
  opens_at: new Date(Date.now() - 86400000).toISOString(),
  closes_at: new Date(Date.now() + 86400000).toISOString(),
  max_per_customer: 2,
  delivery_terms: 'Retiro en tienda',
  created_at: now,
  updated_at: now,
  version: 1,
});
const products = [
  fixture('section-yugi', 'Cartas Yu-Gi-Oh! de prueba', 'Yu-Gi-Oh!', 'Konami', ['Inglés']),
  fixture(
    'section-era',
    'Mitos y Leyendas · Leyendas Primera Era',
    'Mitos y Leyendas',
    'Mitos y Leyendas',
    ['Primera Era Extendido'],
  ),
  fixture(
    'section-block',
    'Mitos y Leyendas · Leyendas Primer Bloque',
    'Mitos y Leyendas',
    'Mitos y Leyendas',
    ['Primer Bloque Extendido'],
  ),
  fixture('section-zero', 'Fundas Zero Mulligan de prueba', 'Protectores', 'Zero Mulligan', [
    'Japanese',
  ]),
  fixture('section-other', 'Fundas de otra marca', 'Protectores', 'Otra marca', ['Japanese']),
];

test('Tienda y Preventas: accesos por juego y marca, búsqueda, regreso, recarga y celular', async ({
  page,
}, info) => {
  page.setDefaultTimeout(15000);
  let kind: Product['kind'] = 'store';
  await page.route('**/api/**', async (route) => {
    expect(route.request().method()).toBe('GET');
    const u = new URL(route.request().url());
    if (u.pathname === '/api/auth/me') return route.fulfill({ json: null });
    if (u.pathname === '/api/settings')
      return route.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    if (u.pathname === '/api/products')
      return route.fulfill({ json: products.map((p) => ({ ...p, kind })) });
    const product = products.find((p) => u.pathname === `/api/products/${p.slug}`);
    return route.fulfill({
      status: product ? 200 : 404,
      json: product ? { ...product, kind } : { error: 'Fuera de la prueba.' },
    });
  });
  for (const path of ['/tienda', '/preventas']) {
    kind = path === '/tienda' ? 'store' : 'preorder';
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(path);
    const sections = page.getByRole('navigation', { name: 'Juegos y accesorios', exact: true });
    await expect(sections.getByRole('button')).toHaveCount(5);
    await expect(page.locator('.store-product-card')).toHaveCount(5);
    const category = page.getByRole('combobox', { name: 'Categoría', exact: true });
    await expect(category.locator('option')).toHaveText([
      'Todas las categorías',
      'Accesorios',
      'Mitos y Leyendas',
      'Yu-Gi-Oh!',
    ]);
    await category.selectOption('Accesorios');
    await expect(page.locator('.store-product-card')).toHaveCount(2);
    await page.reload();
    await expect(category).toHaveValue('Accesorios');
    await expect(page.locator('.store-product-card')).toHaveCount(2);
    await category.selectOption('');
    await expect(page.locator('.store-product-card')).toHaveCount(5);
    await sections.getByRole('button', { name: 'Yu-Gi-Oh!', exact: true }).click();
    await expect(page.locator('.store-product-title')).toHaveText(['Cartas Yu-Gi-Oh! de prueba']);
    await sections.getByRole('button', { name: 'MyL Primer Bloque', exact: true }).click();
    await expect(page.locator('.store-product-title')).toHaveText([
      'Mitos y Leyendas · Leyendas Primer Bloque',
    ]);
    await page.getByLabel('Buscar artículos', { exact: true }).fill('Leyendas');
    await sections.getByRole('button', { name: 'MyL Primera Era', exact: true }).click();
    await expect(page.getByLabel('Buscar artículos', { exact: true })).toHaveValue('Leyendas');
    await expect(page.locator('.store-product-title')).toHaveText([
      'Mitos y Leyendas · Leyendas Primera Era',
    ]);
    await expect(page).toHaveURL((url) => url.searchParams.get('grupo') === 'myl-first-era');
    await page.locator('.store-product-title').click();
    await expect(
      page.getByRole('heading', { name: 'Mitos y Leyendas · Leyendas Primera Era', exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      sections.getByRole('button', { name: 'MyL Primera Era', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('.store-product-title')).toHaveText([
      'Mitos y Leyendas · Leyendas Primera Era',
    ]);
    await page.getByRole('button', { name: 'Borrar búsqueda', exact: true }).click();
    await sections.getByRole('button', { name: 'Accesorios Zero Mulligan', exact: true }).click();
    await expect(page.locator('.store-product-title')).toHaveText([
      'Fundas Zero Mulligan de prueba',
    ]);
    await page.setViewportSize({ width: 375, height: 812 });
    await sections.getByRole('button', { name: 'MyL Primer Bloque', exact: true }).click();
    await expect(page.locator('.store-product-title')).toHaveText([
      'Mitos y Leyendas · Leyendas Primer Bloque',
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`${kind}-sections-375.png`), fullPage: true });
    await page.getByRole('button', { name: 'Mostrar filtros', exact: true }).click();
    await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    await expect(page.locator('.store-product-card')).toHaveCount(5);
    await expect(page).toHaveURL((url) => !url.searchParams.has('grupo'));
  }
});
