import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

// Never run this suite against a configured production database or mail server.
const testRoot = path.resolve('.data');
const testDirectory = path.join(testRoot, `test-store-${randomUUID()}`);
process.env.LOCAL_DATA_DIR = testDirectory;
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.SMTP_HOST;
Object.assign(process.env, { NODE_ENV: 'test', APP_URL: 'http://localhost:3000' });

test('SERGOD STORE · integración con base PostgreSQL local real', async (t) => {
  await mkdir(testDirectory, { recursive: true });
  const { getDb, closeDb } = await import('../lib/server/db');
  const catalog = await import('../lib/server/catalog');
  const commerce = await import('../lib/server/commerce');
  const auth = await import('../lib/server/auth');
  const { hash, sameOrigin } = await import('../lib/server/core');
  let db = await getDb();
  let sequence = 0;
  t.after(async () => {
    await closeDb();
    const relative = path.relative(testRoot, path.resolve(testDirectory));
    if (
      !relative.startsWith('test-store-') ||
      relative.includes(path.sep) ||
      path.isAbsolute(relative)
    ) {
      throw new Error('La limpieza solo puede afectar el directorio aislado de esta prueba.');
    }
    await rm(testDirectory, { recursive: true, force: true });
  });

  async function user(role: 'admin' | 'customer' = 'customer', verified = true) {
    const id = randomUUID();
    return (
      await db.query(
        `INSERT INTO users(id,email,password_hash,name,role,email_verified)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          id,
          `${id}@example.test`,
          'not-a-login-password',
          role === 'admin' ? 'Administrador de prueba' : 'Cliente de prueba',
          role,
          verified,
        ],
      )
    ).rows[0];
  }
  const admin = await user('admin');
  const customer = await user();
  const unverifiedCustomer = await user('customer', false);
  const imageId = randomUUID();
  const imageUrl = `/api/media/${imageId}.webp`;
  await db.query('INSERT INTO uploads(id,object_key,url,created_by) VALUES($1,$2,$3,$4)', [
    imageId,
    `${imageId}.webp`,
    imageUrl,
    admin.id,
  ]);
  await catalog.saveSettings({
    ...(await catalog.getSettings()),
    address: 'Dirección de prueba, Copiapó',
    hours: 'Horario de prueba: lunes a viernes, 11:00 a 19:00',
    pickup_instructions: 'Presentar número de pedido.',
    reservation_minutes: 15,
    carriers: [
      {
        id: 'test-collect',
        name: 'Transportista de prueba',
        enabled: true,
        mode: 'address',
        collect: true,
        price: 7990,
      },
    ],
  });

  async function product(overrides: Record<string, unknown> = {}, publish = true) {
    const n = ++sequence;
    const p = await catalog.saveProduct(admin, {
      name: `Artículo de prueba ${n}`,
      description: 'Producto creado por una prueba de integración.',
      sku: `TEST-${n}-${randomUUID().slice(0, 8)}`,
      category: 'Cartas',
      price: 10000,
      discount_percent: 0,
      stock: 10,
      images: [imageUrl],
      kind: 'store',
      opens_at: null,
      closes_at: null,
      max_per_customer: null,
      delivery_terms: '',
      ...overrides,
    });
    return publish ? catalog.publishProduct(p.id) : p;
  }
  const input = (
    items: { product_id: string; quantity: number }[],
    extras: Record<string, unknown> = {},
  ) => ({
    items,
    delivery: { method: 'pickup' },
    idempotency_key: randomUUID(),
    ...extras,
  });
  const stock = async (id: string) =>
    (await db.query('SELECT stock,reserved FROM products WHERE id=$1', [id])).rows[0];
  const order = async (id: string) =>
    (await db.query('SELECT * FROM orders WHERE id=$1', [id])).rows[0];
  const count = async (table: 'order_events' | 'inventory_movements' | 'orders', id: string) =>
    Number(
      (
        await db.query(
          `SELECT count(*) AS n FROM ${table} WHERE ${table === 'orders' ? 'id' : 'order_id'}=$1`,
          [id],
        )
      ).rows[0].n,
    );
  async function payment(o: any, status = 2, overrides: Record<string, unknown> = {}) {
    const token = randomBytes(32).toString('hex');
    const flowOrder = ++sequence + 10000;
    await db.query('UPDATE orders SET flow_token=$2,flow_order=$3 WHERE id=$1', [
      o.id,
      token,
      String(flowOrder),
    ]);
    return {
      token,
      result: {
        commerceOrder: o.id,
        flowOrder,
        status,
        amount: o.total,
        currency: 'CLP',
        ...overrides,
      },
    };
  }

  await t.test(
    'guardar, publicar, leer, editar y retirar un producto mantiene persistencia real',
    async () => {
      const p = await product({}, false);
      assert.equal(
        (await catalog.getProducts()).some((item: any) => item.id === p.id),
        false,
      );
      await catalog.publishProduct(p.id);
      let read = await catalog.getProduct(p.slug);
      assert.ok(read);
      assert.equal(read.images[0], imageUrl);
      assert.equal(read.price, 10000);
      await catalog.saveProduct(
        admin,
        { ...read, name: 'Artículo editado y persistido', price: 12340 },
        p.id,
      );
      const stored = (await db.query('SELECT * FROM products WHERE id=$1', [p.id])).rows[0];
      read = await catalog.getProduct(stored.slug);
      assert.equal(read.name, 'Artículo editado y persistido');
      assert.equal(read.price, 12340);
      await catalog.withdrawProduct(p.id);
      assert.equal(
        (await catalog.getProducts()).some((item: any) => item.id === p.id),
        false,
      );
      assert.equal(
        (await catalog.getProducts(true)).some((item: any) => item.id === p.id),
        true,
      );
    },
  );

  await t.test('publicación rechaza un artículo sin imagen guardada', async () => {
    const p = await product({ images: [] }, false);
    await assert.rejects(() => catalog.publishProduct(p.id));
    assert.equal(
      (await db.query('SELECT status FROM products WHERE id=$1', [p.id])).rows[0].status,
      'draft',
    );
  });

  await t.test('última unidad: veinte reservas concurrentes producen un solo ganador', async () => {
    const p = await product({ stock: 1 });
    const buyers = await Promise.all(Array.from({ length: 20 }, () => user()));
    const results = await Promise.allSettled(
      buyers.map((buyer) =>
        commerce.reserveOrder(buyer, input([{ product_id: p.id, quantity: 1 }])),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 19);
    assert.deepEqual(await stock(p.id), { stock: 1, reserved: 1 });
  });

  await t.test('POS y checkout compiten por el mismo stock', async () => {
    const p = await product({ stock: 1 });
    const results = await Promise.allSettled([
      commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 1 }])),
      commerce.completePos(
        admin,
        input([{ product_id: p.id, quantity: 1 }], {
          payment_method: 'cash',
          cash_received: 15000,
        }),
      ),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const s = await stock(p.id);
    assert.equal(s.stock - s.reserved, 0);
    assert.ok(s.stock >= 0 && s.reserved >= 0 && s.reserved <= s.stock);
  });

  await t.test(
    'POS efectivo calcula total y cambio; repetición no descuenta dos veces',
    async () => {
      const p = await product({ stock: 4, price: 10000, discount_percent: 15 });
      const request = input([{ product_id: p.id, quantity: 2 }], {
        payment_method: 'cash',
        cash_received: 20000,
      });
      const sale = await commerce.completePos(admin, request);
      const repeat = await commerce.completePos(admin, request);
      assert.equal(repeat.id, sale.id);
      assert.equal(sale.total, 17000);
      assert.equal(sale.change_amount, 3000);
      assert.equal(sale.payment_status, 'approved');
      assert.equal(sale.source, 'pos');
      assert.deepEqual(await stock(p.id), { stock: 2, reserved: 0 });
      assert.equal(await count('inventory_movements', sale.id), 1);
    },
  );

  await t.test('POS rechaza efectivo insuficiente sin alterar inventario', async () => {
    const p = await product({ stock: 1 });
    await assert.rejects(() =>
      commerce.completePos(
        admin,
        input([{ product_id: p.id, quantity: 1 }], { payment_method: 'cash', cash_received: 9999 }),
      ),
    );
    assert.deepEqual(await stock(p.id), { stock: 1, reserved: 0 });
  });

  await t.test(
    'editar un formulario antiguo tras una venta no repone inventario vendido',
    async () => {
      const p = await product({ stock: 5 });
      const staleForm = await catalog.getProduct(p.slug);
      await commerce.completePos(
        admin,
        input([{ product_id: p.id, quantity: 1 }], {
          payment_method: 'cash',
          cash_received: 10000,
        }),
      );
      await assert.rejects(() =>
        catalog.saveProduct(
          admin,
          { ...staleForm, description: 'Cambio de texto con formulario antiguo.' },
          p.id,
        ),
      );
      assert.deepEqual(await stock(p.id), { stock: 4, reserved: 0 });
      const current = await catalog.getProduct(p.slug);
      await catalog.saveProduct(
        admin,
        { ...current, description: 'Cambio de texto con versión vigente.' },
        p.id,
      );
      assert.deepEqual(await stock(p.id), { stock: 4, reserved: 0 });
      assert.equal(
        (await catalog.getProduct(p.slug)).description,
        'Cambio de texto con versión vigente.',
      );
    },
  );

  await t.test('un cliente no puede completar una venta POS', async () => {
    const p = await product({ stock: 1 });
    await assert.rejects(() =>
      commerce.completePos(
        customer,
        input([{ product_id: p.id, quantity: 1 }], {
          payment_method: 'cash',
          cash_received: 10000,
        }),
      ),
    );
    assert.deepEqual(await stock(p.id), { stock: 1, reserved: 0 });
  });

  await t.test('límite de preventa acumula reservas simultáneas y compras aprobadas', async () => {
    const buyer = await user();
    const p = await product({
      kind: 'preorder',
      stock: 20,
      max_per_customer: 2,
      opens_at: new Date(Date.now() - 86400000).toISOString(),
      closes_at: new Date(Date.now() + 86400000).toISOString(),
      delivery_terms: 'Retiro al lanzamiento anunciado.',
    });
    const requests = await Promise.allSettled(
      [1, 2].map(() => commerce.reserveOrder(buyer, input([{ product_id: p.id, quantity: 2 }]))),
    );
    assert.equal(requests.filter((r) => r.status === 'fulfilled').length, 1);
    const approved = requests.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
    const verified = await payment(approved.value);
    await commerce.applyPayment(verified.token, verified.result);
    await assert.rejects(() =>
      commerce.reserveOrder(buyer, input([{ product_id: p.id, quantity: 1 }])),
    );
    assert.deepEqual(await stock(p.id), { stock: 18, reserved: 0 });
  });

  await t.test('preventa rechaza compras antes de apertura o después del cierre', async () => {
    for (const closed of [false, true]) {
      const p = await product({
        kind: 'preorder',
        max_per_customer: 2,
        opens_at: new Date(Date.now() + (closed ? -172800000 : 86400000)).toISOString(),
        closes_at: new Date(Date.now() + 172800000).toISOString(),
        delivery_terms: 'Fecha de entrega de prueba.',
      });
      // Publication requires a future close. Move the persisted clock boundary to simulate elapsed time.
      if (closed)
        await db.query("UPDATE products SET closes_at=now()-interval '1 day' WHERE id=$1", [p.id]);
      await assert.rejects(() =>
        commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 1 }])),
      );
      assert.deepEqual(await stock(p.id), { stock: 10, reserved: 0 });
    }
  });

  await t.test('SKU duplicado en carrito suma cantidades antes de comprobar stock', async () => {
    const p = await product({ stock: 3 });
    await assert.rejects(() =>
      commerce.reserveOrder(
        customer,
        input([
          { product_id: p.id, quantity: 2 },
          { product_id: p.id, quantity: 2 },
        ]),
      ),
    );
    assert.deepEqual(await stock(p.id), { stock: 3, reserved: 0 });
  });

  await t.test('fallo en segundo producto revierte toda la reserva', async () => {
    const a = await product({ stock: 5 });
    const b = await product({ stock: 0 });
    await assert.rejects(() =>
      commerce.reserveOrder(
        customer,
        input([
          { product_id: a.id, quantity: 2 },
          { product_id: b.id, quantity: 1 },
        ]),
      ),
    );
    assert.deepEqual(await stock(a.id), { stock: 5, reserved: 0 });
    assert.deepEqual(await stock(b.id), { stock: 0, reserved: 0 });
  });

  await t.test('precios manipulados no cambian el importe calculado por servidor', async () => {
    const p = await product({ price: 10001, discount_percent: 10 });
    const o = await commerce.reserveOrder(
      customer,
      input([{ product_id: p.id, quantity: 2 }], {
        total: 1,
        subtotal: 1,
        discount_percent: 99,
        shipping_price: 0,
        price: 1,
      }),
    );
    assert.equal(o.total, Math.round(10001 * 0.9) * 2);
    assert.equal(o.items[0].unit_price, Math.round(10001 * 0.9));
  });

  await t.test(
    'envío por pagar excluye el flete del total y conserva datos de destinatario',
    async () => {
      const p = await product({ price: 12000 });
      const delivery = {
        method: 'shipping',
        carrier_id: 'test-collect',
        recipient: 'Persona de prueba',
        phone: '+56912345678',
        region: 'Atacama',
        commune: 'Copiapó',
        address: 'Dirección ficticia de prueba 123',
      };
      const o = await commerce.reserveOrder(
        customer,
        input([{ product_id: p.id, quantity: 1 }], { delivery }),
      );
      assert.equal(o.shipping_price, 0);
      assert.equal(o.total, 12000);
      assert.equal(o.delivery.collect, true);
      assert.equal(o.delivery.recipient, delivery.recipient);
      assert.match(o.delivery.freight_note, /separado/i);
      await assert.rejects(() =>
        commerce.reserveOrder(
          customer,
          input([{ product_id: p.id, quantity: 1 }], { delivery: { ...delivery, address: '' } }),
        ),
      );
      await assert.rejects(() =>
        commerce.reserveOrder(
          customer,
          input([{ product_id: p.id, quantity: 1 }], {
            delivery: { ...delivery, carrier_id: 'disabled-or-invented' },
          }),
        ),
      );
    },
  );

  await t.test('reserva exige correo verificado y cantidades enteras positivas', async () => {
    const p = await product();
    await assert.rejects(() =>
      commerce.reserveOrder(unverifiedCustomer, input([{ product_id: p.id, quantity: 1 }])),
    );
    for (const quantity of [-1, 0, 1.5]) {
      await assert.rejects(() =>
        commerce.reserveOrder(customer, input([{ product_id: p.id, quantity }])),
      );
    }
    assert.deepEqual(await stock(p.id), { stock: 10, reserved: 0 });
  });

  await t.test(
    'idempotencia devuelve la misma orden y rechaza reutilizar clave con otro carrito',
    async () => {
      const p = await product();
      const request = input([{ product_id: p.id, quantity: 1 }]);
      const [a, b] = await Promise.all([
        commerce.reserveOrder(customer, request),
        commerce.reserveOrder(customer, request),
      ]);
      assert.equal(a.id, b.id);
      assert.equal(await count('orders', a.id), 1);
      assert.deepEqual(await stock(p.id), { stock: 10, reserved: 1 });
      await assert.rejects(() =>
        commerce.reserveOrder(customer, { ...request, items: [{ product_id: p.id, quantity: 2 }] }),
      );
      assert.deepEqual(await stock(p.id), { stock: 10, reserved: 1 });
    },
  );

  await t.test(
    'notificaciones aprobadas repetidas consumen inventario y generan correo una sola vez',
    async () => {
      const p = await product({ stock: 5 });
      const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 2 }]));
      const verified = await payment(o);
      await commerce.applyPayment(verified.token, verified.result);
      const events = await count('order_events', o.id);
      const mailBefore = Number(
        (await db.query('SELECT count(*) AS n FROM mail_outbox')).rows[0].n,
      );
      await Promise.all(
        Array.from({ length: 20 }, () => commerce.applyPayment(verified.token, verified.result)),
      );
      assert.equal((await order(o.id)).payment_status, 'approved');
      assert.deepEqual(await stock(p.id), { stock: 3, reserved: 0 });
      assert.equal(await count('inventory_movements', o.id), 1);
      assert.equal(await count('order_events', o.id), events);
      assert.equal(
        Number((await db.query('SELECT count(*) AS n FROM mail_outbox')).rows[0].n),
        mailBefore,
      );
    },
  );

  await t.test(
    'un resultado atrasado nunca degrada un pedido aprobado ni repone stock',
    async () => {
      const p = await product({ stock: 2 });
      const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 1 }]));
      const verified = await payment(o);
      await commerce.applyPayment(verified.token, verified.result);
      for (const status of [1, 3, 4]) {
        await commerce.applyPayment(verified.token, { ...verified.result, status });
      }
      await commerce.releaseOrder(o.id, 'expired', 'Intento de expiración posterior al pago.');
      assert.equal((await order(o.id)).payment_status, 'approved');
      assert.deepEqual(await stock(p.id), { stock: 1, reserved: 0 });
    },
  );

  await t.test(
    'monto, moneda, commerceOrder y flowOrder distintos jamás aprueban ni consumen',
    async () => {
      for (const mismatch of [
        { amount: 1 },
        { currency: 'USD' },
        { commerceOrder: randomUUID() },
        { flowOrder: 999999999 },
      ]) {
        const p = await product({ stock: 2 });
        const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 1 }]));
        const verified = await payment(o);
        await commerce
          .applyPayment(verified.token, { ...verified.result, ...mismatch })
          .catch(() => undefined);
        assert.notEqual((await order(o.id)).payment_status, 'approved');
        assert.equal((await stock(p.id)).stock, 2);
        assert.equal(await count('inventory_movements', o.id), 0);
      }
      await assert.rejects(() =>
        commerce.applyPayment('unknown-token', { status: 2, amount: 10000, currency: 'CLP' }),
      );
    },
  );

  await t.test('rechazo y expiración liberan la reserva exactamente una vez', async () => {
    for (const status of ['rejected', 'expired'] as const) {
      const p = await product({ stock: 3 });
      const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 2 }]));
      await commerce.releaseOrder(o.id, status, 'Fin de reserva confirmado en prueba.');
      await commerce.releaseOrder(o.id, status, 'Notificación duplicada.');
      assert.equal((await order(o.id)).payment_status, status);
      assert.deepEqual(await stock(p.id), { stock: 3, reserved: 0 });
    }
  });

  await t.test('reserva vencida sin iniciar creación de pago se libera una sola vez', async () => {
    const p = await product({ stock: 3 });
    const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 2 }]));
    await db.query("UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1", [o.id]);
    assert.equal(await commerce.releaseUnstartedOrders(), 1);
    assert.equal((await order(o.id)).payment_status, 'expired');
    assert.deepEqual(await stock(p.id), { stock: 3, reserved: 0 });
    const events = await count('order_events', o.id);
    assert.equal(await commerce.releaseUnstartedOrders(), 0);
    assert.equal(await count('order_events', o.id), events);
    assert.deepEqual(await stock(p.id), { stock: 3, reserved: 0 });
  });

  await t.test('vencimiento local conserva reservas con creación incierta o en curso', async () => {
    for (const state of ['creating', 'uncertain']) {
      const p = await product({ stock: 2 });
      const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 1 }]));
      await db.query(
        "UPDATE orders SET expires_at=now()-interval '1 minute',payment_url=$2 WHERE id=$1",
        [o.id, state],
      );
      assert.equal(await commerce.releaseUnstartedOrders(), 0);
      assert.equal((await order(o.id)).payment_status, 'pending');
      assert.deepEqual(await stock(p.id), { stock: 2, reserved: 1 });
    }
  });

  await t.test(
    'recuperación por commerceId mantiene token nulo y callback posterior no duplica pago',
    async () => {
      const p = await product({ stock: 3 });
      const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 2 }]));
      await db.query("UPDATE orders SET payment_url='uncertain' WHERE id=$1", [o.id]);
      const result = {
        commerceOrder: o.id,
        flowOrder: ++sequence + 20000,
        amount: o.total,
        currency: 'CLP',
        status: 1,
      };
      await commerce.applyPayment(`recovered:${o.id}`, result);
      assert.equal((await order(o.id)).flow_token, null);
      assert.equal((await order(o.id)).flow_order, String(result.flowOrder));
      assert.deepEqual(await stock(p.id), { stock: 3, reserved: 2 });
      await commerce.applyPayment(`recovered:${o.id}`, { ...result, status: 2 });
      assert.equal((await order(o.id)).flow_token, null);
      assert.equal((await order(o.id)).payment_status, 'approved');
      const token = randomBytes(32).toString('hex');
      const events = await count('order_events', o.id);
      const outbox = Number((await db.query('SELECT count(*) AS n FROM mail_outbox')).rows[0].n);
      await commerce.applyPayment(token, { ...result, status: 2 });
      await commerce.applyPayment(token, { ...result, status: 2 });
      assert.equal((await order(o.id)).flow_token, token);
      assert.deepEqual(await stock(p.id), { stock: 1, reserved: 0 });
      assert.equal(await count('inventory_movements', o.id), 1);
      assert.equal(await count('order_events', o.id), events);
      assert.equal(
        Number((await db.query('SELECT count(*) AS n FROM mail_outbox')).rows[0].n),
        outbox,
      );
    },
  );

  await t.test(
    'pago tardío después de liberar y revender no causa inventario negativo',
    async () => {
      const p = await product({ stock: 1 });
      const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 1 }]));
      const verified = await payment(o);
      await commerce.releaseOrder(o.id, 'expired', 'Expiración de prueba.');
      await commerce.completePos(
        admin,
        input([{ product_id: p.id, quantity: 1 }], {
          payment_method: 'cash',
          cash_received: 10000,
        }),
      );
      await commerce.applyPayment(verified.token, verified.result);
      assert.equal((await order(o.id)).payment_status, 'review');
      assert.deepEqual(await stock(p.id), { stock: 0, reserved: 0 });
    },
  );

  await t.test('retirar y borrar producto vendido preserva los datos de la venta', async () => {
    const p = await product({ price: 14990 });
    const sale = await commerce.completePos(
      admin,
      input([{ product_id: p.id, quantity: 1 }], { payment_method: 'cash', cash_received: 15000 }),
    );
    await catalog.withdrawProduct(p.id);
    await catalog.deleteProduct(p.id);
    assert.equal(
      (await catalog.getProducts()).some((item: any) => item.id === p.id),
      false,
    );
    const saved = await order(sale.id);
    assert.equal(saved.items[0].name, p.name);
    assert.equal(saved.items[0].sku, p.sku);
    assert.equal(saved.items[0].unit_price, 14990);
    assert.equal(saved.total, 14990);
    assert.equal(await count('inventory_movements', sale.id), 1);
  });

  await t.test(
    'sesión persiste, permisos admin se aplican y origen externo se rechaza',
    async () => {
      const raw = await auth.createSession(customer.id);
      const request = new Request('http://localhost:3000/api/admin', {
        headers: { cookie: `sergod_session=${raw}` },
      });
      assert.equal((await auth.sessionUser(request))?.id, customer.id);
      await assert.rejects(() => auth.requireUser(new Request('http://localhost:3000/api/admin')));
      await assert.rejects(() => auth.requireUser(request, true));
      assert.throws(() =>
        sameOrigin(
          new Request('http://localhost:3000/api/admin', {
            headers: { origin: 'https://another.example' },
          }),
        ),
      );
      assert.throws(() => sameOrigin(new Request('http://localhost:3000/api/admin')));
      assert.doesNotThrow(() =>
        sameOrigin(
          new Request('http://localhost:3000/api/admin', {
            headers: { origin: 'http://localhost:3000' },
          }),
        ),
      );
      assert.equal(
        (
          await db.query('SELECT token_hash FROM sessions WHERE user_id=$1', [customer.id])
        ).rows.some((r: any) => r.token_hash === raw),
        false,
      );
      await auth.logout(request);
      assert.equal(await auth.sessionUser(request), null);
    },
  );

  await t.test('cada cliente consulta únicamente sus propios pedidos', async () => {
    const p = await product();
    const o = await commerce.reserveOrder(customer, input([{ product_id: p.id, quantity: 1 }]));
    const stranger = await user();
    assert.equal((await commerce.getOrder(o.id, customer)).id, o.id);
    await assert.rejects(() => commerce.getOrder(o.id, stranger));
    assert.equal(
      (await commerce.listOrders(stranger)).some((item: any) => item.id === o.id),
      false,
    );
  });

  await t.test(
    'registro, verificación y recuperación usan tokens de una sola vez y revocan sesiones',
    async () => {
      const email = `${randomUUID()}@example.test`;
      const oldPassword = 'Una-clave-de-prueba-123!';
      const newPassword = 'Nueva-clave-de-prueba-456!';
      await auth.register({ name: 'Usuario registrado', email, password: oldPassword });
      const registered = (await db.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
      assert.equal(registered.email_verified, false);
      assert.notEqual(registered.password_hash, oldPassword);
      let message = (
        await db.query(
          'SELECT body FROM mail_outbox WHERE recipient=$1 ORDER BY created_at DESC LIMIT 1',
          [email],
        )
      ).rows[0].body;
      const verification = String(message).match(/token=([a-f0-9]{64})/)?.[1];
      assert.ok(verification);
      assert.equal(
        (await db.query('SELECT token_hash FROM auth_tokens WHERE user_id=$1', [registered.id]))
          .rows[0].token_hash,
        hash(verification),
      );
      await auth.consumeToken({ token: verification }, 'verify');
      await assert.rejects(() => auth.consumeToken({ token: verification }, 'verify'));
      const session = await auth.login({ email, password: oldPassword });
      const request = new Request('http://localhost:3000/api/account', {
        headers: { cookie: `sergod_session=${session.raw}` },
      });
      assert.equal((await auth.sessionUser(request))?.email_verified, true);
      await auth.forgot({ email });
      message = (
        await db.query(
          "SELECT body FROM mail_outbox WHERE recipient=$1 AND subject LIKE 'Recupera%' ORDER BY created_at DESC LIMIT 1",
          [email],
        )
      ).rows[0].body;
      const reset = String(message).match(/token=([a-f0-9]{64})/)?.[1];
      assert.ok(reset);
      await auth.consumeToken({ token: reset, password: newPassword }, 'reset');
      assert.equal(await auth.sessionUser(request), null);
      await assert.rejects(() =>
        auth.consumeToken({ token: reset, password: newPassword }, 'reset'),
      );
      await assert.rejects(() => auth.login({ email, password: oldPassword }));
      assert.equal((await auth.login({ email, password: newPassword })).user?.id, registered.id);
    },
  );

  await t.test('cerrar y reabrir la base conserva catálogo, configuración y sesión', async () => {
    const p = await product({ name: 'Persistencia tras reinicio', stock: 7 });
    const session = await auth.createSession(customer.id);
    await closeDb();
    db = await getDb();
    assert.equal((await catalog.getProduct(p.slug)).name, 'Persistencia tras reinicio');
    assert.deepEqual(await stock(p.id), { stock: 7, reserved: 0 });
    assert.equal((await catalog.getSettings()).address, 'Dirección de prueba, Copiapó');
    const request = new Request('http://localhost:3000/api/account', {
      headers: { cookie: `sergod_session=${session}` },
    });
    assert.equal((await auth.sessionUser(request))?.id, customer.id);
  });
});
