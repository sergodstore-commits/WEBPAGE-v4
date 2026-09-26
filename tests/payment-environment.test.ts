import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migración de ambientes identifica hosts Flow y conserva ventas y datos desconocidos', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE orders (id integer PRIMARY KEY, source text, payment_url text)');
    const cases = [
      ['web', 'https://sandbox.flow.cl/app/web/pay.php?token=test', 'sandbox'],
      ['web', 'https://www.flow.cl/app/web/pay.php?token=test', 'production'],
      ['web', 'https://flow.cl/app/web/pay.php?token=test', 'production'],
      ['web', 'https://sandbox.flow.cl.example.test/pay', null],
      ['web', 'uncertain', null],
      ['web', null, null],
      ['pos', 'https://sandbox.flow.cl/app/web/pay.php', null],
    ];
    for (const [i, [source, url]] of cases.entries())
      await db.query('INSERT INTO orders VALUES($1,$2,$3)', [i, source, url]);
    const sql = await readFile('db/migrations/004_payment_environment.sql', 'utf8');
    await db.exec(sql);
    assert.deepEqual(
      (await db.query('SELECT payment_environment FROM orders ORDER BY id')).rows.map(
        (r: any) => r.payment_environment,
      ),
      cases.map((c) => c[2]),
    );
    await assert.rejects(() =>
      db.query("UPDATE orders SET payment_environment='sandbox' WHERE source='pos'"),
    );
    await assert.rejects(() =>
      db.query("UPDATE orders SET payment_environment='other' WHERE id=0"),
    );
    await db.exec(sql);
    assert.equal(
      (await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM orders')).rows[0]
        .count,
      cases.length,
    );
  } finally {
    await db.close();
  }
});
