/** Real PostgreSQL verification. See verify-postgres.md before running. */
import { loadEnvConfig } from '@next/env';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { databasePoolConfig } from '../lib/server/database-config';
import { assertVerificationSchema, verificationDropSql } from './verify-postgres-guards';

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL)
    throw new Error('Configura DATABASE_URL de PostgreSQL. Este script no usa la base local.');
  const schema = `sergod_verify_${randomBytes(16).toString('hex')}`;
  assertVerificationSchema(schema);
  const marker = `sergod-verify:${randomUUID()}`;
  let createdSchema: string | undefined;
  const control = new Pool({ ...databasePoolConfig(), max: 1 });
  const payments = new Map<
    string,
    { commerceOrder: string; flowOrder: number; status: number; amount: number; currency: string }
  >();
  let mockRequests = 0;
  let checks = 0;
  // This process never uses the shop's schema, payment account, SMTP or Storage.
  Object.assign(process.env, {
    DATABASE_SCHEMA: schema,
    AUTO_MIGRATE: 'false',
    APP_URL: 'https://verification.invalid',
    FLOW_ENV: 'sandbox',
    FLOW_API_KEY: 'verification-mock-key',
    FLOW_SECRET_KEY: 'verification-mock-secret',
  });
  for (const name of [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'MAIL_FROM',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ])
    delete process.env[name];
  globalThis.fetch = async (input, init) => {
    mockRequests++;
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    assert.equal(url.origin, 'https://sandbox.flow.cl', 'No se permiten otras solicitudes HTTP');
    if (url.pathname === '/api/payment/create') {
      assert.equal(init?.method, 'POST');
      const form = new URLSearchParams(String(init.body));
      const token = randomBytes(24).toString('hex');
      const payment = {
        commerceOrder: form.get('commerceOrder')!,
        flowOrder: payments.size + 10000,
        status: 1,
        amount: Number(form.get('amount')),
        currency: 'CLP',
      };
      payments.set(token, payment);
      return Response.json({
        token,
        flowOrder: payment.flowOrder,
        url: 'https://sandbox.flow.cl/app/web/pay.php',
      });
    }
    assert.equal(url.pathname, '/api/payment/getStatus', 'Endpoint Flow simulado desconocido');
    const payment = payments.get(url.searchParams.get('token') || '');
    assert.ok(payment, 'El token pertenece a esta ejecución');
    return Response.json(payment);
  };
  const { getDb, closeDb, migrate } = await import('../lib/server/db');
  const catalog = await import('../lib/server/catalog');
  const commerce = await import('../lib/server/commerce');
  const flow = await import('../lib/server/flow');
  const record = (name: string) => {
    checks++;
    console.log(`OK ${checks}: ${name}`);
  };
  try {
    const client = await control.connect();
    try {
      await client.query('BEGIN');
      // No IF NOT EXISTS: a collision must fail without adopting another schema.
      await client.query(`CREATE SCHEMA "${schema}" AUTHORIZATION CURRENT_USER`);
      await client.query(`REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC`);
      await client.query(`COMMENT ON SCHEMA "${schema}" IS '${marker}'`);
      await client.query('COMMIT');
      createdSchema = schema;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    console.log(`Esquema temporal: ${schema}. Flow simulado; correo deshabilitado.`);
    let db = await getDb();
    await migrate(db);
    await migrate(db);
    const names = (await readdir('db/migrations')).filter((name) => name.endsWith('.sql')).sort();
    assert.deepEqual(
      (await db.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(
        (row) => row.name,
      ),
      names,
    );
    record('Migraciones reales e idempotentes en el esquema aislado');

    // Hold three transactions simultaneously. A serial embedded adapter or a
    // pooler with only one backend cannot satisfy this rendezvous.
    let arrivals = 0;
    let release!: () => void;
    let reject!: (error: Error) => void;
    const ready = new Promise<void>((resolve, fail) => {
      release = resolve;
      reject = fail;
    });
    const timer = setTimeout(
      () =>
        reject(
          new Error('No se consiguieron tres conexiones PostgreSQL simultáneas en 15 segundos.'),
        ),
      15000,
    );
    const backends = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        db.transaction(async (tx) => {
          const row = (await tx.query('SELECT pg_backend_pid() AS pid, current_schema() AS schema'))
            .rows[0];
          assert.equal(row.schema, schema);
          if (++arrivals === 3) release();
          await ready;
          return row.pid;
        }),
      ),
    );
    clearTimeout(timer);
    for (const backend of backends) if (backend.status === 'rejected') throw backend.reason;
    assert.equal(
      new Set(backends.map((backend) => (backend.status === 'fulfilled' ? backend.value : null)))
        .size,
      3,
    );
    record('Tres conexiones PostgreSQL simultáneas y search_path privado en cada transacción');

    const makeUser = async (role: 'admin' | 'customer' = 'customer') => {
      const id = randomUUID();
      return (
        await db.query(
          `INSERT INTO users(id,email,password_hash,name,role,email_verified)
        VALUES($1,$2,'verification-only-no-login','Prueba PostgreSQL',$3,true) RETURNING *`,
          [id, `${id}@example.invalid`, role],
        )
      ).rows[0];
    };
    const admin = await makeUser('admin');
    const buyers = await Promise.all(Array.from({ length: 20 }, () => makeUser()));
    const imageId = randomUUID();
    const imageUrl = `https://verification.invalid/${imageId}.webp`;
    await db.query('INSERT INTO uploads(id,object_key,url,created_by) VALUES($1,$2,$3,$4)', [
      imageId,
      `${imageId}.webp`,
      imageUrl,
      admin.id,
    ]);
    await catalog.saveSettings({
      ...(await catalog.getSettings()),
      address: 'Dirección de prueba',
      hours: 'Solo verificación',
    });
    let sequence = 0;
    const product = async (overrides: Record<string, unknown> = {}) => {
      const number = ++sequence;
      const draft = await catalog.saveProduct(admin, {
        name: `Verificación PostgreSQL ${number}`,
        sku: `VERIFY-${number}`,
        description: 'Artículo temporal de comprobación',
        category: 'Verificación',
        price: 10000,
        stock: 1,
        kind: 'store',
        images: [imageUrl],
        ...overrides,
      });
      return catalog.publishProduct(draft.id);
    };
    const input = (productId: string) => ({
      items: [{ product_id: productId, quantity: 1 }],
      delivery: { method: 'pickup' },
      idempotency_key: randomUUID(),
    });
    const stock = async (id: string) =>
      (await db.query('SELECT stock,reserved FROM products WHERE id=$1', [id])).rows[0];
    const winners = <T>(results: PromiseSettledResult<T>[], expected: number): T[] => {
      const accepted: T[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') accepted.push(result.value);
        else
          assert.equal(
            result.reason?.status,
            409,
            `Se esperaba un rechazo de disponibilidad; código recibido: ${result.reason?.code || result.reason?.status || 'sin código'}`,
          );
      }
      assert.equal(accepted.length, expected);
      return accepted;
    };

    const lastUnit = await product();
    const checked = winners(
      await Promise.allSettled(buyers.map((buyer) => flow.checkout(buyer, input(lastUnit.id)))),
      1,
    )[0];
    assert.deepEqual(await stock(lastUnit.id), { stock: 1, reserved: 1 });
    record('Veinte checkouts concurrentes: una reserva sobre la última unidad');
    const paidToken = new URL(checked.payment_url).searchParams.get('token')!;
    payments.get(paidToken)!.status = 2;
    const approvals = await Promise.all(
      Array.from({ length: 10 }, () => flow.verifyToken(paidToken)),
    );
    assert.ok(approvals.every((order) => order.payment_status === 'approved'));
    assert.deepEqual(await stock(lastUnit.id), { stock: 0, reserved: 0 });
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS n FROM inventory_movements WHERE order_id=$1', [
          checked.order.id,
        ])
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS n FROM order_events WHERE order_id=$1', [
          checked.order.id,
        ])
      ).rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS n FROM mail_outbox WHERE dedupe_key=$1', [
          `order:${checked.order.id}:approved`,
        ])
      ).rows[0].n,
      1,
    );
    record('Diez callbacks aprobados concurrentes: un descuento, un evento y un correo en cola');

    for (let round = 0; round < 6; round++) {
      const item = await product();
      const web = () => flow.checkout(buyers[round], input(item.id));
      const pos = () =>
        commerce.completePos(admin, {
          ...input(item.id),
          payment_method: 'cash',
          cash_received: 15000,
        });
      const attempts = round % 2 === 0 ? [web(), pos()] : [pos(), web()];
      winners(await Promise.allSettled(attempts), 1);
      const remaining = await stock(item.id);
      assert.equal(remaining.stock - remaining.reserved, 0);
      assert.ok(
        remaining.stock >= 0 && remaining.reserved >= 0 && remaining.reserved <= remaining.stock,
      );
    }
    record('Seis carreras POS/checkout: ningún doble consumo de la última unidad');

    const preorder = await product({
      kind: 'preorder',
      stock: 10,
      max_per_customer: 2,
      opens_at: new Date(Date.now() - 60000).toISOString(),
      closes_at: new Date(Date.now() + 86400000).toISOString(),
      delivery_terms: 'Condiciones exclusivas de la prueba',
    });
    winners(
      await Promise.allSettled(
        Array.from({ length: 6 }, () => flow.checkout(buyers[0], input(preorder.id))),
      ),
      2,
    );
    assert.deepEqual(await stock(preorder.id), { stock: 10, reserved: 2 });
    record('Seis reservas simultáneas de un cliente respetan su máximo de dos');

    const cash = await product({ stock: 4, discount_percent: 15 });
    const ticket = {
      ...input(cash.id),
      items: [{ product_id: cash.id, quantity: 2 }],
      payment_method: 'cash',
      cash_received: 20000,
    };
    const sales = await Promise.all(
      Array.from({ length: 6 }, () => commerce.completePos(admin, ticket)),
    );
    assert.equal(new Set(sales.map((sale) => sale.id)).size, 1);
    assert.equal(sales[0].total, 17000);
    assert.equal(sales[0].change_amount, 3000);
    assert.deepEqual(await stock(cash.id), { stock: 2, reserved: 0 });
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS n FROM inventory_movements WHERE order_id=$1', [
          sales[0].id,
        ])
      ).rows[0].n,
      1,
    );
    record('POS concurrente idempotente, descuento y cambio en efectivo correctos');

    const before = (await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n;
    const empty = await product({ stock: 0 });
    await assert.rejects(
      () =>
        flow.checkout(buyers[1], {
          ...input(cash.id),
          items: [
            { product_id: cash.id, quantity: 1 },
            { product_id: empty.id, quantity: 1 },
          ],
        }),
      (error: any) => error.status === 409,
    );
    assert.deepEqual(await stock(cash.id), { stock: 2, reserved: 0 });
    assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, before);
    record('Carrito imposible revierte sin pedidos ni reservas parciales');

    await closeDb();
    db = await getDb();
    assert.equal((await db.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, before);
    assert.deepEqual(await stock(cash.id), { stock: 2, reserved: 0 });
    assert.equal(
      (await commerce.getOrder(checked.order.id, buyers[0], true)).payment_status,
      'approved',
    );
    assert.equal(
      (await db.query("SELECT count(*)::int AS n FROM mail_outbox WHERE status='sent'")).rows[0].n,
      0,
    );
    record('Persistencia al cerrar/reabrir todas las conexiones; ningún correo enviado');
  } finally {
    try {
      await closeDb();
    } finally {
      try {
        if (createdSchema) {
          const row = (
            await control.query(
              "SELECT obj_description(oid,'pg_namespace') AS marker FROM pg_namespace WHERE nspname=$1",
              [schema],
            )
          ).rows[0];
          await control.query(verificationDropSql(schema, createdSchema, marker, row?.marker));
          assert.equal(
            (await control.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rows
              .length,
            0,
          );
          console.log(`Limpieza verificada: eliminado únicamente ${schema}.`);
        }
      } finally {
        await control.end();
      }
    }
  }
  console.log(
    JSON.stringify({
      ok: true,
      checks,
      simultaneousConnections: 3,
      mockFlowRequests: mockRequests,
      realFlowRequests: 0,
      emailsSent: 0,
      cleanupVerified: true,
    }),
  );
}

main().catch((error) => {
  // Do not echo URLs, credentials, query parameters or private connection errors.
  console.error(
    `Verificación PostgreSQL fallida (${error?.code || error?.name || 'error'}). ${error?.name === 'AssertionError' ? 'Una comprobación no pasó.' : 'Revisa conexión, permisos o configuración.'}`,
  );
  process.exitCode = 1;
});
