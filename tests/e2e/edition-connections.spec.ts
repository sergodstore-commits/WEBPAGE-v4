import { test, expect } from '@playwright/test';
import type { EditionProducts } from '../../lib/edition-connections';

const products: EditionProducts = {
  edition: { code: 'betb', name: 'Beyond the Brave' },
  products: [
    ['Sobre español', 'pack', 5000, 'store', 2],
    ['Display inglés', 'display', 120000, 'store', 0],
    ['Token box español', 'token', 22000, 'preorder', 4],
  ].map(([name, slug, price, kind, available], index) => ({
    id: String(index),
    name: String(name),
    slug: String(slug),
    price: Number(price),
    kind: kind as 'store' | 'preorder',
    available: Number(available),
    discount_percent: 0,
    images: ['/art/hero/yugioh-front.webp'],
    options: { Idioma: index === 1 ? 'Inglés' : 'Español' },
    opens_at: '2000-01-01T00:00:00Z',
    closes_at: '2099-01-01T00:00:00Z',
    release_date: null,
  })),
};

test('Conexiones: guía a Comunidad y presentaciones separadas bajo demanda', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/community/editions/betb/products', (route) => {
    requests++;
    return route.fulfill({ json: products });
  });
  await page.goto('/noticias/beyond-the-brave');
  await expect(page.getByRole('button', { name: /^Ver carta:/ })).toHaveCount(100);
  const connections = page.getByRole('region', { name: 'Cartas y productos de esta edición' });
  await expect(connections).toBeVisible();
  expect(requests).toBe(0);
  await expect(
    connections.getByRole('link', { name: 'Explorar cartas en Comunidad' }),
  ).toHaveAttribute('href', '/comunidad?vista=ediciones&edicion=betb');
  await connections.locator('summary').click();
  await expect(connections.getByRole('link', { name: /^Ver / })).toHaveCount(3);
  await expect(connections).toContainText('$5.000');
  await expect(connections).toContainText('$120.000');
  await expect(connections).toContainText('$22.000');
  await expect(connections).toContainText('Agotado');
  await expect(connections).toContainText('Reserva disponible');
  await expect(connections.getByRole('link', { name: 'Ver Display inglés' })).toHaveAttribute(
    'href',
    '/producto/display',
  );
  await connections.locator('summary').click();
  await connections.locator('summary').click();
  expect(requests).toBe(1);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(connections.getByRole('link', { name: 'Ver Token box español' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await connections.getByRole('link', { name: 'Explorar cartas en Comunidad' }).click();
  await expect(page).toHaveURL(/vista=ediciones&edicion=betb/);
  await expect(connections.getByRole('link', { name: 'Leer guía de la edición' })).toHaveAttribute(
    'href',
    '/noticias/beyond-the-brave',
  );
  await connections.locator('summary').click();
  await expect(connections.getByRole('link', { name: /^Ver / })).toHaveCount(3);
});

test('Conexiones: noticia relacionada, error recuperable y edición sin productos', async ({
  page,
}) => {
  await page.route('**/api/news/tcg/related-example', (route) =>
    route.fulfill({
      json: {
        id: 'related-example',
        title: 'Novedades de Beyond the Brave',
        summary: 'Información preparada en español para esta edición.',
        url: 'https://www.yugiohmeta.com/articles/sets/tcg/betb',
        published_on: '2026-10-11',
        visible: true,
        edition_code: 'betb',
        body: 'Una noticia relacionada con su guía y catálogo.',
      },
    }),
  );
  let requests = 0;
  await page.route('**/api/community/editions/betb/products', (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 503, json: { error: 'Error temporal' } })
      : route.fulfill({ json: { ...products, products: [] } });
  });
  await page.goto('/noticias/tcg/related-example');
  const connections = page.getByRole('region', { name: 'Cartas y productos de esta edición' });
  await expect(connections).toBeVisible();
  expect(requests).toBe(0);
  await connections.locator('summary').click();
  await expect(connections.getByRole('alert')).toContainText('No pudimos consultar');
  await connections.getByRole('button', { name: 'Reintentar productos' }).click();
  await expect(connections).toContainText('Por ahora no hay productos publicados');
  await expect(
    connections.getByRole('link', { name: 'Explorar cartas en Comunidad' }),
  ).toBeVisible();
  expect((await page.request.get('/api/community/editions/private/products')).status()).toBe(404);
});
