import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { rm } from 'node:fs/promises';
const root = path.resolve('.data'),
  dir = path.join(root, `test-release-${randomUUID()}`);
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
Object.assign(process.env, { NODE_ENV: 'test', LOCAL_DATA_DIR: dir, FLOW_ENV: 'sandbox' });
test('Lanzamiento: remanente real pasa una sola vez y conserva reservas, pedidos y stock', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { moveReleasedPreorders } = await import('../lib/server/preorder-release');
  const catalog = await import('../lib/server/catalog');
  const commerce = await import('../lib/server/commerce');
  const db = await getDb();
  t.after(async () => {
    await closeDb();
    assert.equal(path.dirname(dir), root);
    assert.ok(path.basename(dir).startsWith('test-release-'));
    await rm(dir, { recursive: true, force: true });
  });
  const admin = (
    await db.query(
      "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,'unused','Prueba','admin',true) RETURNING *",
      [randomUUID(), randomUUID() + '@example.test'],
    )
  ).rows[0];
  const image = '/api/media/' + randomUUID() + '.webp';
  await db.query("INSERT INTO uploads(id,object_key,url,created_by) VALUES($1,'test.webp',$2,$3)", [
    randomUUID(),
    image,
    admin.id,
  ]);
  await db.query(
    "UPDATE settings SET data=jsonb_set(jsonb_set(data,'{address}','\"Prueba\"'),'{hours}','\"10 a 20\"') WHERE id=1",
  );
  const create = async () => {
    const draft = await catalog.saveProduct(admin, {
      name: 'Preventa de prueba',
      description: 'Prueba real de transición',
      sku: randomUUID(),
      category: 'Yu-Gi-Oh!',
      price: 5000,
      stock: 5,
      kind: 'preorder',
      images: [image],
      opens_at: new Date(Date.now() - 86400000).toISOString(),
      closes_at: new Date(Date.now() + 86400000).toISOString(),
      max_per_customer: 5,
      delivery_terms: 'Entrega al lanzamiento',
      release_date: '2099-01-01',
      auto_move_to_store: true,
    });
    return catalog.publishProduct(draft.id);
  };
  const p = await create();
  const order = await commerce.reserveOrder(admin, {
    items: [{ product_id: p.id, quantity: 2 }],
    delivery: { method: 'pickup' },
    idempotency_key: randomUUID(),
  });
  const before = (await db.query('SELECT * FROM orders WHERE id=$1', [order.id])).rows[0];
  await db.query(
    "UPDATE products SET opens_at=now()-interval '3 days',closes_at=now()-interval '1 day' WHERE id=$1",
    [p.id],
  );
  const closed = await catalog.getProduct(p.id, true);
  const today = (
    await db.query("SELECT to_char(now() AT TIME ZONE 'America/Santiago','YYYY-MM-DD') AS day")
  ).rows[0].day;
  const input = {
    ...closed,
    opens_at: new Date(closed.opens_at!).toISOString(),
    closes_at: new Date(closed.closes_at!).toISOString(),
    expected_version: closed.version,
  };
  await assert.rejects(
    () => catalog.saveProduct(admin, { ...input, release_date: '2000-01-01' }, p.id),
    /lanzamiento/,
  );
  const moved = await catalog.saveProduct(admin, { ...input, release_date: today }, p.id);
  assert.equal(moved.kind, 'store');
  const updated = (await catalog.getProducts(false, new URLSearchParams('kind=store'))).find(
    (x) => x.id === p.id,
  )!;
  assert.ok(updated);
  assert.equal(updated.stock, 5);
  assert.equal(updated.reserved, 2);
  assert.equal(updated.available, 3);
  assert.equal(updated.price, 5000);
  assert.deepEqual(updated.images, p.images);
  assert.equal(updated.delivery_terms, p.delivery_terms);
  assert.equal(updated.max_per_customer, p.max_per_customer);
  assert.ok(updated.moved_to_store_at);
  assert.equal(
    (await catalog.getProducts(false, new URLSearchParams('kind=preorder'))).some(
      (x) => x.id === p.id,
    ),
    false,
  );
  assert.deepEqual(
    (await db.query('SELECT * FROM orders WHERE id=$1', [order.id])).rows[0],
    before,
  );
  assert.equal(await moveReleasedPreorders(), 0);
  await commerce.completePos(admin, {
    items: [{ product_id: p.id, quantity: 1 }],
    payment_method: 'cash',
    cash_received: 5000,
    idempotency_key: randomUUID(),
  });
  const sold = await catalog.getProduct(p.id, true);
  assert.equal(sold.stock, 4);
  assert.equal(sold.reserved, 2);
  await commerce.releaseOrder(order.id, 'expired', 'Prueba de liberación');
  const released = await catalog.getProduct(p.id, true);
  assert.equal(released.stock, 4);
  assert.equal(released.reserved, 0);
  for (const patch of [
    'stock=0',
    'stock=2,reserved=2',
    'auto_move_to_store=false',
    "status='draft'",
    "status='withdrawn'",
    'deleted_at=now()',
    'release_date=NULL',
    "release_date='2099-01-01'",
  ]) {
    const untouched = await create();
    await db.query(
      "UPDATE products SET opens_at=now()-interval '3 days',closes_at=now()-interval '1 day',release_date='2000-01-01' WHERE id=$1",
      [untouched.id],
    );
    await db.query(`UPDATE products SET ${patch} WHERE id=$1`, [untouched.id]);
    await moveReleasedPreorders();
    assert.equal(
      (await db.query('SELECT kind FROM products WHERE id=$1', [untouched.id])).rows[0].kind,
      'preorder',
    );
  }
});
