import { test, expect } from '@playwright/test';
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
