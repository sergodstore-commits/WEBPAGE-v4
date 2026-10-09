import { test, expect } from '@playwright/test';

test('explorador aislado carga el proveedor solo bajo demanda y funciona en móvil', async ({
  page,
}) => {
  let embeds = 0;
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
  await page.route('https://tcgindex.io/embed/**', (route) => {
    embeds++;
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>Gráfico externo de prueba</h1>' });
  });
  await page.goto('/pruebas/explorador');
  await expect(page.getByRole('button', { name: 'Sobre Inglés' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(embeds).toBe(0);
  await page.getByRole('button', { name: 'Display Inglés' }).click();
  await expect(page.getByRole('link', { name: 'Ver este producto' })).toHaveAttribute(
    'href',
    '/producto/beyond-display',
  );
  await page.getByRole('button', { name: 'Cargar precio e historial' }).click();
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Gráfico externo de prueba' }),
  ).toBeVisible();
  expect(embeds).toBe(1);
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect.poll(() => embeds).toBe(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Dark Time Wizard' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(mutations).toEqual([]);
});

