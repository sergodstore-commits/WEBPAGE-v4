import { CryptoUuidGenerator, SystemClock } from '@sergod/foundation';

import { AuditService } from './contexts/audit/application/audit-service.js';
import { PgAuditRepository } from './contexts/audit/infrastructure/postgres-audit-repository.js';
import { AuditHttpApi } from './contexts/audit/presentation/audit-http-api.js';
import { AccountDeliveryPreferencesService } from './contexts/account-preferences/application/account-delivery-preferences-service.js';
import { PgAccountDeliveryPreferencesRepository } from './contexts/account-preferences/infrastructure/postgres-account-delivery-preferences-repository.js';
import { AccountDeliveryPreferencesHttpApi } from './contexts/account-preferences/presentation/account-delivery-preferences-http-api.js';
import { CatalogEntityAdminService } from './contexts/catalog/application/catalog-entity-admin-service.js';
import { CartService } from './contexts/commerce-orders/application/cart-service.js';
import { CheckoutService } from './contexts/commerce-orders/application/checkout-service.js';
import { FulfillmentService } from './contexts/commerce-orders/application/fulfillment-service.js';
import { OrderService } from './contexts/commerce-orders/application/order-service.js';
import { PaymentService } from './contexts/commerce-orders/application/payment-service.js';
import { PgCartRepository } from './contexts/commerce-orders/infrastructure/postgres-cart-repository.js';
import { PgCheckoutRepository } from './contexts/commerce-orders/infrastructure/postgres-checkout-repository.js';
import { PgFulfillmentRepository } from './contexts/commerce-orders/infrastructure/postgres-fulfillment-repository.js';
import { PgOrderRepository } from './contexts/commerce-orders/infrastructure/postgres-order-repository.js';
import { configuredPaymentGateways } from './contexts/commerce-orders/infrastructure/payment-gateways.js';
import { PgPaymentRepository } from './contexts/commerce-orders/infrastructure/postgres-payment-repository.js';
import { CartHttpApi } from './contexts/commerce-orders/presentation/cart-http-api.js';
import { CheckoutHttpApi } from './contexts/commerce-orders/presentation/checkout-http-api.js';
import { FulfillmentHttpApi } from './contexts/commerce-orders/presentation/fulfillment-http-api.js';
import { OrderHttpApi } from './contexts/commerce-orders/presentation/order-http-api.js';
import { PaymentHttpApi } from './contexts/commerce-orders/presentation/payment-http-api.js';
import { CatalogPublicQueryService } from './contexts/catalog/application/catalog-public-query-service.js';
import { CatalogPublicResourceService } from './contexts/catalog/application/catalog-public-resource-service.js';
import { CatalogResourceAdminService } from './contexts/catalog/application/catalog-resource-admin-service.js';
import { CatalogService } from './contexts/catalog/application/catalog-service.js';
import { UuidCatalogStorageKeyGenerator } from './contexts/catalog/infrastructure/catalog-storage-key-generator.js';
import { PgCatalogAdminAuthorizer } from './contexts/catalog/infrastructure/postgres-catalog-admin-authorizer.js';
import { PgCatalogRepository } from './contexts/catalog/infrastructure/postgres-catalog-repository.js';
import { PgCatalogPublicQueryRepository } from './contexts/catalog/infrastructure/postgres-catalog-public-query-repository.js';
import { SharpCatalogImageValidator } from './contexts/catalog/infrastructure/sharp-catalog-image-validator.js';
import { SupabaseCatalogPrivateStorage } from './contexts/catalog/infrastructure/supabase-catalog-private-storage.js';
import { CatalogAdminHttpApi } from './contexts/catalog/presentation/catalog-admin-http-api.js';
import {
  CatalogPublicHttpApi,
  CatalogPublicRateLimiter,
} from './contexts/catalog/presentation/catalog-public-http-api.js';
import { CatalogPublicResourceHttpApi } from './contexts/catalog/presentation/catalog-public-resource-http-api.js';
import { CatalogResourceAdminHttpApi } from './contexts/catalog/presentation/catalog-resource-admin-http-api.js';
import { IdentityAccessService } from './contexts/identity-access/application/identity-access-service.js';
import { EditorialService } from './contexts/editorial-content/application/editorial-service.js';
import { PgEditorialRepository } from './contexts/editorial-content/infrastructure/postgres-editorial-repository.js';
import { EditorialHttpApi } from './contexts/editorial-content/presentation/editorial-http-api.js';
import { PgIdentityAccessRepository } from './contexts/identity-access/infrastructure/postgres-identity-access-repository.js';
import { SupabaseIdentityProvider } from './contexts/identity-access/infrastructure/supabase-identity-provider.js';
import { IdentityHttpApi } from './contexts/identity-access/presentation/identity-http-api.js';
import { InventoryAdminService } from './contexts/inventory/application/inventory-admin-service.js';
import { PgInventoryAdminAuthorizer } from './contexts/inventory/infrastructure/postgres-inventory-admin-authorizer.js';
import { PgInventoryRepository } from './contexts/inventory/infrastructure/postgres-inventory-repository.js';
import { InventoryAdminHttpApi } from './contexts/inventory/presentation/inventory-admin-http-api.js';
import {
  createNotificationRuntime,
  notificationWorkerEnabled,
} from './contexts/notifications/infrastructure/notification-runtime.js';
import { LoyaltyService } from './contexts/loyalty/application/loyalty-service.js';
import { PgLoyaltyAdminAuthorizer } from './contexts/loyalty/infrastructure/postgres-loyalty-authorizer.js';
import { PgLoyaltyRepository } from './contexts/loyalty/infrastructure/postgres-loyalty-repository.js';
import { LoyaltyHttpApi } from './contexts/loyalty/presentation/loyalty-http-api.js';
import { PromotionsAdminService } from './contexts/promotions/application/promotions-admin-service.js';
import { PgPromotionsAdminAuthorizer } from './contexts/promotions/infrastructure/postgres-promotions-admin-authorizer.js';
import { PgPromotionsRepository } from './contexts/promotions/infrastructure/postgres-promotions-repository.js';
import { PromotionsAdminHttpApi } from './contexts/promotions/presentation/promotions-admin-http-api.js';
import { PreordersAdminService } from './contexts/preorders/application/preorders-admin-service.js';
import { PgPreordersAdminAuthorizer } from './contexts/preorders/infrastructure/postgres-preorders-admin-authorizer.js';
import { PgPreordersRepository } from './contexts/preorders/infrastructure/postgres-preorders-repository.js';
import { PreordersAdminHttpApi } from './contexts/preorders/presentation/preorders-admin-http-api.js';
import { ServiceCoverageService } from './contexts/service-coverage/application/service-coverage-service.js';
import { PgServiceCoverageRepository } from './contexts/service-coverage/infrastructure/postgres-service-coverage-repository.js';
import { ServiceCoverageHttpApi } from './contexts/service-coverage/presentation/service-coverage-http-api.js';
import { PosService } from './contexts/sales-pos/application/pos-service.js';
import { PgPosRepository } from './contexts/sales-pos/infrastructure/postgres-pos-repository.js';
import { PosHttpApi } from './contexts/sales-pos/presentation/pos-http-api.js';
import { SystemConfigurationService } from './contexts/system-configuration/application/system-configuration-service.js';
import { PgSystemConfigurationAdminAuthorizer } from './contexts/system-configuration/infrastructure/postgres-system-configuration-authorizer.js';
import { PgSystemConfigurationRepository } from './contexts/system-configuration/infrastructure/postgres-system-configuration-repository.js';
import { SystemConfigurationHttpApi } from './contexts/system-configuration/presentation/system-configuration-http-api.js';
import { loadCatalogRuntimeConfig } from './platform/config/catalog-runtime-config.js';
import { loadCatalogPublicRuntimeConfig } from './platform/config/catalog-public-runtime-config.js';
import { loadDatabaseRuntimeConfig } from './platform/config/database-runtime-config.js';
import { loadIdentityRuntimeConfig } from './platform/config/identity-runtime-config.js';
import { loadRuntimeConfig } from './platform/config/load-runtime-config.js';
import { createLogger } from './platform/logging/logger.js';
import { createPostgresPool } from './platform/persistence/postgres.js';
import { CancelableWorker } from './platform/workers/cancelable-worker.js';
import {
  CompositeHttpRouteHandler,
  createServer,
  type HttpRouteHandler,
} from './presentation/http/create-server.js';

