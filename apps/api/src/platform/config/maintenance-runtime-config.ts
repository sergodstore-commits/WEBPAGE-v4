import { z } from 'zod';

const schema = z.object({
  MAINTENANCE_JOB_TOKEN: z.string().min(32),
});

export interface MaintenanceRuntimeConfig {
  readonly token: string;
}

export function loadMaintenanceRuntimeConfig(
  environment: NodeJS.ProcessEnv,
): MaintenanceRuntimeConfig | null {
  if (!environment.MAINTENANCE_JOB_TOKEN?.trim()) return null;
  const parsed = schema.parse(environment);
  return Object.freeze({ token: parsed.MAINTENANCE_JOB_TOKEN });
}
