import type { Transaction, TransactionExecutor } from '@sergod/foundation';
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export class PgTransaction implements Transaction {
  readonly connection: PoolClient;

  constructor(client: PoolClient) {
    this.connection = client;
  }

  query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.connection.query<Row>(text, [...values]);
  }
}

export class PgTransactionExecutor implements TransactionExecutor {
  constructor(private readonly pool: Pool) {}

  async execute<Value>(operation: (transaction: PgTransaction) => Promise<Value>): Promise<Value> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await operation(new PgTransaction(client));
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createPostgresPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  return new Pool({
    application_name: 'sergod-api',
    connectionString,
    max: 10,
    ...overrides,
  });
}
