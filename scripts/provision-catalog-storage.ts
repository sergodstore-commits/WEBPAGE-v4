import { loadCatalogRuntimeConfig } from '../apps/api/src/platform/config/catalog-runtime-config.js';
import {
  createCatalogStorageAdminApi,
  provisionCatalogAssetBucket,
} from '../apps/api/src/contexts/catalog/infrastructure/supabase-catalog-private-storage.js';

const config = loadCatalogRuntimeConfig(process.env);
if (config === null) {
  throw new Error('CATALOG_ASSET_BUCKET must explicitly enable catalog Storage provisioning.');
}

const result = await provisionCatalogAssetBucket(
  createCatalogStorageAdminApi({
    secretKey: config.supabaseSecretKey,
    supabaseUrl: config.supabaseUrl,
  }),
  config.assetBucket,
);

process.stdout.write(`Catalog asset bucket ${result === 'CREATED' ? 'created' : 'verified'}.\n`);
