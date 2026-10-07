import { test, expect } from '@playwright/test';
const origin = 'http://localhost:3100';
test('Liga: selección múltiple guardada, recarga, suma pública y nuevo ciclo sin borrar', async ({
  page,
  browser,
}, info) => {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const old = await (await page.request.get('/api/admin/league')).json();
  const original = old
    .filter((t: any) => t.board === 'yugioh' && t.included_in_ranking)
    .map((t: any) => t.id);
  const ids: string[] = [];
  const names: string[] = [];
  const prefix = `Ciclo ${Date.now()}`;
  const visitor = await browser.newContext();
  const client = await visitor.newPage();
  try {
    expect(
      (
        await client.request.patch(origin + '/api/admin/league/selection', {
          headers: { Origin: origin },
          data: { board: 'yugioh', tournament_ids: [] },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.patch('/api/admin/league/selection', {
          headers: { Origin: 'https://evil.example' },
          data: { board: 'yugioh', tournament_ids: [] },
        })
      ).status(),
    ).toBe(403);
    for (let i = 1; i <= 4; i++) {
      const title = `${prefix} liga ${i}`;
      names.push(title);
      const p = await page.request.post('/api/admin/league/file/preview', {
        headers: { Origin: origin },
        data: {
          title,
          played_on: `2026-10-0${i}`,
          event_id: `${prefix.replaceAll(' ', '-')}-${i}`,
          text: `Posicion,Jugador,Puntos,Konami ID\n1,Ana Ciclo,${i * 3},id-ciclo`,
        },
      });
      expect(p.ok(), await p.text()).toBeTruthy();
      const c = await page.request.post('/api/admin/league/commit', {
        headers: { Origin: origin },
        data: { preview_id: (await p.json()).id },
      });
      expect(c.ok()).toBeTruthy();
      ids.push((await c.json()).id);
    }
    await page.goto('/admin/liga');
    const group = page.getByRole('group', {
      name: 'Yu-Gi-Oh! · Ranking SERGOD STORE',
      exact: true,
    });
    await expect(group.getByRole('checkbox')).toHaveCount(
      old.filter((t: any) => t.board === 'yugioh').length + 4,
    );
    await group.getByRole('button', { name: 'Desmarcar todas', exact: true }).click();
    for (const [count, points] of [
      [1, 3],
      [2, 9],
      [4, 30],
    ]) {
      for (let i = 0; i < count; i++)
        await group.getByRole('checkbox', { name: new RegExp(names[i]) }).check();
      await group.getByRole('button', { name: 'Guardar selección', exact: true }).click();
      await expect(group.getByRole('status')).toContainText(`${count} ligas`);
      await client.goto(origin + '/comunidad?ranking=yugioh');
      const ranking = await (
        await client.request.get(origin + '/api/rankings?board=yugioh')
      ).json();
      expect(ranking.rows[0].points).toBe(points);
      expect(ranking.tournaments).toHaveLength(count);
      await expect(
        client.getByRole('table', { name: 'Clasificación Ranking SERGOD STORE' }),
      ).toContainText('Ana Ciclo');
    }
    await page.reload();
    await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(4);
    await page.setViewportSize({ width: 375, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('seleccion-375.png') });
    await group.getByRole('button', { name: 'Desmarcar todas', exact: true }).click();
    await group.getByRole('button', { name: 'Guardar selección', exact: true }).click();
    await expect(group.getByRole('status')).toContainText('comienza de cero');
    await page.reload();
    await expect(group.getByRole('checkbox', { checked: true })).toHaveCount(0);
    expect(
      (await (await client.request.get(origin + '/api/rankings?board=yugioh')).json()).rows,
    ).toHaveLength(0);
    await group.getByRole('checkbox', { name: new RegExp(names[3]) }).check();
    await group.getByRole('button', { name: 'Guardar selección', exact: true }).click();
    await expect(group.getByRole('status')).toContainText('1 ligas');
    const final = await (await client.request.get(origin + '/api/rankings?board=yugioh')).json();
    expect(final.rows[0].points).toBe(12);
    expect(
      (await (await page.request.get('/api/admin/league')).json()).filter((t: any) =>
        ids.includes(t.id),
      ),
    ).toHaveLength(4);
  } finally {
    await page.request.patch('/api/admin/league/selection', {
      headers: { Origin: origin },
      data: { board: 'yugioh', tournament_ids: original },
    });
    for (const id of ids)
      await page.request.delete('/api/admin/league/' + id, { headers: { Origin: origin } });
    await visitor.close();
  }
});
