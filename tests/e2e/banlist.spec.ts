import { test, expect } from '@playwright/test';
import type { BanlistState } from '../../lib/banlist';

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
  const state: BanlistState = {
    checked_at: '2026-10-10T03:00:00Z',
    current: {
      effective_on: '2026-09-21',
      cards: [
        { cid: 1, name: 'Dragón de Prueba', copies: 0, change: 'Limitada → Prohibida' },
        { cid: 2, name: 'Mágica de Prueba', copies: 1 },
        {
          cid: 3,
          name: 'Retorno de Prueba',
          copies: 3,
          change: 'Limitada → Ya no está en la Lista',
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
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e@example.test');
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
  let refreshed = false;
  await page.route('**/api/admin/news/banlist', (route) => {
    if (route.request().method() === 'POST') refreshed = true;
    return route.fulfill({ json: refreshed ? state : null });
  });
  await page.goto('/admin/noticias');
  await page.getByRole('button', { name: 'Actualizar banlist TCG', exact: true }).click();
  await expect(page.getByText(/Lista verificada. Ya se puede consultar/)).toBeVisible();
  await expect(page.getByText(/Lista vigente:/)).toContainText('3 cartas');
});
