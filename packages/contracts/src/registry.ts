import { z } from 'zod';

export class ContractValidationError extends Error {
  constructor(
    readonly code:
      | 'CONTRACT_NOT_ACTIVATED'
      | 'CONTRACT_TOO_LARGE'
      | 'SCHEMA_VALIDATION_FAILED'
      | 'UNKNOWN_CONTRACT',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ContractValidationError';
  }
}

export interface ContractDefinition {
  readonly contract: string;
  readonly maximumBytes: number;
  readonly owner: string;
  readonly schema?: z.ZodType;
}

export class ContractRegistry {
  readonly #definitions: ReadonlyMap<string, ContractDefinition>;

  constructor(definitions: readonly ContractDefinition[]) {
    const map = new Map<string, ContractDefinition>();
    for (const definition of definitions) {
      if (map.has(definition.contract)) {
        throw new Error(`Duplicate contract: ${definition.contract}`);
      }
      map.set(definition.contract, Object.freeze(definition));
    }
    this.#definitions = map;
  }

  list(): readonly ContractDefinition[] {
    return [...this.#definitions.values()];
  }

  validate(contract: string, value: unknown): unknown {
    const definition = this.#definitions.get(contract);
    if (definition === undefined) {
      throw new ContractValidationError('UNKNOWN_CONTRACT', `Unknown contract: ${contract}`);
    }
    if (definition.schema === undefined) {
      throw new ContractValidationError(
        'CONTRACT_NOT_ACTIVATED',
        `Contract ${contract} belongs to a later owning phase.`,
      );
    }

    let parsed: unknown;
    try {
      parsed = definition.schema.parse(value);
    } catch (error) {
      throw new ContractValidationError(
        'SCHEMA_VALIDATION_FAILED',
        `Value does not satisfy ${contract}.`,
        { cause: error },
      );
    }

    const size = new TextEncoder().encode(canonicalJson(parsed)).byteLength;
    if (size > definition.maximumBytes) {
      throw new ContractValidationError(
        'CONTRACT_TOO_LARGE',
        `Value exceeds the maximum size for ${contract}.`,
      );
    }

    return parsed;
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export const metadataEnvelope = <Schema extends z.ZodRawShape>(contract: string, shape: Schema) =>
  z
    .object({
      metadata_contract: z.literal(contract),
      metadata_schema_version: z.literal(1),
      ...shape,
    })
    .strict();
