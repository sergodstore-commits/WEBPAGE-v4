import { test, expect } from '@playwright/test';
import { initialWebNews, newsContentBody, type WebNewsBlock } from '../../lib/web-news';
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
  const world = page.getByRole('region', { name: 'Yu-Gi-Oh! TCG / OCG', exact: true });
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
  await page.getByRole('button', { name: 'Yu-Gi-Oh! TCG / OCG', exact: true }).click();
  await expect(world).toContainText(initialWebNews[0].summary);
  // The banner stays complete; the controls share rows and article titles never cover artwork.
  const sectionsBox = await page
    .getByRole('navigation', { name: 'Secciones de noticias' })
    .boundingBox();
  const banlistsBox = await page
    .getByRole('group', { name: 'Herramientas de noticias' })
    .boundingBox();
  expect(Math.abs(sectionsBox!.y - banlistsBox!.y)).toBeLessThan(5);
  const filtersBox = await world
    .getByRole('group', { name: 'Categoría de noticias TCG' })
    .boundingBox();
  const searchBox = await world.getByRole('searchbox').boundingBox();
  expect(Math.abs(filtersBox!.y - searchBox!.y)).toBeLessThan(5);
  for (const card of await world.locator('article').all()) {
    const headingBox = await card.getByRole('heading', { level: 3 }).boundingBox();
    const coverBox = await card.locator('[data-category]').boundingBox();
    expect(headingBox!.y).toBeGreaterThanOrEqual(coverBox!.y + coverBox!.height);
    expect((await card.boundingBox())!.height).toBeLessThan(430);
    for (const image of await card.locator('[data-category] > img').all()) {
      const imageBox = await image.boundingBox();
      expect(imageBox!.height).toBeLessThanOrEqual(coverBox!.height + 1);
      expect(imageBox!.y).toBeGreaterThanOrEqual(coverBox!.y);
    }
  }
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
  const mobileTitle = await world.getByRole('heading', { level: 3 }).boundingBox();
  const mobileCover = await world.locator('[data-category]').boundingBox();
  expect(mobileTitle!.y).toBeGreaterThanOrEqual(mobileCover!.y + mobileCover!.height);
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

