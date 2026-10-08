import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Product, Settings } from '../../lib/types';

// These browser-only fixtures exercise the presentation without creating
// products, changing inventory, calling checkout or contacting a payment provider.
const family = 'Edición de prueba de Yu-Gi-Oh!';
const group = 'shop-design-yugioh';
const now = '2026-10-03T12:00:00.000Z';
const front = '/art/hero/yugioh-front.webp';
const back = '/art/hero/yugioh-back.webp';

function product(id: string, override: Partial<Product> = {}): Product {
  return {
    id,
    slug: id,
    name: id,
    description: 'Artículo de prueba para comprobar formato, idioma y disponibilidad.',
    sku: id.toUpperCase(),
    price: 5000,
    discount_percent: 0,
    category: 'Yu-Gi-Oh!',
    catalog_group: group,
    catalog_name: family,
    brand: 'Konami',
    options: {},
    tags: ['Cartas coleccionables'],
    specifications: [{ label: 'Contenido', value: 'Se indica en el formato seleccionado' }],
    source_url: '',
    stock: 4,
    reserved: 0,
    available: 4,
    kind: 'store',
    status: 'published',
    images: [front, back],
    opens_at: null,
    closes_at: null,
    max_per_customer: null,
    delivery_terms: '',
    created_at: now,
    updated_at: now,
    version: 1,
    ...override,
  };
}

const variants = [
  product('shop-sobre-es', {
    name: `${family} · Sobre · Español`,
    options: { Formato: 'Sobre', Idioma: 'Español' },
    discount_percent: 20,
  }),
  product('shop-sobre-en', {
    name: `${family} · Sobre · Inglés`,
    options: { Formato: 'Sobre', Idioma: 'Inglés' },
    price: 5500,
    stock: 0,
    available: 0,
  }),
  product('shop-token-es', {
    name: `${family} · Token box · Español`,
    options: { Formato: 'Token box', Idioma: 'Español' },
    price: 38000,
    stock: 2,
    available: 2,
  }),
  product('shop-token-en', {
    name: `${family} · Token box · Inglés`,
    options: { Formato: 'Token box', Idioma: 'Inglés' },
    price: 39000,
    discount_percent: 10,
    stock: 1,
    available: 1,
  }),
  product('shop-display-es', {
    name: `${family} · Display de 24 sobres · Español`,
    options: { Formato: 'Display de 24 sobres', Idioma: 'Español' },
    price: 110000,
    discount_percent: 10,
    stock: 3,
    available: 3,
  }),
  product('shop-display-en', {
    name: `${family} · Display de 24 sobres · Inglés`,
    options: { Formato: 'Display de 24 sobres', Idioma: 'Inglés' },
    price: 120000,
    stock: 5,
    available: 5,
  }),
];
const mitos = product('shop-mitos', {
  name: 'Sobre de Mitos de prueba',
  category: 'Mitos y Leyendas',
  catalog_group: '',
  catalog_name: '',
  brand: 'Fénix',
  price: 2500,
  images: ['/art/hero/mitos-front.webp'],
  stock: 0,
  available: 0,
});
const accessory = product('shop-fundas', {
  name: 'Fundas de prueba',
  category: 'Accesorios',
  catalog_group: '',
  catalog_name: '',
  brand: 'Marca de prueba',
  price: 7000,
  images: [back],
  tags: ['Protección'],
});
const catalog = [...variants, mitos, accessory];

async function mockShop(page: Page) {
  const settings: Settings = {
    name: 'SERGOD STORE',
    description: '',
    address: 'Los Carrera 5142, Copiapó',
    hours: '',
    pickup_instructions: '',
    phone: '',
    email: '',
    reservation_minutes: 20,
    carriers: [],
    payment_mode: 'disabled',
  };
  await page.route('**/api/**', async (route) => {
    expect(route.request().method(), 'El recorrido visual solo consulta la API').toBe('GET');
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: null });
    if (url.pathname === '/api/settings') return route.fulfill({ json: settings });
    if (url.pathname === '/api/products') {
      const selected = catalog.filter(
        (item) =>
          (!url.searchParams.has('kind') || item.kind === url.searchParams.get('kind')) &&
          (!url.searchParams.has('group') || item.catalog_group === url.searchParams.get('group')),
      );
      return route.fulfill({ json: selected });
    }
    if (url.pathname.startsWith('/api/products/')) {
      const selected = catalog.find(
        (item) => item.slug === decodeURIComponent(url.pathname.split('/').at(-1)!),
      );
      return route.fulfill({
        status: selected ? 200 : 404,
        json: selected || { error: 'Artículo de prueba inexistente.' },
      });
    }
    return route.fulfill({ status: 404, json: { error: 'Ruta fuera de esta prueba visual.' } });
  });
}

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
}

