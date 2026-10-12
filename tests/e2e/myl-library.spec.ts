import { test, expect } from '@playwright/test';
import { mylLibraryDefinitions, type MylLibraryDocument } from '../../lib/myl-library';
const definition = mylLibraryDefinitions.find((d) => d.code === 'myl-ra')!;
const doc: MylLibraryDocument = {
  ...definition,
  updated: '2026-10-12',
  cards: [
    ...Array.from({ length: 36 }, (_, i) => ({
      code: `ARAX-${String(i + 1).padStart(2, '0')}`,
      name: `Carta del relato ${i + 1}`,
      section: 'Relatos Dominios de Ra',
      presentation: i < 12 ? 'amanecer' : i < 24 ? 'invasores' : 'sabiduria',
      role: 'fixed' as const,
      source: 'https://blog.myl.cl/wp-content/uploads/2026/08/ARAX_01.png',
      image: '/editions/betb/77482666.webp',
      thumbnail: '/editions/betb/77482666-thumb.webp',
    })),
    {
      code: 'RA-P396',
      name: 'Sobek',
      section: 'Promoción de reserva',
      presentation: 'amanecer',
      role: 'reserve',
      source: 'https://blog.myl.cl/wp-content/uploads/2026/08/396-Sobek_Promo-1.png',
      image: '/editions/betb/77482666.webp',
      thumbnail: '/editions/betb/77482666-thumb.webp',
    },
  ],
};
const choices = [
  {
    code: doc.code,
    name: doc.name,
    game: doc.board,
    release_date: doc.release_date,
    total: 36,
    expected: 36,
    cover_cards: doc.cards.slice(0, 3).map((c) => c.thumbnail),
  },
  ...['myl-first-era', 'yugioh'].map((game, i) => ({
    code: i ? 'betb' : 'myl-lpe4',
    name: i ? 'Beyond the Brave' : 'Leyendas Primera Era 4.0',
    game,
    release_date: '2026-07-03',
    total: 100,
    cover_cards: ['/editions/betb/77482666-thumb.webp'],
  })),
];
test('MyL: filtro por formato, contenido fijo, sobres, reservas, imagen ampliada y móvil', async ({
  page,
}, info) => {
  const galleryRequests: string[] = [],
    large: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/community/myl-library/')) galleryRequests.push(r.url());
    if (r.url().endsWith('/77482666.webp')) large.push(r.url());
  });
  await page.route('**/api/community/editions', (r) => r.fulfill({ json: choices }));
  await page.route('**/api/community/myl-library/myl-ra', (r) => r.fulfill({ json: doc }));
  await page.goto('/comunidad?vista=ediciones');
  expect(galleryRequests).toEqual([]);
  expect(large).toEqual([]);
  await page
    .getByRole('navigation', { name: 'Juego de la biblioteca' })
    .getByRole('link', { name: 'MyL Primer Bloque', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'Explorar Relatos de Dominios de Ra', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Explorar Beyond the Brave', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Explorar Relatos de Dominios de Ra', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Ver carta MyL:/ })).toHaveCount(36);
  await page.getByLabel('Contenido del producto', { exact: true }).selectOption('amanecer');
  await expect(page.getByRole('button', { name: /^Ver carta MyL:/ })).toHaveCount(12);
  await expect(page.getByText('12 cartas del relato Amanecer.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Ver las cartas posibles de los sobres incluidos',
      exact: true,
    }),
  ).toHaveAttribute('href', '/comunidad?vista=ediciones&edicion=myl-lpb4');
  await expect(
    page.getByRole('heading', { name: 'Promoción de reserva', exact: true }),
  ).toBeVisible();
  expect(large).toEqual([]);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const opener = page.getByRole('button', {
      name: 'Ver carta MyL: Carta del relato 1',
      exact: true,
    });
    await opener.click();
    const modal = page.getByRole('dialog', { name: 'Carta del relato 1', exact: true });
    await expect(modal).toContainText('Habilidad en español en la imagen oficial');
    await page.screenshot({ path: info.outputPath(`myl-carta-${width}.png`), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByLabel('Tipo de contenido MyL', { exact: true }).selectOption('reserve');
  await expect(page.getByRole('button', { name: /^Ver carta MyL:/ })).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Ver carta MyL: Sobek', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Contenido del producto', { exact: true })).toHaveValue('amanecer');
  await expect(page.getByRole('button', { name: /^Ver carta MyL:/ })).toHaveCount(12);
  await page.getByLabel('Buscar carta MyL', { exact: true }).fill('ARAX-01');
  await expect(page.getByRole('button', { name: /^Ver carta MyL:/ })).toHaveCount(1);
});

test('MyL: preparación desde el panel y endpoints protegidos', async ({ page }) => {
  expect((await page.request.get('/api/admin/news/myl-library')).status()).toBe(401);
  expect(
    (
      await page.request.post('/api/admin/news/myl-library/myl-ra/prepare', {
        headers: { Origin: 'http://localhost:3100' },
      })
    ).status(),
  ).toBe(401);
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  expect(
    (
      await page.request.post('/api/admin/news/myl-library/myl-ra/prepare', {
        headers: { Origin: 'https://evil.example' },
      })
    ).status(),
  ).toBe(403);
  let ready = 0,
    published = false;
  const writes: string[] = [];
  const panel = () => ({
    items: [{ ...definition, total: 2, ready, published, updated: '2026-10-12' }],
    storage_bytes: 22000,
    storage_limit: 60000000,
  });
  await page.route('**/api/admin/news/myl-library**', (r) => {
    const action = new URL(r.request().url()).pathname.split('/').at(-1)!;
    if (r.request().method() === 'POST') {
      writes.push(action);
      if (action === 'prepare') ready = 0;
      if (action === 'batch') ready++;
      if (action === 'publish') published = true;
    }
    return r.fulfill({ json: panel() });
  });
  await page.route('**/api/community/myl-library/myl-ra?*', (r) => r.fulfill({ json: doc }));
  await page.goto('/admin/noticias?herramienta=editions');
  await page.getByRole('button', { name: 'Mitos y Leyendas', exact: true }).click();
  await page.getByLabel('Producto o edición MyL', { exact: true }).selectOption('myl-ra');
  await expect(
    page.getByRole('button', { name: 'Publicar en Comunidad', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Actualizar contenido de MyL', exact: true }).click();
  await expect(
    page.getByText('Imágenes disponibles preparadas. Revisa la galería y publica.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(writes).toEqual(['prepare', 'batch', 'batch']);
  await page.getByRole('button', { name: 'Publicar en Comunidad', exact: true }).click();
  await expect(
    page.getByText('Galería publicada y lectura pública comprobada.', { exact: true }),
  ).toBeVisible();
  expect(writes.at(-1)).toBe('publish');
});
