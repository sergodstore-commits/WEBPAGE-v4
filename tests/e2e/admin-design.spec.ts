import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}

test('Admin: tareas agrupadas, ubicación y pantallas de trabajo adaptables', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await login(page);
  const navigation = page.getByRole('navigation', { name: 'Administración', exact: true });
  for (const label of ['Catálogo', 'Ventas', 'Comunidad y contenido', 'Configuración']) {
    await expect(navigation.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(navigation.getByRole('link', { name: 'Resumen' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const width of [1440, 1024, 820, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      '/admin',
      '/admin/articulos/nuevo',
      '/admin/articulos',
      '/admin/preventas',
      '/admin/torneos',
      '/admin/integraciones',
      '/admin/liga',
      '/admin/noticias',
    ]) {
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.getByText('Cargando información…', { exact: true })).toHaveCount(0);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${path} a ${width}px`).toBeLessThanOrEqual(1);
      if (width === 1440 || width === 375) {
        await page.screenshot({
          path: info.outputPath(`${width}-${path.replaceAll('/', '-')}.png`),
          fullPage: true,
        });
      }
    }
  }
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await navigation.getByRole('link', { name: 'Artículos', exact: true }).click();
  await expect(page).toHaveURL('/admin/articulos');
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.querySelector('main')?.contains(document.activeElement)
          ? 'content'
          : document.activeElement?.outerHTML,
      ),
    )
    .toBe('content');
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('Admin móvil: menú con foco contenido, cierre y restauración de navegación', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 820, height: 700 });
  await login(page);
  const trigger = page.getByRole('button', { name: 'Abrir menú' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Menú de administración' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cerrar menú' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Cerrar menú' })).toHaveCSS(
    'color',
    'rgb(228, 237, 245)',
  );
  await expect(page.locator('.admin-workspace')).toHaveAttribute('inert', '');
  await expect(page.locator('.admin-sidebar-overlay')).toBeVisible();
  await dialog.getByRole('link', { name: 'Ver tienda pública' }).focus();
  await page.keyboard.press('Tab');
  await expect(
    dialog.getByRole('link', { name: 'SERGOD STORE Administración', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: 'Ver tienda pública' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await trigger.click();
  await page.locator('.admin-sidebar-overlay').click({ position: { x: 800, y: 100 } });
  await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 375, height: 812 });
  await trigger.click();
  await expect.poll(async () => (await dialog.boundingBox())?.x).toBe(0);
  await page.screenshot({ path: info.outputPath('375-menu.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.admin-sidebar')).toBeVisible();
  await expect(page.locator('.admin-workspace')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
