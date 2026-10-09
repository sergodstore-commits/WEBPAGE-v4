import { expect, test, type Page } from '@playwright/test';
import type { Order, Product, Settings, User } from '../../lib/types';
import { expectReadable } from './helpers/readability';

const now = '2026-10-07T12:00:00.000Z';
const product: Product = {
  id: 'commerce-product',
  slug: 'commerce-product',
  name: 'Sobre de prueba · Español',
  description: 'Prueba de presentación, sin venta ni escritura real.',
  sku: 'UI-ES',
  price: 5000,
  discount_percent: 20,
  category: 'Yu-Gi-Oh!',
  kind: 'store',
  status: 'published',
  stock: 5,
  reserved: 0,
  available: 5,
  images: ['/art/hero/yugioh-front.webp'],
  catalog_group: '',
  catalog_name: '',
  brand: 'Konami',
  options: {},
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
const user: User = {
  id: 'commerce-user',
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
const settings: Settings = {
  name: 'SERGOD STORE',
  description: '',
  address: 'Los Carrera 5142, Copiapó',
  hours: 'Horario de prueba',
  pickup_instructions: 'Esperar aviso de retiro.',
  phone: '',
  email: '',
  reservation_minutes: 20,
  carriers: [
    { id: 'home', name: 'Starken', enabled: true, mode: 'address', collect: true, price: 0 },
    { id: 'agency', name: 'Starken', enabled: true, mode: 'agency', collect: true, price: 0 },
    {
      id: 'prepaid',
      name: 'Transportista de prueba',
      enabled: true,
      mode: 'address',
      collect: false,
      price: 4900,
    },
  ],
};
function order(status: Order['payment_status'] = 'approved'): Order {
  return {
    id: 'commerce-order',
    number: 42,
    user_id: user.id,
    customer_email: user.email,
    customer_name: user.name,
    source: 'web',
    payment_environment: 'sandbox',
    can_refresh_payment: false,
    can_manage_delivery: false,
    payment_status: status,
    fulfillment_status: 'shipped',
    subtotal: 4000,
    shipping_price: 0,
    total: 4000,
    delivery: {
      method: 'shipping',
      carrier: 'Starken',
      collect: true,
      recipient: user.name,
      phone: user.phone,
      commune: 'Copiapó',
      region: 'Atacama',
      address: 'Dirección de prueba',
    },
    items: [
      {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        image: product.images[0],
        kind: 'store',
        quantity: 1,
        unit_price: 4000,
        original_price: 5000,
      },
    ],
    payment_method: 'flow',
    cash_received: null,
    change_amount: null,
    carrier: 'Starken',
    tracking: 'SEG-PRUEBA-42',
    expires_at: null,
    reservation_released_at: null,
    created_at: now,
    updated_at: now,
    events: [{ id: 'event', message: 'Pedido preparado y enviado.', created_at: now }],
  };
}
async function fixtures(page: Page, account: User | null = user, current: Order = order()) {
  const state = {
    account,
    order: current,
    products: [product],
    checkout: [] as unknown[],
    refreshes: 0,
    checkoutError: 'Pago interceptado para prueba de interfaz.',
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    let data: unknown = [],
      status = 200;
    if (path === '/api/settings') data = settings;
    else if (path === '/api/auth/me') data = state.account;
    else if (path === '/api/products')
      data = url.searchParams.get('kind') === 'preorder' ? [] : state.products;
    else if (path === '/api/orders') data = [state.order];
    else if (path === '/api/orders/commerce-order') data = state.order;
    else if (path.endsWith('/refresh')) {
      state.refreshes++;
      data = {};
    } else if (path === '/api/checkout') {
      state.checkout.push(request.postDataJSON());
      status = 400;
      data = { error: state.checkoutError };
    } else if (request.method() !== 'GET') {
      status = 400;
      data = { error: 'Acción interceptada: no se guardan datos en esta prueba.' };
    }
    await route.fulfill({ status, json: data });
  });
  await page.addInitScript(
    (id) =>
      localStorage.setItem(
        'sergod-store-cart-v1',
        JSON.stringify([{ product_id: id, quantity: 2 }]),
      ),
    product.id,
  );
  return state;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
  await expectReadable(page);
}

test('Compra: resumen, pasos y modalidades de entrega entre 320 y 1440 px', async ({
  page,
}, info) => {
  await fixtures(page);
  for (const width of [1440, 820, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/carrito');
    await expect(page.locator('.store-total')).toContainText('$8.000');
    await expect(page.locator('.store-order-summary')).toContainText('−$2.000');
    await page.getByRole('button', { name: 'Continuar con la compra' }).click();
    await expect(page.getByRole('heading', { name: 'Entrega y pago' })).toBeFocused();
    await expect(
      page.getByLabel('Pasos de la compra').locator('[aria-current=step]'),
    ).toContainText('Entrega');
    await expect(page.locator('.store-pickup-details')).toContainText(settings.address);
    await noOverflow(page);
    if (width === 1440 || width === 375)
      await page.screenshot({ path: info.outputPath(`${width}-pickup.png`), fullPage: true });
    await page.getByRole('radio', { name: /Envío/ }).check();
    await page.getByRole('combobox', { name: 'Transportista', exact: true }).selectOption('agency');
    await expect(page.getByLabel('Agencia de destino')).toBeVisible();
    await page.getByLabel('Agencia de destino').focus();
    await expect(page.getByLabel('Agencia de destino')).toBeFocused();
    await expect(page.getByLabel('Dirección de entrega')).toHaveCount(0);
    await expect(page.locator('.store-shipping-notice')).toContainText('no está incluido');
    await expect(page.locator('.store-total')).toContainText('$8.000');
    await page
      .getByRole('combobox', { name: 'Transportista', exact: true })
      .selectOption('prepaid');
    await expect(page.getByLabel('Dirección de entrega')).toBeVisible();
    await expect(page.locator('.store-total')).toContainText('$12.900');
    await page.getByRole('combobox', { name: 'Transportista', exact: true }).selectOption('home');
    await expect(page.locator('.store-total')).toContainText('$8.000');
    await noOverflow(page);
    if (width === 1440 || width === 375)
      await page.screenshot({ path: info.outputPath(`${width}-checkout.png`), fullPage: true });
    await page
      .getByRole('combobox', { name: 'Transportista', exact: true })
      .selectOption('prepaid');
    await page.getByRole('button', { name: 'Volver al carrito' }).click();
    await expect(page.locator('.store-total')).toContainText('$8.000');
    await expect(page.getByRole('heading', { name: 'Tu carrito' })).toBeFocused();
    await noOverflow(page);
    if (width === 1440 || width === 375)
      await page.screenshot({ path: info.outputPath(`${width}-cart.png`), fullPage: true });
  }
});

test('Compra: iniciar sesión, correo pendiente, falta de stock y validación antes del pago', async ({
  page,
}) => {
  const state = await fixtures(page, null);
  await page.goto('/carrito');
  await page.getByRole('button', { name: 'Continuar con la compra' }).click();
  await expect(
    page.locator('.store-order-summary').getByRole('link', { name: 'Iniciar sesión' }),
  ).toHaveAttribute('href', '/cuenta?next=carrito');
  state.account = { ...user, email_verified: false };
  await page.reload();
  await page.getByRole('button', { name: 'Continuar con la compra' }).click();
  await expect(page.getByRole('link', { name: 'Verificar mi cuenta' })).toBeVisible();
  state.account = user;
  state.products = [{ ...product, available: 1 }];
  await page.reload();
  await expect(page.getByRole('button', { name: 'Continuar con la compra' })).toBeDisabled();
  await expect(page.locator('.store-inline-error')).toContainText('1 unidades');
  await page.getByLabel(`Cantidad de ${product.name}`, { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Continuar con la compra' }).click();
  await page.getByRole('radio', { name: /Envío/ }).check();
  await page.getByRole('combobox', { name: 'Transportista', exact: true }).selectOption('agency');
  await page.getByRole('button', { name: 'Ir a pagar con Flow' }).click();
  expect(state.checkout).toHaveLength(0);
  await page.getByLabel('Nombre del destinatario').fill(user.name);
  await page.getByLabel('Teléfono de contacto').fill(user.phone);
  await page.getByLabel('Comuna', { exact: true }).fill('Copiapó');
  await page.getByLabel('Agencia de destino').fill('Agencia de prueba');
  await page.getByRole('button', { name: 'Ir a pagar con Flow' }).click();
  await expect(page.locator('.store-message-error[role=alert]')).toContainText(state.checkoutError);
  expect(state.checkout).toHaveLength(1);
  await expect(page.getByLabel('Agencia de destino')).toBeEnabled();
});

test('Carrito: varios formatos, cantidades, subtotales y eliminación sin iniciar un pago', async ({
  page,
}, info) => {
  const state = await fixtures(page);
  state.products.push({
    ...product,
    id: 'cart-box',
    slug: 'cart-box',
    name: 'Display de 24 sobres con nombre extenso · Inglés',
    price: 90000,
    discount_percent: 0,
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'sergod-store-cart-v1',
      JSON.stringify([
        { product_id: 'commerce-product', quantity: 2 },
        { product_id: 'cart-box', quantity: 1 },
      ]),
    ),
  );
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/carrito');
    await expect(page.locator('.store-cart-item')).toHaveCount(2);
    await expect(page.locator('.store-total')).toContainText('$98.000');
    await page
      .getByRole('button', { name: `Aumentar cantidad de ${product.name}`, exact: true })
      .click();
    await expect(page.locator('.store-total')).toContainText('$102.000');
    await page
      .getByRole('button', { name: `Disminuir cantidad de ${product.name}`, exact: true })
      .click();
    await expect(page.locator('.store-total')).toContainText('$98.000');
    await noOverflow(page);
    if (width !== 320)
      await page.screenshot({ path: info.outputPath(`${width}-cart-items.png`), fullPage: true });
    await page
      .getByRole('button', { name: `Eliminar ${state.products[1].name}`, exact: true })
      .click();
    await expect(page.locator('.store-total')).toContainText('$8.000');
    await page.getByRole('button', { name: `Eliminar ${product.name}`, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Tu carrito está esperando', exact: true }),
    ).toBeVisible();
    expect(state.checkout).toHaveLength(0);
  }
});

test('Cuenta: acceso, recuperación, perfil y enlaces inválidos adaptables', async ({
  page,
}, info) => {
  const state = await fixtures(page, null);
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/cuenta');
    await expect(page.getByRole('button', { name: 'Crear cuenta', exact: true })).toBeVisible();
    await noOverflow(page);
    if (width !== 320)
      await page.screenshot({ path: info.outputPath(`${width}-login.png`), fullPage: true });
    await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
    await expect(page.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeVisible();
    await noOverflow(page);
    await page.getByRole('button', { name: 'Volver a iniciar sesión' }).click();
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await expect(page.getByLabel('Nombre completo')).toBeVisible();
    await noOverflow(page);
  }
  state.account = user;
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/cuenta');
    await expect(page.getByRole('heading', { name: 'Hola, Cliente' })).toBeVisible();
    await noOverflow(page);
    const orderLink = page.locator('.store-order-row');
    await orderLink.focus();
    await expect(orderLink).toBeFocused();
    await expect(orderLink).toContainText('Pedido #42');
    if (width !== 320)
      await page.screenshot({ path: info.outputPath(`${width}-history.png`), fullPage: true });
    await page.getByRole('button', { name: 'Mis datos', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mis datos', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('Konami ID')).toBeVisible();
    await noOverflow(page);
    if (width !== 320)
      await page.screenshot({ path: info.outputPath(`${width}-profile.png`), fullPage: true });
  }
  await page.goto('/cuenta/restablecer');
  await expect(page.locator('.store-message-error[role=alert]')).toContainText('enlace no incluye');
  await expect(page.getByRole('link', { name: 'Ir a mi cuenta' })).toBeVisible();
});

test('Pedido: estados comprensibles, seguimiento y carrito solo tras aprobación', async ({
  page,
}, info) => {
  const state = await fixtures(page);
  await page.addInitScript(() =>
    localStorage.setItem('sergod-store-checkout-v1', JSON.stringify({ orderId: 'commerce-order' })),
  );
  for (const status of ['pending', 'rejected', 'expired', 'approved'] as const) {
    state.order = order(status);
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/cuenta/pedidos/commerce-order');
      await expect(page.getByRole('heading', { name: 'Pedido #42' })).toBeVisible();
      await expect(page.locator('.store-order-status')).toContainText(
        status === 'approved'
          ? 'Tu pago está confirmado'
          : status === 'pending'
            ? 'esperando la confirmación'
            : status === 'rejected'
              ? 'no fue aprobado'
              : 'plazo de reserva terminó',
      );
      await expect(page.locator('.store-order-delivery')).toContainText('SEG-PRUEBA-42');
      await noOverflow(page);
      if (width !== 320 && status === 'approved')
        await page.screenshot({ path: info.outputPath(`${width}-order.png`), fullPage: true });
      const cart = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('sergod-store-cart-v1')!),
      );
      expect(cart[0].quantity).toBe(status === 'approved' ? 1 : 2);
    }
  }
  state.order = { ...order('pending'), can_refresh_payment: true, reservation_released_at: now };
  await page.goto('/cuenta/pedidos/commerce-order');
  await expect(page.locator('.store-order-status')).toContainText('reserva terminó');
  await expect.poll(() => state.refreshes).toBe(1);
  await page.getByRole('button', { name: 'Actualizar pago' }).click();
  await expect.poll(() => state.refreshes).toBe(2);
});
