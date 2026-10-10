import { test, expect } from '@playwright/test';
import type { InstagramCandidate, NewsItem } from '../../lib/news';

test('Instagram: selección por páginas, guardado parcial recuperable y lectura tras recargar', async ({
  page,
}, info) => {
  const candidates: InstagramCandidate[] = [1, 2, 3].map((n) => ({
    media_id: String(n),
    preview_id: `00000000-0000-4000-8000-00000000000${n}`,
    caption: `Publicación ${n} sin hashtag`,
    recorded_at: '2026-10-08T15:00:00Z',
    assets: [],
    permalink: `https://www.instagram.com/p/POST${n}/`,
    media_type: 'IMAGE',
    expires_at: '2030-01-01T00:00:00Z',
  }));
  const asNews = (c: InstagramCandidate, status: NewsItem['status']): NewsItem => ({
    ...c,
    id: c.preview_id,
    username: 'sergod_test',
    source: 'instagram',
    status,
    tournament_id: null,
    league_tournament_id: null,
    ranking_board: null,
  });
  let saved = [asNews(candidates[0], 'published')],
    creates = 0,
    failLast = true;
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      path = new URL(req.url()).pathname;
    if (path === '/api/auth/me')
      return r.fulfill({
        json: { id: 'admin', role: 'admin', name: 'Admin', email: 'admin@example.test' },
      });
    if (path === '/api/admin/news/editions')
      return r.fulfill({
        json: {
          discoveries: [],
          discovered_at: null,
          editions: [],
          storage_bytes: 0,
          storage_limit: 100000000,
        },
      });
    if (path === '/api/admin/news/banlist')
      return r.fulfill({
        json: { state: null, ready: 0, total: 0, storage_bytes: 0, storage_limit: 100000000 },
      });
    if (path === '/api/admin/integrations/instagram')
      return r.fulfill({
        json: {
          configured: true,
          connected: true,
          expired: false,
          username: 'sergod_test',
          hashtag: 'legacy',
          callback_url: '',
          expires_at: null,
        },
      });
    if (path === '/api/admin/integrations/instagram/review') {
      const next = req.postDataJSON().cursor;
      return r.fulfill({
        json: {
          candidates: next ? candidates.slice(2) : candidates.slice(0, 2),
          next_cursor: next ? null : 'NEXT',
          scanned: next ? 1 : 2,
        },
      });
    }
    if (path === '/api/admin/news') {
      if (req.method() === 'GET') return r.fulfill({ json: saved });
      const candidate = candidates.find((c) => c.preview_id === req.postDataJSON().preview_id)!;
      if (candidate.media_id === '3' && failLast) {
        failLast = false;
        return r.fulfill({ status: 503, json: { error: 'Prueba de error temporal' } });
      }
      expect(saved.some((n) => n.media_id === candidate.media_id)).toBe(false);
      const item = asNews(candidate, 'published');
      saved.push(item);
      creates++;
      return r.fulfill({ json: item });
    }
    if (path.startsWith('/api/admin/news/') && req.method() === 'PATCH') {
      const id = path.split('/').pop();
      saved = saved.map((n) => (n.id === id ? { ...n, ...req.postDataJSON() } : n));
      return r.fulfill({ json: saved.find((n) => n.id === id) });
    }
    if (path === '/api/news')
      return r.fulfill({ json: saved.filter((n) => n.status === 'published') });
    return r.fulfill({ json: [] });
  });
  await page.goto('/admin/noticias');
  const refresh = page.getByRole('button', { name: 'Actualizar publicaciones', exact: true });
  await refresh.click();
  await expect(
    page.getByRole('checkbox', { name: 'Mostrar publicación 1 en Noticias', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Cargar más publicaciones', exact: true }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(3);
  expect(creates).toBe(0);
  await page
    .getByRole('checkbox', { name: 'Mostrar publicación 1 en Noticias', exact: true })
    .uncheck();
  for (const n of [2, 3])
    await page
      .getByRole('checkbox', { name: `Mostrar publicación ${n} en Noticias`, exact: true })
      .check();
  await expect(refresh).toBeDisabled();
  const save = page.getByRole('button', { name: 'Guardar selección de Noticias', exact: true });
  await save.click();
  await expect(page.getByRole('alert').filter({ hasText: '2 cambios guardados' })).toBeVisible();
  expect(creates).toBe(1);
  await save.click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Selección guardada. Lectura' }),
  ).toBeVisible();
  expect(creates).toBe(2);
  await page.reload();
  await refresh.click();
  await expect(
    page.getByRole('checkbox', { name: 'Mostrar publicación 1 en Noticias', exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Mostrar publicación 2 en Noticias', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Cargar más publicaciones', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Mostrar publicación 3 en Noticias', exact: true }),
  ).toBeChecked();
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`instagram-selection-${width}.png`),
      fullPage: true,
    });
  }
});
