import { test, expect, type Page } from '@playwright/test';
import type { Product } from '../../lib/types';

const family = 'Preventa de prueba';
const now = Date.now(),
  day = 86400000;
function article(id: string, change: Partial<Product> = {}): Product {
  return {
    id,
    slug: id,
    name: id,
    catalog_name: '',
    catalog_group: '',
    description: 'Descripción de preventa de prueba.',
    sku: id.toUpperCase(),
    price: 2500,
    discount_percent: 0,
    category: 'Yu-Gi-Oh!',
    brand: 'Konami',
    options: {},
    tags: [],
    specifications: [],
    source_url: '',
    stock: 5,
    reserved: 0,
    available: 5,
    kind: 'preorder',
    status: 'published',
    images: ['/art/hero/yugioh-front.webp'],
    opens_at: new Date(now - day).toISOString(),
    closes_at: new Date(now + day).toISOString(),
    max_per_customer: 2,
    delivery_terms: 'Retiro cuando llegue el producto. No es la fecha de cierre.',
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    version: 1,
    ...change,
  };
}
const products = [
  article('reserva-es', {
    release_date: '2027-01-28',
    catalog_group: 'grupo',
    catalog_name: family,
    options: { Idioma: 'Español' },
  }),
  article('reserva-en', {
    catalog_group: 'grupo',
    catalog_name: family,
    options: { Idioma: 'Inglés' },
    price: 3000,
    max_per_customer: 1,
    delivery_terms: 'Envío al llegar la edición en inglés.',
    closes_at: new Date(now + 2 * day).toISOString(),
  }),
  article('proximamente', {
    opens_at: new Date(now + day).toISOString(),
    closes_at: new Date(now + 2 * day).toISOString(),
  }),
  article('finalizada', {
    opens_at: new Date(now - 2 * day).toISOString(),
    closes_at: new Date(now - day).toISOString(),
  }),
  article('agotada', { available: 0, stock: 0 }),
  article('sin-fecha', { opens_at: null }),
];
async function mock(page: Page, mode: 'normal' | 'empty' | 'error' = 'normal') {
  await page.route('**/api/**', async (route) => {
    expect(route.request().method()).toBe('GET');
    const u = new URL(route.request().url());
    if (u.pathname === '/api/auth/me') return route.fulfill({ json: null });
    if (u.pathname === '/api/settings')
      return route.fulfill({
        json: {
          name: 'SERGOD STORE',
          description: '',
          address: '',
          hours: '',
          pickup_instructions: '',
          phone: '',
          email: '',
          reservation_minutes: 20,
          carriers: [],
          payment_mode: 'disabled',
        },
      });
    if (u.pathname === '/api/products')
      return route.fulfill({
        status: mode === 'error' ? 503 : 200,
        json:
          mode === 'error'
            ? { error: 'Error de prueba recuperable.' }
            : mode === 'empty'
              ? []
              : products.filter(
                  (p) =>
                    !u.searchParams.has('group') || p.catalog_group === u.searchParams.get('group'),
                ),
      });
    const p = products.find((p) => u.pathname === `/api/products/${p.slug}`);
    return route.fulfill({ status: p ? 200 : 404, json: p || { error: 'No disponible.' } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
}
test('Preventas: estados, fechas por opción, filtros persistentes y responsive', async ({
  page,
}, info) => {
  await mock(page);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/preventas');
    await expect(page.locator('.store-product-card')).toHaveCount(6);
    const spanishCard = page
      .locator('.store-product-card')
      .filter({ has: page.getByRole('link', { name: 'reserva-es', exact: true }) });
    await expect(spanishCard).toContainText('Hora de Chile');
    await expect(spanishCard).toContainText('Máximo 2 por cliente.');
    await expect(spanishCard.locator('time[datetime="2027-01-28"]')).toHaveText(/28.*ene.*2027/);
    for (const label of [
      'Reserva abierta',
      'Próximamente',
      'Preventa finalizada',
      'Cupos agotados',
      'Fechas por confirmar',
    ])
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText('Fechas según opción. Revisa la ficha.', { exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`preventas-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await page.getByRole('button', { name: 'Mostrar filtros', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Solo disponibles', exact: true }).check();
  await expect(page.locator('.store-product-card')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.store-product-card')).toHaveCount(2);
  await expect(page).toHaveURL(/disponibles=1/);
});
test('Reserva: límites e idioma actualizan fechas, precio, condiciones y carrito', async ({
  page,
}, info) => {
  await mock(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/producto/reserva-es');
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveAttribute('max', '2');
  await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('Inglés');
  await expect(page).toHaveURL('/producto/reserva-en');
  await expect(page.locator('.store-detail-price strong')).toHaveText('$3.000');
  await expect(page.locator('.store-preorder-info')).toContainText(
    'Envío al llegar la edición en inglés.',
  );
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveAttribute('max', '1');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Idioma', exact: true })).toHaveValue('Inglés');
  await page.getByRole('button', { name: 'Añadir reserva al carrito', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('sergod-store-cart-v1') || '[]')),
    )
    .toEqual([{ product_id: 'reserva-en', quantity: 1 }]);
  await page.screenshot({ path: info.outputPath('reserva-mobile.png'), fullPage: true });
  for (const slug of ['proximamente', 'finalizada', 'agotada', 'sin-fecha']) {
    await page.goto(`/producto/${slug}`);
    await expect(
      page.getByRole('button', { name: 'Añadir reserva al carrito', exact: true }),
    ).toBeDisabled();
  }
});
test('Vista rápida de preventa: condiciones por idioma, límite y foco al cerrar', async ({
  page,
}) => {
  await mock(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/preventas');
  const open = page.getByRole('button', { name: 'Vista rápida de reserva-es', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Vista rápida', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('Inglés');
  await expect(dialog.locator('.store-preorder-info')).toContainText(
    'Envío al llegar la edición en inglés.',
  );
  const add = dialog.getByRole('button', { name: 'Añadir reserva al carrito', exact: true });
  await add.click();
  await expect(dialog.getByRole('status')).toContainText('se añadió al carrito');
  await add.click();
  await expect(dialog.getByRole('alert')).toContainText('Puedes añadir hasta 1 unidades');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('Preventas: estados vacíos y recuperación tras error sin escrituras', async ({ page }) => {
  await mock(page, 'empty');
  await page.goto('/preventas');
  await expect(page.getByText('Aún no hay preventas publicadas', { exact: true })).toBeVisible();
  await page.unroute('**/api/**');
  await mock(page, 'error');
  await page.reload();
  await expect(page.getByText('Error de prueba recuperable.', { exact: true })).toBeVisible();
  await page.unroute('**/api/**');
  await mock(page);
  await page.getByRole('button', { name: 'Volver a intentar', exact: true }).click();
  await expect(page.locator('.store-product-card')).toHaveCount(6);
});
