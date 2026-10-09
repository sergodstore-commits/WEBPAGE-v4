import { expect, test } from '@playwright/test';
import type { Product, User } from '../../lib/types';
import { expectReadable } from './helpers/readability';

test('Base interior: lectura, campos, selección y marcos uniformes en escritorio y celular', async ({
  page,
}, info) => {
  const now = new Date().toISOString();
  const product: Product = {
    id: 'foundation-product',
    slug: 'foundation-product',
    name: 'Sobre de prueba · Español',
    description: 'Cartas coleccionables para comprobar la lectura y los controles.',
    sku: 'UI-FOUNDATION',
    price: 5000,
    discount_percent: 0,
    category: 'Yu-Gi-Oh!',
    kind: 'store',
    status: 'published',
    stock: 4,
    reserved: 0,
    available: 4,
    images: ['/art/hero/yugioh-front.webp'],
    catalog_group: '',
    catalog_name: '',
    brand: 'Konami',
    options: { Idioma: 'Español', Formato: 'Sobre' },
    tags: [],
    specifications: [],
    source_url: '',
    opens_at: null,
    closes_at: null,
    max_per_customer: null,
    delivery_terms: '',
    created_at: now,
    updated_at: now,
    version: 1,
  };
  const preorder: Product = {
    ...product,
    id: 'foundation-preorder',
    slug: 'foundation-preorder',
    kind: 'preorder',
    opens_at: new Date(Date.now() - 86400000).toISOString(),
    closes_at: new Date(Date.now() + 86400000 * 15).toISOString(),
    delivery_terms: 'Entrega en Copiapó después del lanzamiento.',
    max_per_customer: 2,
  };
  const customer: User = {
    id: 'foundation-customer',
    name: 'Cliente de prueba',
    email: 'cliente@example.test',
    role: 'customer',
    email_verified: true,
    phone: '+56912345678',
    konami_id: '',
    klu_code: '',
    address: {},
    created_at: now,
  };
  let signedIn = false;
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: signedIn ? customer : null });
    if (url.pathname === '/api/settings')
      return route.fulfill({
        json: {
          name: 'SERGOD STORE',
          address: 'Los Carrera 5142, Copiapó',
          carriers: [
            {
              id: 'starken',
              name: 'Starken',
              enabled: true,
              mode: 'address',
              collect: true,
              price: 0,
            },
          ],
        },
      });
    if (url.pathname === '/api/products')
      return route.fulfill({
        json: url.searchParams.get('kind') === 'preorder' ? [preorder] : [product],
      });
    if (url.pathname === '/api/products/foundation-product')
      return route.fulfill({ json: product });
    if (url.pathname === '/api/products/family/foundation-product')
      return route.fulfill({ json: [product] });
    if (url.pathname === '/api/rankings')
      return route.fulfill({
        json: {
          board: url.searchParams.get('board'),
          rows: [],
          tournaments: [],
          updated_at: null,
          academy: { ra_min: 150, obelisk_min: 300 },
        },
      });
    if (url.pathname === '/api/tournaments')
      return route.fulfill({
        json: {
          live: null,
          videos: [],
          has_more: false,
          channel_url: 'https://www.youtube.com/@sergodstore',
        },
      });
    if (url.pathname === '/api/news')
      return route.fulfill({
        json: [
          {
            id: 'foundation-news',
            title: 'Encuentro de la comunidad',
            caption: 'Una tarde de cartas y duelos en Copiapó.',
            recorded_at: now,
            assets: [{ type: 'image', url: '/art/hero/mitos-front.webp', poster: '' }],
            permalink: '',
            username: '',
            source: 'manual',
            tournament_id: null,
            league_tournament_id: null,
            ranking_board: null,
          },
        ],
      });
    if (url.pathname === '/api/posts' || url.pathname === '/api/orders')
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: { error: 'Fuera de este recorrido visual' } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    signedIn = false;
    for (const path of [
      '/tienda',
      '/preventas',
      '/comunidad?ranking=yugioh',
      '/noticias',
      '/torneos',
      '/cuenta',
      '/producto/foundation-product',
    ]) {
      await page.goto(path);
      await expect(page.locator('.store-main h1')).toBeVisible();
      await expect(page.getByText('Cargando información…', { exact: true })).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await expectReadable(page);
      await page.screenshot({
        path: info.outputPath(`${path.split('?')[0].replaceAll('/', '-')}-${width}.png`),
        fullPage: true,
      });
    }
    signedIn = true;
    await page.addInitScript(
      (id) =>
        localStorage.setItem(
          'sergod-store-cart-v1',
          JSON.stringify([{ product_id: id, quantity: 1 }]),
        ),
      product.id,
    );
    await page.goto('/carrito');
    await expect(page.locator('.store-total')).toContainText('$5.000');
    await expectReadable(page);
    await page.getByRole('button', { name: 'Continuar con la compra' }).click();
    await expect(page.getByRole('heading', { name: 'Entrega y pago' })).toBeVisible();
    await expectReadable(page);
    await page.getByRole('radio', { name: /Envío/ }).check();
    await expect(page.getByLabel('Dirección de entrega')).toBeVisible();
    await expectReadable(page);
    await page.screenshot({ path: info.outputPath(`checkout-${width}.png`), fullPage: true });
  }
});
