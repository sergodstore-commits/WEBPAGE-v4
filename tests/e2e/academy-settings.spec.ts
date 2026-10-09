import { test, expect } from '@playwright/test';

test('Academia: admin guarda, recarga, lectura pública y protección de escritura', async ({
  page,
  browser,
}) => {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const visitor = await browser.newContext();
  const before = await (await page.request.get('/api/admin/league/academy')).json();
  try {
    expect(
      (
        await visitor.request.patch('http://localhost:3100/api/admin/league/academy', {
          headers: { Origin: 'http://localhost:3100' },
          data: { ra_min: 80, obelisk_min: 200 },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.patch('/api/admin/league/academy', {
          headers: { Origin: 'https://evil.example' },
          data: { ra_min: 80, obelisk_min: 200 },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch('/api/admin/league/academy', {
          headers: { Origin: 'http://localhost:3100' },
          data: { ra_min: 200, obelisk_min: 100 },
        })
      ).status(),
    ).toBe(400);
    await page.goto('/admin/liga');
    await page.getByText('Academia de Duelos · Límites de puntos', { exact: true }).click();
    await page.getByLabel('Ra: puntos mínimos', { exact: true }).fill('80');
    await page.getByLabel('Obelisk: puntos mínimos', { exact: true }).fill('200');
    await page.getByRole('button', { name: 'Guardar límites', exact: true }).click();
    await expect(
      page.getByText('Límites guardados y comprobados en el ranking público.'),
    ).toBeVisible();
    await page.reload();
    await page.getByText('Academia de Duelos · Límites de puntos', { exact: true }).click();
    await expect(page.getByLabel('Ra: puntos mínimos', { exact: true })).toHaveValue('80');
    await expect(page.getByLabel('Obelisk: puntos mínimos', { exact: true })).toHaveValue('200');
    await page.setViewportSize({ width: 375, height: 850 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
    const publicRanking = await (await page.request.get('/api/rankings?board=yugioh')).json();
    expect(publicRanking.academy).toEqual({ ra_min: 80, obelisk_min: 200 });
    // An empty fixture has no house tables; supply a player while retaining
    // the configuration actually read back from the database.
    await page.route('**/api/rankings?board=yugioh', (r) =>
      r.fulfill({
        json: {
          ...publicRanking,
          rows: [{ name: 'Jugador de prueba', points: 80, position: 1, tournaments: 1 }],
        },
      }),
    );
    await page.goto('/comunidad?ranking=yugioh');
    // Thresholds remain configurable in admin but are intentionally hidden publicly.
    await expect(page.getByRole('region', { name: 'Jugadores de Ra', exact: true })).toContainText(
      'Jugador de prueba',
    );
    await expect(page.getByText('De 80 a 199 puntos', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Desde 200 puntos', { exact: true })).toHaveCount(0);
  } finally {
    await page.request.patch('/api/admin/league/academy', {
      headers: { Origin: 'http://localhost:3100' },
      data: before,
    });
    await visitor.close();
  }
});
