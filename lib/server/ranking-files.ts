import { z } from 'zod';
import { fail, hash } from './core';
import type { LeagueResult } from '../rankings';
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const identityName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
const schema = z.object({
  text: z.string().min(1).max(500000),
  title: z.string().trim().min(2).max(180),
  played_on: z.iso.date(),
  event_id: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-zA-Z0-9_.:-]*$/)
    .default(''),
});

function parseTable(text: string) {
  const first =
    text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .find((line) => line.trim()) || '';
  const separator = ['\t', ';', ','].sort(
    (a, b) => first.split(b).length - first.split(a).length,
  )[0];
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closedQuote = false;
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closedQuote = true;
      } else if (closedQuote) fail(400, 'El archivo contiene comillas fuera de lugar.');
      else if (!cell.trim()) quoted = true;
      else
        fail(
          400,
          'El archivo tiene comillas fuera de lugar. Utiliza CSV o texto separado por tabulaciones.',
        );
    } else if (!quoted && (c === separator || c === '\n')) {
      row.push(cell.trim());
      cell = '';
      closedQuote = false;
      if (c === '\n') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (closedQuote) {
      if (c.trim()) fail(400, 'Hay texto después de cerrar una celda entre comillas.');
    } else cell += c;
    if (cell.length > 1000 || row.length > 50 || rows.length > 5001)
      fail(400, 'El archivo supera el tamaño permitido (5.000 jugadores).');
  }
  if (quoted) fail(400, 'El archivo contiene comillas sin cerrar.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2 || rows.length > 5001)
    fail(400, 'Agrega encabezados y entre 1 y 5.000 jugadores al archivo.');
  return rows;
}
function column(headers: string[], aliases: string[]) {
  const candidates = headers.flatMap((h, i) => (aliases.includes(norm(h)) ? [i] : []));
  if (candidates.length > 1)
    fail(400, 'El archivo tiene columnas repetidas o ambiguas. Usa un solo encabezado por dato.');
  return candidates[0] ?? -1;
}
export function parseRankingFile(input: unknown) {
  const d = schema.parse(input),
    rows = parseTable(d.text),
    headers = rows.shift()!;
  const name = column(headers, [
    'jugador',
    'nombre',
    'player',
    'playername',
    'fullname',
    'nombrecompleto',
    'name',
  ]);
  const first = column(headers, ['firstname', 'nombres']),
    last = column(headers, ['lastname', 'apellidos']);
  const points = column(headers, [
    'puntos',
    'points',
    'matchpoints',
    'totalpoints',
    'puntosfinales',
    'score',
  ]);
  const id = column(headers, [
    'id',
    'konamiid',
    'kcgnid',
    'cardgameid',
    'playerid',
    'identificador',
  ]);
  const pos = column(headers, ['posicion', 'position', 'pos', 'rank', 'ranking', 'puesto']);
  if (points < 0 || (name < 0 && (first < 0 || last < 0)))
    fail(
      400,
      'No se encontraron Jugador/Player y Puntos/Points. Usa el archivo de ejemplo o texto tabulado con esos encabezados.',
    );
  const warnings: string[] = [];
  if (id < 0)
    warnings.push(
      'Sin ID de jugador: se agrupa por nombre normalizado. Usa nombres consistentes y un ID para distinguir personas con el mismo nombre.',
    );
  if (pos < 0)
    warnings.push('Sin posición: se conserva el orden de las filas como posición del torneo.');
  const results: LeagueResult[] = rows.map((r, i) => {
    if (r.length !== headers.length)
      fail(400, `Fila ${i + 2}: la cantidad de columnas no coincide con el encabezado.`);
    const player = (name >= 0 ? r[name] : `${r[first]} ${r[last]}`).trim().replace(/\s+/g, ' ');
    if (!player || player.length > 180)
      fail(400, `Fila ${i + 2}: indica un nombre de jugador de hasta 180 caracteres.`);
    const rawId = id >= 0 ? r[id].trim() : '';
    if (id >= 0 && (!rawId || rawId.length > 120))
      fail(400, `Fila ${i + 2}: falta un ID válido. Mantén el mismo ID en todos los torneos.`);
    if (!/^\d+$/.test(r[points]))
      fail(400, `Fila ${i + 2}: los puntos deben ser enteros, sin porcentajes ni fórmulas.`);
    const score = Number(r[points]),
      position = pos >= 0 ? Number(r[pos]) : i + 1;
    if (score > 100000 || !Number.isInteger(position) || position < 1 || position > 5000)
      fail(400, `Fila ${i + 2}: revisa puntos y posición.`);
    return {
      player_key: `ygo:${id >= 0 ? 'id' : 'name'}:${hash(id >= 0 ? rawId : identityName(player))}`,
      name: player,
      points: score,
      position,
    };
  });
  if (new Set(results.map((r) => r.player_key)).size !== results.length)
    fail(
      400,
      'Hay jugadores repetidos en el archivo. Usa un ID distinto para personas con el mismo nombre.',
    );
  const identity =
    d.event_id || `local:${hash(`${d.played_on}|${identityName(d.title)}`).slice(0, 32)}`;
  // Identical final tables on different dates are valid separate tournaments.
  const fingerprint = hash(
    d.played_on +
      '|' +
      JSON.stringify([...results].sort((a, b) => a.player_key.localeCompare(b.player_key))),
  );
  return {
    source: 'file' as const,
    external_id: identity,
    board: 'yugioh' as const,
    title: d.title,
    played_on: d.played_on,
    source_url: '',
    round_id: null,
    final_round: null,
    results: results.sort((a, b) => a.position - b.position),
    warnings,
    file_hash: fingerprint,
  };
}
