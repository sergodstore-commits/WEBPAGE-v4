import { test, expect } from '@playwright/test';
import { initialWebNews } from '../../lib/web-news';

test('Noticias: columnas adaptables y enlace a fuente sin cargar sus recursos', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('yugiohmeta.com')) external.push(r.url());
  });
  await page.route('**/api/news', (route) =>
    route.fulfill({
      json: [
        {
          id: 'store-test',
          title: 'Liga SERGOD STORE',
          caption: 'Noticias de nuestra comunidad.',
          recorded_at: '2026-10-09T12:00:00Z',
          assets: [],
          permalink: '',
          username: '',
          source: 'manual',
          tournament_id: null,
          league_tournament_id: null,
          ranking_board: null,
        },
      ],
    }),
  );
  await page.route('**/api/news/web-sources', (route) => route.fulfill({ json: initialWebNews }));
  await page.goto('/noticias');
  const own = page.getByRole('region', { name: 'SERGOD STORE', exact: true });
  const world = page.getByRole('complementary', { name: 'Yu-Gi-Oh!', exact: true });
  await expect(own).toContainText('Liga SERGOD STORE');
  await expect(world).toContainText(initialWebNews[0].summary);
  const link = world.getByRole('link', { name: /Leer noticia original/ });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', initialWebNews[0].url);
  expect((await own.boundingBox())!.x).toBeLessThan((await world.boundingBox())!.x);
  await page.screenshot({ path: '.data/web-news-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await own.boundingBox())!.y).toBeLessThan((await world.boundingBox())!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(external).toEqual([]);
});

test('Admin: selección web protegida, editar español, ocultar y persistir', async ({ page }) => {
  expect(
    (
      await page.request.patch('/api/admin/news/web-sources', {
        data: [],
        headers: { Origin: 'http://localhost:3100' },
      })
    ).status(),
  ).toBe(401);
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const original = await (await page.request.get('/api/admin/news/web-sources')).json();
  try {
    expect(
      (
        await page.request.patch('/api/admin/news/web-sources', {
          data: [],
          headers: { Origin: 'https://evil.test' },
        })
      ).status(),
    ).toBe(403);
    await page.goto('/admin/noticias');
    const section = page.getByRole('region', { name: 'Actualidad Yu-Gi-Oh!', exact: true });
    await section.getByRole('button', { name: 'Editar', exact: true }).click();
    await section
      .getByLabel('Título en español', { exact: true })
      .fill('Beyond the Brave: cartas y rarezas');
    await section.getByRole('button', { name: 'Aplicar edición a la lista', exact: true }).click();
    await section.getByRole('checkbox', { name: /Mostrar Beyond the Brave/ }).uncheck();
    await section
      .getByRole('button', { name: 'Guardar selección de actualidad', exact: true })
      .click();
    await expect(
      section.getByRole('status').filter({ hasText: 'Selección publicada' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      section.getByRole('checkbox', {
        name: 'Mostrar Beyond the Brave: cartas y rarezas',
        exact: true,
      }),
    ).not.toBeChecked();
    expect(await (await page.request.get('/api/news/web-sources')).json()).toEqual([]);
  } finally {
    await page.request.patch('/api/admin/news/web-sources', {
      data: original,
      headers: { Origin: 'http://localhost:3100' },
    });
  }
});
