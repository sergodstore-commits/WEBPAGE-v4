import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseRankingFile } from '../../lib/server/ranking-files';
import { KONAMI_CONNECTOR_ID } from '../../lib/konami-connector';

test('Complemento Konami real: sesión del navegador, páginas completas y vista previa válida', async () => {
  test.skip(
    process.env.KONAMI_SKIP_EXTENSION_E2E === 'true',
    'Chromium descargado no puede iniciarse en este entorno Windows; se prueba el complemento completo en CI Linux.',
  );
  const profile = await mkdtemp(path.join(tmpdir(), 'sergod-konami-test-'));
  const extension = path.resolve('extensions/konami-connector');
  const context = await chromium.launchPersistentContext(profile, {
    ...(process.env.KONAMI_TEST_BROWSER
      ? { executablePath: process.env.KONAMI_TEST_BROWSER }
      : { channel: 'chromium' as const }),
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    // Every request stays in this fixture; neither real Konami nor production is contacted.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'shp.cardgame-network.konami.net')
        return route.fulfill({
          contentType: 'text/html',
          body: `
        <div class="ruled-line"><label>Estado</label><div>Torneo Finalizado</div></div>
        <div class="ruled-line"><label>Nombre del Torneo</label><div>Torneo prueba conector</div></div>
        <div class="ruled-line"><label>Fecha y Hora del Evento (Hora Local de la Tienda)</label><div>10/03/2026 5:30 p. m.</div></div>
        <input id="checkboxExceptDropFlg" type="checkbox">
        <div><div class="table-responsive"><table><tr><th>Rangos</th><th>ID de Card Game</th><th>Nombre de Acceso</th><th>Victoria</th><th>Empate</th></tr><tr id="result"><td>Ganador</td><td>0000000001</td><td>Ana Prueba</td><td>4</td><td>0</td></tr></table></div>
        <ul class="pagination"><li class="pagination-first disabled"><a href="#">«</a></li><li class="pagination-next"><a href="#" onclick="event.preventDefault();document.querySelector('#result').innerHTML='<td>2</td><td>0000000002</td><td>Bruno Prueba</td><td>3</td><td>0</td>';this.parentElement.classList.add('disabled')">›</a></li></ul></div>`,
        });
      return route.fulfill({ contentType: 'text/html', body: '<h1>Panel local de prueba</h1>' });
    });
    const konami = await context.newPage();
    await konami.goto(
      'https://shp.cardgame-network.konami.net/mt/home/#/tournament-finish/E26-CONNECTOR-TEST',
    );
    const admin = await context.newPage();
    await admin.goto('https://www.sergodstore.cl/admin/liga');
    const response = await admin.evaluate(
      (id) =>
        new Promise<any>((resolve) => {
          (window as any).chrome.runtime.sendMessage(
            id,
            { type: 'SERGOD_KONAMI_RESULTS' },
            resolve,
          );
        }),
      KONAMI_CONNECTOR_ID,
    );
    expect(response.ok).toBe(true);
    const preview = parseRankingFile(response.report);
    expect(preview.played_on).toBe('2026-10-03');
    expect(preview.results.map((p) => p.points)).toEqual([12, 9]);
    expect(preview.external_id).toBe('E26-CONNECTOR-TEST');
    await konami.locator('#checkboxExceptDropFlg').check();
    const filtered = await admin.evaluate(
      (id) =>
        new Promise<any>((resolve) => {
          (window as any).chrome.runtime.sendMessage(
            id,
            { type: 'SERGOD_KONAMI_RESULTS' },
            resolve,
          );
        }),
      KONAMI_CONNECTOR_ID,
    );
    expect(filtered.ok).toBe(false);
    expect(filtered.error).toContain('retirados');
    const other = await context.newPage();
    await other.goto('https://www.sergodstore.cl/tienda');
    const rejected = await other.evaluate(
      (id) =>
        new Promise<any>((resolve) => {
          (window as any).chrome.runtime.sendMessage(
            id,
            { type: 'SERGOD_KONAMI_RESULTS' },
            resolve,
          );
        }),
      KONAMI_CONNECTOR_ID,
    );
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toContain('no autorizada');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('Lector Konami: fecha real, ceros del ID, victorias y filtros', async ({ page }) => {
  await page.setContent(`<div class="ruled-line"><label>Estado</label><div>Torneo Finalizado</div></div>
    <div class="ruled-line"><label>Nombre del Torneo</label><div>Local - November 3</div></div>
    <div class="ruled-line"><label>Fecha y Hora del Evento (Hora Local de la Tienda)</label><div>10/03/2026 5:30 p. m.</div></div>
    <input id="checkboxExceptDropFlg" type="checkbox">
    <div><div class="table-responsive"><table><tr><th>Rangos</th><th>ID de Card Game</th><th>Nombre de Acceso</th><th>Victoria</th><th>Empate</th></tr><tr><td>Ganador</td><td>0000000001</td><td>Ana Pérez</td><td>4</td><td>0</td></tr></table></div><ul class="pagination"><li class="pagination-next disabled"><a>›</a></li></ul></div>`);
  await page.addScriptTag({ path: path.resolve('extensions/konami-connector/reader.js') });
  const report = await page.evaluate(() =>
    (window as any).readKonamiReport(
      document,
      'https://shp.cardgame-network.konami.net/mt/home/#/tournament-finish/E26-TEST',
    ),
  );
  const parsed = parseRankingFile(report);
  expect(parsed.played_on).toBe('2026-10-03');
  expect(parsed.results[0].points).toBe(12);
  expect(parsed.results[0].name).toBe('Ana Pérez');
  await page.locator('#checkboxExceptDropFlg').check();
  const error = await page.evaluate(async () => {
    try {
      await (window as any).readKonamiReport(
        document,
        'https://shp.cardgame-network.konami.net/mt/home/#/tournament-finish/E26-TEST',
      );
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(error).toContain('retirados');
});
