import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
export type Db = {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>;
  exec: (sql: string) => Promise<unknown>;
  transaction: <T>(callback: (tx: Db) => Promise<T>) => Promise<T>;
};
// Local storage is never included in a serverless deployment artifact.
export const dataDir = () =>
  path.resolve(/* turbopackIgnore: true */ process.env.LOCAL_DATA_DIR || '.data');
const globalDb = globalThis as unknown as { sergodDB?: Promise<Db>; sergodRaw?: PGlite | Pool };
export async function migrate(db: Db) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const dir = path.join(process.cwd(), 'db', 'migrations');
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()) {
    await db.transaction(async (tx) => {
      await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      if ((await tx.query('SELECT name FROM schema_migrations WHERE name=$1', [name])).rows.length)
        return;
      await tx.exec(await readFile(path.join(dir, name), 'utf8'));
      await tx.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
    });
  }
}
export async function getDb(): Promise<Db> {
  if (!globalDb.sergodDB)
    globalDb.sergodDB = (async () => {
      let db: Db;
      if (process.env.DATABASE_URL) {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 5,
          connectionTimeoutMillis: 8000,
          idleTimeoutMillis: 20000,
          ssl:
            process.env.DATABASE_SSL === 'false'
              ? false
              : {
                  rejectUnauthorized: true,
                  ca: process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n'),
                },
        });
        globalDb.sergodRaw = pool;
        db = {
          query: async (sql, params) => (await pool.query(sql, params)) as any,
          exec: (sql) => pool.query(sql),
          transaction: async (cb) => {
            const c = await pool.connect();
            const tx: Db = {
              query: async (sql, params) => (await c.query(sql, params)) as any,
              exec: (sql) => c.query(sql),
              transaction: async () => {
                throw new Error('Nested transactions are not supported');
              },
            };
            try {
              await c.query('BEGIN');
              const result = await cb(tx);
              await c.query('COMMIT');
              return result;
            } catch (e) {
              await c.query('ROLLBACK');
              throw e;
            } finally {
              c.release();
            }
          },
        };
      } else {
        if (
          process.env.VERCEL ||
          (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOCAL_PRODUCTION !== 'true')
        )
          throw new Error('DATABASE_URL es obligatoria en producción.');
        await mkdir(dataDir(), { recursive: true });
        const local = new PGlite(path.join(dataDir(), 'postgres'));
        globalDb.sergodRaw = local;
        await local.waitReady;
        const wrap = (d: any): Db => ({
          query: (sql, params) => d.query(sql, params),
          exec: (sql) => d.exec(sql),
          transaction: (cb) => d.transaction((tx: any) => cb(wrap(tx))),
        });
        db = wrap(local);
      }
      if (!process.env.DATABASE_URL || process.env.AUTO_MIGRATE === 'true') await migrate(db);
      return db;
    })().catch((e) => {
      globalDb.sergodDB = undefined;
      throw e;
    });
  return globalDb.sergodDB;
}
export async function closeDb() {
  const raw = globalDb.sergodRaw;
  if (raw instanceof Pool) await raw.end();
  else if (raw) await raw.close();
  globalDb.sergodDB = undefined;
  globalDb.sergodRaw = undefined;
}
