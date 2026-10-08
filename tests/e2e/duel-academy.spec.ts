import { test, expect } from '@playwright/test';

test('Academia: casas, límites, puesto general, búsqueda y detalle adaptable', async ({
  page,
}, info) => {
  await page.route('**/api/posts?kind=community', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/rankings?board=yugioh', (route) =>
    route.fulfill({
      json: {
        board: 'yugioh',
        updated_at: null,
        tournaments: [
          {
            id: 'selected',
            title: 'Liga seleccionada',
            played_on: '2026-10-03',
            final_round: 4,
            source_url: '',
          },
        ],
        rows: [251, 250, 150, 149, 0].map((points, i) => ({
          name: `Jugador ${points}`,
          points,
          position: i + 1,
          tournaments: 1,
          contributions: [
            {
              tournament_id: 'selected',
              title: 'Liga seleccionada',
              played_on: '2026-10-03',
              points,
              position: i + 1,
            },
          ],
        })),
      },
    }),
  );
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/comunidad?ranking=yugioh');
    await expect(
      page.getByRole('heading', { name: 'La Academia de Duelos', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Primeros lugares', { exact: true })).toHaveCount(0);
    const slifer = page.getByRole('table', { name: 'Clasificación Slifer', exact: true });
    const ra = page.getByRole('table', { name: 'Clasificación Ra', exact: true });
    const obelisk = page.getByRole('table', { name: 'Clasificación Obelisco Azul', exact: true });
    await expect(slifer.getByRole('row')).toHaveCount(3);
    await expect(slifer).toContainText('Jugador 149');
    await expect(slifer).toContainText('Jugador 0');
    await expect(ra.getByRole('row')).toHaveCount(3);
    await expect(ra).toContainText('Jugador 150');
    await expect(ra).toContainText('Jugador 250');
    await expect(obelisk.getByRole('row')).toHaveCount(2);
    await expect(obelisk).toContainText('Jugador 251');
    await expect(
      slifer.getByRole('button', { name: 'Ver puntos por torneo de Jugador 149', exact: true }),
    ).toHaveText('4°');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
    await slifer
      .getByRole('button', { name: 'Ver puntos por torneo de Jugador 149', exact: true })
      .click();
    const detail = page.getByRole('dialog', { name: 'Jugador 149', exact: true });
    await expect(detail).toContainText('149 puntos en 1 torneo');
    await expect(detail).toContainText('Liga seleccionada');
    expect(await detail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await page.getByLabel('Buscar jugador', { exact: true }).fill('Jugador 250');
    await expect(page.getByRole('table')).toHaveCount(1);
    await expect(ra).toContainText('Jugador 250');
    await page.reload();
    await expect(slifer).toBeVisible();
    await page.screenshot({ path: info.outputPath(`academia-${width}.png`), fullPage: true });
  }
});