test('Noticias: temas persistentes, fechas originales y formatos separados', async ({ page }) => {
  const make = (id: string, published_on: string, category: string, boards = ['yugioh']) => ({
    ...initialWebNews[0],
    id,
    title: id,
    published_on,
    category,
    boards,
    article_path: `/noticias/tcg/${id}`,
  });
  await page.route('**/api/news/web-sources', (route) =>
    route.fulfill({
      json: [
        make('Antigua importada hoy', '2026-09-01', 'reveals'),
        make('Lanzamiento reciente', '2026-10-10', 'releases'),
        make('Revelación más reciente', '2026-10-09', 'reveals'),
        make('Noticia Primera Era', '2026-10-08', 'news', ['myl-first-era']),
        make('Torneo Primer Bloque', '2026-10-07', 'tournaments', ['myl-first-block']),
        { ...make('Excluir OCG', '2026-10-11', 'reveals'), format: 'OCG' },
      ],
    }),
  );
  await page.goto('/noticias?seccion=yugioh');
  const world = page.getByRole('region', { name: 'Yu-Gi-Oh! TCG / OCG', exact: true });
  await expect(world.locator('article h3')).toHaveText([
    'Lanzamiento reciente',
    'Revelación más reciente',
    'Antigua importada hoy',
  ]);
  await expect(world.getByRole('button', { name: 'Revelaciones', exact: true })).toContainText('2');
  await world.getByRole('button', { name: 'Revelaciones', exact: true }).click();
  await expect(page).toHaveURL(/seccion=yugioh&categoria=reveals$/);
  await expect(world.locator('article h3')).toHaveText([
    'Revelación más reciente',
    'Antigua importada hoy',
  ]);
  await page.reload();
  await expect(world.getByRole('button', { name: 'Revelaciones', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await world.getByRole('button', { name: 'Lanzamientos', exact: true }).click();
  await expect(page).toHaveURL(/categoria=releases$/);
  await page.goBack();
  await expect(world.getByRole('button', { name: 'Revelaciones', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await world.getByRole('searchbox').fill('sin resultados');
  await expect(world).toContainText('No hay noticias con estos filtros');
  await world.getByRole('button', { name: 'Quitar filtros', exact: true }).click();
  await expect(world.getByRole('searchbox')).toHaveValue('');
  await expect(world.locator('article')).toHaveCount(3);
  await expect(page).toHaveURL(/seccion=yugioh$/);
  await page.getByRole('button', { name: 'MyL Primera Era', exact: true }).click();
  const era = page.getByRole('region', { name: 'MyL Primera Era', exact: true });
  await expect(era.locator('article h3')).toHaveText(['Noticia Primera Era']);
  await expect(era.getByRole('button', { name: 'Actualidad', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'MyL Primer Bloque', exact: true }).click();
  const block = page.getByRole('region', { name: 'MyL Primer Bloque', exact: true });
  await expect(block.locator('article h3')).toHaveText(['Torneo Primer Bloque']);
  await expect(block.getByRole('button', { name: /Banlist/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Banlists/ })).toBeVisible();
  await page.goto('/noticias?seccion=myl-first-block&categoria=desconocida');
  await expect(block.getByRole('button', { name: 'Todas', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(block.getByRole('button', { name: 'Torneos', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  for (const path of [
    'review',
    'review-myl',
    'review-ygorganization',
    'draft',
    'example/prepare',
    'example/images',
  ])
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
      .getByLabel('Edición relacionada (opcional)', { exact: true })
      .selectOption('betb');
    await section
      .getByRole('button', { name: 'Guardar cambios de la noticia', exact: true })
      .click();
    await expect(section.getByRole('status').filter({ hasText: 'Noticia guardada' })).toBeVisible();
    expect(
      (await (await page.request.get('/api/news/tcg/beyond-the-brave')).json()).edition_code,
    ).toBe('betb');
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
  await expect(era.getByRole('link', { name: /Cambios revisados/ })).toHaveCount(0);
  await expect(era.getByRole('link', { name: /Beyond the Brave/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Banlists/ }).click();
  await expect(era.getByRole('region', { name: 'Banlist por formato' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Banlist por formato' })).toBeVisible();
  await page.getByRole('button', { name: 'MyL Primer Bloque', exact: true }).click();
  const block = page.getByRole('region', { name: 'MyL Primer Bloque', exact: true });
  await expectReadable(page);
  await page.goto('/noticias/myl/myl-example');
  await expect(page.getByRole('heading', { name: myl.title, exact: true })).toBeVisible();
  await expect(page.getByLabel('Vigencia de la banlist')).toContainText('8 de octubre de 2026');
  await expect(page.getByLabel('Vigencia de la banlist')).toContainText('11 de octubre de 2026');
  await expect(page.getByRole('link', { name: 'Blog oficial Mitos y Leyendas ↗' })).toHaveAttribute(
    'href',
    myl.url,
  );
});

test('Admin MyL: buscar y preparar productos conserva fecha, formato y confirmación pública', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const candidate = {
    id: 'myl-admin-example',
    title: 'Leyendas Primera Era: nuevas cartas',
    summary: 'Referencia breve oficial del blog.',
    url: 'https://blog.myl.cl/leyendas-de-prueba/',
    published_on: '2026-10-07',
    boards: ['myl-first-era', 'myl-first-block'],
    category: 'reveals',
    source_image: '',
  };
  let saved: any[] = [];
  let rejectPublication = true;
  let noCandidates = false;
  await page.route('**/api/admin/news/web-sources', (r) => r.fulfill({ json: saved }));
  await page.route('**/api/admin/news/web-sources/*', (r) => {
    if (r.request().method() === 'PATCH') {
      const item = r.request().postDataJSON();
      if (item.visible && rejectPublication) {
        rejectPublication = false;
        return r.fulfill({ status: 503, json: { error: 'Servicio temporalmente no disponible.' } });
      }
      saved = [item];
    }
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
    r.fulfill({ json: { items: noCandidates ? [] : [candidate] } }),
  );
  await page.goto('/admin/noticias');
  const section = page.getByRole('region', { name: 'Actualidad Yu-Gi-Oh! y MyL', exact: true });
  await section.getByRole('button', { name: /Buscar y preparar/ }).click();
  await expect(section).toContainText('TCG y OCG para Yu-Gi-Oh!');
  await expect(section).toContainText('Las restricciones se actualizan en Banlists.');
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
  await section.getByRole('button', { name: 'Guardar cambios de la noticia', exact: true }).click();
  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].boards).toEqual(['myl-first-era']);
  expect(saved[0].visible).toBe(false);
  expect(saved[0].category).toBe('reveals');
  await section.getByRole('button', { name: 'Editar', exact: true }).click();
  const publishRow = section.getByRole('row').filter({ hasText: saved[0].title });
  await expect(
    publishRow.getByRole('button', { name: 'Publicar noticia', exact: true }),
  ).toBeEnabled();
  await section.getByLabel('Título en español', { exact: true }).fill('');
  await publishRow.getByRole('button', { name: 'Publicar noticia', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('Título en español:');
  expect(saved[0].visible).toBe(false);
  await section
    .getByLabel('Título en español', { exact: true })
    .fill('Cambios revisados para nuestra liga');
  await publishRow.getByRole('button', { name: 'Publicar noticia', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('Servicio temporalmente no disponible.');
  const errorBox = await section.getByRole('alert').boundingBox();
  expect(errorBox!.y).toBeGreaterThanOrEqual(0);
  expect(errorBox!.y + errorBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(section.getByLabel('Título en español', { exact: true })).toHaveValue(
    'Cambios revisados para nuestra liga',
  );
  expect(saved[0].visible).toBe(false);
  await section.getByRole('button', { name: 'Publicar noticia revisada', exact: true }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Noticia publicada' })).toBeVisible();
  await expect(section.getByRole('link', { name: 'Ver noticia publicada ↗' })).toHaveAttribute(
    'href',
    '/noticias/myl/myl-admin-example',
  );
  expect(saved[0].visible).toBe(true);
  await page.reload();
  await expect(section.getByRole('row').filter({ hasText: saved[0].title })).toContainText(
    'Publicado',
  );
  noCandidates = true;
  await section.getByRole('button', { name: /Buscar y preparar/ }).click();
  await section.getByRole('button', { name: 'Buscar novedades MyL', exact: true }).click();
  await expect(section.getByRole('status')).toContainText('La fuente no ofrece revelaciones');
  await expect(section.getByRole('region', { name: 'Noticias MyL disponibles' })).toHaveCount(0);
  expect(saved[0].visible).toBe(true);
  await page
    .getByRole('navigation', { name: 'Administración', exact: true })
    .getByRole('link', { name: 'Banlists', exact: true })
    .click();
  await expect(section).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Banlist Yu-Gi-Oh! TCG' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Banlists', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/admin-news-workspace-mobile.png', fullPage: true });
});

test('Admin: biblioteca separada de fuentes, filtros, historial y herramientas bajo demanda', async ({
  page,
}) => {
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://localhost:3100' },
    data: { email: 'e2e@example.test', password: 'E2e-Prueba-Sergod-2026!' },
  });
  expect(login.ok()).toBeTruthy();
  const items = [
    {
      id: 'workflow-tcg',
      title: 'Nueva edición TCG',
      summary: 'Cartas de prueba',
      body: 'Texto revisado',
      url: 'https://www.yugiohmeta.com/articles/test-workflow',
      published_on: '2026-10-10',
      category: 'news',
      boards: ['yugioh'],
      visible: false,
      media_checked: true,
    },
    {
      id: 'workflow-myl',
      title: 'Liga Primera Era',
      summary: 'Noticias de MyL',
      body: 'Texto original español',
      url: 'https://blog.myl.cl/test-workflow/',
      published_on: '2026-10-09',
      category: 'news',
      boards: ['myl-first-era'],
      visible: true,
      media_checked: true,
    },
  ];
  const requests: string[] = [];
  await page.route('**/api/admin/news/web-sources', (route) => route.fulfill({ json: items }));
  await page.route('**/api/admin/news/web-sources/review', (route) =>
    route.fulfill({ json: { items: [items[0]] } }),
  );
  await page.route('**/api/admin/news/web-sources/draft', (route) => {
    requests.push('download');
    return route.fulfill({ status: 500 });
  });
  await page.route('**/api/admin/news/editions', (route) => {
    requests.push('editions');
    return route.fulfill({
      json: { editions: [], discoveries: [], storage_bytes: 0, storage_limit: 15000000 },
    });
  });
  await page.route('**/api/admin/news/banlist', (route) => {
    requests.push('banlist');
    return route.fulfill({
      json: { state: null, ready: 0, total: 0, storage_bytes: 0, storage_limit: 15000000 },
    });
  });
  await page.route('**/api/admin/integrations/instagram', (route) => {
    requests.push('instagram');
    return route.fulfill({ json: { configured: false, connected: false } });
  });
  await page.goto('/admin/noticias');
  const section = page.getByRole('region', { name: 'Actualidad Yu-Gi-Oh! y MyL', exact: true });
  await expect(section.getByRole('row').filter({ hasText: 'Nueva edición TCG' })).toBeVisible();
  expect(requests).toEqual([]);
  await expect(
    section.getByRole('button', { name: 'Buscar novedades Yu-Gi-Oh!', exact: true }),
  ).not.toBeVisible();
  await section
    .getByRole('combobox', { name: 'Juego o formato', exact: true })
    .selectOption('myl-first-era');
  await expect(section.getByRole('row').filter({ hasText: 'Nueva edición TCG' })).toHaveCount(0);
  await expect(section.getByRole('row').filter({ hasText: 'Liga Primera Era' })).toBeVisible();
  await section.getByLabel('Buscar noticias guardadas', { exact: true }).fill('sin coincidencias');
  await expect(section).toContainText('No hay noticias con estos filtros');
  await section.getByLabel('Buscar noticias guardadas', { exact: true }).fill('');
  await section.getByRole('combobox', { name: 'Juego o formato', exact: true }).selectOption('all');
  await section
    .getByRole('row')
    .filter({ hasText: 'Nueva edición TCG' })
    .getByRole('button', { name: 'Editar', exact: true })
    .click();
  await section.getByLabel('Título en español', { exact: true }).fill('Borrador sin perder');
  const navigation = page.getByRole('navigation', { name: 'Administración', exact: true });
  await navigation.getByRole('link', { name: 'Biblioteca de cartas', exact: true }).click();
  await expect(navigation.locator('[aria-current=page]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Guías de nuevas ediciones' })).toBeVisible();
  expect(requests).toEqual(['editions']);
  await navigation.getByRole('link', { name: 'Noticias', exact: true }).click();
  await expect(section.getByLabel('Título en español', { exact: true })).toHaveValue(
    'Borrador sin perder',
  );
  await section.getByRole('button', { name: /Buscar y preparar/ }).click();
  await expect(page).toHaveURL(/paso=fuentes/);
  await expect(
    section.getByRole('button', { name: 'Buscar novedades Yu-Gi-Oh!', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(section.getByLabel('Título en español', { exact: true })).toHaveValue(
    'Borrador sin perder',
  );
  await section.getByRole('button', { name: /Buscar y preparar/ }).click();
  await section.getByRole('button', { name: 'Buscar novedades Yu-Gi-Oh!', exact: true }).click();
  await section.getByRole('button', { name: 'Revisar noticia guardada', exact: true }).click();
  await expect(section.getByLabel('Título en español', { exact: true })).toHaveValue(
    items[0].title,
  );
  await expect(
    section.getByRole('status').filter({ hasText: 'No se ha vuelto a descargar' }),
  ).toBeVisible();
  expect(requests).toEqual(['editions']);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Artículo completo: secciones, condiciones e imágenes en contexto con ampliación', async ({
  page,
}) => {
  const blocks: WebNewsBlock[] = [
    { kind: 'heading', text: 'Amadís' },
    {
      kind: 'paragraph',
      text: 'Puedes jugar el Aliado sin pagar su Coste si controlas un Aliado del mismo Coste. Solo una vez por turno.',
    },
    {
      kind: 'image',
      text: 'Amadís',
      source: 'https://blog.myl.cl/wp-content/uploads/2026/10/test.png',
    },
    { kind: 'heading', text: 'Espada Verde' },
    {
      kind: 'paragraph',
      text: 'Si hace daño de combate, busca una carta que no sea Oro en el Mazo Castillo oponente y destiérrala.',
    },
  ];
  await page.route('**/api/news/myl/myl-complete', (r) =>
    r.fulfill({
      json: {
        id: 'myl-complete',
        title: 'Cartas de Amadís: detalles',
        summary: 'Información de las cartas y sus condiciones.',
        url: 'https://blog.myl.cl/amadis-test/',
        published_on: '2026-10-07',
        body: newsContentBody(blocks),
        content_blocks: blocks,
        media: [{ source: blocks[2].source, name: 'Amadís', image: '/art/hero/yugioh-front.webp' }],
      },
    }),
  );
  await page.goto('/noticias/myl/myl-complete');
  await expect(page.getByRole('heading', { name: 'Amadís', exact: true })).toBeVisible();
  await expect(page.getByText(/Solo una vez por turno/)).toBeVisible();
  const position = await page
    .locator('article')
    .evaluate((el) =>
      Array.from(el.querySelectorAll('h2,figure')).map((n) => n.tagName + ':' + n.textContent),
    );
  expect(position).toEqual(['H2:Amadís', 'FIGURE:Amadís', 'H2:Espada Verde']);
  await page.getByRole('button', { name: 'Ampliar Amadís', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Amadís' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
