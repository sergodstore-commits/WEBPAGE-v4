import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { z } from 'zod';
import { fail } from './core';

// Only the final standings are retained. Staff, penalties and match details are discarded.
export function readKonamiKts(text: string) {
  if (text.length > 500000 || /<!DOCTYPE|<!ENTITY/i.test(text))
    fail(400, 'El archivo KTS supera el límite o contiene declaraciones XML no permitidas.');
  if (XMLValidator.validate(text) !== true)
    fail(400, 'El archivo KTS no contiene XML válido. Descárgalo nuevamente desde Konami.');
  const root = new XMLParser({
    parseTagValue: false,
    ignoreAttributes: true,
    isArray: (name) => name === 'TournPlayer',
  }).parse(text).Tournament;
  const value = z
    .object({
      ID: z.string().regex(/^[a-zA-Z0-9_.:-]{1,120}$/),
      Name: z.string().trim().min(2).max(180),
      Date: z.iso.date(),
      Finalized: z.literal('True'),
      TournamentPlayers: z.object({
        TournPlayer: z
          .array(
            z.object({
              Player: z.object({
                ID: z.string().regex(/^\d{10}$/),
                FirstName: z.string().trim().max(180),
                LastName: z.string().trim().max(180),
              }),
              Rank: z.string().regex(/^\d+$/),
              Wins: z.string().regex(/^\d+$/),
            }),
          )
          .min(1)
          .max(5000),
      }),
    })
    .safeParse(root);
  if (!value.success)
    fail(
      400,
      'El KTS debe ser de un torneo finalizado e incluir fecha, ID, nombres, puestos y victorias válidos.',
    );
  const data = value.data;
  const cells = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = data.TournamentPlayers.TournPlayer.map((p) => {
    const name = `${p.Player.FirstName} ${p.Player.LastName}`.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 180) fail(400, 'El KTS contiene un nombre de jugador inválido.');
    return [p.Rank, p.Player.ID, name, p.Wins].map(cells).join('\t');
  });
  return {
    title: data.Name,
    played_on: data.Date,
    event_id: data.ID,
    text: `Lista de Resultados del Torneo\t${data.ID}\t\nPosición\tID de Card Game\tNombre de Acceso\tVictoria\n${rows.join('\n')}`,
  };
}
