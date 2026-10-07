import { test, expect, type Page } from '@playwright/test';
import type { Post, TwitchVideo } from '../../lib/types';
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
const videos: TwitchVideo[] = Array.from({ length: 8 }, (_, i) => ({
  id: `vod-${i}`,
  video_id: String(123456 + i),
  channel: 'sergod_test',
  title: `Transmisión ${i}`,
  recorded_at: '2026-10-01T20:00:00Z',
  twitch_thumbnail: '/art/hero/yugioh-front.webp',
  custom_thumbnail: i === 0 ? '/art/hero/mitos-front.webp' : '',
  tournament_id: null,
}));

test('Admin Twitch: revisar no importa; previsualizar, publicar, recargar y retirar un VOD', async ({
  page,
}, info) => {
  page.setDefaultTimeout(15_000);
  let saved: TwitchVideo[] = [];
  let writes = 0;
  const candidate = {
    video_id: videos[0].video_id,
    title: videos[0].title,
    recorded_at: videos[0].recorded_at,
    twitch_thumbnail: '/art/hero/yugioh-front.webp',
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
    if (u.pathname === '/api/admin/integrations/twitch')
      return r.fulfill({
        json: {
          configured: true,
          connected: true,
          channel: 'sergod_test',
          validated_at: '2026-10-07T10:00:00Z',
          callback_url: 'http://localhost:3100/api/admin/integrations/twitch/callback',
          live: { enabled: false, channel: '', title: '', tournament_id: null },
        },
      });
    if (u.pathname === '/api/admin/integrations/twitch/review')
      return r.fulfill({ json: { videos: [candidate], cursor: null } });
    if (u.pathname === '/api/admin/uploads')
      return r.fulfill({ json: { url: '/art/hero/mitos-front.webp' } });
    if (u.pathname === '/api/admin/transmissions' && req.method() === 'GET')
      return r.fulfill({ json: saved });
    if (u.pathname === '/api/admin/transmissions' && req.method() === 'POST') {
      writes++;
      saved = [
        {
          ...videos[0],
          ...req.postDataJSON(),
          id: 'saved-vod',
          channel: 'sergod_test',
          twitch_thumbnail: candidate.twitch_thumbnail,
        },
      ];
      return r.fulfill({ json: saved[0] });
    }
    if (u.pathname === '/api/admin/transmissions/saved-vod' && req.method() === 'PATCH') {
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
  await expect(page.getByText('Canal: sergod_test', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revisar Twitch', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'VOD encontrados' })).toBeVisible();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Revisar Transmisión 0', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Miniatura de la transmisión' })).toHaveAttribute(
    'src',
    candidate.twitch_thumbnail,
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
  await page.route('https://player.twitch.tv/**', (r) =>
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
            ? { enabled: true, channel: 'sergod_test', title: 'Liga en vivo', tournament_id: null }
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
    ).toHaveCSS('color', 'rgb(187, 201, 214)');
    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      'Liga primero',
      'Liga segundo',
      ...videos.slice(0, 6).map((v) => v.title),
    ]);
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
    /video=v123456.*parent=localhost.*autoplay=false/,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.locator('iframe')).toHaveCount(0);
});
test('Directo visible, enlace Twitch en celular y detalle sin inscripción ni pago', async ({
  page,
}) => {
  await mock(page, true);
  await page.goto('/torneos');
  await expect(page.getByText('● EN VIVO', { exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    /channel=sergod_test.*parent=localhost/,
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Abrir Twitch', exact: true })).toHaveAttribute(
    'href',
    'https://www.twitch.tv/sergod_test',
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
    (await visitor.request.get('http://localhost:3100/api/admin/integrations/twitch')).status(),
  ).toBe(401);
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  await page.goto('/admin/integraciones');
  await expect(page.getByRole('heading', { name: 'Integraciones', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar Twitch', exact: true })).toBeDisabled();
  expect(
    (
      await page.request.post('/api/admin/integrations/twitch/connect', {
        headers: { Origin: 'https://evil.example' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto('/admin/torneos');
  await expect(page.getByRole('heading', { name: 'Torneos', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva publicación', exact: true }).click();
  const title = `Liga sencilla ${Date.now()}`;
  await page.getByLabel('Título *', { exact: true }).fill(title);
  await page.getByLabel('Fecha y hora del torneo *', { exact: true }).fill('2030-10-01T18:00');
  await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('published');
  await page.getByRole('button', { name: 'Guardar y publicar', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('visible para la comunidad');
  await page.reload();
  await visitor.goto('http://localhost:3100/torneos');
  await expect(visitor.getByRole('link', { name: title, exact: true })).toBeVisible();
  await visitor.reload();
  await expect(visitor.getByRole('link', { name: title, exact: true })).toBeVisible();
  await expect(
    visitor
      .getByLabel('Calendario de torneos', { exact: true })
      .getByRole('button', { name: new RegExp(title) }),
  ).toBeVisible();
  await anonymous.close();
});
