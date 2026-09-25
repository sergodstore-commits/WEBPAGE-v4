import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import type { Product } from '../../lib/types';

const origin = 'http://localhost:3100';
const adminEmail = 'e2e@example.test';
const password = 'E2e-Prueba-Sergod-2026!';

async function loginAdmin(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(adminEmail);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}

async function testImage() {
  return {
    name: 'fotografia-de-prueba.png',
    mimeType: 'image/png',
    buffer: await sharp({ create: { width: 450, height: 600, channels: 3, background: '#d9d9d9' } })
      .composite([
        {
          input: Buffer.from(
            '<svg width="450" height="600"><rect x="28" y="28" width="394" height="544" rx="16" fill="#202020"/><rect x="50" y="50" width="350" height="420" fill="#f4f4f4"/><text x="225" y="515" text-anchor="middle" font-family="Arial" font-size="22" fill="white">PRUEBA E2E</text></svg>',
          ),
        },
      ])
      .png()
      .toBuffer(),
  };
}

function datetimeInput(value: number) {
  const d = new Date(value);
  // The browser receives the local date fields, independent of the runner timezone.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(' ', 'T');
}

async function createArticle(page: Page, kind: 'store' | 'preorder', label: string, stock = 7) {
  const sku = `E2E-${randomUUID().slice(0, 8)}`;
  await page.goto('/admin/articulos/nuevo');
  await page.getByLabel('Nombre *', { exact: true }).fill(label);
  await page.getByLabel(/^SKU/).fill(sku);
  await page.getByLabel('Categoría *', { exact: true }).fill('Cartas de prueba');
  await page.getByLabel('Dónde se mostrará').selectOption(kind);
  await page
    .getByLabel('Descripción *', { exact: true })
    .fill(
      'Artículo de una prueba automatizada aislada. Comprueba guardado, imágenes e inventario.',
    );
  await page.getByLabel('Precio en pesos chilenos *').fill('15000');
  await page
    .getByLabel(kind === 'store' ? /^Unidades en stock/ : /^Cupos totales/)
    .fill(String(stock));
  await page.getByLabel('Descuento (%)').fill('10');
  if (kind === 'preorder') {
    await page.getByLabel('Apertura de reservas *').fill(datetimeInput(Date.now() - 86_400_000));
    await page.getByLabel('Cierre de reservas *').fill(datetimeInput(Date.now() + 7 * 86_400_000));
    await page.getByLabel('Máximo de unidades por cliente *').fill('2');
    await page
      .getByLabel('Condiciones y fecha estimada de entrega *')
      .fill('Entrega de prueba en el local después de confirmar la llegada.');
  }
  await page.getByLabel('Imágenes del artículo').setInputFiles(await testImage());
  await expect(page.locator('.admin-feedback.success')).toContainText('Imágenes cargadas');
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click();
  await expect(page.locator('.admin-preview-image img')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/articulos\/[a-f0-9-]{36}$/);
  await page.reload();
  await expect(page.getByLabel('Nombre *', { exact: true })).toHaveValue(label);
  await expect(page.locator('.admin-image-tile img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Publicar artículo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar publicación', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('Artículo publicado');
  const id = page.url().split('/').at(-1)!;
  const response = await page.request.get(`/api/admin/products/${id}`);
  expect(response.ok()).toBeTruthy();
  const product = (await response.json()) as Product;
  expect(product.status).toBe('published');
  expect(product.kind).toBe(kind);
  expect(product.images[0]).toMatch(/\.webp$/);
  return product;
}

for (const kind of ['store', 'preorder'] as const) {
  test(`${kind === 'store' ? 'Artículo' : 'Preventa'}: crear, subir, publicar, recargar, editar y retirar`, async ({
    page,
    browser,
  }, testInfo) => {
    await loginAdmin(page);
    const label = `${kind === 'store' ? 'Producto' : 'Preventa'} E2E ${Date.now()}`;
    const product = await createArticle(page, kind, label);
    const visitor = await browser.newContext({
      baseURL: origin,
      viewport: { width: 1440, height: 1000 },
    });
    const publicPage = await visitor.newPage();
    await publicPage.goto(kind === 'store' ? '/tienda' : '/preventas');
    await publicPage.getByRole('link', { name: label, exact: true }).click();
    await expect(publicPage.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await publicPage.reload();
    await expect(publicPage.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await expect(publicPage.locator('.store-detail-gallery img').first()).toBeVisible();
    await publicPage.screenshot({
      path: testInfo.outputPath(`${kind}-publicado.png`),
      fullPage: true,
    });

    const changed = label + ' editado';
    await page.getByLabel('Nombre *', { exact: true }).fill(changed);
    await page.getByLabel('Precio en pesos chilenos *').fill('18000');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(page.locator('.admin-feedback.success')).toContainText('Cambios guardados');
    await page.reload();
    await expect(page.getByLabel('Nombre *', { exact: true })).toHaveValue(changed);
    await expect(page.getByLabel('Precio en pesos chilenos *')).toHaveValue('18000');
    await publicPage.reload();
    await expect(publicPage.getByRole('heading', { name: changed, exact: true })).toBeVisible();
    const persisted = (await (
      await publicPage.request.get(`/api/products/${product.slug}`)
    ).json()) as Product;
    expect(persisted.price).toBe(18000);
    expect(persisted.name).toBe(changed);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Retirar', exact: true }).click();
    await expect(page.locator('.admin-feedback.success')).toContainText('Artículo retirado');
    await publicPage.reload();
    await expect(publicPage.locator('.store-message-error')).toContainText('no está disponible');
    await publicPage.goto(kind === 'store' ? '/tienda' : '/preventas');
    await expect(publicPage.getByRole('link', { name: changed, exact: true })).toHaveCount(0);
    expect((await publicPage.request.get(`/api/products/${product.slug}`)).status()).toBe(404);
    await visitor.close();
  });
}

test('POS: venta en efectivo, cambio, recibo persistente y stock compartido', async ({
  page,
}, testInfo) => {
  await loginAdmin(page);
  const label = `Venta POS E2E ${Date.now()}`;
  const product = await createArticle(page, 'store', label, 7);
  await page.goto('/admin/pos');
  await page.getByLabel('Buscar artículos para venta').fill(product.sku);
  await page.getByRole('button', { name: new RegExp(label) }).click();
  await page.getByLabel(`Cantidad de ${label}`, { exact: true }).fill('2');
  await page.getByLabel('Dinero recibido (CLP)').fill('30000');
  await page.getByLabel('Nombre del cliente (opcional)').fill('Cliente presencial de prueba');
  await page.getByRole('button', { name: 'Completar venta', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('registrada');
  await expect(page.locator('.admin-receipt')).toContainText('Cambio: $3.000');
  await page.getByRole('link', { name: 'Consultar venta', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Pedido #/ })).toBeVisible();
  await expect(page.locator('.admin-totals')).toContainText('$27.000');
  await page.reload();
  await expect(page.locator('.admin-totals')).toContainText('$3.000');
  await page.screenshot({ path: testInfo.outputPath('venta-pos.png'), fullPage: true });
  const current = (await (
    await page.request.get(`/api/products/${product.slug}`)
  ).json()) as Product;
  expect(current.stock).toBe(5);
  expect(current.available).toBe(5);
  expect(current.reserved).toBe(0);
  await page.goto('/admin/inventario');
  await page.getByLabel('Buscar inventario').fill(product.sku);
  await expect(page.getByRole('row').filter({ hasText: label })).toContainText('5');
  await page.getByRole('button', { name: 'Ajustar stock', exact: true }).click();
  await page.getByLabel(/^Cantidad a agregar o descontar/).fill('2');
  await page.getByLabel('Motivo del ajuste').fill('Entrada adicional de prueba');
  await page.getByRole('button', { name: 'Confirmar ajuste', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('actualizado');
  await page.reload();
  await page.getByLabel('Buscar inventario').fill(product.sku);
  const afterAdjustment = (await (
    await page.request.get(`/api/products/${product.slug}`)
  ).json()) as Product;
  expect(afterAdjustment.stock).toBe(7);
});

test('Cuenta: registro, verificación, sesión persistente, perfil y permisos', async ({
  page,
  browser,
}, testInfo) => {
  await loginAdmin(page);
  const visitor = await browser.newContext({ baseURL: origin });
  const customer = await visitor.newPage();
  const email = `cliente-${Date.now()}@example.test`;
  await customer.goto('/cuenta');
  await customer.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await customer.getByLabel('Nombre completo').fill('Cliente de prueba');
  await customer.getByLabel('Correo electrónico').fill(email);
  await customer.getByLabel(/^Contraseña/).fill(password);
  await customer.getByRole('button', { name: 'Crear mi cuenta', exact: true }).click();
  await expect(customer.locator('.store-message[role="status"]')).toContainText(
    'enlace para verificarlo',
  );
  const mail = (await (await page.request.get('/api/admin/mail')).json()) as {
    recipient: string;
    body: string;
  }[];
  const verify = mail
    .find((m) => m.recipient === email)
    ?.body.match(/http:\/\/localhost:3100\/cuenta\/verificar\?token=[a-f0-9]+/)?.[0];
  expect(verify).toBeTruthy();
  await customer.goto(verify!);
  await expect(customer.locator('.store-message[role="status"]')).toContainText(
    'Tu correo está verificado',
  );
  await customer.goto('/cuenta');
  await customer.getByLabel('Correo electrónico').fill(email);
  await customer.getByLabel('Contraseña', { exact: true }).fill(password);
  await customer
    .locator('form')
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(customer.getByRole('heading', { name: 'Hola, Cliente', exact: true })).toBeVisible();
  await customer.reload();
  await expect(customer.getByRole('heading', { name: 'Hola, Cliente', exact: true })).toBeVisible();
  await customer.getByRole('button', { name: 'Mis datos', exact: true }).click();
  await customer.getByLabel('Konami ID', { exact: true }).fill('KONAMI-E2E');
  await customer.getByLabel('Código KLU', { exact: true }).fill('KLU-E2E');
  await customer.getByLabel('Teléfono', { exact: true }).fill('+56912345678');
  await customer.getByRole('button', { name: 'Guardar mis datos', exact: true }).click();
  await expect(customer.locator('.store-message[role="status"]')).toContainText('guardados');
  await customer.reload();
  await customer.getByRole('button', { name: 'Mis datos', exact: true }).click();
  await expect(customer.getByLabel('Konami ID', { exact: true })).toHaveValue('KONAMI-E2E');
  await expect(customer.getByLabel('Código KLU', { exact: true })).toHaveValue('KLU-E2E');
  await customer.screenshot({ path: testInfo.outputPath('cuenta-perfil.png'), fullPage: true });
  expect((await customer.request.get('/api/admin/products')).status()).toBe(403);
  expect(
    (
      await customer.request.post('/api/admin/products', { headers: { Origin: origin }, data: {} })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/admin/products', {
        headers: { Origin: 'https://ajeno.example' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await customer.goto('/admin');
  await expect(
    customer.getByRole('heading', { name: 'Acceso de administración', exact: true }),
  ).toBeVisible();
  await visitor.close();
  const anonymous = await browser.newContext({ baseURL: origin });
  expect((await anonymous.request.get('/api/admin/products')).status()).toBe(401);
  await anonymous.close();
});

test('Configuración: guardar datos reales de prueba y transportista por pagar', async ({
  page,
}) => {
  await loginAdmin(page);
  await page.goto('/admin/local');
  await page.getByLabel('Dirección del local').fill('Dirección de prueba 123, Copiapó');
  await page.getByLabel('Horario de atención').fill('Lunes a viernes, 10:00 a 18:00 (prueba)');
  await page.getByLabel('Instrucciones para retiro').fill('Presentar número de pedido de prueba.');
  await page.getByRole('button', { name: 'Agregar opción', exact: true }).click();
  await page.getByLabel('Transportista *', { exact: true }).last().fill('Transportista E2E');
  await page.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText(
    'Configuración guardada y comprobada',
  );
  await page.reload();
  await expect(page.getByLabel('Dirección del local')).toHaveValue(
    'Dirección de prueba 123, Copiapó',
  );
  const settings = await (await page.request.get('/api/settings')).json();
  expect(
    settings.carriers.some(
      (c: { name: string; collect: boolean; price: number }) =>
        c.name === 'Transportista E2E' && c.collect && c.price === 0,
    ),
  ).toBeTruthy();
});

test('Publicaciones: noticias, comunidad y torneos se guardan, publican, editan y retiran', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  await loginAdmin(page);
  const visitor = await browser.newContext({ baseURL: origin });
  const publicPage = await visitor.newPage();
  for (const kind of ['news', 'community', 'tournament']) {
    const title = `Publicación ${kind} E2E ${Date.now()}`;
    await page.goto('/admin/publicaciones');
    await page.getByRole('button', { name: 'Nueva publicación', exact: true }).click();
    await page.getByLabel('Título *', { exact: true }).fill(title);
    await page.getByRole('combobox', { name: 'Sección', exact: true }).selectOption(kind);
    await page
      .getByLabel('Contenido *', { exact: true })
      .fill('Contenido de prueba publicado desde el formulario administrativo.');
    if (kind === 'tournament') {
      await page
        .getByLabel('Fecha y hora del torneo *')
        .fill(datetimeInput(Date.now() + 3 * 86_400_000));
      await page.getByLabel('Lugar del torneo *').fill('Local de prueba en Copiapó');
    }
    await page.getByLabel('Imagen de la publicación').setInputFiles(await testImage());
    await expect(page.locator('.admin-post-preview')).toBeVisible();
    await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('published');
    await page.getByRole('button', { name: 'Guardar y publicar', exact: true }).click();
    await expect(page.locator('.admin-feedback.success')).toContainText(
      'visible para la comunidad',
    );
    const posts = (await (await publicPage.request.get(`/api/posts?kind=${kind}`)).json()) as {
      id: string;
      slug: string;
      title: string;
    }[];
    const post = posts.find((p) => p.title === title);
    expect(post).toBeTruthy();
    await publicPage.goto(`/publicacion/${post!.slug}`);
    await expect(publicPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await publicPage.reload();
    await expect(publicPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    if (kind === 'tournament')
      await publicPage.screenshot({
        path: testInfo.outputPath('torneo-publicado.png'),
        fullPage: true,
      });
    const changed = title + ' editado';
    await page.getByLabel('Título *', { exact: true }).fill(changed);
    await page.getByRole('button', { name: 'Guardar y publicar', exact: true }).click();
    await expect(page.locator('.admin-feedback.success')).toContainText(
      'visible para la comunidad',
    );
    await publicPage.reload();
    await expect(publicPage.getByRole('heading', { name: changed, exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('withdrawn');
    await page.getByRole('button', { name: 'Guardar publicación', exact: true }).click();
    await expect(page.locator('.admin-feedback.success')).toContainText('Publicación guardada');
    expect((await publicPage.request.get(`/api/posts/${post!.slug}`)).status()).toBe(404);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: `Borrar ${changed}`, exact: true }).click();
    await expect(page.locator('.admin-feedback.success')).toContainText('Publicación borrada');
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: changed })).toHaveCount(0);
  }
  await visitor.close();
});

test('Escritorio y celular: rutas públicas y panel sin desbordamiento horizontal', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await loginAdmin(page);
  const routes = [
    '/',
    '/tienda',
    '/preventas',
    '/comunidad',
    '/noticias',
    '/torneos',
    '/cuenta',
    '/carrito',
    '/admin',
    '/admin/articulos',
    '/admin/articulos/nuevo',
    '/admin/inventario',
    '/admin/preventas',
    '/admin/pedidos',
    '/admin/pos',
    '/admin/publicaciones',
    '/admin/clientes',
    '/admin/local',
  ];
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.getByText('Cargando información…', { exact: true })).toHaveCount(0);
      const metrics = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(metrics.document, `Desbordamiento en ${route} a ${width}px`).toBeLessThanOrEqual(
        metrics.viewport + 1,
      );
      if (['/', '/admin', '/admin/articulos/nuevo', '/admin/pos'].includes(route)) {
        await page.screenshot({
          path: testInfo.outputPath(
            `${width}-${route === '/' ? 'inicio' : route.replaceAll('/', '-').slice(1)}.png`,
          ),
          fullPage: true,
        });
      }
    }
  }
});

test('Carrito: cantidades persistentes, descuentos, envío por pagar y Flow sin configurar', async ({
  page,
}) => {
  await loginAdmin(page);
  const label = `Carrito E2E ${Date.now()}`;
  const product = await createArticle(page, 'store', label, 5);
  const settings = await (await page.request.get('/api/settings')).json();
  const carrierId = randomUUID();
  const saved = await page.request.patch('/api/admin/settings', {
    headers: { Origin: origin },
    data: {
      ...settings,
      carriers: [
        {
          id: carrierId,
          name: 'Agencia por pagar de prueba',
          enabled: true,
          mode: 'agency',
          collect: true,
          price: 7990,
        },
      ],
    },
  });
  expect(saved.ok()).toBeTruthy();
  const before = await (await page.request.get('/api/admin/orders')).json();
  await page.goto(`/producto/${product.slug}`);
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await page.goto('/carrito');
  await page.getByLabel(`Cantidad de ${label}`, { exact: true }).fill('2');
  await page.reload();
  await expect(page.getByLabel(`Cantidad de ${label}`, { exact: true })).toHaveValue('2');
  await expect(page.locator('.store-order-summary')).toContainText('$27.000');
  await expect(page.locator('.store-order-summary')).toContainText('Descuentos');
  await page.getByRole('button', { name: 'Continuar con la compra' }).click();
  await page.getByRole('radio', { name: /Envío/ }).check();
  await page.getByRole('combobox', { name: 'Transportista', exact: true }).selectOption(carrierId);
  await page.getByLabel('Nombre del destinatario').fill('Destinatario de prueba');
  await page.getByLabel('Teléfono de contacto').fill('+56912345678');
  await page.getByLabel('Región', { exact: true }).fill('Atacama');
  await page.getByLabel('Comuna', { exact: true }).fill('Copiapó');
  await page.getByLabel('Agencia de destino').fill('Agencia de prueba');
  await expect(page.locator('.store-shipping-notice')).toContainText('no está incluido');
  await expect(page.locator('.store-total')).toContainText('$27.000');
  await page.getByRole('button', { name: 'Ir a pagar con Flow' }).click();
  await expect(page.locator('.store-message-error')).toContainText('debe conectar Flow');
  const after = await (await page.request.get('/api/admin/orders')).json();
  expect(after.length).toBe(before.length);
  const current = await (await page.request.get(`/api/products/${product.slug}`)).json();
  expect(current.stock).toBe(5);
  expect(current.reserved).toBe(0);
  await page.getByRole('button', { name: `Eliminar ${label}`, exact: true }).click();
  await expect(page.locator('.store-empty')).toContainText('carrito');
});
