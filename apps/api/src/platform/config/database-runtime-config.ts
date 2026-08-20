import { z } from 'zod';

const schema = z.object({ DATABASE_URL: z.url() });

export interface DatabaseRuntimeConfig {
  readonly databaseUrl: string;
}

export function loadDatabaseRuntimeConfig(
  environment: NodeJS.ProcessEnv,
): DatabaseRuntimeConfig | null {
  if (!environment.DATABASE_URL?.trim()) return null;
  const parsed = schema.parse(environment);
  return Object.freeze({ databaseUrl: parsed.DATABASE_URL });
}
