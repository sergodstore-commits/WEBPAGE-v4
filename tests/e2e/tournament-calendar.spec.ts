import { test, expect } from '@playwright/test';
import type { Post } from '../../lib/types';

const post = (id: string, title: string, at: string): Post => ({
  id,
  slug: id,
  title,
  event_at: at,
  kind: 'tournament',
  status: 'published',
  body: 'Evento de prueba',
  image: '',
  location: 'Los Carrera 5142, Copiapó',
  created_at: '2032-01-01T12:00:00Z',
  updated_at: '2032-01-01T12:00:00Z',
});

test('Agenda mensual: días de Chile, varios eventos, detalle, cambio de mes y posición adaptable', async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date('2032-02-01T12:00:00Z'));
  const events = [
    post('medianoche', 'Sellado de medianoche', '2032-03-01T01:30:00Z'),
    post('primera-era', 'Liga Mitos Primera Era', '2032-02-29T20:00:00Z'),
    post('yugi', 'Liga Yu-Gi-Oh!', '2032-02-29T17:00:00Z'),
    post('marzo', 'Sellado de marzo', '2032-03-01T18:00:00Z'),
  ];
  await page.route('**/api/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/auth/me') return r.fulfill({ json: null });
    if (path === '/api/settings')
      return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    if (path === '/api/posts') return r.fulfill({ json: events });
    if (path.startsWith('/api/posts/')) return r.fulfill({ json: events[2] });
    if (path === '/api/tournaments')
      return r.fulfill({ json: { live: null, videos: [], total: 0 } });
    return r.fulfill({ status: 404, json: { error: 'Fuera de la prueba.' } });
  });
  await page.goto('/torneos');
  const calendar = page.getByLabel('Calendario de torneos', { exact: true });
  const table = calendar.getByRole('table');
  await expect(calendar.getByText('febrero de 2032', { exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader')).toHaveCount(7);
  await expect(table.getByRole('button')).toHaveCount(29);
  await expect(calendar.locator('[aria-current="date"] time')).toHaveText('1');
  await expect(
    page.getByText('Las grabaciones aparecerán aquí cuando la tienda las publique.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('El archivo comienza con la próxima transmisión', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Próximas fechas por anunciar', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Ver detalles de/ })).toHaveCount(0);
  const day = calendar.getByRole('button', { name: /29 de febrero de 2032:/ });
  await expect(day).toContainText('Liga Yu-Gi-Oh!');
  await expect(day).toContainText('+2 más');
  await expect(day).not.toContainText('Sellado de marzo');
  await day.click();
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await expect(calendar.getByRole('region')).toHaveCount(1);
  await expect(calendar.getByRole('link')).toHaveText([
    'Liga Yu-Gi-Oh! →',
    'Liga Mitos Primera Era →',
    'Sellado de medianoche →',
  ]);
  await expect(calendar.getByRole('link', { name: 'Liga Yu-Gi-Oh!', exact: true })).toHaveAttribute(
    'href',
    '/publicacion/yugi',
  );
  const bounds = await calendar.boundingBox();
  const liveBounds = await page
    .getByRole('region', { name: 'Transmisión en vivo', exact: true })
    .boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThan(liveBounds!.x);
  expect(Math.abs(bounds!.y - liveBounds!.y)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('agenda-desktop.png'), fullPage: true });
  await calendar.getByRole('button', { name: 'Cerrar detalles del día', exact: true }).click();
  await expect(day).toBeFocused();
  await expect(day).toHaveAttribute('aria-pressed', 'false');
  await expect(calendar.getByRole('region')).toHaveCount(0);
  await calendar.getByRole('button', { name: /, 2 de febrero de 2032:/ }).click();
  await expect(calendar.getByText('No hay eventos publicados para este día.')).toBeVisible();
  await day.click();

  await calendar.getByRole('button', { name: 'Mes siguiente', exact: true }).click();
  await expect(calendar.getByText('marzo de 2032', { exact: true })).toBeVisible();
  await expect(calendar.getByRole('link')).toHaveCount(0);
  await expect(table.getByRole('button')).toHaveCount(31);
  await expect(table.getByRole('button', { name: /, 1 de marzo de 2032:/ })).toContainText(
    'Sellado de marzo',
  );
  await calendar.getByRole('button', { name: 'Volver al mes actual', exact: true }).click();
  await expect(calendar.getByText('febrero de 2032', { exact: true })).toBeVisible();
  await calendar.getByRole('button', { name: 'Mes anterior', exact: true }).click();
  await expect(
    calendar.getByText('Sin eventos publicados este mes.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Próximas fechas por anunciar', { exact: true })).toHaveCount(0);
  await calendar.getByRole('button', { name: 'Mes anterior', exact: true }).click();
  await expect(calendar.getByText('diciembre de 2031', { exact: true })).toBeVisible();
  await calendar.getByRole('button', { name: 'Volver al mes actual', exact: true }).click();
  await calendar.getByRole('button', { name: 'Ampliar', exact: true }).click();
  await expect(calendar.getByRole('button', { name: 'Compactar', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(day).toContainText('Sellado de medianoche');
  await day.click();
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    const mobileCalendar = await calendar.boundingBox();
    await expect(calendar.getByRole('region')).toBeVisible();
    const mobileLive = await page
      .getByRole('region', { name: 'Transmisión en vivo', exact: true })
      .boundingBox();
    expect(mobileLive!.y).toBeGreaterThan(mobileCalendar!.y + mobileCalendar!.height);
    await page.screenshot({ path: info.outputPath(`agenda-${width}.png`), fullPage: true });
  }
  await calendar.getByRole('button', { name: 'Compactar', exact: true }).click();
  await calendar.getByRole('button', { name: 'Cerrar detalles del día', exact: true }).click();
  await day.focus();
  await page.keyboard.press('Enter');
  await expect(calendar.getByRole('link')).toHaveCount(3);
  await calendar.getByRole('link', { name: 'Liga Yu-Gi-Oh!', exact: true }).click();
  await expect(page).toHaveURL(/\/publicacion\/yugi$/);
  await expect(page.getByRole('heading', { name: 'Liga Yu-Gi-Oh!', exact: true })).toBeVisible();
});
