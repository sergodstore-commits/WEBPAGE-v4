import { test, expect } from '@playwright/test';

test('Admin YGOrganization: fuente TCG, coincidencias y borrador revisable antes de publicar', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const candidate = {
    id: 'ygorg-first-look',
    title: '[TCG] Magnificent Maestros Grandmaster Rares First Look',
    summary: 'New TCG cards and their release date.',
    published_on: '2026-10-08',
    category: 'reveals',
    boards: ['yugioh'],
    source_image: '',
    url: 'https://ygorganization.com/first-look',
  };
  const fresh = {
    ...candidate,
    id: 'ygorg-product',
    title: '[TCG] New product announced',
    url: 'https://ygorganization.com/new-product',
  };
  let saved: any[] = [
    {
      ...candidate,
      id: 'meta-stored',
      title: 'Rarezas de Maestros',
      original_title: 'TCG: Magnificent Maestros Grandmaster Rares First Look Revealed',
      url: 'https://www.yugiohmeta.com/articles/news/maestros',
      visible: false,
      media_checked: true,
    },
  ];
  let source = '';
  await page.route('**/api/admin/news/web-sources', (route) => route.fulfill({ json: saved }));
  await page.route('**/api/admin/news/web-sources/review-ygorganization', (route) =>
    route.fulfill({ json: { items: [candidate, fresh] } }),
  );
  await page.route('**/api/admin/news/web-sources/draft', (route) => {
    source = route.request().postDataJSON().source;
    saved.push({
      ...fresh,
      title: 'Nuevo producto anunciado',
      summary: 'Contenido revisado en español para los jugadores.',
      original_title: fresh.title,
      media_checked: true,
      body: 'Contenido completo de la noticia en español.',
      visible: false,
    });
    return route.fulfill({ json: saved });
  });
  await page.route('**/api/admin/news/web-sources/ygorg-product/prepare', (route) =>
    route.fulfill({
      json: {
        items: saved,
        ready: 0,
        total: 0,
        storage_bytes: 0,
        storage_limit: 15000000,
      },
    }),
  );
  await page.route('**/api/admin/news/web-sources/ygorg-product', (route) => {
    saved = saved.map((item) => (item.id === fresh.id ? route.request().postDataJSON() : item));
    return route.fulfill({ json: saved });
  });
  await page.route('**/api/news/web-sources', (route) =>
    route.fulfill({ json: saved.filter((item) => item.visible) }),
  );
  await page.goto('/admin/noticias?paso=fuentes');
  const section = page.getByRole('region', { name: 'Actualidad Yu-Gi-Oh! y MyL', exact: true });
  await section.getByLabel('Fuente Yu-Gi-Oh!', { exact: true }).selectOption('ygorganization');
  await section.getByRole('button', { name: 'Buscar novedades Yu-Gi-Oh!', exact: true }).click();
  const results = section.getByRole('region', { name: 'Noticias TCG / OCG disponibles' });
  await expect(results).toContainText('Posible coincidencia con «Rarezas de Maestros»');
  await results.getByRole('button', { name: 'Revisar coincidencia', exact: true }).click();
  await expect(section.getByLabel('Título en español', { exact: true })).toHaveValue(
    'Rarezas de Maestros',
  );
  await section.getByRole('button', { name: /Buscar y preparar/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await results
    .getByRole('row')
    .filter({ hasText: fresh.title })
    .getByRole('button', { name: 'Preparar noticia', exact: true })
    .click();
  await expect(section.getByLabel('Título en español', { exact: true })).toHaveValue(
    'Nuevo producto anunciado',
  );
  expect(source).toBe('ygorganization');
  expect(saved.every((item) => !item.visible)).toBe(true);
  await section.locator('button[form="web-news-editor"][value="publish"]').click();
  await expect(
    section.getByRole('link', { name: 'Ver noticia publicada ↗', exact: true }),
  ).toHaveAttribute('href', '/noticias/tcg/ygorg-product');
  expect(saved.find((item) => item.id === fresh.id).visible).toBe(true);
});
