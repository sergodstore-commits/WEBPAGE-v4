import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  POS_COMPLETE_ID,
  POS_PROMO_ID,
  posTicketCapacity,
  type PosTicketProduct,
} from '../lib/pos-menu';

process.env.LOCAL_DATA_DIR = path.resolve('.data', `test-pos-menu-${randomUUID()}`);
for (const key of [
  'DATABASE_URL',
  'VERCEL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SMTP_HOST',
])
  delete process.env[key];
Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  FLOW_ENV: 'sandbox',
});

test('POS menu: private catalog, component inventory and verified staff payment recording', async (t) => {
  const { getDb, closeDb } = await import('../lib/server/db');
  const { getPosMenu, savePosMenuStock } = await import('../lib/server/pos-menu');
  const { completePos, reserveOrder, updateDelivery } = await import('../lib/server/commerce');
  const catalog = await import('../lib/server/catalog');
  const db = await getDb();
  await catalog.saveSettings({
    ...(await catalog.getSettings()),
    address: 'Local de prueba',
    hours: 'Horario de prueba',
  });
  t.after(closeDb);
  const admin = { id: randomUUID(), role: 'admin' };
  const customer = { id: randomUUID(), role: 'customer', email_verified: true };
  for (const user of [admin, customer])
    await db.query(
      "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,'test-only','Test',$3,true)",
      [user.id, `${user.id}@example.test`, user.role],
    );
  const menu = await getPosMenu();
  const pepsi = menu.find((i) => i.code === 'pepsi')!;
  const beer = menu.find((i) => i.alcoholic)!;
  const full = menu.find((i) => i.id === POS_COMPLETE_ID)!;
  const setStock = async (id: string, stock: number) => {
    const item = (await getPosMenu()).find((i) => i.id === id)!;
    return savePosMenuStock(admin, { id, stock, expected_version: item.version });
  };
  const stock = async (id: string) => (await getPosMenu()).find((i) => i.id === id)!.stock;
  const input = (extras: Record<string, unknown> = {}) => ({
    payment_method: 'cash',
    cash_received: 10000,
    idempotency_key: randomUUID(),
    ...extras,
  });

  await t.test(
    'eleven stock-controlled items start at zero and never enter the public product catalog',
    async () => {
      assert.equal(menu.length, 11);
      assert.ok(menu.every((i) => i.stock === 0));
      assert.ok(menu.every((i) => i.price === (i.kind === 'food' ? 2000 : 1500)));
      assert.ok((await catalog.getProducts()).every((p) => !menu.some((i) => i.id === p.id)));
      await assert.rejects(catalog.getProduct(pepsi.code), /no está disponible/);
      for (const id of [pepsi.id, POS_PROMO_ID])
        await assert.rejects(
          reserveOrder(customer, {
            items: [{ product_id: id, quantity: 1 }],
            delivery: { method: 'pickup' },
            idempotency_key: randomUUID(),
          }),
          /no está publicado/,
        );
      await assert.rejects(
        completePos(admin, input({ menu_items: [{ product_id: pepsi.id, quantity: 1 }] })),
        /Solo quedan 0/,
      );
    },
  );
  await t.test(
    'stock edits require an administrator and current version; prices are server controlled',
    async () => {
      await assert.rejects(
        savePosMenuStock(customer, { id: pepsi.id, stock: 8, expected_version: pepsi.version }),
        /administrador/,
      );
      await setStock(pepsi.id, 8);
      await setStock(full.id, 6);
      await setStock(beer.id, 3);
      await assert.rejects(
        savePosMenuStock(admin, { id: pepsi.id, stock: 100, expected_version: pepsi.version }),
        /stock cambió/,
      );
      const current = (await getPosMenu()).find((i) => i.id === pepsi.id)!;
      await assert.rejects(
        savePosMenuStock(admin, {
          id: pepsi.id,
          stock: 8,
          price: 1,
          expected_version: current.version,
        }),
      );
      await assert.rejects(
        completePos(customer, input({ menu_items: [{ product_id: pepsi.id, quantity: 1 }] })),
        /administrador/,
      );
    },
  );
  await t.test(
    'mixed menu and promo deduct each component once, totals ignore client prices, retries are idempotent',
    async () => {
      const request = input({
        menu_items: [{ product_id: pepsi.id, quantity: 1, unit_price: 1 }],
        promos: [{ product_id: pepsi.id, quantity: 2 }],
        delivery_slot: 'round2',
        table: 'Mesa 4',
      });
      const before = Number((await db.query('SELECT count(*) AS n FROM orders')).rows[0].n);
      const order = await completePos(admin, request);
      assert.equal(order.total, 7500);
      assert.equal(order.change_amount, 2500);
      assert.equal(order.fulfillment_status, 'received');
      assert.equal(order.delivery.entrega, 'En la ronda 2');
      assert.match(order.items.find((i: any) => i.kind === 'pos-promo').name, /Pepsi/);
      assert.equal(await stock(pepsi.id), 5);
      assert.equal(await stock(full.id), 4);
      assert.equal((await completePos(admin, request)).id, order.id);
      assert.equal(await stock(pepsi.id), 5);
      assert.equal(
        Number((await db.query('SELECT count(*) AS n FROM orders')).rows[0].n),
        before + 1,
      );
      assert.equal(
        Number(
          (
            await db.query('SELECT count(*) AS n FROM pos_menu_movements WHERE order_id=$1', [
              order.id,
            ])
          ).rows[0].n,
        ),
        2,
      );
      const ready = await updateDelivery(order.id, { fulfillment_status: 'ready' });
      assert.equal(ready.fulfillment_status, 'ready');
      await assert.rejects(
        updateDelivery(order.id, {
          fulfillment_status: 'shipped',
          carrier: 'Test',
          tracking: '123',
        }),
        /venta presencial/i,
      );
    },
  );
  await t.test(
    'alcohol is sold separately, never accepted as a promo; stock and orders roll back on any failure',
    async () => {
      const before = Number((await db.query('SELECT count(*) AS n FROM orders')).rows[0].n);
      await assert.rejects(
        completePos(admin, input({ promos: [{ product_id: beer.id, quantity: 1 }] })),
        /sin alcohol/,
      );
      await assert.rejects(
        completePos(
          admin,
          input({
            menu_items: [{ product_id: pepsi.id, quantity: 4 }],
            promos: [{ product_id: pepsi.id, quantity: 2 }],
          }),
        ),
        /Solo quedan 5/,
      );
      await assert.rejects(
        completePos(
          admin,
          input({ promos: [{ product_id: pepsi.id, quantity: 1 }], cash_received: 1 }),
        ),
        /no alcanza/,
      );
      await assert.rejects(
        completePos(
          admin,
          input({ promos: [{ product_id: pepsi.id, quantity: 1 }], delivery_slot: 'round2' }),
        ),
        /mesa/,
      );
      assert.equal(await stock(pepsi.id), 5);
      assert.equal(await stock(full.id), 4);
      assert.equal(await stock(beer.id), 3);
      assert.equal(Number((await db.query('SELECT count(*) AS n FROM orders')).rows[0].n), before);
      const order = await completePos(
        admin,
        input({ menu_items: [{ product_id: beer.id, quantity: 1 }] }),
      );
      assert.equal(order.total, 1500);
      assert.equal(await stock(beer.id), 2);
    },
  );
  await t.test(
    'TCG stock and menu components share one atomic sale without mixing inventory tables',
    async () => {
      const id = randomUUID(),
        url = `/api/media/${id}.webp`;
      await db.query('INSERT INTO uploads(id,object_key,url,created_by) VALUES($1,$2,$3,$4)', [
        id,
        `${id}.webp`,
        url,
        admin.id,
      ]);
      const product = await catalog.saveProduct(admin, {
        name: 'Sobre TCG de prueba',
        description: 'Prueba',
        sku: `TCG-${id}`,
        price: 5000,
        stock: 2,
        kind: 'store',
        category: 'Sobres',
        images: [url],
      });
      await catalog.publishProduct(product.id);
      const order = await completePos(
        admin,
        input({
          items: [{ product_id: product.id, quantity: 1 }],
          promos: [{ product_id: pepsi.id, quantity: 1 }],
        }),
      );
      assert.equal(order.total, 8000);
      assert.equal((await catalog.getProduct(product.id, true)).stock, 1);
      assert.equal(await stock(pepsi.id), 4);
      assert.equal(await stock(full.id), 3);
      await assert.rejects(
        completePos(
          admin,
          input({
            items: [{ product_id: product.id, quantity: 2 }],
            promos: [{ product_id: pepsi.id, quantity: 1 }],
          }),
        ),
        /Solo quedan/,
      );
      assert.equal(await stock(pepsi.id), 4);
      assert.equal(await stock(full.id), 3);
    },
  );
  await t.test(
    'the basket reserves promo components for UI quantities without creating separate promo stock',
    async () => {
      const current = await getPosMenu();
      const drink: PosTicketProduct = {
        id: pepsi.id,
        name: pepsi.name,
        sku: 'MENU',
        price: 1500,
        discount_percent: 0,
        available: 4,
        images: [],
        menu_id: pepsi.id,
      };
      const promo: PosTicketProduct = {
        ...drink,
        id: `promo-${pepsi.id}`,
        menu_id: undefined,
        promo_beverage_id: pepsi.id,
        price: 3000,
      };
      const ticket = [
        { product: drink, quantity: 2 },
        { product: promo, quantity: 1 },
      ];
      assert.equal(posTicketCapacity(promo, current, ticket), 2);
      assert.equal(posTicketCapacity(drink, current, ticket), 3);
    },
  );
  await t.test('two staff terminals cannot sell the same last promo components', async () => {
    await setStock(pepsi.id, 1);
    await setStock(full.id, 1);
    const secondAdmin = { id: randomUUID(), role: 'admin' };
    await db.query(
      "INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,'test-only','Second','admin',true)",
      [secondAdmin.id, `${secondAdmin.id}@example.test`],
    );
    const results = await Promise.allSettled(
      [admin, secondAdmin].map((user) =>
        completePos(user, input({ promos: [{ product_id: pepsi.id, quantity: 1 }] })),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await stock(pepsi.id), 0);
    assert.equal(await stock(full.id), 0);
  });
});
