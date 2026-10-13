import { test, expect } from '@playwright/test';

test('Daily updates: protected cron and readable admin status on desktop/mobile', async ({
  page,
}) => {
  expect((await page.request.get('/api/cron/content')).status()).toBe(401);
  expect(
    (
      await page.request.get('/api/cron/content', { headers: { Authorization: 'Bearer invalid' } })
    ).status(),
  ).toBe(401);
  expect((await page.request.get('/api/admin/news/automation')).status()).toBe(401);
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-news@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.goto('/admin/noticias?paso=fuentes');
  const status = page.getByLabel('Actualización automática de noticias');
  await expect(status).toContainText('Actualización diaria automática');
  await expect(status).toContainText('Máximo 10 noticias de Yu-Gi-Oh! y 10 de MyL en total');
  await expect(status).toContainText('Las cartas y sus galerías se conservan');
  const data = await (await page.request.get('/api/admin/news/automation')).json();
  expect(data.limit).toBe(10);
  expect(data.pending).toBeGreaterThanOrEqual(0);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(status).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await status.screenshot({ path: `.data/actualizacion-diaria-${width}.png` });
  }
});
