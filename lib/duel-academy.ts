export type DuelThresholds = { ra_min: number; obelisk_min: number };
export const defaultDuelThresholds: DuelThresholds = { ra_min: 150, obelisk_min: 251 };
export function academyHouses(limits: DuelThresholds = defaultDuelThresholds) {
  return [
    { id: 'slifer', name: 'Slifer', range: `Menos de ${limits.ra_min} puntos` },
    { id: 'ra', name: 'Ra', range: `De ${limits.ra_min} a ${limits.obelisk_min - 1} puntos` },
    { id: 'obelisk', name: 'Obelisk', range: `Desde ${limits.obelisk_min} puntos` },
  ] as const;
}
export const duelHouses = academyHouses();

export function duelHouse(points: number, limits: DuelThresholds = defaultDuelThresholds) {
  return points < limits.ra_min ? 'slifer' : points < limits.obelisk_min ? 'ra' : 'obelisk';
}
