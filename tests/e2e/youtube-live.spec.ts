import { test, expect } from '@playwright/test';
test('Admin YouTube: publicar directo, comprobar recarga y finalizar en archivo', async ({
  page,
}) => {
  let live = {
    enabled: false,
    video_id: '',
    title: '',
    stage: 'scheduled',
    tournament_id: null,
    channel_url: 'https://www.youtube.com/@SergodStore',
  };
  let archive: Record<string, unknown>[] = [];
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
          email_verified: true,
        },
      });
    if (u.pathname === '/api/settings')
      return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [] } });
    if (u.pathname === '/api/admin/posts' || u.pathname === '/api/posts')
      return r.fulfill({ json: [] });
    if (u.pathname === '/api/admin/integrations/youtube') return r.fulfill({ json: live });
    if (u.pathname === '/api/admin/integrations/youtube/live') {
      live = { ...live, ...req.postDataJSON(), video_id: 'SergodLive1' };
      return r.fulfill({ json: live });
    }
    if (u.pathname === '/api/admin/integrations/youtube/finish') {
      archive = [
        {
          id: 'archived-test',
          video_id: live.video_id,
          title: live.title,
          recorded_at: req.postDataJSON().recorded_at,
          youtube_thumbnail: '/brand/sergod-logo.webp',
          custom_thumbnail: '',
          tournament_id: null,
        },
      ];
      live = { ...live, enabled: false };
      return r.fulfill({ json: { ok: true } });
    }
    if (u.pathname === '/api/tournaments')
      return r.fulfill({
        json: {
          provider: 'youtube',
          channel_url: live.channel_url,
          live: live.enabled ? live : null,
          videos: archive,
          total: archive.length,
        },
      });
    return r.fulfill({ status: 404, json: { error: 'Fuera de esta prueba.' } });
  });
  await page.route('https://www.youtube-nocookie.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<p>Reproductor de prueba</p>' }),
  );
  await page.goto('/admin/integraciones');
  await page
    .getByLabel('Enlace del directo de YouTube', { exact: true })
    .fill('https://www.youtube.com/live/SergodLive1');
  await page.getByLabel('Título o contexto del directo', { exact: true }).fill('Liga YouTube');
  await page.getByRole('combobox', { name: /^Estado del directo/ }).selectOption('live');
  await page.getByRole('combobox', { name: /^Mostrar directo en Torneos/ }).selectOption('yes');
  await page.getByRole('button', { name: 'Guardar directo', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Directo guardado y visible en Torneos.' }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Enlace del directo de YouTube', { exact: true })).toHaveValue(
    'SergodLive1',
  );
  await page.goto('/torneos');
  await expect(page.getByText('● EN VIVO', { exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    /youtube-nocookie.com\/embed\/SergodLive1/,
  );
  await page.goto('/admin/integraciones');
  await page.getByRole('button', { name: 'Finalizar y guardar en archivo', exact: true }).click();
  await expect(
    page.getByText('Directo oculto y grabación publicada en Transmisiones anteriores.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto('/torneos');
  await page.reload();
  await expect(page.getByText('● EN VIVO', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Ver transmisión: Liga YouTube', exact: true }),
  ).toBeVisible();
});
