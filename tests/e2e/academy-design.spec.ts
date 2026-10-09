import { test, expect } from '@playwright/test';

test('Academia: marcos completos, listas con scroll y detalle del jugador', async ({
  page,
}, info) => {
  const rows = Array.from({ length: 72 }, (_, i) => ({
    position: i + 1,
    name: `Jugador con nombre y apellidos extensos ${i + 1}`,
    points: i < 24 ? 40 : i < 48 ? 180 : 340,
    tournaments: 2,
    contributions: [
      {
        tournament_id: `t-${i}`,
        title: 'Liga de prueba',
        played_on: '2026-10-08',
        position: 1,
        points: 12,
      },
    ],
  }));
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    expect(route.request().method()).toBe('GET');
    if (path === '/api/rankings')
      return route.fulfill({
        json: {
          board: 'yugioh',
          rows,
          tournaments: [],
          updated_at: '2026-10-09T12:00:00Z',
          academy: { ra_min: 150, obelisk_min: 300 },
        },
      });
    if (path === '/api/posts') return route.fulfill({ json: [] });
    if (path === '/api/auth/me') return route.fulfill({ json: null });
    if (path === '/api/settings')
      return route.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    return route.fulfill({ status: 404, json: {} });
  });
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/comunidad?ranking=yugioh');
    const houses = page.locator('section[data-house]');
    await expect(houses).toHaveCount(3);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    for (const name of ['Slifer', 'Ra', 'Obelisk']) {
      const list = page.getByRole('region', { name: `Jugadores de ${name}`, exact: true });
      await expect(list.getByRole('row')).toHaveCount(25);
      const size = await list.evaluate((el) => ({
        visible: el.clientHeight,
        total: el.scrollHeight,
        width: el.scrollWidth - el.clientWidth,
      }));
      expect(size.total).toBeGreaterThan(size.visible);
      expect(size.width).toBeLessThanOrEqual(1);
    }
    await expect
      .poll(() =>
        houses
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (el) =>
                (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await houses.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`academia-${width}.png`) });
    const list = page.getByRole('region', { name: 'Jugadores de Slifer', exact: true });
    const height = await houses.first().evaluate((el) => el.clientHeight);
    await list.focus();
    await page.keyboard.press('End');
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await houses.first().evaluate((el) => el.clientHeight)).toBe(height);
    await list.getByRole('button').last().click();
    await expect(page.getByRole('dialog')).toContainText('Liga de prueba');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});
