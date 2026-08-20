import type { z } from 'zod';

import { ContractRegistry, type ContractDefinition } from './registry.js';

export interface PayloadContractDefinition extends ContractDefinition {
  readonly messageType: string;
  readonly schemaVersion: number;
  readonly schema: z.ZodType;
}

export class PayloadRegistry {
  readonly #registry: ContractRegistry;
  readonly #byMessage: ReadonlyMap<string, PayloadContractDefinition>;

  constructor(definitions: readonly PayloadContractDefinition[]) {
    this.#registry = new ContractRegistry(definitions);
    this.#byMessage = new Map(
      definitions.map((definition) => [
        `${definition.messageType}:${definition.schemaVersion}`,
        definition,
      ]),
    );
  }

  validate(messageType: string, schemaVersion: number, contract: string, value: unknown): unknown {
    const definition = this.#byMessage.get(`${messageType}:${schemaVersion}`);
    if (definition === undefined || definition.contract !== contract) {
      return this.#registry.validate('__unknown__', value);
    }
    return this.#registry.validate(contract, value);
  }
}

export const outboxPayloadRegistry = new PayloadRegistry([]);
export const inboxPayloadRegistry = new PayloadRegistry([]);
