import { test, expect } from '@playwright/test';
import type { BanlistState } from '../../lib/banlist';
import baseline from '../../public/editions/betb/cards.json';

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
  await page.goto('/comunidad?ranking=yugioh');
  const trigger = page.getByRole('button', { name: 'Banlist TCG', exact: true });
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
  await page.getByRole('button', { name: 'Actualizar banlist TCG', exact: true }).click();
  await expect(page.getByText(/Lista verificada. Galería completa/)).toBeVisible();
  expect(batches).toBe(1);
  await expect(page.getByText(/Galería: 3 de 3 cartas listas/)).toBeVisible();
  await expect(page.getByText(/Lista vigente:/)).toContainText('3 cartas');
});
