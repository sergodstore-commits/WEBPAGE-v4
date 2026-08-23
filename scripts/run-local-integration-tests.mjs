import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import pg from 'pg';

const databaseUrl = await resolveDatabaseUrl();
if (databaseUrl === null) {
  process.stderr.write(
    'INTEGRATION_LOCAL=DEFERRED_EXTERNAL PostgreSQL is not configured; no integration suites were started.\n',
  );
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3_000, max: 1 });
try {
  await pool.query('SELECT 1');
} catch {
  process.stderr.write(
    'INTEGRATION_LOCAL=DEFERRED_EXTERNAL PostgreSQL is unreachable; no integration suites were started.\n',
  );
  process.exitCode = 2;
} finally {
  await pool.end().catch(() => undefined);
}
if (process.exitCode !== undefined) process.exit(process.exitCode);

const vitest = resolve('node_modules/vitest/vitest.mjs');
const child = spawn(
  process.execPath,
  [vitest, 'run', '--project', 'integration', '--exclude', '**/*remote.integration.test.ts'],
  {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  },
);
process.exitCode = await new Promise((resolveExitCode) => {
  child.once('error', (error) => {
    process.stderr.write(`Integration runner failed to start: ${error.message}\n`);
    resolveExitCode(1);
  });
  child.once('close', (code, signal) => {
    resolveExitCode(signal === null ? (code ?? 1) : 1);
  });
});

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  try {
    const text = (await readFile(resolve('.runtime/postgresql/credentials.json'), 'utf8')).replace(
      /^\uFEFF/u,
      '',
    );
    const parsed = JSON.parse(text);
    return typeof parsed.databaseUrl === 'string' && parsed.databaseUrl.trim()
      ? parsed.databaseUrl.trim()
      : null;
  } catch {
    return null;
  }
}
