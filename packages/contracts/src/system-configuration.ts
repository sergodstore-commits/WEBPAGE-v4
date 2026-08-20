import { z } from 'zod';

import { configurationKeys, configurationRegistry } from './configuration-registry.js';

export const systemConfigurationKeySchema = z.enum(configurationKeys);
export const systemConfigurationStateSchema = z.enum(['DRAFT', 'ACTIVE', 'RETIRED']);
export const systemConfigurationValueSchema = z.union([
  z.number().int().safe(),
  z.boolean(),
  z.string().min(1).max(2048),
]);
const reasonSchema = z.string().trim().min(1).max(500);

export const systemConfigurationListQuerySchema = z
  .object({
    configurationKey: systemConfigurationKeySchema.optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100),
    state: systemConfigurationStateSchema.optional(),
  })
  .strict();

export const activeSystemConfigurationQuerySchema = z
  .object({ configurationKey: systemConfigurationKeySchema })
  .strict();

export const createSystemConfigurationSchema = z
  .object({
    configurationKey: systemConfigurationKeySchema,
    reason: reasonSchema,
    value: systemConfigurationValueSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const definition = configurationRegistry.find(
      (candidate) => candidate.key === input.configurationKey,
    );
    if (definition === undefined) return;
    if (definition.valueType === 'INTEGER') {
      if (
        !Number.isSafeInteger(input.value) ||
        typeof input.value !== 'number' ||
        (definition.minimum !== undefined && input.value < definition.minimum) ||
        (definition.maximum !== undefined && input.value > definition.maximum)
      ) {
        context.addIssue({ code: 'custom', message: 'Configuration value is invalid.' });
      }
      return;
    }
    if (typeof input.value !== 'string' || !z.uuid().safeParse(input.value).success) {
      context.addIssue({ code: 'custom', message: 'Configuration value is invalid.' });
    }
  });

export const editSystemConfigurationSchema = z
  .object({ reason: reasonSchema, value: systemConfigurationValueSchema })
  .strict();

export const systemConfigurationTransitionSchema = z
  .object({ nextState: z.enum(['ACTIVE', 'RETIRED']), reason: reasonSchema })
  .strict();

export type SystemConfigurationState = z.infer<typeof systemConfigurationStateSchema>;
export type SystemConfigurationValue = z.infer<typeof systemConfigurationValueSchema>;
export type CreateSystemConfiguration = z.infer<typeof createSystemConfigurationSchema>;
export type EditSystemConfiguration = z.infer<typeof editSystemConfigurationSchema>;
export type SystemConfigurationTransition = z.infer<typeof systemConfigurationTransitionSchema>;
