import { z } from 'zod';

const optionalIdentifier = z
  .string()
  .trim()
  .max(64)
  .regex(/^[A-Za-z0-9._-]*$/u)
  .transform((value) => (value === '' ? null : value))
  .nullable();

export const accountTournamentIdentifiersSchema = z
  .object({
    konamiId: optionalIdentifier,
    kluCode: optionalIdentifier,
  })
  .strict();

export type AccountTournamentIdentifiers = z.infer<typeof accountTournamentIdentifiersSchema>;
