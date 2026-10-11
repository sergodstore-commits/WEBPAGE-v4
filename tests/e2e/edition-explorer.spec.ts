import { test, expect } from '@playwright/test';
import baseline from '../../public/editions/betb/cards.json';
import type { EditionChoice, EditionDocument } from '../../lib/edition-gallery';

const choices: EditionChoice[] = [
  {
    code: 'cori',
    name: 'Chaos Origins',
    release_date: '2026-07-02',
    total: 2,
    cover_cards: baseline.cards.slice(0, 2).map((card) => card.thumbnail),
  },
  {
    code: 'betb',
    name: 'Beyond the Brave',
    release_date: '2026-09-26',
    total: 100,
    cover_cards: baseline.cards.slice(0, 3).map((card) => card.thumbnail),
  },
];
const editionDoc: EditionDocument = {
  name: 'Chaos Origins',
  code: 'cori',
  title: 'Guía de Chaos Origins',
  summary: 'Una edición preparada con efectos en español.',
  body: 'Texto editorial que no debe desplazar la herramienta de cartas.',
  updated: '2026-10-11',
  cards: baseline.cards.slice(0, 2),
};

test('Comunidad: elegir edición sin cargar todas las cartas, buscar, cambiar y consultar español', async ({
  page,
}) => {
  const galleries: string[] = [],
    external: string[] = [];
  page.on('request', (request) => {
    if (/cards\.json|\/api\/news\/editions\//.test(request.url())) galleries.push(request.url());
    if (/ygoprodeck|yugiohmeta|db\.yugioh-card/.test(request.url())) external.push(request.url());
  });
  await page.route('**/api/community/editions', (route) => route.fulfill({ json: choices }));
  await page.route('**/api/news/editions/cori', (route) => route.fulfill({ json: editionDoc }));
  await page.goto('/comunidad?vista=ediciones&ranking=yugioh');
  await expect(
    page.getByRole('link', { name: 'Explorar Beyond the Brave', exact: true }),
  ).toBeVisible();
  expect(galleries).toEqual([]);
  await page.getByLabel('Buscar edición', { exact: true }).fill('BETB');
  await expect(page.getByRole('link', { name: 'Explorar Chaos Origins', exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel('Buscar edición', { exact: true }).fill('');
  await page.screenshot({ path: '.data/community-editions-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Explorar Beyond the Brave', exact: true }).click();
  await expect(page).toHaveURL(/edicion=betb/);
  await expect(page.getByRole('button', { name: /^Ver carta:/ })).toHaveCount(100);
  await expect(
    page.getByRole('heading', { name: 'Explora antes de abrir', exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Buscar carta', { exact: true }).fill('BETB-EN001');
  const opener = page.getByRole('button', {
    name: 'Ver carta: Guerrero Pantera Viento Veloz',
    exact: true,
  });
  await opener.click();
  await expect(page.getByRole('dialog')).toContainText('No puede declarar un ataque');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.getByLabel('Cambiar edición', { exact: true }).selectOption('cori');
  await expect(page.getByRole('button', { name: /^Ver carta:/ })).toHaveCount(2);
  await expect(page.getByLabel('Buscar carta', { exact: true })).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Chaos Origins', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: /^Ver carta:/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText(editionDoc.cards[0].effects[0]);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/community-editions-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Todas las ediciones', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Explorar Beyond the Brave', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Secciones de Comunidad' })
    .getByRole('link', { name: 'Rankings', exact: true })
    .click();
  await expect(page).toHaveURL(/ranking=yugioh/);
  expect(external).toEqual([]);
});

test('Comunidad: enlace directo no publicado, error recuperable y carga móvil sin desbordes', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/community/editions', (route) => {
    if (fail) {
      fail = false;
      return route.fulfill({ status: 503, json: { error: 'No disponible' } });
    }
    return route.fulfill({ json: choices });
  });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/comunidad?vista=ediciones&edicion=privada');
  await expect(page.getByRole('alert').filter({ hasText: 'No pudimos cargar' })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Esta edición no está disponible' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ver ediciones disponibles', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Explorar Beyond the Brave', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
