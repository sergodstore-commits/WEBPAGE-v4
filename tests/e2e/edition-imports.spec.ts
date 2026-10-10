import { test, expect } from '@playwright/test';
import type { EditionDocument, EditionPanel, EditionSummary } from '../../lib/edition-gallery';
import baseline from '../../public/editions/betb/cards.json';

test('Admin: búsqueda protegida, pausar, reanudar, revisar y publicar una guía', async ({
  page,
}) => {
  expect(
    (
      await page.request.post('/api/admin/news/editions/search', {
        headers: { Origin: 'http://localhost:3100' },
      })
    ).status(),
  ).toBe(401);
  expect((await page.request.get('/api/admin/news/editions/test/preview')).status()).toBe(401);
  expect((await page.request.get('/api/news/editions/test')).status()).toBe(404);
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  expect(
    (
      await page.request.post('/api/admin/news/editions/search', {
        headers: { Origin: 'https://evil.test' },
      })
    ).status(),
  ).toBe(403);

  let state: EditionSummary = {
    code: 'test',
    name: 'Edición de prueba',
    expected: 2,
    release_date: '2026-10-09',
    title: 'Edición de prueba: guía de cartas',
    summary: 'Consulta todas las cartas y sus efectos oficiales en español.',
    body: 'Artículo en español con una galería completa. Las rarezas se reúnen en una ficha por carta.',
    ready: 0,
    total: 2,
    source_complete: true,
    complete: false,
    last_error: '',
    published: false,
  };
  const panel: EditionPanel = {
    discoveries: [],
    discovered_at: null,
    editions: [],
    storage_bytes: 0,
    storage_limit: 100000000,
  };
  let batches = 0;
  await page.route('**/api/admin/news/editions{,/**}', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/search')) {
      panel.discoveries = [
        { code: state.code, name: state.name, expected: 2, release_date: state.release_date },
      ];
      panel.discovered_at = '2026-10-09T12:00:00Z';
    } else if (url.pathname.endsWith('/prepare')) {
      panel.editions = [state];
      return route.fulfill({ json: state });
    } else if (url.pathname.endsWith('/batch')) {
      batches++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      state = { ...state, ready: state.ready + 1, complete: state.ready + 1 === 2 };
      panel.editions = [state];
      return route.fulfill({ json: state });
    } else if (url.pathname.endsWith('/publish')) {
      state = { ...state, published: true };
      panel.editions = [state];
      return route.fulfill({ json: state });
    } else if (route.request().method() === 'PATCH') {
      state = { ...state, ...route.request().postDataJSON() };
      panel.editions = [state];
      return route.fulfill({ json: state });
    }
    return route.fulfill({ json: panel });
  });
  await page.goto('/admin/noticias');
  const section = page.getByRole('region', { name: 'Guías de nuevas ediciones' });
  await section.getByRole('button', { name: 'Buscar nuevas ediciones', exact: true }).click();
  await expect(section).toContainText('Encontramos 1 ediciones');
  await section.getByRole('combobox', { name: 'Edición', exact: true }).selectOption('test');
  await section.getByRole('button', { name: 'Preparar galería', exact: true }).click();
  await expect.poll(() => batches).toBe(1);
  await section.getByRole('button', { name: 'Pausar', exact: true }).click();
  await expect(section).toContainText('Preparación pausada');
  await expect(section).toContainText('1 / 2 cartas preparadas');
  await expect(section.getByRole('button', { name: 'Publicar guía', exact: true })).toBeDisabled();
  await section.getByRole('button', { name: 'Reanudar / comprobar galería', exact: true }).click();
  await expect(section).toContainText('Galería completa');
  expect(batches).toBe(2);
  await section
    .getByLabel('Título en español', { exact: true })
    .fill('Guía revisada de nuestra edición');
  await expect(section.getByRole('link', { name: 'Vista previa ↗', exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(section.getByRole('link', { name: 'Vista previa ↗', exact: true })).toHaveAttribute(
    'href',
    '/noticias/ediciones/test?vista=admin',
  );
  await section
    .getByRole('checkbox', { name: 'He revisado el artículo y la galería en español.' })
    .check();
  await section.getByRole('button', { name: 'Publicar guía', exact: true }).click();
  await expect(section).toContainText('Guía publicada');
  await expect(section.getByRole('link', { name: 'Ver publicada ↗', exact: true })).toHaveAttribute(
    'href',
    '/noticias/ediciones/test',
  );
  await page.screenshot({ path: '.data/editions-admin-tested.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Una nueva edición abre la galería interna, sus textos españoles y su vista móvil', async ({
  page,
}) => {
  const editionDoc: EditionDocument = {
    code: 'test',
    name: 'Edición de prueba',
    title: 'Nueva edición: todas las cartas',
    summary: 'Textos oficiales en español y galería completa.',
    body: 'Esta guía muestra las cartas de una edición nueva sin crear otra pestaña en la navegación principal.',
    updated: '2026-10-09',
    cards: baseline.cards.slice(0, 2),
  };
  await page.route('**/api/news/editions/test', (route) => route.fulfill({ json: editionDoc }));
  await page.goto('/noticias/ediciones/test');
  await expect(page.getByRole('heading', { name: editionDoc.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ver carta:/ })).toHaveCount(2);
  await page
    .getByRole('button', { name: /^Ver carta:/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText(editionDoc.cards[0].effects[0]);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: /^Ver carta:/ })
    .last()
    .click();
  await expect(page.getByRole('dialog')).toContainText(editionDoc.cards[1].name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
