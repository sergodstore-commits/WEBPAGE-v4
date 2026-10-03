import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Post, Product } from '../../lib/types';

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
}

async function sceneIsStill(scene: Locator) {
  return scene.evaluate(async (element) => {
    const sample = () =>
      [...element.querySelectorAll('[data-hero-card], [data-hero-card] *')]
        .map((node) => {
          const style = getComputedStyle(node);
          return `${style.transform}|${style.opacity}`;
        })
        .join(';');
    const before = sample();
    for (let frame = 0; frame < 12; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return before === sample();
  });
}

test('Home: cartas reales, acciones utilizables y composición sin desbordes en cuatro anchos', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const hero = page.getByTestId('home-hero');
  await expect(hero.getByRole('heading', { level: 1 })).toContainText('Tu próxima partida');
  await expect(hero.getByRole('heading', { level: 1 })).toContainText('empieza aquí');
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await expect
    .poll(() =>
      hero.locator('img[src^="/art/hero/"]').evaluateAll((images) => {
        const loaded = images.filter(
          (image) =>
            (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
        );
        return [...new Set(loaded.map((image) => image.getAttribute('src')))].length;
      }),
    )
    .toBe(4);

  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
    await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
    // Trial clicks also check that decorative cards cannot cover either CTA.
    await hero
      .getByRole('link', { name: 'Explorar la tienda', exact: true })
      .click({ trial: true });
    await hero.getByRole('link', { name: 'Ver torneos', exact: true }).click({ trial: true });
  }
  await hero.getByRole('link', { name: 'Explorar la tienda', exact: true }).click();
  await expect(page).toHaveURL(/\/tienda$/);
  await expect(page.getByRole('heading', { name: 'Tienda', exact: true })).toBeVisible();
  await page.goto('/');
  await hero.getByRole('link', { name: 'Ver torneos', exact: true }).click();
  await expect(page).toHaveURL(/\/torneos$/);
  await expect(page.getByRole('heading', { name: 'Torneos', exact: true })).toBeVisible();
});

