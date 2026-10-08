import { z } from 'zod';
import { getDb } from './db';
import type { DuelThresholds } from '../duel-academy';

export async function getDuelThresholds(): Promise<DuelThresholds> {
  return (
    await (await getDb()).query('SELECT ra_min,obelisk_min FROM duel_academy_settings WHERE id=1')
  ).rows[0];
}
export async function saveDuelThresholds(input: unknown): Promise<DuelThresholds> {
  const values = z
    .object({
      ra_min: z.number().int().min(1).max(1000000),
      obelisk_min: z.number().int().min(2).max(1000001),
    })
    .refine((v) => v.obelisk_min > v.ra_min, {
      message: 'Obelisk debe comenzar con más puntos que Ra.',
      path: ['obelisk_min'],
    })
    .parse(input);
  return (
    await (
      await getDb()
    ).query(
      'UPDATE duel_academy_settings SET ra_min=$1,obelisk_min=$2 WHERE id=1 RETURNING ra_min,obelisk_min',
      [values.ra_min, values.obelisk_min],
    )
  ).rows[0];
}
