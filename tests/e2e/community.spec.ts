import { test, expect, type Page } from '@playwright/test';
import {
  boards,
  type RankingBoard,
  type PublicRanking,
  type LeaguePreview,
  type LeagueTournament,
} from '../../lib/rankings';
test('KTS Konami: cargar, sumar dos fechas y actualizar sin duplicar', async ({ page }) => {
  await loginAdmin(page);
  // Remove only disposable KTS fixtures left by an interrupted local test run.
  const previous: LeagueTournament[] = await (await page.request.get('/api/admin/league')).json();
  for (const old of previous.filter((t) => /^KTS-\d+-[12]$/.test(t.external_id))) {
    expect(
      (
        await page.request.delete(`/api/admin/league/${old.id}`, {
          headers: { Origin: 'http://localhost:3100' },
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto('/admin/liga');
  const suffix = Date.now();
  const report = (index: number, wins: number) =>
    `<Tournament><ID>KTS-${suffix}-${index}</ID><Name>KTS ${suffix} ${index}</Name><Date>2026-10-0${index}</Date><Finalized>True</Finalized><TournamentPlayers><TournPlayer><Player><ID>0000099999</ID><FirstName>Jugador</FirstName><LastName>KTS</LastName></Player><Rank>1</Rank><Wins>${wins}</Wins><Points>999999</Points></TournPlayer></TournamentPlayers></Tournament>`;
  const upload = async (index: number, wins: number) => {
    await page.getByLabel('Archivo de resultados', { exact: true }).setInputFiles({
      name: 'resultado.Tournament',
      mimeType: 'application/xml',
      buffer: Buffer.from(report(index, wins)),
    });
    await expect(
      page.getByRole('heading', { name: 'Standing final · Vista previa', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Fecha del torneo *', { exact: true })).toHaveValue(
      `2026-10-0${index}`,
    );
  };
  await upload(1, 4);
  await page.getByRole('button', { name: 'Agregar a Liga', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText(
    'lectura pública comprobados',
  );
  await upload(2, 3);
  await page.getByRole('button', { name: 'Agregar a Liga', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText(
    'lectura pública comprobados',
  );
  await page.reload();
  const ranking = async () =>
    (await (await page.request.get('/api/rankings?board=yugioh')).json()).rows.find(
      (r: { name: string }) => r.name === 'Jugador KTS',
    );
  expect((await ranking()).points).toBe(21);
  await upload(1, 2);
  await page.getByRole('button', { name: 'Confirmar actualización', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('reemplazados');
  await page.reload();
  expect((await ranking()).points).toBe(15);
  for (const index of [1, 2]) {
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: `Eliminar torneo KTS ${suffix} ${index}`, exact: true })
      .click();
    await expect(page.locator('.admin-feedback.success')).toContainText('eliminado');
  }
});
const tournament = '98d5a731-15ed-47af-a83a-e4e152f9c839';
const rows = Array.from({ length: 60 }, (_, i) => ({
  position: i < 4 ? 1 : i + 1,
  name: i === 0 ? 'Andrés Competidor' : `Jugador ${String(i).padStart(2, '0')}`,
  tournaments: 2,
  points: i < 4 ? 120 : 120 - i,
}));
const fixture = (board: RankingBoard): PublicRanking => ({
  board,
  updated_at: '2026-10-07T15:00:00Z',
  rows:
    board === 'myl-first-era'
      ? rows
      : board === 'myl-first-block'
        ? [{ position: 1, name: 'Jugadora Primer Bloque', tournaments: 1, points: 9 }]
        : [],
  tournaments:
    board === 'yugioh'
      ? []
      : [
          {
            id: tournament,
            title: 'Liga publicada',
            played_on: '2026-10-06',
            source_url: '',
            final_round: 7,
          },
        ],
});
async function publicMock(page: Page, fail = false) {
  let broken = fail;
  await page.route('**/api/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/api/auth/me') return r.fulfill({ json: null });
    if (url.pathname === '/api/settings')
      return r.fulfill({ json: { name: 'SERGOD STORE', carriers: [], reservation_minutes: 20 } });
    if (url.pathname === '/api/posts') return r.fulfill({ json: [] });
    if (url.pathname === '/api/rankings') {
      if (broken) {
        broken = false;
        return r.fulfill({ status: 503, json: { error: 'No se pudo leer el ranking.' } });
      }
      return r.fulfill({
        json: fixture((url.searchParams.get('board') || 'myl-first-era') as RankingBoard),
      });
    }
    if (url.pathname.startsWith('/api/rankings/'))
      return r.fulfill({
        json: {
          title: 'Liga publicada',
          final_round: 7,
          results: [{ name: 'Andrés Competidor', position: 1, points: 12 }],
        },
      });
    return r.fulfill({ status: 404, json: { error: 'Fuera de la prueba.' } });
  });
}
async function loginAdmin(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('e2e-tournaments@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('E2e-Prueba-Sergod-2026!');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Resumen', exact: true })).toBeVisible();
}
test('Comunidad: rankings separados, búsqueda, más jugadores y lectura adaptable', async ({
  page,
}, info) => {
  await publicMock(page);
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/comunidad');
    await expect(page.getByRole('heading', { name: 'Comunidad.', exact: true })).toBeVisible();
    await expect(
      page.getByText('Liga y rankings internos de SERGOD STORE.', { exact: true }),
    ).toHaveCSS('color', 'rgb(82, 97, 112)');
    const table = page.getByRole('table', { name: 'Clasificación Primera Era' });
    await expect(table.getByRole('row')).toHaveCount(51);
    const leaders = page.getByLabel('Primeros lugares', { exact: true });
    await expect(leaders.locator('article')).toHaveCount(4);
    await expect(leaders.locator('article[data-position="1"]')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Ver resultados', exact: true })).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`comunidad-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.getByRole('button', { name: 'Ver más jugadores', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Clasificación Primera Era' }).getByRole('row'),
  ).toHaveCount(61);
  await page.getByLabel('Buscar jugador', { exact: true }).fill('ANDRES');
  await expect(
    page.getByRole('table', { name: 'Clasificación Primera Era' }).getByRole('row'),
  ).toHaveCount(2);
  await page.getByText('Torneos que aportan al ranking · 1', { exact: true }).press('Enter');
  await expect(page.getByText(/Solo se suman las ligas de Primera Era/)).toBeVisible();
  await page.getByRole('button', { name: 'Ver resultados', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Resultados de Liga publicada' })).toContainText(
    'Ronda 7',
  );
  await page.getByRole('link', { name: 'Primer Bloque', exact: true }).click();
  await expect(page).toHaveURL(/ranking=myl-first-block/);
  await page.reload();
  await expect(page.getByRole('table', { name: 'Clasificación Primer Bloque' })).toContainText(
    'Jugadora Primer Bloque',
  );
  await page.getByRole('link', { name: 'Ranking SERGOD STORE', exact: true }).click();
  await expect(page.getByText(/No es un ranking oficial de Konami/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'El ranking comienza contigo', exact: true }),
  ).toBeVisible();
});
test('Comunidad: error recuperable y parámetro desconocido seguro', async ({ page }) => {
  await publicMock(page, true);
  await page.goto('/comunidad?ranking=toString');
  await expect(
    page.getByRole('alert').filter({ hasText: 'No se pudo leer el ranking.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Clasificación Primera Era' })).toBeVisible();
});
test('Liga real local: subir reporte, previsualizar, guardar, recargar, corregir y eliminar', async ({
  page,
  browser,
}, info) => {
  page.setDefaultTimeout(15000);
  await loginAdmin(page);
  const visitor = await browser.newContext(),
    client = await visitor.newPage();
  expect((await client.request.get('http://localhost:3100/api/admin/league')).status()).toBe(401);
  expect(
    (
      await page.request.post('/api/admin/league/file/preview', {
        headers: { Origin: 'https://evil.example' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto('/admin/liga');
  const title = `Liga YGO ${Date.now()}`,
    event = `TEST-${Date.now()}`;
  await page.getByLabel('Nombre del torneo *', { exact: true }).fill(title);
  await page.getByLabel('Fecha del torneo *', { exact: true }).fill('2026-10-07');
  await page.getByLabel(/^Identificador del torneo/).fill(event);
  const upload = async (text: string, name: string) => {
    await page
      .getByLabel('Archivo de resultados', { exact: true })
      .setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    await expect(page.getByLabel(/^Tabla de resultados/)).toHaveValue(text);
  };
  await upload(
    `Lista de Resultados del Torneo,${event},\n,,\nRangos,El ID de Card Game,Nombre de Acceso\nGanador,0000123401,Ana Prueba\n2,0000123402,Bruno Prueba`,
    'resultados.csv',
  );
  await page
    .getByRole('button', { name: 'Previsualizar resultados Yu-Gi-Oh!', exact: true })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'El archivo no incluye puntos' }),
  ).toBeVisible();
  await page.getByLabel(/^Puntos por posición/).fill('1=9\n2=6');
  await page
    .getByRole('button', { name: 'Previsualizar resultados Yu-Gi-Oh!', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Standing final · Vista previa', exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/rankings?board=yugioh')).json()).tournaments,
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Agregar a Liga', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText(
    'lectura pública comprobados',
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: `Actualizar resultados de ${title}`, exact: true }),
  ).toBeVisible();
  await client.goto('http://localhost:3100/comunidad?ranking=yugioh');
  await client.reload();
  const ranking = client.getByRole('table', { name: 'Clasificación Ranking SERGOD STORE' });
  await expect(ranking).toContainText('Ana Prueba');
  await expect(ranking.getByRole('row').filter({ hasText: 'Ana Prueba' })).toContainText('9');
  const publicData = await (
    await client.request.get('http://localhost:3100/api/rankings?board=yugioh')
  ).json();
  expect(JSON.stringify(publicData)).not.toContain('0000123401');
  await page
    .getByRole('button', { name: `Actualizar resultados de ${title}`, exact: true })
    .click();
  await page.getByLabel(/^Puntos por posición/).fill('');
  await upload(
    'Posicion,Jugador,Puntos,Konami ID\n1,Ana Prueba,3,0000123401\n2,Bruno Prueba,1,0000123402',
    'corregidos.csv',
  );
  await page
    .getByRole('button', { name: 'Previsualizar resultados Yu-Gi-Oh!', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirmar actualización', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('reemplazados');
  await client.reload();
  await expect(ranking.getByRole('row').filter({ hasText: 'Ana Prueba' })).toContainText('3');
  await page.setViewportSize({ width: 375, height: 900 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath('liga-admin-375.png'),
    fullPage: true,
    animations: 'disabled',
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: `Eliminar torneo ${title}`, exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('eliminado');
  await client.reload();
  await expect(
    client.getByRole('heading', { name: 'El ranking comienza contigo', exact: true }),
  ).toBeVisible();
  await visitor.close();
});
test('Liga TOR Admin: revisar, standing final, agregar y actualizar sin importación automática', async ({
  page,
}) => {
  page.setDefaultTimeout(15000);
  await loginAdmin(page);
  let saved: LeagueTournament[] = [],
    writes = 0;
  const candidate = {
    external_id: '87654',
    title: 'Liga TOR de prueba',
    board: 'myl-first-era' as const,
    played_on: '2026-10-06',
    imported: false,
    revision: 0,
    status: 'Reportado',
  };
  await page.route('**/api/admin/league**', (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/admin/league') return r.fulfill({ json: saved });
    if (path === '/api/admin/league/tor/review')
      return r.fulfill({
        json: {
          store_id: 501,
          tournaments: [{ ...candidate, imported: !!saved.length }],
          next_page: null,
        },
      });
    if (path === '/api/admin/league/tor/preview')
      return r.fulfill({
        json: {
          id: tournament,
          source: 'tor',
          external_id: candidate.external_id,
          board: candidate.board,
          title: candidate.title,
          played_on: candidate.played_on,
          source_url: '',
          round_id: 987654,
          final_round: 7,
          base_revision: saved[0]?.revision || 0,
          warnings: [],
          file_hash: null,
          expires_at: '2030-01-01T00:00:00Z',
          results: [
            {
              player_key: 'tor:1',
              name: 'Jugadora TOR',
              position: 1,
              points: saved.length ? 3 : 12,
            },
          ],
        } satisfies LeaguePreview,
      });
    if (path === '/api/admin/league/commit') {
      writes++;
      const input = r.request().postDataJSON();
      expect(input.replace).toBe(saved.length > 0);
      saved = [
        {
          ...candidate,
          id: tournament,
          source: 'tor',
          source_url: '',
          round_id: 987654,
          final_round: 7,
          updated_at: '2026-10-07T10:00:00Z',
          players: 1,
          revision: writes,
          included_in_ranking: false,
        },
      ];
      return r.fulfill({ json: saved[0] });
    }
    return r.fulfill({ status: 404, json: { error: 'Fuera de la prueba' } });
  });
  await page.route('**/api/rankings?**', (r) =>
    r.fulfill({
      json: {
        ...fixture('myl-first-era'),
        tournaments: saved.filter((t) => t.included_in_ranking),
      },
    }),
  );
  await page.goto('/admin/liga');
  await page.getByRole('button', { name: 'Revisar TOR', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Revisar standing de Liga TOR de prueba', exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page
    .getByRole('button', { name: 'Revisar standing de Liga TOR de prueba', exact: true })
    .click();
  await expect(page.getByText(/Última ronda: 7/)).toBeVisible();
  await page.getByRole('button', { name: 'Agregar a Liga', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('Resultados guardados');
  expect(writes).toBe(1);
  await page.reload();
  await page
    .getByRole('button', { name: 'Actualizar resultados de Liga TOR de prueba', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirmar actualización', exact: true }).click();
  await expect(page.locator('.admin-feedback.success')).toContainText('reemplazados');
  expect(writes).toBe(2);
});