async function expectFitsHorizontally(locator: Locator, width: number) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
}

test.beforeEach(async ({ page }) => {
  await mockShop(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Tienda y ficha: imágenes, controles y precios caben entre 320 y 1440 píxeles', async ({
  page,
}) => {
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tienda');
    await expect(page.locator('.store-product-card')).toHaveCount(8);
    await expectNoOverflow(page);
    await expectFitsHorizontally(page.getByLabel('Buscar artículos', { exact: true }), width);
    await expectFitsHorizontally(
      page.getByRole('combobox', { name: 'Ordenar artículos', exact: true }),
      width,
    );
    for (const card of await page.locator('.store-product-card').all()) {
      await expectFitsHorizontally(card, width);
      await expectFitsHorizontally(card.locator('.store-product-price'), width);
    }
    const quick = page.getByRole('button', {
      name: `Vista rápida de ${variants[0].name}`,
      exact: true,
    });
    await quick.click({ trial: true });

    await page.goto(`/producto/${variants[0].slug}`);
    await expect(page.getByRole('heading', { name: family, level: 1, exact: true })).toBeVisible();
    await expectNoOverflow(page);
    for (const control of [
      page.locator('.store-detail-main-image'),
      page.locator('.store-detail-price'),
      page.getByRole('combobox', { name: 'Formato', exact: true }),
      page.getByRole('combobox', { name: 'Idioma', exact: true }),
      page.getByRole('button', { name: 'Añadir al carrito', exact: true }),
    ]) {
      await expectFitsHorizontally(control, width);
    }
    await expect
      .poll(() =>
        page.locator('.store-detail-main-image img').evaluate((image) => {
          const img = image as HTMLImageElement;
          return img.complete && img.naturalWidth > 0;
        }),
      )
      .toBe(true);
    await page
      .getByRole('button', { name: 'Añadir al carrito', exact: true })
      .click({ trial: true });
  }
});

