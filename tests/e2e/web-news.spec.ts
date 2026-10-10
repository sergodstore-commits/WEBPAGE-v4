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
  for (const path of ['review', 'review-myl', 'draft', 'example/prepare', 'example/images'])
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
    const section = page.getByRole('region', { name: 'Actualidad Yu-Gi-Oh! y MyL', exact: true });
    await section.getByRole('button', { name: 'Editar', exact: true }).click();
    await section
      .getByLabel('Título en español', { exact: true })
      .fill('Beyond the Brave: cartas y rarezas');
    await section
      .getByRole('button', { name: 'Guardar cambios de la noticia', exact: true })
      .click();
    await expect(section.getByRole('status').filter({ hasText: 'Noticia guardada' })).toBeVisible();
    await section.getByRole('button', { name: 'Retirar noticia', exact: true }).click();
    await expect(section.getByRole('status').filter({ hasText: 'Noticia retirada' })).toBeVisible();
    await page.reload();
    const row = section.getByRole('row').filter({ hasText: 'Beyond the Brave: cartas y rarezas' });
    await expect(row).toContainText('Borrador');
    await expect(row.getByRole('button', { name: 'Publicar noticia', exact: true })).toBeVisible();
    expect(await (await page.request.get('/api/news/web-sources')).json()).toEqual([]);
  } finally {
    await page.request.patch('/api/admin/news/web-sources', {
      data: original,
      headers: { Origin: 'http://localhost:3100' },
    });
  }
});

test('MyL: pestañas separadas, banlist y vigencia dentro de la noticia', async ({ page }) => {
  const myl = {
    id: 'myl-example',
    title: 'Cambios revisados de la banlist',
    summary: 'Aviso para los jugadores de los dos formatos clásicos.',
    url: 'https://blog.myl.cl/noticia-de-prueba/',
    published_on: '2026-10-07',
    visible: true,
    boards: ['myl-first-era', 'myl-first-block'],
    category: 'banlist',
    article_path: '/noticias/myl/myl-example',
    body: 'Consulta los cambios revisados por SERGOD STORE.',
    effective_dates: { 'myl-first-era': '2026-10-08', 'myl-first-block': '2026-10-11' },
  };
  await page.route('**/api/news', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/news/web-sources', (r) => r.fulfill({ json: [initialWebNews[0], myl] }));
  await page.route('**/api/news/myl/myl-example', (r) => r.fulfill({ json: myl }));
  await page.goto('/noticias');
  await expect(page.getByRole('link', { name: /Cambios revisados/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'MyL Primera Era', exact: true }).click();
  const era = page.getByRole('region', { name: 'MyL Primera Era', exact: true });
  await expect(era.getByRole('link', { name: /Cambios revisados/ })).toBeVisible();
  await expect(era.getByRole('link', { name: /Beyond the Brave/ })).toHaveCount(0);
  await era.getByRole('button', { name: 'Banlist', exact: true }).click();
  await expect(era.getByRole('link')).toHaveCount(1);
  await page.getByRole('button', { name: 'MyL Primer Bloque', exact: true }).click();
  const block = page.getByRole('region', { name: 'MyL Primer Bloque', exact: true });
  await expectReadable(page);
  await block.getByRole('link', { name: /Cambios revisados/ }).click();
  await expect(page.getByRole('heading', { name: myl.title, exact: true })).toBeVisible();
  await expect(page.getByLabel('Vigencia de la banlist')).toContainText('8 de octubre de 2026');
  await expect(page.getByLabel('Vigencia de la banlist')).toContainText('11 de octubre de 2026');
  await expect(page.getByRole('link', { name: 'Blog oficial Mitos y Leyendas ↗' })).toHaveAttribute(
    'href',
    myl.url,
  );
});

test('Admin MyL: buscar y preparar conserva fecha y permite elegir formato y vigencia', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const candidate = {
    id: 'myl-admin-example',
    title: 'Banlist General MyL',
    summary: 'Referencia breve oficial del blog.',
    url: 'https://blog.myl.cl/banlist-de-prueba/',
    published_on: '2026-10-07',
    boards: ['myl-first-era', 'myl-first-block'],
    category: 'banlist',
    source_image: '',
  };
  let saved: any[] = [];
  await page.route('**/api/admin/news/web-sources', (r) => r.fulfill({ json: saved }));
  await page.route('**/api/admin/news/web-sources/*', (r) => {
    if (r.request().method() === 'PATCH') saved = [r.request().postDataJSON()];
    if (r.request().url().endsWith('/draft'))
      saved = [
        {
          ...candidate,
          visible: false,
          media_checked: true,
          body: candidate.summary,
          original_title: candidate.title,
          original_summary: candidate.summary,
        },
      ];
    return r.fulfill({ json: saved });
  });
  await page.route('**/api/admin/news/web-sources/*/prepare', (r) =>
    r.fulfill({
      json: { items: saved, ready: 0, total: 0, storage_bytes: 0, storage_limit: 15000000 },
    }),
  );
  await page.route('**/api/news/web-sources', (r) =>
    r.fulfill({ json: saved.filter((i) => i.visible) }),
  );
  await page.route('**/api/admin/news/web-sources/review-myl', (r) =>
    r.fulfill({ json: { items: [candidate] } }),
  );
  await page.goto('/admin/noticias');
  const section = page.getByRole('region', { name: 'Actualidad Yu-Gi-Oh! y MyL', exact: true });
  await section.getByRole('button', { name: 'Buscar novedades MyL', exact: true }).click();
  await expect(section.getByRole('region', { name: 'Noticias MyL disponibles' })).toContainText(
    candidate.title,
  );
  await section.getByRole('button', { name: 'Preparar noticia', exact: true }).click();
  await expect(section.getByLabel('Fecha del artículo', { exact: true })).toHaveValue('2026-10-07');
  await section
    .getByLabel('Título en español', { exact: true })
    .fill('Cambios revisados para nuestra liga');
  await section
    .getByRole('textbox', { name: 'Resumen propio en español', exact: true })
    .fill('Resumen preparado por la tienda para sus jugadores.');
  await section.getByRole('checkbox', { name: 'MyL Primer Bloque', exact: true }).uncheck();
  await section.getByLabel('MyL Primera Era · vigente desde', { exact: true }).fill('2026-10-08');
  await section.getByRole('button', { name: 'Guardar cambios de la noticia', exact: true }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].boards).toEqual(['myl-first-era']);
  expect(saved[0].visible).toBe(false);
  expect(saved[0].effective_dates['myl-first-era']).toBe('2026-10-08');
  await section.getByRole('button', { name: 'Editar', exact: true }).click();
  await section.getByRole('button', { name: 'Publicar noticia revisada', exact: true }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Noticia publicada' })).toBeVisible();
  expect(saved[0].visible).toBe(true);
  await page.reload();
  await expect(section.getByRole('row').filter({ hasText: saved[0].title })).toContainText(
    'Publicada',
  );
  await page
    .getByRole('navigation', { name: 'Herramientas de contenido' })
    .getByRole('button', { name: 'Banlist TCG' })
    .click();
  await expect(section).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Banlist Yu-Gi-Oh! TCG' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('navigation', { name: 'Herramientas de contenido' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/admin-news-workspace-mobile.png', fullPage: true });
});
