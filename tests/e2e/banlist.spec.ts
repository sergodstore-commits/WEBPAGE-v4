import { test, expect } from '@playwright/test';
import type { BanlistState } from '../../lib/banlist';
import baseline from '../../public/editions/betb/cards.json';

test('Noticias: Banlist directa, formatos, búsqueda MyL, imágenes y acceso móvil', async ({
  page,
}) => {
  let tcgRequests = 0,
    mylRequests = 0;
  await page.route('**/api/news', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/news/web-sources', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/news/banlist', (r) =>
    r.fulfill({
      json: { yugioh: { current: { effective_on: '2026-09-21' }, upcoming: null }, myl: {} },
    }),
  );
  await page.route('**/api/community/banlist', (r) => {
    tcgRequests++;
    return r.fulfill({
      json: {
        checked_at: '2026-10-12T12:00:00Z',
        current: { effective_on: '2026-09-21', cards: [] },
        upcoming: null,
      },
    });
  });
  const snapshot = {
    effective_on: '2026-10-08',
    cards: [
      { name: 'Kanillu', edition: 'La Ira del Nahual', copies: 1, change: 'Antes: 0 → Ahora: 1' },
      { name: 'Mosquete Puritano', edition: 'Mundo Gótico', copies: 0 },
    ],
    rules: ['Mínimo de Aliados: 16'],
    images: [
      {
        source: 'https://blog.myl.cl/wp-content/uploads/2026/10/test.png',
        name: 'Aclaración de formato',
        image: baseline.cards[0].image,
      },
    ],
    sources: ['https://blog.myl.cl/ban-list-primera-era-formato-racial-edicion/'],
    notes: ['Lista contrastada con el aviso oficial más reciente.'],
  };
  await page.route('**/api/news/banlist/myl', (r) => {
    mylRequests++;
    return r.fulfill({
      json: {
        checked_at: '2026-10-12T12:00:00Z',
        formats: { 'myl-first-era': snapshot, 'myl-first-block': snapshot },
      },
    });
  });
  await page.goto('/noticias');
  await expect(page.getByRole('button', { name: 'Actualidad', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Torneos', exact: true })).toHaveCount(0);
  expect(tcgRequests + mylRequests).toBe(0);
  const access = page.getByRole('button', { name: 'Banlists', exact: false });
  await expect(access).toHaveCount(1);
  await expect(access).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'SERGOD STORE', exact: true }).click();
  await access.click();
  await expect(page).toHaveURL(/vista=banlists/);
  const hub = page.getByRole('region', { name: 'Banlist por formato' });
  await expect(hub).toBeVisible();
  expect(tcgRequests + mylRequests).toBe(0);
  await page.getByRole('button', { name: 'MyL Primera Era', exact: true }).click();
  await expect(hub).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'MyL Primera Era', exact: true })
      .getByRole('button', { name: /Banlist/ }),
  ).toHaveCount(0);
  await page.reload();
  await expect(hub).toBeVisible();
  await page.getByRole('button', { name: 'Revelaciones', exact: true }).click();
  await expect(hub).toBeVisible();
  await access.click();
  await expect(page).toHaveURL(/categoria=reveals/);
  await expect(hub).toHaveCount(0);
  await page.goBack();
  await expect(hub).toBeVisible();
  await page.goForward();
  await expect(hub).toHaveCount(0);
  await access.click();
  const tcg = hub.getByRole('button', { name: /Yu-Gi-Oh! TCG/ });
  await tcg.click();
  await expect(page.getByRole('dialog', { name: 'Banlist Yu-Gi-Oh!' })).toBeVisible();
  expect(tcgRequests).toBe(1);
  await page.keyboard.press('Escape');
  await expect(tcg).toBeFocused();
  const era = hub.getByRole('button', { name: /MyL Primera Era/ });
  await era.click();
  const dialog = page.getByRole('dialog', { name: 'Banlist MyL Primera Era' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Kanillu', { exact: true })).toBeVisible();
  expect(mylRequests).toBe(1);
  await dialog.getByRole('searchbox').fill('mosquete');
  await expect(dialog.getByText('Kanillu', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Mosquete Puritano', { exact: true })).toBeVisible();
  await dialog.getByRole('searchbox').fill('');
  await dialog.getByRole('button', { name: '1 copia', exact: true }).click();
  await expect(dialog.getByText('Kanillu', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Mosquete Puritano', { exact: true })).toHaveCount(0);
  await dialog.getByText('Reglas y aclaraciones del formato', { exact: true }).click();
  await expect(dialog.getByText('Mínimo de Aliados: 16')).toBeVisible();
  await dialog.getByRole('button', { name: 'Ampliar Aclaración de formato' }).click();
  await expect(dialog.getByRole('img', { name: 'Aclaración de formato' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Volver a restricciones' }).click();
  await page.keyboard.press('Escape');
  await expect(era).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await hub.getByRole('button', { name: /MyL Primer Bloque/ }).click();
  const mobile = page.getByRole('dialog', { name: 'Banlist MyL Primer Bloque' });
  await expect(mobile).toBeVisible();
  expect((await mobile.boundingBox())!.width).toBeLessThan(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/news-myl-banlist-mobile.png' });
  await page.keyboard.press('Escape');
  await page.goto('/comunidad?ranking=yugioh');
  await expect(page.getByRole('button', { name: /Banlist/ })).toHaveCount(0);
  expect(
    (
      await page.request.post('/api/admin/news/banlist/myl', {
        headers: { Origin: 'http://localhost:3100' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post('/api/admin/news/banlist/myl/images', {
        headers: { Origin: 'http://localhost:3100' },
      })
    ).status(),
  ).toBe(401);
});

test('Banlist: consulta interna, buscador, filtros, móvil y permisos de actualización', async ({
  page,
}) => {
  expect(
    (
      await page.request.post('/api/admin/news/banlist', {
        headers: { Origin: 'http://localhost:3100' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post('/api/admin/news/banlist/cards', {
        headers: { Origin: 'http://localhost:3100' },
      })
    ).status(),
  ).toBe(401);
  const detail = {
    ...baseline.cards[0],
    effects: ['Efecto oficial de prueba en español.'],
    englishName: 'Test Dragon',
  };
  const state: BanlistState = {
    checked_at: '2026-10-10T03:00:00Z',
    current: {
      effective_on: '2026-09-21',
      cards: [
        { cid: 1, name: 'Dragón de Prueba', copies: 0, change: 'Limitada → Prohibida', detail },
        { cid: 2, name: 'Mágica de Prueba', copies: 1, detail },
        {
          cid: 3,
          name: 'Retorno de Prueba',
          copies: 3,
          change: 'Limitada → Ya no está en la Lista',
          detail,
        },
      ],
    },
    upcoming: null,
  };
  await page.route('**/api/community/banlist', (route) => route.fulfill({ json: state }));
  await page.goto('/noticias?seccion=yugioh&categoria=banlist');
  const trigger = page
    .getByRole('region', { name: 'Banlist por formato' })
    .getByRole('button', { name: /Yu-Gi-Oh! TCG/ });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Banlist Yu-Gi-Oh!' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Dragón de Prueba', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Mágica de Prueba', { exact: true })).toHaveCount(0);
  const dragon = dialog.getByRole('button', { name: 'Ver carta: Dragón de Prueba', exact: true });
  await expect(dragon.getByRole('img')).toBeVisible();
  await dragon.click();
  await expect(
    dialog.getByText('Efecto oficial de prueba en español.', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('img', { name: 'Dragón de Prueba', exact: true })).toHaveAttribute(
    'src',
    detail.image,
  );
  await page.keyboard.press('Escape');
  await expect(dragon).toBeFocused();
  await dialog.getByRole('searchbox', { name: 'Buscar carta en la banlist' }).fill('magica');
  await expect(dialog.getByText('Mágica de Prueba', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Dragón de Prueba', { exact: true })).toHaveCount(0);
  await dialog.getByRole('searchbox').fill('');
  await dialog.getByRole('button', { name: /^Prohibidas/ }).click();
  await expect(dialog.getByText('Dragón de Prueba', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThan(390);
  await dialog.getByRole('button', { name: 'Cerrar banlist' }).click();
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-news@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  expect(
    (
      await page.request.post('/api/admin/news/banlist', {
        headers: { Origin: 'https://evil.test' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/admin/news/banlist/cards', {
        headers: { Origin: 'https://evil.test' },
      })
    ).status(),
  ).toBe(403);
  let refreshed = false;
  const summary = {
    checked_at: state.checked_at,
    current: { effective_on: state.current.effective_on, total: 3 },
    upcoming: null,
  };
  await page.route('**/api/admin/news/banlist', (route) => {
    if (route.request().method() === 'POST') refreshed = true;
    return route.fulfill({
      json: {
        state: refreshed ? summary : null,
        ready: refreshed ? 2 : 0,
        total: refreshed ? 3 : 0,
        storage_bytes: 20000,
        storage_limit: 100000000,
      },
    });
  });
  let batches = 0;
  await page.route('**/api/admin/news/banlist/cards', (route) => {
    batches++;
    return route.fulfill({
      json: { state: summary, ready: 3, total: 3, storage_bytes: 30000, storage_limit: 100000000 },
    });
  });
  await page.goto('/admin/noticias');
  await page
    .getByRole('navigation', { name: 'Herramientas de contenido' })
    .getByRole('button', { name: 'Banlists' })
    .click();
  await page.getByRole('button', { name: 'Actualizar banlist TCG', exact: true }).click();
  await expect(page.getByText(/Lista verificada. Galería completa/)).toBeVisible();
  expect(batches).toBe(1);
  await expect(page.getByText(/Galería: 3 de 3 cartas listas/)).toBeVisible();
  await expect(page.getByText(/Lista vigente:/)).toContainText('3 cartas');
});
