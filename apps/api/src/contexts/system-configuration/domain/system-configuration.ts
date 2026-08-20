import {
  configurationRegistry,
  type ConfigurationDefinition,
  type ConfigurationKey,
  type SystemConfigurationValue,
} from '@sergod/contracts';

export type SystemConfigurationErrorCategory =
  'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class SystemConfigurationError extends Error {
  constructor(
    readonly code: string,
    readonly category: SystemConfigurationErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SystemConfigurationError';
  }
}

export function requiredConfigurationDefinition(key: ConfigurationKey): ConfigurationDefinition {
  const definition = configurationRegistry.find((candidate) => candidate.key === key);
  if (definition === undefined) {
    throw new SystemConfigurationError(
      'SYSTEM_CONFIGURATION_KEY_UNKNOWN',
      'VALIDATION',
      'Configuration key is not registered.',
    );
  }
  return definition;
}

export function validateConfigurationValue(
  definition: ConfigurationDefinition,
  value: SystemConfigurationValue,
): SystemConfigurationValue {
  if (definition.valueType === 'INTEGER') {
    if (!Number.isSafeInteger(value)) throw invalidValue();
    const integer = value as number;
    if (definition.minimum !== undefined && integer < definition.minimum) throw invalidValue();
    if (definition.maximum !== undefined && integer > definition.maximum) throw invalidValue();
    return integer;
  }
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw invalidValue();
  return value.toLowerCase();
}

export function normalizeConfigurationReason(value: string): string {
  const reason = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (reason === '') {
    throw new SystemConfigurationError(
      'SYSTEM_CONFIGURATION_REASON_REQUIRED',
      'VALIDATION',
      'A reason is required.',
    );
  }
  return reason;
}

function invalidValue(): SystemConfigurationError {
  return new SystemConfigurationError(
    'SYSTEM_CONFIGURATION_VALUE_INVALID',
    'VALIDATION',
    'Configuration value does not satisfy its registered definition.',
  );
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
