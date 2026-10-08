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
if (typeof module !== 'undefined') module.exports = { readKonamiReport };
