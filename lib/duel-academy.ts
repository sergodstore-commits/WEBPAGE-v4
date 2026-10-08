export const duelHouses = [
  { id: 'slifer', name: 'Slifer', range: 'Menos de 150 puntos' },
  { id: 'ra', name: 'Ra', range: 'De 150 a 250 puntos' },
  { id: 'obelisk', name: 'Obelisco Azul', range: 'Más de 250 puntos' },
] as const;

export function duelHouse(points: number) {
  return points < 150 ? 'slifer' : points <= 250 ? 'ra' : 'obelisk';
}
