import { z } from 'zod';

const optionalText = z.string().trim().min(1).max(500).nullable();

export const accountDeliveryPreferencesSchema = z
  .object({
    agencyDestination: optionalText,
    carrier: z.enum(['CHILEXPRESS', 'STARKEN']).nullable(),
    destinationCommune: z.string().trim().min(1).max(100).nullable(),
    recipientName: optionalText,
    recipientPhone: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/u)
      .nullable(),
  })
  .strict();

export type AccountDeliveryPreferences = z.infer<typeof accountDeliveryPreferencesSchema>;
