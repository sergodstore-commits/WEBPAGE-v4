import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KONAMI_CONNECTOR_ID } from '../../lib/konami-connector';
import { parseRankingFile } from '../../lib/server/ranking-files';

test('Complemento Konami: todos los torneos, paginación, sesión y regreso a la página original', async () => {
  test.skip(
    process.env.KONAMI_SKIP_EXTENSION_E2E === 'true',
    'Se comprueba el complemento completo en Chromium de CI.',
  );
  const profile = await mkdtemp(path.join(tmpdir(), 'sergod-konami-batch-'));
  if (
    path.dirname(path.resolve(profile)) !== path.resolve(tmpdir()) ||
    !path.basename(profile).startsWith('sergod-konami-batch-')
  )
    throw Error('Perfil fuera del directorio de pruebas.');
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
    await context.route('**/*', (r) => {
      if (new URL(r.request().url()).hostname !== 'shp.cardgame-network.konami.net')
        return r.fulfill({ contentType: 'text/html', body: '<h1>Panel de prueba</h1>' });
      return r.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<main id="page"></main><script>
        let page=1;
        const row=(id,status='Torneo Finalizado',store='Sergod Store')=>'<tbody><tr><td><div class="tournament-label">'+status+'</div><div class="store-name">'+store+'</div></td><td><div>'+id+'</div></td></tr></tbody>';
        function list(){ document.querySelector('#page').innerHTML='<input id="search-start-date" value="2026-09-08"><input id="search-end-date"><button id="clear">Eliminar Condiciones De Búsqueda</button><button id="search">Buscar</button><table><thead><tr><th>Número de Torneo</th></tr></thead>'+ (page===1?row('E26-BATCH-1')+row('E26-NOTFINAL','Preparándose')+row('E26-FOREIGN','Torneo Finalizado','Otra Tienda'):row('E26-BATCH-2'))+'</table><ul class="pagination"><li class="pagination-first '+(page===1?'disabled':'')+'"><a id="first">«</a></li><li class="pagination-next '+(page===2?'disabled':'')+'"><a id="next">›</a></li></ul>';
          document.querySelector('#clear').onclick=()=>document.querySelector('#search-start-date').value='2026-09-08';
          document.querySelector('#search').onclick=()=>{page=1;list()};
          document.querySelector('#next').onclick=()=>{page=2;list()};document.querySelector('#first').onclick=()=>{page=1;list()};
        }
        function render(){if(location.hash==='#/tournament'){page=1;list();return;}const id=location.hash.split('/').pop(),n=id.endsWith('2')?2:1;
          document.querySelector('#page').innerHTML='<div class="ruled-line"><label>Estado</label><div>Torneo Finalizado</div></div><div class="ruled-line"><label>Número de Torneo</label><div>'+id+'</div></div><div class="ruled-line"><label>Nombre del Torneo</label><div>Konami '+n+'</div></div><div class="ruled-line"><label>Fecha y Hora del Evento (Hora Local de la Tienda)</label><div>10/0'+n+'/2026 5:30 PM</div></div><div><div><table><tr><th>Rangos</th><th>ID de Card Game</th><th>Nombre de Acceso</th><th>Victoria</th><th>Empate</th></tr><tr><td>Ganador</td><td>0000000001</td><td>Ana Prueba</td><td>'+n+'</td><td>0</td></tr></table></div></div>';
        }window.addEventListener('hashchange',()=>setTimeout(render,80));render();
      </script>`,
      });
    });
    const konami = await context.newPage();
    await konami.goto(
      'https://shp.cardgame-network.konami.net/mt/home/#/tournament-finish/E26-BATCH-1',
    );
    const admin = await context.newPage();
    await admin.goto('https://www.sergodstore.cl/admin/liga');
    const result = await admin.evaluate(
      (id) =>
        new Promise<any>((resolve) =>
          (window as any).chrome.runtime.sendMessage(
            id,
            { type: 'SERGOD_KONAMI_ALL_RESULTS' },
            resolve,
          ),
        ),
      KONAMI_CONNECTOR_ID,
    );
    expect(result.ok, result.error).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.reports.map((r: any) => r.event_id)).toEqual(['E26-BATCH-1', 'E26-BATCH-2']);
    expect(result.reports.map((r: any) => parseRankingFile(r).results[0].points)).toEqual([3, 6]);
    await expect(konami).toHaveURL(/tournament-finish\/E26-BATCH-1$/);
    await admin.goto('https://www.sergodstore.cl/');
    const rejected = await admin.evaluate(
      (id) =>
        new Promise<any>((resolve) =>
          (window as any).chrome.runtime.sendMessage(
            id,
            { type: 'SERGOD_KONAMI_ALL_RESULTS' },
            resolve,
          ),
        ),
      KONAMI_CONNECTOR_ID,
    );
    expect(rejected.error).toContain('no autorizada');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
