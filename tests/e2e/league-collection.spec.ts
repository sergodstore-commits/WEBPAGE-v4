import { test, expect } from '@playwright/test';
import type { LeagueTournament } from '../../lib/rankings';
test('Recolectar TOR: todas las páginas, guardar sin seleccionar, archivar, restaurar y recargar', async ({
  page,
}, info) => {
  let saved: LeagueTournament[] = [],
    requests: number[] = [],
    archiveWrites = 0;
  await page.route('**/api/**', (r) => {
    const req = r.request(),
      url = new URL(req.url()),
      p = url.pathname;
    if (p === '/api/auth/me')
      return r.fulfill({
        json: { id: 'admin', role: 'admin', email: 'admin@example.test', name: 'Admin' },
      });
    if (p === '/api/admin/league') return r.fulfill({ json: saved });
    if (p === '/api/admin/league/tor/review') {
      const page = req.postDataJSON().page;
      requests.push(page);
      return r.fulfill({
        json: {
          tournaments: [
            {
              external_id: String(page),
              title: `Liga ${page}`,
              board: page === 1 ? 'myl-first-era' : 'myl-first-block',
              played_on: '2026-10-08',
            },
          ],
          next_page: page === 1 ? 2 : null,
        },
      });
    }
    if (p === '/api/admin/league/collect') {
      const results = req.postDataJSON().ids.map((n: number) => {
        const old = saved.find((s) => s.external_id === String(n));
        if (old) return { external_id: String(n), state: old.archived ? 'archived' : 'existing' };
        saved.push({
          id: `00000000-0000-4000-8000-00000000000${n}`,
          source: 'tor',
          external_id: String(n),
          board: n === 1 ? 'myl-first-era' : 'myl-first-block',
          title: `Liga ${n}`,
          played_on: '2026-10-08',
          players: 12,
          source_url: '',
          round_id: 1,
          final_round: 4,
          revision: 1,
          updated_at: '2026-10-08',
          included_in_ranking: false,
          archived: false,
        });
        return { external_id: String(n), state: 'added' };
      });
      return r.fulfill({ json: { results } });
    }
    if (p === '/api/admin/league/selection') {
      const d = req.postDataJSON();
      saved = saved.map((s) =>
        s.board === d.board ? { ...s, included_in_ranking: d.tournament_ids.includes(s.id) } : s,
      );
      return r.fulfill({ json: {} });
    }
    if (p.startsWith('/api/admin/league/') && req.method() === 'PATCH') {
      archiveWrites++;
      const archived = req.postDataJSON().archived;
      saved = saved.map((s) =>
        s.id === p.split('/').pop() ? { ...s, archived, included_in_ranking: false } : s,
      );
      return r.fulfill({ json: {} });
    }
    if (p === '/api/rankings')
      return r.fulfill({
        json: {
          tournaments: saved.filter(
            (s) => s.board === url.searchParams.get('board') && s.included_in_ranking,
          ),
        },
      });
    return r.fulfill({ json: [] });
  });
  await page.goto('/admin/liga');
  const refresh = page.getByRole('button', { name: 'Actualizar torneos de MyL', exact: true });
  await refresh.click();
  await expect(page.getByRole('status').filter({ hasText: '2 torneos nuevos' })).toBeVisible();
  expect(requests).toEqual([1, 2]);
  const era = page.getByRole('group', { name: 'Mitos y Leyendas · Primera Era', exact: true }),
    block = page.getByRole('group', { name: 'Mitos y Leyendas · Primer Bloque', exact: true });
  await expect(era.getByRole('checkbox')).not.toBeChecked();
  await expect(block.getByRole('checkbox')).not.toBeChecked();
  await era.getByRole('checkbox').check();
  await era.getByRole('button', { name: 'Guardar selección', exact: true }).click();
  await expect(era.getByRole('status')).toContainText('Lectura pública comprobada');
  await era.getByRole('button', { name: 'Archivar torneo Liga 1', exact: true }).click();
  await expect(era.getByRole('checkbox')).toHaveCount(0);
  expect(archiveWrites).toBe(1);
  await refresh.click();
  await expect(page.getByRole('status').filter({ hasText: '1 archivados' })).toBeVisible();
  expect(saved).toHaveLength(2);
  await expect(era.getByRole('checkbox')).toHaveCount(0);
  await page.reload();
  await page.getByText('Archivados · 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Restaurar torneo Liga 1', exact: true }).click();
  await expect(era.getByRole('checkbox')).not.toBeChecked();
  await page.reload();
  await expect(era.getByRole('checkbox')).not.toBeChecked();
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`league-collection-${width}.png`),
      fullPage: true,
    });
  }
});

test('Recolectar Konami: permisos reales, guardado automático y archivo persistente', async ({
  page,
  browser,
}) => {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
  const visitor = await browser.newContext();
  const event = `AUTOCOLLECT-${Date.now()}`,
    payload = {
      source: 'file',
      reports: [
        {
          title: 'Recolectado prueba',
          event_id: event,
          played_on: '2026-10-08',
          text: 'Rangos\tID de Card Game\tNombre de Acceso\tVictoria\tEmpate\nGanador\t0000000055\tJugador Recolectado\t2\t0',
        },
      ],
    };
  expect(
    (
      await visitor.request.post('http://localhost:3100/api/admin/league/collect', {
        headers: { Origin: 'http://localhost:3100' },
        data: payload,
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post('/api/admin/league/collect', {
        headers: { Origin: 'https://evil.example' },
        data: payload,
      })
    ).status(),
  ).toBe(403);
  const first = await page.request.post('/api/admin/league/collect', {
    headers: { Origin: 'http://localhost:3100' },
    data: payload,
  });
  expect(first.ok()).toBe(true);
  expect((await first.json()).results[0].state).toBe('added');
  const items: LeagueTournament[] = await (await page.request.get('/api/admin/league')).json(),
    item = items.find((s) => s.external_id === event)!;
  try {
    expect(item.included_in_ranking).toBe(false);
    const r = await page.request.post('/api/admin/league/collect', {
      headers: { Origin: 'http://localhost:3100' },
      data: payload,
    });
    expect((await r.json()).results[0].state).toBe('existing');
    expect(
      (
        await page.request.patch(`/api/admin/league/${item.id}`, {
          headers: { Origin: 'https://evil.example' },
          data: { archived: true },
        })
      ).status(),
    ).toBe(403);
    await page.goto('/admin/liga');
    const group = page.getByRole('group', {
      name: 'Yu-Gi-Oh! · Ranking SERGOD STORE',
      exact: true,
    });
    await group
      .getByRole('button', { name: 'Archivar torneo Recolectado prueba', exact: true })
      .click();
    await page.reload();
    await expect(group.getByRole('checkbox', { name: /Recolectado prueba/ })).toHaveCount(0);
    const again = await page.request.post('/api/admin/league/collect', {
      headers: { Origin: 'http://localhost:3100' },
      data: payload,
    });
    expect((await again.json()).results[0].state).toBe('archived');
  } finally {
    await page.request.delete(`/api/admin/league/${item.id}`, {
      headers: { Origin: 'http://localhost:3100' },
    });
    await visitor.close();
  }
});
