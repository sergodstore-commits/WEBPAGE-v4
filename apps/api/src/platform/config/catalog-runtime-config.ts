import { z } from 'zod';

const bucketSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u);

const schema = z.object({
  CATALOG_ASSET_BUCKET: bucketSchema,
  SUPABASE_SECRET_KEY: z.string().min(1),
  SUPABASE_URL: z.url(),
});

export interface CatalogRuntimeConfig {
  readonly assetBucket: string;
  readonly supabaseSecretKey: string;
  readonly supabaseUrl: string;
}

export function loadCatalogRuntimeConfig(
  environment: NodeJS.ProcessEnv,
): CatalogRuntimeConfig | null {
  if (!environment.CATALOG_ASSET_BUCKET?.trim()) return null;
  const parsed = schema.parse(environment);
  return Object.freeze({
    assetBucket: parsed.CATALOG_ASSET_BUCKET,
    supabaseSecretKey: parsed.SUPABASE_SECRET_KEY,
    supabaseUrl: parsed.SUPABASE_URL,
  });
}
