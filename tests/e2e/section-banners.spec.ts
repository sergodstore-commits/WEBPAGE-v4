import { test, expect } from '@playwright/test';

test('Banners: cinco secciones con altura uniforme, título legible e ilustración cargada', async ({
  page,
}, info) => {
  const sections = [
    ['/tienda', 'Tienda'],
    ['/preventas', 'Preventas'],
    ['/comunidad', 'Comunidad'],
    ['/noticias', 'Noticias'],
    ['/torneos', 'Torneos'],
  ];
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const heights: number[] = [];
    for (const [path, title] of sections) {
      await page.goto(path);
      const banner = page.locator('[data-section-header]');
      const heading = banner.getByRole('heading', { name: title, exact: true });
      await expect(heading).toBeVisible();
      await expect
        .poll(() =>
          banner
            .locator('img')
            .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
      const frame = (await banner.boundingBox())!;
      expect(
        await banner.locator('img').evaluate((image) => getComputedStyle(image).objectFit),
      ).toBe('contain');
      const text = (await heading.boundingBox())!;
      heights.push(frame.height);
      expect(text.x).toBeGreaterThanOrEqual(frame.x);
      expect(text.x + text.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await banner.screenshot({ path: info.outputPath(`${path.slice(1)}-${width}.png`) });
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  }
});