test('Filtros móviles: teclado, categoría conservada al recargar y limpieza completa', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/tienda');
  await expect(page.locator('.store-product-card')).toHaveCount(8);
  const toggle = page.getByRole('button', { name: 'Mostrar filtros', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Ocultar filtros', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  const category = page.getByRole('combobox', { name: 'Categoría', exact: true });
  await expect(category).toBeVisible();
  await category.selectOption('Yu-Gi-Oh!');
  await page.getByLabel('Precio hasta', { exact: true }).fill('6000');
  await page.getByLabel('Solo disponibles', { exact: true }).check();
  await expect(page.locator('.store-product-card')).toHaveCount(1);
  await expect(page.locator('.store-product-card')).toContainText(variants[0].name);
  await expect(page.locator('.store-product-price strong')).toHaveText('$4.000');
  await expect(page).toHaveURL((url) => url.searchParams.get('categoria') === 'Yu-Gi-Oh!');
  await expectNoOverflow(page);
  await page.reload();
  await page.getByRole('button', { name: 'Mostrar filtros', exact: true }).click();
  await expect(category).toHaveValue('Yu-Gi-Oh!');
  await expect(page.getByLabel('Precio hasta', { exact: true })).toHaveValue('6000');
  await expect(page.getByLabel('Solo disponibles', { exact: true })).toBeChecked();
  await expect(page.locator('.store-product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(category).toHaveValue('');
  await expect(page.getByLabel('Precio hasta', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Solo disponibles', { exact: true })).not.toBeChecked();
  await expect(page.locator('.store-product-card')).toHaveCount(8);
  await expect(page).toHaveURL((url) => !url.searchParams.has('categoria'));
  await page.reload();
  await expect(page.locator('.store-product-card')).toHaveCount(8);
});

test('Formatos e idiomas: precio, descuento, stock, galería y artículo añadido corresponden a la variante', async ({
  page,
}) => {
  await page.goto(`/producto/${variants[0].slug}`);
  await page.getByRole('button', { name: 'Ver imagen 2', exact: true }).click();
  await expect(page.locator('.store-detail-main-image img')).toHaveAttribute('src', back);
  await expect(page.getByRole('button', { name: 'Ver imagen 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Cantidad', { exact: true }).fill('3');

  // Expectations are explicit commercial values, independent of the application's
  // discount helper, and deliberately include a sold-out language sibling.
  const cases = [
    { index: 1, amount: '$5.500', original: null, units: 0 },
    { index: 2, amount: '$38.000', original: null, units: 2 },
    { index: 3, amount: '$35.100', original: '$39.000', units: 1 },
    { index: 4, amount: '$99.000', original: '$110.000', units: 3 },
    { index: 0, amount: '$4.000', original: '$5.000', units: 4 },
    { index: 5, amount: '$120.000', original: null, units: 5 },
  ];
  for (const item of cases) {
    const selected = variants[item.index];
    await page
      .getByRole('combobox', { name: 'Formato', exact: true })
      .selectOption(selected.options.Formato);
    // Changing format can navigate to its current-language sibling. Wait for
    // that response before selecting a language in the newly rendered control.
    await expect(page.locator('.store-sku')).toContainText(selected.sku.replace(/-(ES|EN)$/, ''));
    await page
      .getByRole('combobox', { name: 'Idioma', exact: true })
      .selectOption(selected.options.Idioma);
    await expect(page).toHaveURL(`/producto/${selected.slug}`);
    await expect(page.locator('.store-sku')).toContainText(selected.sku);
    await expect(page.locator('.store-detail-price strong')).toHaveText(item.amount);
    if (item.original) {
      await expect(page.locator('.store-detail-price del')).toHaveText(item.original);
    } else {
      await expect(page.locator('.store-detail-price del')).toHaveCount(0);
    }
    await expect(page.locator('.store-detail-main-image img')).toHaveAttribute('src', front);
    await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('1');
    const add = page.getByRole('button', { name: 'Añadir al carrito', exact: true });
    if (item.units === 0) {
      await expect(page.locator('.store-detail-stock')).toContainText('Agotado');
      await expect(add).toBeDisabled();
    } else {
      await expect(page.locator('.store-detail-stock')).toContainText(
        `${item.units} unidades disponibles`,
      );
      await expect(page.getByLabel('Cantidad', { exact: true })).toHaveAttribute(
        'max',
        String(item.units),
      );
      await expect(add).toBeEnabled();
    }
  }
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Formato', exact: true })).toHaveValue(
    'Display de 24 sobres',
  );
  await expect(page.getByRole('combobox', { name: 'Idioma', exact: true })).toHaveValue('Inglés');
  await expect(page.locator('.store-detail-price strong')).toHaveText('$120.000');
  await page.getByLabel('Cantidad', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('sergod-store-cart-v1') || '[]')),
    )
    .toEqual([{ product_id: variants[5].id, quantity: 2 }]);
});

test('Vista rápida móvil y escritorio: variante agotada, precio actualizado y Escape devuelve el foco', async ({
  page,
}) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tienda');
    const open = page.getByRole('button', {
      name: `Vista rápida de ${variants[0].name}`,
      exact: true,
    });
    await open.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Vista rápida', exact: true });
    await expect(dialog).toBeVisible();
    await expectFitsHorizontally(dialog, width);
    await dialog.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('Sobre');
    await dialog.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('Inglés');
    await expect(dialog.locator('.store-sku')).toContainText(variants[1].sku);
    await expect(dialog.locator('.store-detail-stock')).toContainText('Agotado');
    await expect(
      dialog.getByRole('button', { name: 'Añadir al carrito', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('Token box');
    await expect(dialog.locator('.store-detail-price strong')).toHaveText('$35.100');
    await expect(dialog.locator('.store-detail-stock')).toContainText('1 unidades disponibles');
    await expect(
      dialog.getByRole('link', { name: 'Ver ficha completa', exact: true }),
    ).toHaveAttribute('href', `/producto/${variants[3].slug}`);
    if (width === 375) {
      const add = dialog.getByRole('button', { name: 'Añadir al carrito', exact: true });
      await add.click();
      await expect(dialog.getByRole('status')).toContainText('se añadió al carrito');
      await expect(dialog.getByRole('link', { name: 'Ver carrito', exact: true })).toBeVisible();
      await add.click();
      await expect(dialog.getByRole('alert')).toContainText('Puedes añadir hasta 1 unidades');
      await expect
        .poll(() =>
          page.evaluate(() => JSON.parse(localStorage.getItem('sergod-store-cart-v1') || '[]')),
        )
        .toEqual([{ product_id: variants[3].id, quantity: 1 }]);
    }
    await expect(page).toHaveURL(/\/tienda$/);
    await expectNoOverflow(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  }
});
