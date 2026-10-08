import { test, expect } from '@playwright/test';
test('Academia: tres casas contiguas y desplazamiento contenido en celular', async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: null });
    if (url.pathname === '/api/settings')
      return route.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    if (url.pathname === '/api/posts') return route.fulfill({ json: [] });
    if (url.pathname === '/api/rankings')
      return route.fulfill({
        json: {
          board: 'yugioh',
          academy: { ra_min: 150, obelisk_min: 300 },
          tournaments: [{ id: 'a', title: 'Liga', played_on: '2026-10-01' }],
          rows: [
            { name: 'Jugador Slifer', position: 3, points: 149, tournaments: 1 },
            { name: 'Jugador Ra', position: 2, points: 150, tournaments: 1 },
            { name: 'Jugador Obelisk', position: 1, points: 300, tournaments: 1 },
          ],
        },
      });
    return route.fulfill({ json: [] });
  });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/comunidad?ranking=yugioh');
    const houses = page.locator('[data-house]');
    await expect(houses).toHaveCount(3);
    const boxes = await houses.evaluateAll((nodes) =>
      nodes.map((x) => ({ x: x.getBoundingClientRect().x, y: x.getBoundingClientRect().y })),
    );
    expect(Math.max(...boxes.map((x) => x.y)) - Math.min(...boxes.map((x) => x.y))).toBeLessThan(2);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
    expect(boxes[2].x).toBeGreaterThan(boxes[1].x);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await expect(houses.nth(0)).toContainText('Jugador Slifer');
    await expect(houses.nth(1)).toContainText('Jugador Ra');
    await expect(houses.nth(2)).toContainText('Jugador Obelisk');
  }
});
