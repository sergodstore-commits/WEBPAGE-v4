/* Reads only rendered tournament data. It never reads credentials, cookies or account storage. */
async function readKonamiReport(doc, href) {
  const url = new URL(href);
  const match = /^#\/tournament-finish\/([a-zA-Z0-9_.:-]+)$/.exec(url.hash);
  if (url.origin !== 'https://shp.cardgame-network.konami.net' || !match)
    throw Error('Abre la pantalla de resultados de un torneo finalizado.');
  const norm = (value) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const labels = [...doc.querySelectorAll('.ruled-line')];
  const field = (label) =>
    labels
      .find((row) => norm(row.querySelector('label')?.textContent || '') === norm(label))
      ?.querySelector('div')
      ?.textContent.trim();
  if (field('Número de Torneo') && field('Número de Torneo') !== match[1])
    throw Error('La página de resultados todavía está cargando.');
  if (field('Estado') !== 'Torneo Finalizado')
    throw Error('Expande «Detalles del Torneo/Evento» y comprueba que indique Torneo Finalizado.');
  const date = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(
    field('Fecha y Hora del Evento (Hora Local de la Tienda)') || '',
  );
  if (!date) throw Error('No se pudo leer la fecha local del torneo. Expande sus detalles.');
  const title = field('Nombre del Torneo');
  if (!title) throw Error('No se pudo leer el nombre del torneo.');
  const findTable = () =>
    [...doc.querySelectorAll('table')].find((t) => {
      const headers = [...t.querySelectorAll('tr:first-child th,tr:first-child td')].map((c) =>
        norm(c.textContent),
      );
      return (
        headers.includes('victoria') &&
        headers.includes('nombredeacceso') &&
        headers.includes('rangos')
      );
    });
  const readRows = () => {
    const table = findTable();
    if (!table) throw Error('Expande «Lista de Resultados del Torneo».');
    const all = [...table.querySelectorAll('tr')].map((row) =>
      [...row.querySelectorAll('td,th')].map((c) => c.textContent.trim()),
    );
    const heads = all.shift().map(norm);
    const required = ['rangos', 'iddecardgame', 'nombredeacceso', 'victoria', 'empate'];
    if (required.some((h) => heads.indexOf(h) < 0))
      throw Error('El formato de Konami cambió. Usa el archivo KTS hasta revisar la conexión.');
    const rows = all.map((row) => required.map((h) => row[heads.indexOf(h)]));
    if (!rows.length || rows.some((r) => r.some((c) => c === undefined)))
      throw Error('La tabla de resultados está incompleta.');
    return { table, rows };
  };
  const waitChanged = async (previous) => {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      const current = readRows();
      if (JSON.stringify(current.rows) !== previous) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error(
      'Konami no terminó de cargar todas las páginas. No se importó un resultado parcial.',
    );
  };
  // Begin at page one, then follow the existing pagination controls.
  let current = readRows();
  const pager = () => current.table.parentElement.parentElement.querySelector('.pagination');
  const first = pager()?.querySelector('.pagination-first:not(.disabled) a');
  if (first) {
    const before = JSON.stringify(current.rows);
    first.click();
    await waitChanged(before);
    current = readRows();
  }
  const collected = [],
    ids = new Set();
  for (let page = 0; page < 5000; page++) {
    current = readRows();
    for (const row of current.rows) {
      if (ids.has(row[1]))
        throw Error('Konami repitió un jugador o una página. No se importó un resultado parcial.');
      ids.add(row[1]);
      collected.push(row);
    }
    if (collected.length > 5000) throw Error('El torneo supera los 5.000 jugadores permitidos.');
    const next = pager()?.querySelector('.pagination-next:not(.disabled) a');
    if (!next) break;
    const before = JSON.stringify(current.rows);
    next.click();
    await waitChanged(before);
    if (page === 4999) throw Error('No se pudo completar la paginación.');
  }
  if (doc.querySelector('#checkboxExceptDropFlg:checked'))
    throw Error('Desmarca el filtro de jugadores retirados antes de importar.');
  const countText =
    labels
      .find((row) =>
        norm(row.querySelector('label')?.textContent || '').startsWith('participantespotenciales'),
      )
      ?.querySelector('div')?.textContent || '';
  const expectedCount = /\/\s*(\d+)/.exec(countText);
  if (expectedCount && Number(expectedCount[1]) !== collected.length)
    throw Error(
      'La cantidad de jugadores no coincide con el torneo. No se importó un resultado parcial.',
    );
  const cell = (value) => `"${value.replace(/"/g, '""')}"`;
  return {
    title,
    played_on: `${date[3]}-${date[1]}-${date[2]}`,
    event_id: match[1],
    text: `Lista de Resultados del Torneo\t${match[1]}\t\nRangos\tID de Card Game\tNombre de Acceso\tVictoria\tEmpate\n${collected.map((r) => r.map(cell).join('\t')).join('\n')}`,
  };
}
function readKonamiTournamentPage(doc) {
  const table = [...doc.querySelectorAll('table')].find((t) =>
    t.querySelector('thead')?.textContent.includes('Número de Torneo'),
  );
  if (!table)
    throw Error(
      'No se pudo leer la lista de torneos. Inicia sesión en Konami y abre Búsqueda de Torneo/Evento.',
    );
  const rows = [...table.querySelectorAll('tbody tr')];
  const ids = rows.flatMap((row) => {
    const status = row.querySelector('.tournament-label')?.textContent.trim();
    const store = row.querySelector('.store-name')?.textContent.trim().toLowerCase();
    if (status !== 'Torneo Finalizado' || store !== 'sergod store') return [];
    const id = [...row.querySelectorAll('td div')]
      .map((el) => el.textContent.trim())
      .find((t) => /^E\d{2}-[a-zA-Z0-9_.:-]+$/.test(t));
    if (!id)
      throw Error('Konami cambió el identificador del torneo. No se obtuvo una lista completa.');
    return [id];
  });
  return { ids, signature: rows.map((r) => r.textContent.trim()).join('\n'), table };
}
async function readAllKonamiTournamentIds(doc) {
  const findButton = (text) =>
    [...doc.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  const clear = findButton('Eliminar Condiciones De Búsqueda'),
    search = findButton('Buscar');
  if (!clear || !search) throw Error('Abre la búsqueda de torneos de Konami en español.');
  clear.click();
  for (const id of ['search-start-date', 'search-end-date']) {
    const field = doc.getElementById(id);
    if (!field) throw Error('Konami cambió sus filtros. No se pudo buscar todo el historial.');
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
  search.click();
  const waitReady = async () => {
    const until = Date.now() + 20000;
    await new Promise((resolve) => setTimeout(resolve, 200));
    while (Date.now() < until) {
      if (!search.disabled) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error('Konami tardó demasiado en buscar los torneos.');
  };
  await waitReady();
  let current = readKonamiTournamentPage(doc);
  const first = doc.querySelector('.pagination-first:not(.disabled) a');
  if (first) {
    first.click();
    await waitReady();
    current = readKonamiTournamentPage(doc);
  }
  const ids = new Set(),
    pages = new Set();
  for (let page = 0; page < 5000; page++) {
    current = readKonamiTournamentPage(doc);
    if (pages.has(current.signature))
      throw Error('Konami repitió una página. No se obtuvo una lista completa.');
    pages.add(current.signature);
    current.ids.forEach((id) => ids.add(id));
    if (ids.size > 5000) throw Error('El historial supera los 5.000 torneos permitidos.');
    const next = doc.querySelector('.pagination-next:not(.disabled) a');
    if (!next) return [...ids];
    next.click();
    await waitReady();
    const until = Date.now() + 10000;
    while (readKonamiTournamentPage(doc).signature === current.signature && Date.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error('No se completó la consulta de todas las páginas de Konami.');
}
if (typeof module !== 'undefined')
  module.exports = { readKonamiReport, readKonamiTournamentPage, readAllKonamiTournamentIds };
