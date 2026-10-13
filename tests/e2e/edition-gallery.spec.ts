import { test, expect } from '@playwright/test';
import baseline from '../../public/editions/betb/cards.json';

test('Community card: Spanish translation beside original artwork, English retained and responsive', async ({
  page,
}) => {
  const card = {
    ...baseline.cards[0],
    effects: ['Puedes destruir 1 carta; roba 2 cartas.'],
    englishEffects: ['You can destroy 1 card; draw 2 cards.'],
    text_origin: 'translated',
  };
  await page.route('**/api/community/editions', (route) =>
    route.fulfill({
      json: [
        {
          code: 'trad',
          name: 'Edición traducida',
          release_date: '2026-10-13',
          total: 1,
          cover_cards: [card.thumbnail],
        },
      ],
    }),
  );
  await page.route('**/api/news/editions/trad', (route) =>
    route.fulfill({
      json: {
        code: 'trad',
        name: 'Edición traducida',
        title: 'Guía de cartas',
        summary: 'Cartas disponibles en español.',
        body: '',
        updated: '2026-10-13',
        cards: [card],
      },
    }),
  );
  await page.goto('/comunidad?vista=ediciones&edicion=trad');
  await page.getByRole('button', { name: `Ver carta: ${card.name}`, exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(
    modal.getByRole('heading', { name: 'Traducción al español', exact: true }),
  ).toBeVisible();
  await expect(modal).toContainText('Traducción automática no oficial');
  await expect(modal.locator('[lang=es]')).toContainText('Puedes destruir 1 carta; roba 2 cartas.');
  await modal.getByText('Texto original en inglés', { exact: true }).click();
  await expect(modal.locator('[lang=en]')).toContainText(card.englishEffects[0]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(modal).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await modal.screenshot({ path: `.data/traduccion-carta-${width}.png` });
  }
});
test('Galería completa: buscar, filtrar, ampliar en español y cerrar con teclado', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (/ygoprodeck|yugiohmeta|db\.yugioh-card/.test(request.url())) external.push(request.url());
  });
  await page.goto('/noticias/beyond-the-brave');
  await expect(page.getByRole('heading', { name: 'Galería de la edición' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ver carta:/ })).toHaveCount(100);
  await page.getByLabel('Buscar carta', { exact: true }).fill('BETB-EN001');
  const card = page.getByRole('button', {
    name: 'Ver carta: Guerrero Pantera Viento Veloz',
    exact: true,
  });
  await card.click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('No puede declarar un ataque');
  await expect(modal).toContainText('Mago del Tiempo Oscuro');
  await expect(modal).not.toContainText('&aacute;');
  await expect(modal.locator('img')).toHaveAttribute('src', /\/editions\/betb\/\d+\.webp/);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(card).toBeFocused();
  await page.getByLabel('Buscar carta', { exact: true }).fill('');
  await page.getByLabel('Filtrar por rareza').selectOption('Starlight Rare');
  expect(await page.getByRole('button', { name: /^Ver carta:/ }).count()).toBeGreaterThan(0);
  expect(await page.getByRole('button', { name: /^Ver carta:/ }).count()).toBeLessThan(100);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole('button', { name: /^Ver carta:/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Cerrar carta', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(external).toEqual([]);
});
