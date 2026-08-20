export const businessReasonCodes = [
  'INITIAL_CREATION',
  'ACCOUNT_DEACTIVATED',
  'ORDER_PAYMENT_EXPIRED',
  'ORDER_CANCELLED',
  'PAYMENT_REJECTED',
  'PAYMENT_EXCEPTION_REFUNDED',
  'NON_CLP_PROVIDER_ANOMALY',
  'INVENTORY_UNAVAILABLE',
  'PRICE_CHANGED',
  'SHIPPING_RATE_CHANGED',
  'CART_GROUP_INCOMPATIBLE',
  'PREORDER_CAPACITY_UNAVAILABLE',
  'RETURN_NOT_ELIGIBLE',
  'RETURN_QUANTITY_EXCEEDED',
  'CAMPAIGN_FORCED',
  'CAMPAIGN_CANCELLED',
] as const;

export const validationErrorCodes = [
  'REQUIRED',
  'INVALID_FORMAT',
  'OUT_OF_RANGE',
  'NOT_VERIFIED',
  'NOT_ACTIVE',
  'STATE_CONFLICT',
  'VERSION_CONFLICT',
  'OVERLAPPING_COMMUNE',
  'UNSUPPORTED_MEDIA',
  'MEDIA_LIMIT_EXCEEDED',
  'UNKNOWN_SNAPSHOT_VERSION',
] as const;

export const infrastructureErrorCodes = [
  'TIMEOUT',
  'DEPENDENCY_UNAVAILABLE',
  'LEASE_LOST',
  'DEADLOCK_RETRY_EXHAUSTED',
  'STORAGE_FAILURE',
  'SCHEMA_VALIDATION_FAILED',
] as const;

export type InfrastructureErrorCode = (typeof infrastructureErrorCodes)[number];

const allCodes = new Set<string>([
  ...businessReasonCodes,
  ...validationErrorCodes,
  ...infrastructureErrorCodes,
]);

export function isRegisteredCode(value: string): boolean {
  return allCodes.has(value);
}
