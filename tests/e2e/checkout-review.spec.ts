import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Product, Settings } from '../../lib/types';

const origin = 'http://localhost:3100';

test('Carrito verificado: revisar entrega no crea pago; solo el botón final envía el pedido', async ({
  page,
}) => {
  const headers = { Origin: origin };
  const login = await page.request.post('/api/auth/login', {
    headers,
    data: { email: 'e2e@example.test', password: 'E2e-Prueba-Sergod-2026!' },
  });
  expect(login.ok()).toBeTruthy();
  expect((await login.json()).email_verified).toBe(true);
  const settings = (await (await page.request.get('/api/settings')).json()) as Settings;
  const ordersBefore = await (await page.request.get('/api/admin/orders')).json();
  const carrierId = `review-agency-${randomUUID()}`;
  let product: Product | undefined;
  const attempts: {
    items: { product_id: string; quantity: number }[];
    delivery: { method: string; carrier_id: string; agency: string };
  }[] = [];

  // This regression observes the browser's submission boundary. It never
  // forwards checkout to the server, creates a reservation, or calls Flow.
  await page.route('**/api/checkout', async (route) => {
    expect(route.request().method()).toBe('POST');
    attempts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Envío final interceptado para la prueba.' }),
    });
  });
  try {
    const saved = await page.request.patch('/api/admin/settings', {
      headers,
      data: {
        ...settings,
        address: 'Local de prueba, Copiapó',
        hours: 'Horario de prueba',
        carriers: [
          {
            id: carrierId,
            name: 'Starken de prueba',
            mode: 'agency',
            enabled: true,
            collect: true,
            price: 0,
          },
        ],
      },
    });
    expect(saved.ok()).toBeTruthy();
    const upload = await page.request.post('/api/admin/uploads', {
      headers,
      multipart: {
        file: {
          name: 'revision.png',
          mimeType: 'image/png',
          buffer: await sharp({
            create: { width: 32, height: 32, channels: 3, background: '#eeeeee' },
          })
            .png()
            .toBuffer(),
        },
      },
    });
    expect(upload.ok()).toBeTruthy();
    const created = await page.request.post('/api/admin/products', {
      headers,
      data: {
        name: 'Artículo para revisar entrega',
        description: 'Producto de prueba aislado.',
        sku: `REVIEW-${randomUUID()}`,
        category: 'Prueba',
        kind: 'store',
        price: 2990,
        stock: 3,
        images: [(await upload.json()).url],
      },
    });
    expect(created.ok()).toBeTruthy();
    product = await created.json();
    expect(
      (
        await page.request.post(`/api/admin/products/${product!.id}/publish`, { headers, data: {} })
      ).ok(),
    ).toBeTruthy();
    await page.goto(`/producto/${product!.slug}`);
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await page.goto('/carrito');
    await page.getByRole('button', { name: 'Continuar con la compra', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Entrega y pago', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ir a pagar con Flow', exact: true }),
    ).toBeEnabled();
    expect(attempts).toHaveLength(0);

    await page.getByRole('button', { name: 'Volver al carrito', exact: true }).click();
    await page.getByLabel(`Cantidad de ${product!.name}`, { exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Entrega y pago', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ir a pagar con Flow', exact: true }),
    ).toBeEnabled();
    expect(attempts).toHaveLength(0);
    await page.getByRole('button', { name: 'Volver al carrito', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar con la compra', exact: true }).click();
    await page.getByRole('radio', { name: /Envío Con transportista/ }).check();
    await page
      .getByRole('combobox', { name: 'Transportista', exact: true })
      .selectOption(carrierId);
    await page.getByLabel('Nombre del destinatario').fill('Destinatario de prueba');
    await page.getByLabel('Teléfono de contacto').fill('+56912345678');
    await page.getByLabel('Región', { exact: true }).fill('Atacama');
    await page.getByLabel('Comuna', { exact: true }).fill('Copiapó');
    await page.getByLabel('Agencia de destino').fill('Agencia de prueba');
    await expect(page.locator('.store-total')).toContainText('$2.990');
    await expect(page.locator('.store-shipping-notice')).toContainText('no está incluido');
    expect(attempts).toHaveLength(0);
    await page.getByRole('button', { name: 'Ir a pagar con Flow', exact: true }).click();
    await expect(page.locator('.store-message-error')).toContainText('Envío final interceptado');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].items).toEqual([{ product_id: product!.id, quantity: 1 }]);
    expect(attempts[0].delivery).toMatchObject({
      method: 'shipping',
      carrier_id: carrierId,
      agency: 'Agencia de prueba',
    });
    const current = await (await page.request.get(`/api/products/${product!.slug}`)).json();
    expect(current.stock).toBe(3);
    expect(current.reserved).toBe(0);
    expect((await (await page.request.get('/api/admin/orders')).json()).length).toBe(
      ordersBefore.length,
    );
  } finally {
    if (product)
      expect(
        (await page.request.delete(`/api/admin/products/${product.id}`, { headers })).ok(),
      ).toBeTruthy();
    expect(
      (await page.request.patch('/api/admin/settings', { headers, data: settings })).ok(),
    ).toBeTruthy();
  }
});
