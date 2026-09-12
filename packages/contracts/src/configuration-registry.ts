export interface ConfigurationDefinition {
  readonly key: ConfigurationKey;
  readonly maximum?: number;
  readonly minimum?: number;
  readonly scope: 'GLOBAL';
  readonly valueType: 'INTEGER' | 'REFERENCE' | 'TEXT';
}

export const configurationKeys = [
  'PAYMENT_RESERVATION_DURATION_MINUTES',
  'ANONYMOUS_CART_INACTIVITY_MINUTES',
  'PICKUP_BRANCH_ID',
  'DEFAULT_LOW_STOCK_THRESHOLD',
  'RESOURCE_PUBLIC_IMAGE_MAX_BYTES',
  'RESOURCE_IMAGE_MAX_WIDTH_PX',
  'RESOURCE_IMAGE_MAX_HEIGHT_PX',
  'RESOURCE_IMAGE_MAX_MEGAPIXELS',
  'WEB_APPEARANCE_LAYOUT',
] as const;

export type ConfigurationKey = (typeof configurationKeys)[number];

export const configurationRegistry: readonly ConfigurationDefinition[] = Object.freeze([
  {
    key: 'PAYMENT_RESERVATION_DURATION_MINUTES',
    minimum: 1,
    scope: 'GLOBAL',
    valueType: 'INTEGER',
  },
  { key: 'ANONYMOUS_CART_INACTIVITY_MINUTES', minimum: 1, scope: 'GLOBAL', valueType: 'INTEGER' },
  { key: 'PICKUP_BRANCH_ID', scope: 'GLOBAL', valueType: 'REFERENCE' },
  { key: 'DEFAULT_LOW_STOCK_THRESHOLD', minimum: 0, scope: 'GLOBAL', valueType: 'INTEGER' },
  {
    key: 'RESOURCE_PUBLIC_IMAGE_MAX_BYTES',
    maximum: 10 * 1024 * 1024,
    minimum: 1,
    scope: 'GLOBAL',
    valueType: 'INTEGER',
  },
  {
    key: 'RESOURCE_IMAGE_MAX_WIDTH_PX',
    maximum: 8192,
    minimum: 320,
    scope: 'GLOBAL',
    valueType: 'INTEGER',
  },
  {
    key: 'RESOURCE_IMAGE_MAX_HEIGHT_PX',
    maximum: 8192,
    minimum: 320,
    scope: 'GLOBAL',
    valueType: 'INTEGER',
  },
  {
    key: 'RESOURCE_IMAGE_MAX_MEGAPIXELS',
    maximum: 40,
    minimum: 1,
    scope: 'GLOBAL',
    valueType: 'INTEGER',
  },
  {
    key: 'WEB_APPEARANCE_LAYOUT',
    maximum: 65_536,
    minimum: 1,
    scope: 'GLOBAL',
    valueType: 'TEXT',
  },
]);
