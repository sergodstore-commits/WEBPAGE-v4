import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { Client } from 'pg';
import { databasePoolConfig, databaseSchema } from '../lib/server/database-config';
import { migrate, scopeDatabase, type Db } from '../lib/server/db';

test('DATABASE_SCHEMA admite esquemas privados y rechaza identificadores peligrosos o reservados', () => {
  assert.equal(databaseSchema({}), 'public');
  assert.equal(databaseSchema({ DATABASE_SCHEMA: 'sergod_store' }), 'sergod_store');
  for (const schema of [
    'a;DROP SCHEMA public',
    'a,b',
    'a.b',
    '"public"',
    'Uppercase',
    'a'.repeat(64),
    'pg_catalog',
    'pg_temp',
    'information_schema',
  ])
    assert.throws(() => databaseSchema({ DATABASE_SCHEMA: schema }), /DATABASE_SCHEMA/);
});

test('pg conserva la CA y verificación TLS explícitas aunque la URL traiga sslmode u opciones inseguras', () => {
  for (const suffix of [
    'sslmode=verify-full',
    'sslmode=no-verify',
    'ssl=false',
    'sslrootcert=nonexistent.pem&sslmode=require&uselibpqcompat=true',
  ]) {
    const config = databasePoolConfig({
      DATABASE_URL: `postgresql://test:password@localhost:6543/postgres?${suffix}&application_name=sergod`,
      DATABASE_SSL_CA: 'CERTIFICATE\\nCONTENTS',
    });
    const client = new Client(config);
    assert.deepEqual((client as any).connectionParameters.ssl, {
      rejectUnauthorized: true,
      ca: 'CERTIFICATE\nCONTENTS',
    });
    assert.equal((client as any).connectionParameters.application_name, 'sergod');
    assert.equal(new URL(config.connectionString!).searchParams.has('sslmode'), false);
  }
  assert.equal(
    databasePoolConfig({ DATABASE_URL: 'postgres://test@localhost/test', DATABASE_SSL: 'false' })
      .ssl,
    false,
  );
  assert.throws(() => databasePoolConfig({ DATABASE_URL: 'https://example.test' }), /PostgreSQL/);
});

test('el esquema nuevo convive con tablas antiguas: migraciones, aislamiento, rollback y persistencia de datos', async (t) => {
  const local = new PGlite();
  await local.waitReady;
  t.after(() => local.close());
  const wrap = (connection: any): Db => ({
    query: (sql, params) => connection.query(sql, params),
    exec: (sql) => connection.exec(sql),
    transaction: (callback) => connection.transaction((tx: any) => callback(wrap(tx))),
  });
  const raw = wrap(local);
  await raw.exec(`
    SET search_path TO public;
    CREATE TABLE public.products (legacy_name text PRIMARY KEY);
    INSERT INTO public.products VALUES ('Catálogo anterior');
    CREATE TABLE public.orders (legacy_number text PRIMARY KEY);
    INSERT INTO public.orders VALUES ('VENTA-ANTIGUA');
    CREATE TABLE public.schema_migrations (legacy_version integer PRIMARY KEY);
    INSERT INTO public.schema_migrations VALUES (42);
    CREATE TABLE public.only_legacy (value text);
  `);
  const db = scopeDatabase(raw, 'sergod_store');
  await assert.rejects(() => db.query('SELECT * FROM products'), /does not exist/);
  await migrate(db);
  await migrate(db);
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count,
    4,
  );
  assert.equal(
    (await db.query('SELECT current_schema() AS schema')).rows[0].schema,
    'sergod_store',
  );
  assert.equal((await raw.query('SELECT current_schema() AS schema')).rows[0].schema, 'public');
  const grants = await raw.query(`
    SELECT count(*)::int AS count FROM pg_namespace n,
    LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
    WHERE n.nspname='sergod_store' AND a.grantee=0 AND a.privilege_type IN ('USAGE','CREATE')
  `);
  assert.equal(grants.rows[0].count, 0, 'El esquema creado no concede acceso a PUBLIC');
  await db.query(`INSERT INTO products(id,name,slug,sku,price,stock)
    VALUES ('00000000-0000-0000-0000-000000000001','Catálogo nuevo','nuevo','NUEVO',1000,4)`);
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        await tx.query('UPDATE products SET stock=stock-1');
        throw new Error('Cancelar transacción');
      }),
    /Cancelar transacción/,
  );
  assert.equal((await db.query('SELECT stock FROM products')).rows[0].stock, 4);
  await db.transaction(async (tx) => {
    assert.equal(
      (await tx.query('SELECT current_schema() AS schema')).rows[0].schema,
      'sergod_store',
    );
    await tx.query('UPDATE products SET stock=stock-1');
  });
  assert.deepEqual((await db.query('SELECT name,stock,version FROM products')).rows, [
    { name: 'Catálogo nuevo', stock: 3, version: 2 },
  ]);
  await assert.rejects(() => db.query('SELECT * FROM only_legacy'), /does not exist/);
  assert.deepEqual((await raw.query('SELECT * FROM public.products')).rows, [
    { legacy_name: 'Catálogo anterior' },
  ]);
  assert.deepEqual((await raw.query('SELECT * FROM public.orders')).rows, [
    { legacy_number: 'VENTA-ANTIGUA' },
  ]);
  assert.deepEqual((await raw.query('SELECT * FROM public.schema_migrations')).rows, [
    { legacy_version: 42 },
  ]);
  assert.equal((await raw.query('SELECT current_schema() AS schema')).rows[0].schema, 'public');
  const defaultDb = scopeDatabase(raw, databaseSchema({}));
  assert.equal(
    (await defaultDb.query('SELECT legacy_name FROM products')).rows[0].legacy_name,
    'Catálogo anterior',
  );
});