test('Navegación móvil: teclado, Escape, retorno del foco y cambio de página', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Abrir menú', exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('navigation', { name: 'Navegación móvil', exact: true });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar menú', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Tienda', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(open).toBeFocused();
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await menu.getByRole('link', { name: 'Preventas', exact: true }).click();
  await expect(page).toHaveURL(/\/preventas$/);
  await expect(menu).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Preventas', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('Movimiento: carga solo en Home, pausa persistente y preferencia reducida en vivo', async ({
  page,
}) => {
  const artRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/art/hero/')) artRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/carrito');
  await expect(page.getByRole('heading', { name: 'Tu carrito', exact: true })).toBeVisible();
  await expect(page.getByTestId('home-hero')).toHaveCount(0);
  expect(artRequests).toEqual([]);

  await page.goto('/');
  const hero = page.getByTestId('home-hero');
  await expect(hero).toHaveAttribute('data-motion', 'running');
  const scene = page.getByTestId('hero-scene');
  await expect(scene.locator('[data-hero-card]')).toHaveCount(4);
  await expect.poll(() => sceneIsStill(scene)).toBe(false);
  await hero.getByRole('button', { name: 'Pausar movimiento', exact: true }).click();
  await expect(hero).toHaveAttribute('data-motion', 'paused');
  await expect.poll(() => sceneIsStill(scene)).toBe(true);
  await page.reload();
  await expect(hero).toHaveAttribute('data-motion', 'paused');
  await expect(
    hero.getByRole('button', { name: 'Activar movimiento', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await hero.getByRole('button', { name: 'Activar movimiento', exact: true }).click();
  await expect(hero).toHaveAttribute('data-motion', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hero).toHaveAttribute('data-motion', 'reduced');
  await expect.poll(() => sceneIsStill(scene)).toBe(true);
  await expect(
    hero.getByRole('button', { name: 'Movimiento reducido', exact: true }),
  ).toBeDisabled();
  await hero.getByRole('link', { name: 'Explorar la tienda', exact: true }).click({ trial: true });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(hero).toHaveAttribute('data-motion', 'running');
});

test('Home: respeta productos y publicaciones recibidos, separa próximos torneos y conserva el estado vacío', async ({
  page,
}) => {
  // These responses isolate the presentation contract. They are not seed data,
  // are never persisted and cannot reach a production database or payment API.
  const now = new Date().toISOString();
  const product: Product = {
    id: 'home-fixture-product',
    name: 'Artículo visible de prueba Home',
    slug: 'articulo-visible-prueba-home',
    description: 'Descripción publicada de prueba.',
    sku: 'HOME-FIXTURE',
    price: 12500,
    discount_percent: 0,
    category: 'Yu-Gi-Oh!',
    catalog_group: '',
    catalog_name: '',
    brand: '',
    options: {},
    tags: [],
    specifications: [],
    source_url: '',
    stock: 3,
    reserved: 1,
    available: 2,
    kind: 'store',
    status: 'published',
    images: [],
    opens_at: null,
    closes_at: null,
    max_per_customer: null,
    delivery_terms: '',
    created_at: now,
    updated_at: now,
    version: 1,
  };
  const post = (
    kind: Post['kind'],
    slug: string,
    title: string,
    event_at: string | null,
  ): Post => ({
    id: slug,
    slug,
    kind,
    title,
    body: 'Publicación de prueba recibida por la API.',
    image: '',
    event_at,
    location: 'Copiapó de prueba',
    status: 'published',
    created_at: now,
    updated_at: now,
  });
  const future = post(
    'tournament',
    'torneo-futuro-home',
    'Torneo futuro de prueba Home',
    new Date(Date.now() + 86400000).toISOString(),
  );
  const past = post(
    'tournament',
    'torneo-pasado-home',
    'Torneo pasado de prueba Home',
    new Date(Date.now() - 86400000).toISOString(),
  );
  const news = post('news', 'noticia-home', 'Noticia publicada de prueba Home', null);
  const community = post('community', 'comunidad-home', 'Comunidad publicada de prueba Home', null);
  const preorder: Product = {
    ...product,
    id: 'home-fixture-preorder',
    name: 'Preventa visible de prueba Home',
    slug: 'preventa-visible-prueba-home',
    sku: 'HOME-FIXTURE-PREORDER',
    kind: 'preorder',
    opens_at: new Date(Date.now() - 86400000).toISOString(),
    closes_at: new Date(Date.now() + 86400000).toISOString(),
    max_per_customer: 2,
    delivery_terms: 'Condiciones de prueba publicadas.',
  };
  const mitos: Product = {
    ...product,
    id: 'home-fixture-mitos',
    name: 'Artículo Mitos de prueba Home',
    slug: 'articulo-mitos-prueba-home',
    sku: 'HOME-FIXTURE-MITOS',
    category: 'Mitos y Leyendas',
  };
  let empty = false;
  await page.route('**/api/products?kind=store', (route) =>
    route.fulfill({ json: empty ? [] : [product, mitos] }),
  );
  await page.route('**/api/products?kind=preorder', (route) =>
    route.fulfill({ json: empty ? [] : [preorder] }),
  );
  await page.route('**/api/posts', (route) =>
    route.fulfill({ json: empty ? [] : [past, news, future, community] }),
  );
  await page.goto('/');
  const productCard = page
    .locator('.store-product-card')
    .filter({ has: page.getByRole('link', { name: product.name, exact: true }) });
  await expect(productCard).toContainText('$12.500');
  await expect(productCard.getByRole('link', { name: product.name, exact: true })).toHaveAttribute(
    'href',
    `/producto/${product.slug}`,
  );
  await expect(page.getByRole('link', { name: preorder.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: preorder.name, exact: true })).toHaveAttribute(
    'href',
    `/producto/${preorder.slug}`,
  );
  await expect(page.getByRole('heading', { name: future.title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: past.title, exact: true })).toHaveCount(0);
  for (const item of [news, community]) {
    await expect(page.getByRole('heading', { name: item.title, exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: item.title, exact: true }).getByRole('link'),
    ).toHaveAttribute('href', `/publicacion/${item.slug}`);
  }
  for (const [selected, excluded] of [
    [product, mitos],
    [mitos, product],
  ]) {
    await page
      .getByTestId('home-hero')
      .getByRole('link', { name: selected.category, exact: true })
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/tienda' && url.searchParams.get('categoria') === selected.category,
    );
    await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue(
      selected.category,
    );
    await expect(page.getByRole('link', { name: selected.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: excluded.name, exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue(
      selected.category,
    );
    await expect(page.getByRole('link', { name: selected.name, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: excluded.name, exact: true })).toHaveCount(0);
    await page.goto('/');
  }
  empty = true;
  await page.reload();
  await expect(page.getByText('El catálogo se está preparando', { exact: true })).toBeVisible();
  for (const title of [product.name, preorder.name, mitos.name]) {
    await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
  }
  for (const title of [future.title, news.title, community.title]) {
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  }
});
