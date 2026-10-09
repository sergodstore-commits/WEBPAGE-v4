import { test, expect, type Page } from '@playwright/test';
import type { NewsItem, InstagramCandidate, InstagramStatus } from '../../lib/news';
const id = '5a368dc3-f1d6-44cb-8d4b-2171df852ec0';
const image = '/art/hero/mitos-front.webp',
  image2 = '/art/hero/yugioh-front.webp';
const items: NewsItem[] = Array.from({ length: 12 }, (_, i) => ({
  id: i === 0 ? id : `news-${i}`,
  title: i === 3 ? 'Encuentro de la comunidad' : undefined,
  caption:
    i === 0
      ? 'Nuestra última Liga.\nGracias por compartir en SERGOD STORE.'
      : `Momento de la tienda ${i}`,
  recorded_at: `2026-10-${String(7 - (i % 6)).padStart(2, '0')}T18:00:00Z`,
  assets:
    i === 1
      ? [{ type: 'video', url: '/test-video.mp4', poster: image2 }]
      : [
          { type: 'image', url: image, poster: '' },
          ...(i === 0 ? [{ type: 'image' as const, url: image2, poster: '' }] : []),
        ],
  permalink: '',
  username: 'sergod_test',
  source: i === 1 ? 'instagram' : 'manual',
  thumbnail: i === 1 ? image2 : undefined,
  tournament_id: null,
  league_tournament_id: null,
  ranking_board: null,
}));
async function publicMock(page: Page, kind: 'normal' | 'empty' | 'error' = 'normal') {
  let failed = kind === 'error';
  await page.route('**/api/**', (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === '/api/auth/me') return r.fulfill({ json: null });
    if (p === '/api/settings') return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    if (p === '/api/news') {
      if (failed) {
        failed = false;
        return r.fulfill({ status: 503, json: { error: 'No se pudo leer Noticias.' } });
      }
      return r.fulfill({ json: kind === 'empty' ? [] : items });
    }
    return r.fulfill({ status: 404, json: { error: 'Fuera de prueba' } });
  });
}
test('Instagram local: panel sin hashtag y operaciones protegidas sin conectar Meta', async ({
  page,
  browser,
}) => {
  const anonymous = await browser.newContext(),
    client = await anonymous.newPage();
  expect(
    (await client.request.get('http://localhost:3100/api/admin/integrations/instagram')).status(),
  ).toBe(401);
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const original = await (await page.request.get('/api/admin/integrations/instagram')).json();
  expect(original.configured).toBe(false);
  expect(
    (
      await page.request.patch('/api/admin/integrations/instagram', {
        headers: { Origin: 'https://evil.example' },
        data: { hashtag: 'Otro' },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/admin/integraciones');
  await expect(page.getByLabel(/^Hashtag para Noticias/)).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Conectar Instagram', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Actualizar publicaciones', exact: true }),
  ).toBeDisabled();
  const fake = await page.request.post('/api/admin/news', {
    headers: { Origin: 'http://localhost:3100' },
    data: {
      preview_id: id,
      status: 'published',
      caption: 'Intento sin revisión',
      assets: [{ url: 'https://example.com/x' }],
    },
  });
  expect(fake.status()).toBe(410);
  expect((await (await client.request.get('http://localhost:3100/api/news')).json()).length).toBe(
    0,
  );
  await anonymous.close();
});
test('Noticias: visor, carrusel por teclado y swipe, selección anterior y recarga adaptable', async ({
  page,
}, info) => {
  await publicMock(page);
  let videoRequests = 0;
  await page.route('**/test-video.mp4', (r) => {
    videoRequests++;
    return r.abort();
  });
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/noticias');
    await expect(page.getByRole('heading', { name: 'Noticias', exact: true })).toBeVisible();
    await expect(
      page.getByText('Novedades, encuentros y momentos de nuestra tienda.', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Noticia seleccionada' })).toContainText(
      'Nuestra última Liga.',
    );
    await expect(page.locator('video')).toHaveCount(0);
    const titled = page.getByRole('button', {
      name: 'Ver noticia: Encuentro de la comunidad',
      exact: true,
    });
    await expect(titled.getByRole('heading', { name: 'Encuentro de la comunidad' })).toBeVisible();
    await expect(titled).toContainText('Momento de la tienda 3');
    expect(videoRequests).toBe(0);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`noticias-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  const carousel = page.getByLabel('Carrusel de la noticia', { exact: true });
  await carousel.focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('img', { name: 'Imagen 2 de la noticia', exact: true }),
  ).toBeVisible();
  await carousel.dispatchEvent('touchstart', {
    touches: [{ identifier: 1, clientX: 60, clientY: 100 }],
  });
  await carousel.dispatchEvent('touchend', {
    changedTouches: [{ identifier: 1, clientX: 150, clientY: 105 }],
  });
  await expect(
    page.getByRole('img', { name: 'Imagen 1 de la noticia', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ver más noticias', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Ver noticia:/ })).toHaveCount(11);
  await page
    .getByRole('button', { name: 'Ver noticia: Momento de la tienda 2', exact: true })
    .click();
  await expect(page).toHaveURL(/publicacion=news-2/);
  await expect(page.getByRole('region', { name: 'Noticia seleccionada' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Noticia seleccionada' })).toContainText(
    'Momento de la tienda 2',
  );
  await page
    .getByRole('button', { name: 'Ver noticia: Momento de la tienda 1', exact: true })
    .click();
  await expect(page.locator('video')).toHaveCount(1);
  await expect(page.locator('video')).toHaveAttribute('preload', 'none');
  await expect(page.locator('video')).not.toHaveAttribute('autoplay');
  await page.getByRole('button', { name: /^Ver noticia: Nuestra última Liga/ }).click();
  await expect(page.locator('video')).toHaveCount(0);
});
test('Noticias: vacío y recuperación de error conservan acciones utilizables', async ({ page }) => {
  await publicMock(page, 'error');
  await page.goto('/noticias');
  await expect(
    page.getByRole('alert').filter({ hasText: 'No se pudo leer Noticias.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar noticias', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Noticia seleccionada' })).toBeVisible();
  await page.unroute('**/api/**');
  await publicMock(page, 'empty');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Pronto tendremos novedades', exact: true }),
  ).toBeVisible();
});
test('Admin Instagram: actualizar sin hashtag, vista previa, publicar, recargar, retirar y borrar', async ({
  page,
}, info) => {
  const status: InstagramStatus = {
    configured: true,
    connected: true,
    username: 'sergod_test',
    expires_at: '2030-01-01T00:00:00Z',
    expired: false,
    hashtag: 'SergodWeb',
    callback_url: 'http://localhost:3100/api/admin/integrations/instagram/callback',
  };
  const candidate: InstagramCandidate = {
    preview_id: id,
    media_id: '123456',
    caption: items[0].caption,
    recorded_at: items[0].recorded_at,
    assets: items[0].assets,
    permalink: 'https://www.instagram.com/p/TEST/',
    media_type: 'CAROUSEL_ALBUM',
    expires_at: '2030-01-01T00:00:00Z',
  };
  let saved: NewsItem[] = [],
    writes = 0;
  await page.route('https://www.instagram.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<p>Publicación de prueba del proveedor</p>' }),
  );
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      p = new URL(req.url()).pathname,
      m = req.method();
    if (p === '/api/auth/me')
      return r.fulfill({
        json: { id: 'admin', name: 'Admin', role: 'admin', email: 'admin@example.test' },
      });
    if (p === '/api/admin/posts' || p === '/api/admin/league') return r.fulfill({ json: [] });
    if (p === '/api/admin/integrations/tor') return r.fulfill({ json: { store_id: 501 } });
    if (p === '/api/admin/integrations/twitch')
      return r.fulfill({
        json: {
          configured: false,
          connected: false,
          channel: '',
          live: { enabled: false, title: '', channel: '', tournament_id: null },
        },
      });
    if (p === '/api/admin/integrations/instagram' && m === 'GET')
      return r.fulfill({ json: status });
    if (p === '/api/admin/integrations/instagram' && m === 'PATCH') {
      status.hashtag = req.postDataJSON().hashtag;
      return r.fulfill({ json: status });
    }
    if (p === '/api/admin/integrations/instagram/review')
      return r.fulfill({
        json: { candidates: saved.length ? [] : [candidate], next_cursor: null, scanned: 4 },
      });
    if (p === '/api/admin/news' && m === 'GET') return r.fulfill({ json: saved });
    if (p === '/api/admin/news' && m === 'POST') {
      writes++;
      expect(req.postDataJSON()).not.toHaveProperty('caption');
      expect(req.postDataJSON().preview_id).toBe(id);
      saved = [
        {
          ...items[0],
          source: 'instagram',
          assets: [],
          permalink: candidate.permalink,
          media_id: candidate.media_id,
          status: req.postDataJSON().status,
        },
      ];
      return r.fulfill({ json: saved[0] });
    }
    if (p === `/api/admin/news/${id}` && m === 'PATCH') {
      saved = [{ ...saved[0], ...req.postDataJSON() }];
      return r.fulfill({ json: saved[0] });
    }
    if (p === `/api/admin/news/${id}` && m === 'DELETE') {
      saved = [];
      return r.fulfill({ json: { ok: true } });
    }
    if (p === '/api/news')
      return r.fulfill({ json: saved.filter((v) => v.status === 'published') });
    return r.fulfill({ status: 404, json: { error: 'Fuera de la prueba' } });
  });
  await page.goto('/admin/noticias');
  await expect(page.getByLabel(/^Hashtag para Noticias/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Actualizar publicaciones', exact: true }).click();
  await page.getByRole('button', { name: 'Previsualizar publicación 123456', exact: true }).click();
  expect(writes).toBe(0);
  await expect(
    page.getByRole('heading', { name: 'Vista previa de Instagram', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Vista previa de Instagram' })
      .getByText('Nuestra última Liga.\nGracias por compartir en SERGOD STORE.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: /^Estado de la noticia/ }).selectOption('published');
  await page.getByRole('button', { name: 'Importar y publicar', exact: true }).click();
  await expect(
    page.getByText('Noticia guardada. Estado público y lectura comprobados.'),
  ).toBeVisible();
  expect(writes).toBe(1);
  await page.goto('/admin/noticias');
  await page.reload();
  await page.getByRole('button', { name: 'Editar noticia 123456', exact: true }).click();
  await page.getByRole('combobox', { name: /^Estado de la noticia/ }).selectOption('withdrawn');
  await page.setViewportSize({ width: 375, height: 900 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath('noticias-admin-375.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(
    page.getByText('Cambios guardados y lectura comprobada.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Retirado', exact: true })).toBeVisible();
  await page.goto('/noticias');
  await expect(
    page.getByRole('heading', { name: 'Pronto tendremos novedades', exact: true }),
  ).toBeVisible();
  await page.goto('/admin/noticias');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Borrar noticia 123456', exact: true }).click();
  await expect(page.getByText('Noticia eliminada de SERGOD STORE.', { exact: true })).toBeVisible();
});

test('Instagram integrado: una publicación a la vez, selección y recarga sin medios propios', async ({
  page,
}, info) => {
  let mediaDownloads = 0;
  const embedded = items.slice(0, 3).map((n, i) => ({
    ...n,
    source: 'instagram',
    assets: [],
    permalink: `https://www.instagram.com/${i === 1 ? 'reel' : 'p'}/PUBLIC${i}/`,
    media_type: i === 1 ? 'VIDEO' : 'IMAGE',
  }));
  await publicMock(page);
  await page.route('**/api/news', (r) => r.fulfill({ json: embedded }));
  await page.route('https://www.instagram.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<p>Publicación del proveedor simulada</p>' }),
  );
  await page.route('**/api/news-video/**', (r) => {
    mediaDownloads++;
    return r.abort();
  });
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/noticias');
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(page.locator('iframe')).toHaveAttribute(
      'src',
      'https://www.instagram.com/p/PUBLIC0/embed/',
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`instagram-integrado-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole('button', { name: 'Ver noticia: Momento de la tienda 1', exact: true })
    .click();
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://www.instagram.com/reel/PUBLIC1/embed/',
  );
  await page.reload();
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://www.instagram.com/reel/PUBLIC1/embed/',
  );
  await expect(page.locator('video')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Ver publicación en Instagram', exact: true }),
  ).toHaveAttribute('href', embedded[1].permalink);
  expect(mediaDownloads).toBe(0);
});
