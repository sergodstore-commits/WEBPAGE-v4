import { test, expect } from '@playwright/test';
import type { Post } from '../../lib/types';
import { expectReadable } from './helpers/readability';

const event = (id: string, at: string, extra: Partial<Post> = {}): Post => ({
  id,
  slug: id
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-'),
  kind: 'tournament',
  title: id,
  body: 'Formato: Primera Era. Torneo de liga.',
  event_at: at,
  status: 'published',
  location: 'Los Carrera 5142, Copiapó',
  image: '',
  created_at: '2032-01-01T12:00:00Z',
  updated_at: '2032-01-01T12:00:00Z',
  ...extra,
});

test('Entrada Torneos: próximas seis fechas, precios opcionales, Chile y detalle adaptable', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2032-10-11T15:00:00Z'));
  const events = [
    event('Liga Primera Era', '2032-10-11T22:30:00Z', { entry_price: 6000 }),
    event('Yu-Gi-Oh! semanal', '2032-10-12T00:30:00Z', { body: 'Formato: Yu-Gi-Oh! TCG.' }),
    event('Beyond especial', '2032-10-12T20:30:00Z', { entry_price: 25000, event_level: 'major' }),
    ...Array.from({ length: 5 }, (_, i) => event(`Fecha ${i}`, `2032-10-${13 + i}T20:30:00Z`)),
    event('Ya comenzó', '2032-10-11T14:59:00Z'),
    event('Sin fecha', 'invalid'),
    event('Borrador', '2032-10-11T17:00:00Z', { status: 'draft' }),
    event('Retirado', '2032-10-11T17:00:00Z', { status: 'withdrawn' }),
  ];
  const ranges: string[] = [];
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/api/auth/me') return r.fulfill({ json: null });
    if (url.pathname === '/api/settings')
      return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    if (url.pathname === '/api/posts') {
      ranges.push(url.search);
      return r.fulfill({ json: [...events].reverse() });
    }
    if (url.pathname.startsWith('/api/posts/'))
      return r.fulfill({
        json: events.find(
          (p) => p.slug === decodeURIComponent(url.pathname.slice('/api/posts/'.length)),
        ),
      });
    if (url.pathname === '/api/tournaments')
      return r.fulfill({ json: { live: null, videos: [], total: 0 } });
    return r.fulfill({ status: 404, json: { error: 'Fuera de la prueba.' } });
  });
  await page.goto('/torneos');
  const upcoming = page.getByRole('region', { name: 'Próximos torneos', exact: true });
  await expect(upcoming.getByRole('heading', { level: 3 })).toHaveText([
    'Liga Primera Era',
    'Yu-Gi-Oh! semanal',
    'Beyond especial',
    'Fecha 0',
    'Fecha 1',
    'Fecha 2',
  ]);
  expect(
    ranges.some((range) => range.includes('from=2032-10-11') && range.includes('to=2032-11-25')),
  ).toBe(true);
  const yugi = upcoming.getByRole('link', {
    name: 'Ver detalles de Yu-Gi-Oh! semanal',
    exact: true,
  });
  await expect(yugi).toContainText('lunes, 11 de octubre');
  await expect(yugi).toContainText('21:30 h · Chile');
  await expect(yugi).not.toContainText('Inscripción');
  await expect(
    upcoming.getByRole('link', { name: 'Ver detalles de Liga Primera Era', exact: true }),
  ).toContainText('$6.000');
  await expect(
    upcoming.getByRole('link', { name: 'Ver detalles de Beyond especial', exact: true }),
  ).toContainText('$25.000');
  await expect(upcoming.getByText('Especial', { exact: true })).toBeVisible();
  const calendar = page.getByLabel('Calendario de torneos', { exact: true });
  expect((await upcoming.boundingBox())!.y).toBeLessThan((await calendar.boundingBox())!.y);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expectReadable(page);
  }
  await yugi.click();
  await expect(page.getByRole('heading', { name: 'Yu-Gi-Oh! semanal', exact: true })).toBeVisible();
  await expect(page.getByText('21:30 h · Chile', { exact: true })).toBeVisible();
  await expect(page.getByText('Inscripción', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Formato: Yu-Gi-Oh! TCG.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver transmisiones', exact: true })).toHaveAttribute(
    'href',
    '/torneos#transmision',
  );
  await page.getByRole('link', { name: 'Volver a torneos', exact: true }).click();
  await upcoming
    .getByRole('link', { name: 'Ver detalles de Liga Primera Era', exact: true })
    .click();
  await expect(page.getByText('$6.000', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectReadable(page);
});

test('Entrada Torneos: error independiente del calendario, reintento y estado sin próximas fechas', async ({
  page,
}) => {
  let fail = true;
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/api/auth/me') return r.fulfill({ json: null });
    if (url.pathname === '/api/settings')
      return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    if (url.pathname === '/api/posts') {
      if (fail && !url.searchParams.get('from')?.endsWith('-01'))
        return r.fulfill({ status: 503, json: { error: 'Agenda temporalmente no disponible.' } });
      return r.fulfill({ json: [] });
    }
    if (url.pathname === '/api/tournaments')
      return r.fulfill({ json: { live: null, videos: [], total: 0 } });
    return r.fulfill({ status: 404, json: { error: 'Fuera de la prueba.' } });
  });
  await page.clock.setFixedTime(new Date('2032-10-11T15:00:00Z'));
  await page.goto('/torneos');
  const upcoming = page.getByRole('region', { name: 'Próximos torneos', exact: true });
  await expect(upcoming.getByRole('alert')).toContainText('Agenda temporalmente no disponible.');
  await expect(
    page
      .getByLabel('Calendario de torneos', { exact: true })
      .getByText('Sin eventos publicados este mes.', { exact: true }),
  ).toBeVisible();
  fail = false;
  await upcoming.getByRole('button', { name: 'Volver a intentar', exact: true }).click();
  await expect(upcoming).toContainText(
    'No hay próximas fechas publicadas para los siguientes 45 días.',
  );
  await expect(
    upcoming.getByRole('link', { name: 'Ver agenda mensual', exact: true }),
  ).toHaveAttribute('href', '#calendario');
});

