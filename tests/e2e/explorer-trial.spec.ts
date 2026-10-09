import { test, expect } from '@playwright/test';

test('explorador conserva presentaciones y lista externa sin cargar gráficos', async ({ page }) => {
  const externalRequests: string[] = [];
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/') && request.method() !== 'GET')
      mutations.push(request.url());
  });
  await page.route('**/api/products?kind=store', (route) =>
    route.fulfill({
      json: [
        {
          id: 'pack',
          name: 'Beyond the Brave · Sobre',
          slug: 'beyond-sobre',
          catalog_group: 'ygo-beyond-the-brave',
          options: { Formato: 'Sobre', Idioma: 'Inglés' },
          images: [],
        },
        {
          id: 'display',
          name: 'Beyond the Brave · Display',
          slug: 'beyond-display',
          catalog_group: 'ygo-beyond-the-brave',
          options: { Formato: 'Display', Idioma: 'Inglés' },
          images: [],
        },
      ],
    }),
  );
  page.on('request', (request) => {
    if (/https:\/\/(www\.)?(tcgplayer|yugiohmeta)\.com\//.test(request.url()))
      externalRequests.push(request.url());
  });
  await page.goto('/pruebas/explorador');
  await expect(page.getByRole('button', { name: 'Sobre Inglés' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Display Inglés' }).click();
  await expect(page.getByRole('link', { name: 'Ver este producto' })).toHaveAttribute(
    'href',
    '/producto/beyond-display',
  );
  await expect(page.getByRole('link', { name: /Ver cartas de Beyond the Brave/ })).toHaveAttribute(
    'href',
    'https://www.yugiohmeta.com/articles/sets/tcg/betb',
  );
  await expect(page.getByRole('link', { name: /Ver cartas de Beyond the Brave/ })).toHaveAttribute(
    'target',
    '_blank',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: '¿Qué cartas puede traer?' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(mutations).toEqual([]);
  expect(externalRequests).toEqual([]);
});
