import { test, expect, type Page } from '@playwright/test';
import type { Post, YouTubeVideo } from '../../lib/types';
const post = (id: string, time: string | null): Post => ({
  id,
  slug: id,
  title: `Liga ${id}`,
  body: 'Información del torneo publicada por la tienda.',
  image: '',
  event_at: time,
  kind: 'tournament',
  location: 'Copiapó',
  status: 'published',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
});
const upcoming = [post('primero', '2030-10-01T20:00:00Z'), post('segundo', '2030-10-02T20:00:00Z')];
const videos: YouTubeVideo[] = Array.from({ length: 8 }, (_, i) => ({
  id: `vod-${i}`,
  video_id: `SergodTes0${i}`,

  title: `Transmisión ${i}`,
  recorded_at: '2026-10-01T20:00:00Z',
  youtube_thumbnail: '/art/hero/yugioh-front.webp',
  custom_thumbnail: i === 0 ? '/art/hero/mitos-front.webp' : '',
  tournament_id: null,
}));

test('Admin YouTube: revisar no importa; previsualizar, publicar, recargar y retirar una grabación', async ({
  page,
}, info) => {
  page.setDefaultTimeout(15_000);
  let saved: YouTubeVideo[] = [];
  let writes = 0;
  const candidate = {
    video_id: videos[0].video_id,
    title: videos[0].title,
    recorded_at: videos[0].recorded_at,
    youtube_thumbnail: '/art/hero/yugioh-front.webp',
    imported: false,
  };
  await page.route('**/api/**', async (r) => {
    const req = r.request(),
      u = new URL(req.url());
    if (u.pathname === '/api/auth/me')
      return r.fulfill({
        json: {
          id: 'admin-test',
          role: 'admin',
          name: 'Admin',
          email: 'admin@example.test',
          verified: true,
        },
      });
    if (u.pathname === '/api/admin/posts') return r.fulfill({ json: upcoming });
    if (u.pathname === '/api/admin/integrations/youtube')
      return r.fulfill({
        json: {
          enabled: false,
          video_id: '',
          title: '',
          stage: 'scheduled',
          tournament_id: null,
          channel_url: 'https://www.youtube.com/@SergodStore',
        },
      });
    if (u.pathname === '/api/admin/integrations/youtube/review')
      return r.fulfill({ json: candidate });
    if (u.pathname === '/api/admin/uploads')
      return r.fulfill({ json: { url: '/art/hero/mitos-front.webp' } });
    if (u.pathname === '/api/admin/youtube/transmissions' && req.method() === 'GET')
      return r.fulfill({ json: saved });
    if (u.pathname === '/api/admin/youtube/transmissions' && req.method() === 'POST') {
      writes++;
      saved = [
        {
          ...videos[0],
          ...req.postDataJSON(),
          id: 'saved-vod',

          youtube_thumbnail: candidate.youtube_thumbnail,
        },
      ];
      return r.fulfill({ json: saved[0] });
    }
    if (u.pathname === '/api/admin/youtube/transmissions/saved-vod' && req.method() === 'PATCH') {
      writes++;
      saved = [{ ...saved[0], ...req.postDataJSON() }];
      return r.fulfill({ json: saved[0] });
    }
    if (u.pathname === '/api/tournaments') {
      const published = saved.filter((v) => v.status === 'published');
      return r.fulfill({ json: { live: null, videos: published, total: published.length } });
    }
    if (u.pathname === '/api/settings')
      return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [], reservation_minutes: 20 } });
    if (u.pathname === '/api/posts') return r.fulfill({ json: upcoming });
    return r.fulfill({ status: 404, json: { error: 'Fuera de esta prueba de interfaz.' } });
  });
  await page.goto('/admin/integraciones');
  await expect(page.getByText('Canal: @SergodStore', { exact: true })).toBeVisible();
  await page
    .getByLabel('Enlace del video de YouTube', { exact: true })
    .fill('https://youtu.be/' + candidate.video_id);
  await page.getByRole('button', { name: 'Revisar video', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Previsualizar e incorporar transmisión' }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await expect(page.getByRole('img', { name: 'Miniatura de la transmisión' })).toHaveAttribute(
    'src',
    candidate.youtube_thumbnail,
  );
  await page
    .getByLabel(/^Miniatura personalizada \(opcional\)/)
    .setInputFiles('public/art/hero/mitos-front.webp');
  await expect(page.getByRole('img', { name: 'Miniatura de la transmisión' })).toHaveAttribute(
    'src',
    '/art/hero/mitos-front.webp',
  );
  await page.getByLabel('Título de la transmisión *', { exact: true }).fill('Liga revisada');
  await page.getByRole('combobox', { name: /^Estado de la transmisión/ }).selectOption('published');
  await page.getByRole('button', { name: 'Guardar y publicar transmisión', exact: true }).click();
  await expect(
    page.getByText('Transmisión guardada y lectura comprobada.', { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.goto('/torneos');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Liga revisada', exact: true })).toBeVisible();
  await page.goto('/admin/transmisiones');
  await page.getByRole('button', { name: 'Editar transmisión Liga revisada', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 900 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath('admin-transmision-375.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('combobox', { name: /^Estado de la transmisión/ }).selectOption('withdrawn');
  await page.getByRole('button', { name: 'Guardar transmisión', exact: true }).click();
  await expect(
    page.getByText('Cambios guardados y lectura comprobada.', { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(2);
  await page.goto('/torneos');
  await expect(page.getByRole('heading', { name: 'Liga revisada', exact: true })).toHaveCount(0);
});
async function mock(page: Page, live = false) {
  await page.route('https://www.youtube-nocookie.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<p>Reproductor externo simulado</p>' }),
  );
  await page.route('**/api/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/auth/me') return r.fulfill({ json: null });
    if (u.pathname === '/api/settings')
      return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [], reservation_minutes: 20 } });
    if (u.pathname === '/api/posts')
      return r.fulfill({
        json: [
          ...upcoming,
          post('pasado', '2020-01-01T20:00:00Z'),
          post('sinfecha', null),
        ].reverse(),
      });
    if (u.pathname.startsWith('/api/posts/')) return r.fulfill({ json: upcoming[0] });
    if (u.pathname === '/api/tournaments') {
      const offset = Number(u.searchParams.get('offset') || 0);
      return r.fulfill({
        json: {
          live: live
            ? {
                enabled: true,
                video_id: 'SergodLive1',
                stage: 'live',
                title: 'Liga en vivo',
                tournament_id: null,
              }
            : null,
          videos: videos.slice(offset, offset + 6),
          total: 8,
        },
      });
    }
    return r.fulfill({ status: 404, json: { error: 'Fuera de la prueba.' } });
  });
}
test('Cartelera ordenada, archivo paginado y miniaturas sin reproductores hasta seleccionar', async ({
  page,
}, info) => {
  await mock(page);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/torneos');
    await expect(page.getByRole('heading', { name: 'Torneos.', level: 1 })).toBeVisible();
    await expect(
      page.getByText('Próximas fechas y transmisiones de SERGOD STORE.', { exact: true }),
    ).toHaveCSS('color', 'rgb(82, 97, 112)');
    await expect(
      page
        .getByRole('region', { name: 'Transmisiones anteriores', exact: true })
        .getByRole('heading', { level: 3 }),
    ).toHaveText(videos.slice(0, 6).map((v) => v.title));
    await expect(page.getByText('Fuera de línea', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Transmisión en vivo', exact: true })
        .getByRole('img', { name: 'SERGOD STORE', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Liga pasado', { exact: true })).toHaveCount(0);
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Transmisión 0', exact: true })).toHaveAttribute(
      'src',
      '/art/hero/mitos-front.webp',
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`torneos-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Ver más transmisiones', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Ver transmisión:/ })).toHaveCount(8);
  const open = page.getByRole('button', { name: 'Ver transmisión: Transmisión 0', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('iframe')).toHaveCount(1);
  await expect(dialog.locator('iframe')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/SergodTes00\?autoplay=0/,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.locator('iframe')).toHaveCount(0);
});
test('Directo YouTube visible en computador y celular, y detalle sin inscripción ni pago', async ({
  page,
}) => {
  await mock(page, true);
  await page.goto('/torneos');
  await expect(page.getByText('● EN VIVO', { exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/SergodLive1/,
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Abrir en YouTube', exact: true })).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=SergodLive1',
  );
  await page.goto('/publicacion/primero');
  await expect(page.getByRole('heading', { name: 'Liga primero', exact: true })).toBeVisible();
  await expect(page.getByText(/Inscribirse|Entrada|Cupos|Premios|Konami ID/)).toHaveCount(0);
});
test('Permisos, Integraciones sin credenciales y torneo simple guardado desde Admin', async ({
  page,
  browser,
}) => {
  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.clock.setFixedTime(new Date('2030-10-01T12:00:00Z'));
  expect(
    (await visitor.request.get('http://localhost:3100/api/admin/integrations/youtube')).status(),
  ).toBe(401);
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.goto('/admin/integraciones');
  await expect(page.getByRole('heading', { name: 'Integraciones', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'YouTube', exact: true })).toBeVisible();
  expect(
    (
      await page.request.post('/api/admin/integrations/youtube/review', {
        headers: { Origin: 'https://evil.example' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto('/admin/torneos');
  await expect(page.getByRole('heading', { name: 'Torneos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo evento', exact: true }).click();
  const title = `Liga sencilla ${Date.now()}`;
  await page.getByLabel('Título *', { exact: true }).fill(title);
  await page.getByLabel('Fecha y hora del torneo *', { exact: true }).fill('2030-10-01T18:00');
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('published');
  await page.getByRole('button', { name: 'Guardar y publicar', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('visible para la comunidad');
  await page.reload();
  await visitor.goto('http://localhost:3100/torneos');
  const calendar = visitor.getByLabel('Calendario de torneos', { exact: true });
  await calendar.getByRole('button', { name: new RegExp(title) }).click();
  await expect(visitor.getByRole('link', { name: title, exact: true })).toBeVisible();
  await visitor.reload();
  await calendar.getByRole('button', { name: new RegExp(title) }).click();
  await expect(visitor.getByRole('link', { name: title, exact: true })).toBeVisible();
  await expect(
    visitor
      .getByLabel('Calendario de torneos', { exact: true })
      .getByRole('button', { name: new RegExp(title) }),
  ).toBeVisible();
  await anonymous.close();
});

test('Agenda semanal: publicar desde Admin, cambiar una fecha, recargar y pausar', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.goto('/admin/torneos');
  await page.getByRole('button', { name: 'Nuevo evento', exact: true }).click();
  const title = `Agenda semanal ${Date.now()}`;
  const changedTitle = `Fecha especial ${Date.now()}`;
  await page.getByLabel('Título *', { exact: true }).fill(title);
  await page.getByLabel('Fecha y hora del torneo *', { exact: true }).fill('2030-10-01T19:30');
  await page.getByLabel('Inscripción en pesos (opcional)', { exact: true }).fill('6000');
  await page.getByRole('combobox', { name: 'Programación', exact: true }).selectOption('weekly');
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('published');
  await page.getByRole('button', { name: 'Guardar y publicar', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('visible para la comunidad');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: title });
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Programación', exact: true })).toHaveValue(
    'weekly',
  );
  await expect(page.getByLabel('Inscripción en pesos (opcional)', { exact: true })).toHaveValue(
    '6000',
  );
  await page.getByLabel('Fecha excepcional', { exact: true }).fill('2030-10-08');
  await page.getByRole('button', { name: 'Editar solo esta fecha', exact: true }).click();
  await page.getByLabel('Título *', { exact: true }).fill(changedTitle);
  await page.getByLabel('Fecha y hora del torneo *', { exact: true }).fill('2030-10-10T19:30');
  await page.getByRole('button', { name: 'Guardar y publicar', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('visible para la comunidad');
  const context = await browser.newContext();
  const visitor = await context.newPage();
  await visitor.clock.setFixedTime(new Date('2030-10-01T12:00:00Z'));
  await visitor.goto('http://localhost:3100/torneos');
  const calendar = visitor.getByLabel('Calendario de torneos', { exact: true });
  await expect(calendar.getByText('Actualizando agenda…')).toHaveCount(0);
  await expect(calendar.getByRole('button', { name: new RegExp(title) })).toHaveCount(4);
  await calendar.getByRole('button', { name: new RegExp(changedTitle) }).click();
  await expect(calendar.getByText('Inscripción: $6.000', { exact: true })).toBeVisible();
  await calendar.getByRole('link', { name: changedTitle, exact: true }).click();
  await expect(visitor.getByRole('heading', { name: changedTitle, exact: true })).toBeVisible();
  await visitor.goto('http://localhost:3100/torneos');
  await visitor.reload();
  await expect(calendar.getByRole('button', { name: new RegExp(title) })).toHaveCount(4);
  await page.reload();
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('withdrawn');
  await page.getByRole('button', { name: 'Guardar publicación', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('guardada');
  await visitor.reload();
  await expect(calendar.getByRole('button', { name: new RegExp(title) })).toHaveCount(0);
  await visitor.setViewportSize({ width: 375, height: 812 });
  await calendar.getByRole('button', { name: new RegExp(changedTitle) }).click();
  await expect(calendar.getByText('Inscripción: $6.000', { exact: true })).toBeVisible();
  expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await visitor.screenshot({ path: info.outputPath('agenda-375.png'), fullPage: true });
  await context.close();
});
