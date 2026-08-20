import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runner } from 'node-pg-migrate';
import { Client } from 'pg';

async function databaseUrl(): Promise<string> {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) {
    return configured;
  }
  const credentials = JSON.parse(
    (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
      /^\uFEFF/u,
      '',
    ),
  ) as { databaseUrl?: unknown };
  if (typeof credentials.databaseUrl !== 'string' || credentials.databaseUrl.length === 0) {
    throw new Error('The local PostgreSQL connection configuration is invalid.');
  }
  return credentials.databaseUrl;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const url = await databaseUrl();

  if (command === 'status') {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const result = await client.query<{ name: string; run_on: Date }>(
        `SELECT name, run_on
           FROM public.pg_migrations
          ORDER BY id`,
      );
      if (result.rows.length === 0) {
        process.stdout.write('No migrations are applied.\n');
      } else {
        for (const row of result.rows) {
          process.stdout.write(`${row.name} ${row.run_on.toISOString()}\n`);
        }
      }
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '42P01'
      ) {
        process.stdout.write('No migrations are applied.\n');
        return;
      }
      throw error;
    } finally {
      await client.end();
    }
    return;
  }

  if (command !== 'up' && command !== 'down') {
    throw new Error('Usage: database.ts up|down|status');
  }

  await runner({
    checkOrder: true,
    count: command === 'down' ? 1 : undefined,
    databaseUrl: url,
    dir: resolve('apps/api/migrations'),
    direction: command,
    ignorePattern: 'README\\.md',
    migrationsTable: 'pg_migrations',
    schema: 'public',
    singleTransaction: true,
  });
}

await main();
