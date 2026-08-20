export interface Clock {
  now(): Date;
}

export interface UuidGenerator {
  generate(): string;
}

export interface Transaction {
  readonly connection: unknown;
}

export interface TransactionExecutor {
  execute<Value>(operation: (transaction: Transaction) => Promise<Value>): Promise<Value>;
}

export interface TechnicalActionAuthorizer {
  authorize(input: {
    readonly action: string;
    readonly actorId: string;
    readonly actorType: 'SYSTEM' | 'USER';
  }): Promise<boolean>;
}