const config = loadRuntimeConfig(process.env);
const identityConfig = loadIdentityRuntimeConfig(process.env);
const catalogConfig = loadCatalogRuntimeConfig(process.env);
const catalogPublicConfig = loadCatalogPublicRuntimeConfig(process.env);
const databaseConfig = loadDatabaseRuntimeConfig(process.env);
const clock = new SystemClock();
const uuids = new CryptoUuidGenerator();
const logger = createLogger('info');
const pool = databaseConfig === null ? null : createPostgresPool(databaseConfig.databaseUrl);
const notificationController = new AbortController();
let notificationLoop: Promise<void> | null = null;
if (pool !== null && notificationWorkerEnabled(process.env)) {
  const notificationRuntime = createNotificationRuntime(process.env, pool, clock);
  notificationLoop = new CancelableWorker(async () => {
    await notificationRuntime.worker.run(notificationRuntime.batchSize);
  }, notificationRuntime.pollMs)
    .run(notificationController.signal)
    .catch(() => {
      process.stderr.write('The notification worker stopped unexpectedly.\n');
      process.exitCode = 1;
    });
}
const catalogStorage =
  catalogConfig === null
    ? null
    : SupabaseCatalogPrivateStorage.fromCredentials({
        bucket: catalogConfig.assetBucket,
        secretKey: catalogConfig.supabaseSecretKey,
        supabaseUrl: catalogConfig.supabaseUrl,
      });