test('Entrada Torneos: resultados abren el historial de la liga elegida sin duplicar consultas', async ({
  page,
}) => {
  let rankingReads = 0;
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/api/auth/me') return r.fulfill({ json: null });
    if (url.pathname === '/api/settings')
      return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    if (url.pathname === '/api/posts') return r.fulfill({ json: [] });
    if (url.pathname === '/api/tournaments')
      return r.fulfill({ json: { live: null, videos: [], total: 0 } });
    if (url.pathname === '/api/rankings') {
      rankingReads++;
      return r.fulfill({
        json: {
          board: 'myl-first-block',
          updated_at: null,
          rows: [{ position: 1, name: 'Jugador de prueba', points: 12, tournaments: 1 }],
          tournaments: [
            { id: 'liga-1', title: 'Liga publicada', played_on: '2032-10-01', final_round: 4 },
          ],
        },
      });
    }
    if (url.pathname === '/api/rankings/myl-first-block/liga-1')
      return r.fulfill({
        json: {
          title: 'Liga publicada',
          final_round: 4,
          results: [{ position: 1, name: 'Jugador de prueba', points: 12 }],
        },
      });
    return r.fulfill({ status: 404, json: { error: 'Fuera de la prueba.' } });
  });
  await page.goto('/torneos');
  const results = page.getByRole('region', { name: 'Resultados de liga', exact: true });
  await expect(results.getByRole('link')).toHaveCount(3);
  expect(rankingReads).toBe(0);
  await results.getByRole('link').filter({ hasText: 'Primer Bloque' }).click();
  await expect(page).toHaveURL(/ranking=myl-first-block&resultados=1#torneos-ranking$/);
  const history = page.locator('#torneos-ranking');
  await expect(history).toHaveAttribute('open', '');
  await history.getByRole('button', { name: 'Ver resultados', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Resultados de Liga publicada', exact: true }),
  ).toBeVisible();
  expect(rankingReads).toBe(1);
  await page.reload();
  await expect(history).toHaveAttribute('open', '');
});
