import { test, expect } from '@playwright/test';

test('Portada: cartas alternan, se precargan y respetan pausa y movimiento reducido', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  const hero = page.getByTestId('home-hero');
  await expect(hero).toHaveAttribute('data-motion', 'running');
  const lead = hero.locator('[data-hero-card="yugioh-lead"] img').first();
  const mitos = hero.locator('[data-hero-card="mitos-companion"] img').first();
  const initial = await lead.getAttribute('src');
  await page.clock.fastForward(8100);
  await expect(lead).toHaveAttribute('src', /rotation\/yugioh-/);
  await expect(mitos).toHaveAttribute('src', /rotation\/mitos-/);
  expect(await lead.getAttribute('src')).not.toBe(initial);
  await expect
    .poll(() => lead.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  const firstRotated = await lead.getAttribute('src');
  await page.clock.fastForward(8100);
  await expect(lead).not.toHaveAttribute('src', firstRotated!);
  await hero.getByRole('button', { name: 'Pausar movimiento', exact: true }).click();
  await expect(hero).toHaveAttribute('data-motion', 'paused');
  const changed = await lead.getAttribute('src');
  await page.clock.fastForward(20000);
  await expect(lead).toHaveAttribute('src', changed!);
  await hero.getByRole('button', { name: 'Activar movimiento', exact: true }).click();
  await page.clock.fastForward(8100);
  await expect(lead).not.toHaveAttribute('src', changed!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hero).toHaveAttribute('data-motion', 'reduced');
  const reduced = await lead.getAttribute('src');
  await page.clock.fastForward(20000);
  await expect(lead).toHaveAttribute('src', reduced!);
  await page.setViewportSize({ width: 375, height: 850 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
  await expect(hero.getByRole('link', { name: 'Explorar la tienda', exact: true })).toBeVisible();
});