const catalogPublicRateLimiter = new CatalogPublicRateLimiter(
  catalogPublicConfig.rateLimitMaximumRequests,
  catalogPublicConfig.rateLimitWindowMs,
);
let routeHandler: HttpRouteHandler | undefined;
const routeHandlers: HttpRouteHandler[] = [];
if (pool !== null) {
  const catalogPublicRepository = new PgCatalogPublicQueryRepository(pool);
  routeHandlers.push(
    new CatalogPublicResourceHttpApi(
      catalogStorage === null
        ? null
        : new CatalogPublicResourceService(catalogPublicRepository, catalogStorage),
      logger,
      catalogPublicRateLimiter,
    ),
    new CatalogPublicHttpApi(
      new CatalogPublicQueryService(catalogPublicRepository),
      logger,
      catalogPublicRateLimiter,
    ),
  );
}
if (identityConfig !== null && pool !== null) {
  const identityRepository = new PgIdentityAccessRepository(pool, clock, uuids);
  const identityService = new IdentityAccessService(
    identityRepository,
    new SupabaseIdentityProvider(
      identityConfig.supabaseUrl,
      identityConfig.supabasePublishableKey,
      identityConfig.supabaseSecretKey,
    ),
    clock,
    {
      configured: false,
      challenge: () => Promise.reject(new Error('MFA is disabled in V1.')),
    },
  );
  const catalogAuthorizer = new PgCatalogAdminAuthorizer(pool);
  const catalogRepository = new PgCatalogRepository(
    pool,
    clock,
    uuids,
    catalogConfig === null ? undefined : new UuidCatalogStorageKeyGenerator(uuids),
  );
  const catalogService = new CatalogEntityAdminService(catalogRepository, catalogAuthorizer);
  const catalogResourceService =
    catalogStorage === null
      ? null
      : new CatalogResourceAdminService(
          catalogRepository,
          catalogAuthorizer,
          new CatalogService(
            catalogRepository,
            catalogAuthorizer,
            new SharpCatalogImageValidator(),
            catalogStorage,
          ),
        );
  const inventoryService = new InventoryAdminService(
    new PgInventoryRepository(pool, clock, uuids),
    new PgInventoryAdminAuthorizer(pool),
  );
  const promotionsService = new PromotionsAdminService(
    new PgPromotionsRepository(pool, clock, uuids),
    new PgPromotionsAdminAuthorizer(pool),
    clock,
  );
  const loyaltyService = new LoyaltyService(
    new PgLoyaltyRepository(pool, clock, uuids),
    new PgLoyaltyAdminAuthorizer(pool),
  );
  const preordersService = new PreordersAdminService(
    new PgPreordersRepository(pool, clock, uuids),
    new PgPreordersAdminAuthorizer(pool),
    clock,
  );
  const serviceCoverageService = new ServiceCoverageService(
    new PgServiceCoverageRepository(pool, clock, uuids),
  );
  const posService = new PosService(new PgPosRepository(pool, clock, uuids));
  const cartService = new CartService(new PgCartRepository(pool, clock, uuids));
  const checkoutService = new CheckoutService(
    new PgCheckoutRepository(pool, clock, uuids, serviceCoverageService),
  );
  const orderService = new OrderService(new PgOrderRepository(pool, clock, uuids));
  const paymentService = new PaymentService(
    new PgPaymentRepository(pool, clock, uuids),
    configuredPaymentGateways(process.env),
  );
  const fulfillmentService = new FulfillmentService(
    new PgFulfillmentRepository(pool, clock, uuids),
  );
  const editorialService = new EditorialService(new PgEditorialRepository(pool, clock, uuids));
  const accountDeliveryPreferencesService = new AccountDeliveryPreferencesService(
    new PgAccountDeliveryPreferencesRepository(pool, clock),
  );
  const systemConfigurationService = new SystemConfigurationService(
    new PgSystemConfigurationRepository(pool, clock, uuids),
    new PgSystemConfigurationAdminAuthorizer(pool),
  );
  routeHandlers.push(
    new AuditHttpApi(identityService, new AuditService(new PgAuditRepository(pool))),
    new AccountDeliveryPreferencesHttpApi(identityService, accountDeliveryPreferencesService),
    new SystemConfigurationHttpApi(identityService, systemConfigurationService, logger),
    new CheckoutHttpApi(identityService, checkoutService, logger),
    new PaymentHttpApi(identityService, paymentService, logger),
    new FulfillmentHttpApi(identityService, fulfillmentService),
    new EditorialHttpApi(identityService, editorialService),
    new OrderHttpApi(identityService, orderService, logger),
    new CartHttpApi(identityService, cartService, logger),
    new PosHttpApi(identityService, posService),
    new ServiceCoverageHttpApi(identityService, serviceCoverageService, logger),
    new PreordersAdminHttpApi(identityService, preordersService, logger),
    new LoyaltyHttpApi(identityService, loyaltyService, logger),
    new PromotionsAdminHttpApi(identityService, promotionsService, logger),
    new InventoryAdminHttpApi(identityService, inventoryService, logger),
    new CatalogResourceAdminHttpApi(identityService, catalogResourceService, logger),
    new CatalogAdminHttpApi(identityService, catalogService, logger),
    new IdentityHttpApi(
      identityService,
      identityRepository,
      clock,
      identityConfig.contactChangeTtlMs,
      {
        emailChange: new URL('/auth/callback/email-change', identityConfig.webAppUrl).href,
        recovery: new URL('/auth/callback/recovery', identityConfig.webAppUrl).href,
        registration: new URL('/auth/callback/confirm', identityConfig.webAppUrl).href,
      },
    ),
  );
}
if (routeHandlers.length > 0) routeHandler = new CompositeHttpRouteHandler(routeHandlers);
const server = createServer(routeHandler, {
  allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== ''),
});

server.listen(config.port, config.host, () => {
  process.stdout.write('API technical availability check is running.\n');
});

const shutdown = (): void => {
  notificationController.abort();
  server.close(async (error) => {
    if (notificationLoop !== null) await notificationLoop;
    if (pool !== null) await pool.end();
    if (error) {
      process.stderr.write('The technical API server could not close cleanly.\n');
      process.exitCode = 1;
    }
  });
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
