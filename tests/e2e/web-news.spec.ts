import { test, expect } from '@playwright/test';
import { initialWebNews } from '../../lib/web-news';
import { expectReadable } from './helpers/readability';

test('Noticias: pestañas por comunidad, galería TCG con filtros y lectura interna', async ({
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
  await page.route('**/api/news/web-sources', (route) =>
    route.fulfill({
      json: [
        {
          ...initialWebNews[0],
          article_path: '/noticias/beyond-the-brave',
          cover_cards: ['/editions/betb/77482666-thumb.webp'],
        },
        {
          ...initialWebNews[0],
          id: 'reveal-test',
          title: 'Nuevas cartas reveladas',
          category: 'reveals',
          article_path: '/noticias/tcg/reveal-test',
          image: '/art/hero/yugioh-front.webp',
        },
      ],
    }),
  );
  await page.route('**/api/news/tcg/reveal-test', (route) =>
    route.fulfill({
      json: {
        ...initialWebNews[0],
        id: 'reveal-test',
        title: 'Nuevas cartas reveladas',
        category: 'reveals',
        body: 'Texto propio en español.\n\nDetalles revisados por la tienda.',
        media: [
          {
            source: 'test',
            name: 'Carta de prueba',
            image: '/art/hero/yugioh-front.webp',
            caption: 'Efecto revisado en español.',
          },
        ],
      },
    }),
  );
  await page.goto('/noticias');
  const own = page.getByRole('region', { name: 'SERGOD STORE', exact: true });
  const world = page.getByRole('region', { name: 'Yu-Gi-Oh! TCG', exact: true });
  await expect(own).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'SERGOD STORE', exact: true }).click();
  await expect(own).toContainText('Liga SERGOD STORE');
  await page.getByRole('button', { name: 'MyL Primera Era', exact: true }).click();
  await expect(page.getByRole('region', { name: 'MyL Primera Era', exact: true })).toContainText(
    'Pronto tendremos novedades',
  );
  await page.getByRole('button', { name: 'MyL Primer Bloque', exact: true }).click();
  await expect(page.getByRole('region', { name: 'MyL Primer Bloque', exact: true })).toContainText(
    'Pronto tendremos novedades',
  );
  await page.getByRole('button', { name: 'Yu-Gi-Oh! TCG', exact: true }).click();
  await expect(world).toContainText(initialWebNews[0].summary);
  await expect(world.getByRole('link', { name: /Beyond the Brave/ })).toHaveAttribute(
    'href',
    '/noticias/beyond-the-brave',
  );
  await expect(own).toHaveCount(0);
  await expectReadable(page);
  await world.getByRole('button', { name: 'Revelaciones', exact: true }).click();
  await expect(world.getByRole('link')).toHaveCount(1);
  await world.getByRole('searchbox').fill('no existe');
  await expect(world).toContainText('No hay noticias con estos filtros');
  await world.getByRole('searchbox').fill('');
  await page.screenshot({ path: '.data/web-news-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(own).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(external).toEqual([]);
  await world.getByRole('link', { name: /Nuevas cartas reveladas/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Nuevas cartas reveladas', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Texto propio en español.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ampliar Carta de prueba' }).click();
  await expect(page.getByRole('dialog')).toContainText('Efecto revisado en español.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
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
  for (const path of ['review', 'example/prepare', 'example/images'])
    expect(
      (
        await page.request.post(`/api/admin/news/web-sources/${path}`, {
          data: {},
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
    expect(
      (
        await page.request.post('/api/admin/news/web-sources/review', {
          data: {},
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
