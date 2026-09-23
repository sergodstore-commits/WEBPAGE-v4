import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runner } from 'node-pg-migrate';
import pg from 'pg';

const credentials = JSON.parse(
  (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(/^\uFEFF/u, ''),
);
if (
  credentials.host !== '127.0.0.1' ||
  credentials.database !== 'sergod_phase1_test' ||
  !Number.isInteger(credentials.port)
) {
  throw new Error('Fresh migration verification requires the dedicated local test instance.');
}

const database = `sergod_codex_fresh_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
if (!/^sergod_codex_fresh_[a-z0-9_]+$/u.test(database))
  throw new Error('Invalid test database name.');
const admin = new pg.Client({
  database: 'postgres',
  host: credentials.host,
  password: credentials.adminPassword,
  port: credentials.port,
  user: credentials.adminUser,
});
await admin.connect();
let created = false;
try {
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  const migrationUrl = new URL(credentials.databaseUrl);
  migrationUrl.username = credentials.adminUser;
  migrationUrl.password = credentials.adminPassword;
  migrationUrl.pathname = `/${database}`;
  const migrationOptions = {
    checkOrder: true,
    databaseUrl: migrationUrl.toString(),
    dir: resolve('apps/api/migrations'),
    direction: 'up',
    ignorePattern: 'README\\.md',
    migrationsTable: 'pg_migrations',
    schema: 'public',
    singleTransaction: true,
  };
  await runner({ ...migrationOptions, count: 24 });
  const pool = new pg.Pool({ connectionString: migrationUrl.toString(), max: 1 });
  try {
    const baseline = await pool.query('SELECT count(*)::integer AS count FROM pg_migrations');
    if (baseline.rows[0]?.count !== 24) throw new Error('Expected migration baseline 024.');
    await runner(migrationOptions);
    const result = await pool.query(`
      SELECT
        (SELECT count(*)::integer FROM pg_migrations) AS migration_count,
        to_regclass('public.home_carousel_slides') IS NOT NULL AS carousel,
        EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='preorder_campaigns'
          AND column_name='max_per_customer') AS customer_limit,
        EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='user_accounts'
          AND column_name='klu_code') AS klu_code
    `);
    const state = result.rows[0];
    if (!state.carousel || !state.customer_limit || !state.klu_code || state.migration_count < 27)
      throw new Error('Fresh migration chain did not create all expected structures.');
    process.stdout.write(
      `FRESH_AND_UPGRADE_MIGRATIONS=PASS baseline=24 latest=${state.migration_count}\n`,
    );
  } finally {
    await pool.end();
  }
} finally {
  if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await admin.end();
}
