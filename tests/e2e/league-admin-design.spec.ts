import { test, expect } from '@playwright/test';
import type { LeagueTournament } from '../../lib/rankings';

test('Liga simplificada: búsqueda, selección pendiente, guardar y recargar sin perder torneos ocultos', async ({
  page,
}, info) => {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  let writes = 0;
  let saved = ['yugioh', 'myl-first-era', 'myl-first-block'].flatMap((board, b) =>
    [1, 2].map((n) => ({
      id: `t-${b}-${n}`,
      source: 'file',
      external_id: `event-${b}-${n}`,
      board,
      title: `Liga ${n}`,
      played_on: `2026-10-0${n}`,
      source_url: '',
      round_id: null,
      final_round: 4,
      revision: 1,
      updated_at: '2026-10-08',
      players: 12,
      included_in_ranking: n === 1,
    })),
  ) as LeagueTournament[];
  await page.route('**/api/admin/league**', (r) => {
    if (r.request().method() === 'PATCH') {
      writes++;
      const input = r.request().postDataJSON();
      saved = saved.map((t) =>
        t.board === input.board
          ? { ...t, included_in_ranking: input.tournament_ids.includes(t.id) }
          : t,
      );
      return r.fulfill({ json: {} });
    }
    return r.fulfill({ json: saved });
  });
  await page.route('**/api/rankings?board=*', (r) =>
    r.fulfill({
      json: {
        tournaments: saved.filter(
          (t) =>
            t.board === new URL(r.request().url()).searchParams.get('board') &&
            t.included_in_ranking,
        ),
      },
    }),
  );
  await page.goto('/admin/liga');
  const group = page.getByRole('group', { name: 'Yu-Gi-Oh! · Ranking SERGOD STORE', exact: true });
  await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(1);
  await expect(page.getByLabel('Nombre del torneo *', { exact: true })).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Eliminar torneo Liga 1', exact: true }).first(),
  ).toBeHidden();
  await group.getByLabel('Buscar torneo en Ranking SERGOD STORE', { exact: true }).fill('Liga 2');
  await group.getByRole('button', { name: 'Marcar visibles', exact: true }).click();
  await expect(group).toContainText('2 de 2 torneos seleccionados');
  await expect(group).toContainText('Cambios sin guardar');
  expect(writes).toBe(0);
  await group.getByRole('button', { name: 'Guardar selección', exact: true }).click();
  await expect(group.getByRole('status')).toContainText('Lectura pública comprobada');
  expect(writes).toBe(1);
  expect(saved.filter((t) => t.board === 'myl-first-era' && t.included_in_ranking)).toHaveLength(1);
  await page.reload();
  await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await group.getByRole('button', { name: 'Desmarcar todas', exact: true }).click();
  await expect(group).toContainText('Cambios sin guardar');
  expect(writes).toBe(1);
  await page.reload();
  await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(2);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`liga-simple-${width}.png`), fullPage: true });
  }
  await page.getByText('Cargar archivo o pegar resultados Yu-Gi-Oh!', { exact: true }).click();
  await expect(page.getByLabel('Nombre del torneo *', { exact: true })).toBeVisible();
});
