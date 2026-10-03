import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Product } from '../../lib/types';

const origin = 'http://localhost:3100';

test('Familias: filtros, vista rápida, variantes, stock independiente y edición conservada', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const identifier = randomUUID().slice(0, 8);
  const name = `Familia opciones E2E ${identifier}`;
  const group = `e2e-opciones-${identifier}`;
  const brand = `Marca E2E ${identifier}`;
  const created: Product[] = [];
  const visitor = await browser.newContext({ baseURL: origin });
  const customer = await visitor.newPage();
  customer.setDefaultTimeout(15_000);
  page.setDefaultTimeout(15_000);
  let testError: unknown;
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { email: 'e2e@example.test', password: 'E2e-Prueba-Sergod-2026!' },
  });
  expect(login.ok()).toBeTruthy();
  try {
    for (const [index, definition] of [
      { format: 'Estándar', color: 'Negro', price: 6000, background: '#222222' },
      { format: 'Japonés', color: 'Negro', price: 5000, background: '#777777' },
      { format: 'Estándar', color: 'Azul', price: 6500, background: '#2244aa' },
    ].entries()) {
      const uploaded = await page.request.post('/api/admin/uploads', {
        headers: { Origin: origin },
        multipart: {
          file: {
            name: `opcion-${index}.png`,
            mimeType: 'image/png',
            buffer: await sharp({
              create: { width: 120, height: 160, channels: 3, background: definition.background },
            })
              .png()
              .toBuffer(),
          },
        },
      });
      expect(uploaded.ok()).toBeTruthy();
      const { url } = await uploaded.json();
      const response = await page.request.post('/api/admin/products', {
        headers: { Origin: origin },
        data: {
          name: `${name} · ${definition.format} · ${definition.color}`,
          sku: `${group}-${index}`,
          description: 'Producto aislado para comprobar opciones y cantidades independientes.',
          category: 'Accesorios E2E',
          price: definition.price,
          stock: 0,
          kind: 'store',
          status: 'draft',
          images: [url],
          catalog_group: group,
          catalog_name: name,
          brand,
          options: { Formato: definition.format, Color: definition.color },
          tags: ['Nuevo 2026', 'Garantía 103'],
          specifications: [{ label: 'Contenido', value: '103 unidades' }],
          source_url: 'https://example.com/catalogo/prueba',
        },
      });
      expect(response.ok()).toBeTruthy();
      const product = (await response.json()) as Product;
      created.push(product);
      const published = await page.request.post(`/api/admin/products/${product.id}/publish`, {
        headers: { Origin: origin },
        data: {},
      });
      expect(published.ok()).toBeTruthy();
    }

    await customer.goto('/tienda');
    await customer.getByLabel('Buscar artículos', { exact: true }).fill(name);
    await expect(customer.locator('.store-product-card')).toHaveCount(1);
    await expect(customer.locator('.store-product-card')).toContainText('3 opciones');
    await expect(customer.locator('.store-product-card')).toContainText('Agotado');
    await customer.getByRole('combobox', { name: 'Marca', exact: true }).selectOption(brand);
    await customer
      .getByRole('combobox', { name: 'Características', exact: true })
      .selectOption('Garantía 103');
    await customer.getByLabel('Precio hasta', { exact: true }).fill('5500');
    await expect(customer.locator('.store-product-card')).toContainText('1 opción');
    await customer.getByLabel('Precio hasta', { exact: true }).fill('');
    await customer.getByRole('checkbox', { name: 'Solo disponibles', exact: true }).check();
    await expect(customer.locator('.store-product-card')).toHaveCount(0);
    await customer.getByRole('checkbox', { name: 'Solo disponibles', exact: true }).uncheck();

    const quickButton = customer.getByRole('button', {
      name: `Vista rápida de ${name}`,
      exact: true,
    });
    await quickButton.click();
    const dialog = customer.getByRole('dialog', { name: 'Vista rápida', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('Japonés');
    await expect(dialog.locator('.store-sku')).toContainText(created[1].sku);
    await expect(
      dialog.getByRole('button', { name: 'Añadir al carrito', exact: true }),
    ).toBeDisabled();
    await customer.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(quickButton).toBeFocused();

    await customer.getByRole('link', { name: 'Ver opciones', exact: true }).click();
    await customer.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('Estándar');
    await customer.getByRole('combobox', { name: 'Color', exact: true }).selectOption('Azul');
    await expect(customer).toHaveURL(`/producto/${created[2].slug}`);
    await expect(customer.locator('.store-detail-main-image img')).toHaveAttribute(
      'src',
      created[2].images[0],
    );
    await customer.getByRole('combobox', { name: 'Formato', exact: true }).selectOption('Japonés');
    await expect(customer).toHaveURL(`/producto/${created[1].slug}`);
    await expect(customer.getByRole('combobox', { name: 'Color', exact: true })).toHaveValue(
      'Negro',
    );
    await expect(customer.locator('.store-detail-main-image img')).toHaveAttribute(
      'src',
      created[1].images[0],
    );
    await expect(
      customer.getByRole('button', { name: 'Añadir al carrito', exact: true }),
    ).toBeDisabled();

    const adjustment = await page.request.post('/api/admin/inventory', {
      headers: { Origin: origin },
      data: { product_id: created[1].id, delta: 2, reason: 'Existencias de prueba por variante' },
    });
    expect(adjustment.ok()).toBeTruthy();
    await customer.reload();
    await expect(customer.locator('.store-detail-stock')).toContainText('2 unidades disponibles');
    await customer.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
    await customer.goto('/carrito');
    await expect(customer.locator('.store-cart-item-name')).toContainText(created[1].name);
    expect(
      await customer.evaluate(() =>
        JSON.parse(localStorage.getItem('sergod-store-cart-v1') || '[]'),
      ),
    ).toEqual([{ product_id: created[1].id, quantity: 1 }]);

    await page.goto(`/admin/articulos/${created[1].id}`);
    await page.getByText('Familia, opciones y ficha técnica', { exact: true }).click();
    await expect(page.getByLabel(/^Nombre de la familia/)).toHaveValue(name);
    await expect(page.getByLabel(/^Opciones de este artículo/)).toHaveValue(/Formato: Japonés/);
    await expect(page.getByLabel(/^Opciones de este artículo/)).toHaveValue(/Color: Negro/);
    await page.getByLabel('Precio en pesos chilenos *').fill('5500');
    await page.getByLabel(/^Etiquetas/).fill('Nuevo 2026, Garantía 103, Probado');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(page.locator('.admin-feedback.success')).toContainText('Cambios guardados');
    await page.reload();
    await page.getByText('Familia, opciones y ficha técnica', { exact: true }).click();
    await expect(page.getByLabel(/^Etiquetas/)).toHaveValue('Nuevo 2026, Garantía 103, Probado');
    const saved = (await (
      await page.request.get(`/api/admin/products/${created[1].id}`)
    ).json()) as Product;
    expect(saved).toMatchObject({
      catalog_group: group,
      catalog_name: name,
      brand,
      options: { Formato: 'Japonés', Color: 'Negro' },
      specifications: [{ label: 'Contenido', value: '103 unidades' }],
      source_url: 'https://example.com/catalogo/prueba',
      stock: 2,
      price: 5500,
    });
    const sibling = (await (
      await page.request.get(`/api/admin/products/${created[0].id}`)
    ).json()) as Product;
    expect(sibling.stock).toBe(0);
    expect(sibling.price).toBe(6000);
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    try {
      await visitor.close();
      for (const product of created)
        await page.request.delete(`/api/admin/products/${product.id}`, {
          headers: { Origin: origin },
          timeout: 10_000,
        });
    } catch (cleanupError) {
      if (!testError) throw cleanupError;
    }
  }
});
