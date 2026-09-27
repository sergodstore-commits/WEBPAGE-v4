import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

// All catalog and commerce checks use an isolated local database, never production.
const testRoot = path.resolve('.data');
const testDirectory = path.join(testRoot, `test-catalog-${randomUUID()}`);
process.env.LOCAL_DATA_DIR = testDirectory;
delete process.env.DATABASE_URL;
delete process.env.VERCEL;
delete process.env.SMTP_HOST;
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_SCHEMA: 'public',
  APP_URL: 'http://localhost:3000',
  FLOW_ENV: 'sandbox',
});

test('Catálogo con variantes · persistencia y existencias por SKU', async (t) => {
  await mkdir(testDirectory, { recursive: true });
  const { getDb, closeDb } = await import('../lib/server/db');
  const catalog = await import('../lib/server/catalog');
  const commerce = await import('../lib/server/commerce');
  let db = await getDb();
  t.after(async () => {
    await closeDb();
    const relative = path.relative(testRoot, path.resolve(testDirectory));
    if (
      !relative.startsWith('test-catalog-') ||
      relative.includes(path.sep) ||
      path.isAbsolute(relative)
    )
      throw new Error('La limpieza solo puede afectar el directorio aislado de esta prueba.');
    await rm(testDirectory, { recursive: true, force: true });
  });
  async function user(role: 'admin' | 'customer') {
    const id = randomUUID();
    return (
      await db.query(
        'INSERT INTO users(id,email,password_hash,name,role,email_verified) VALUES($1,$2,$3,$4,$5,true) RETURNING *',
        [id, `${id}@example.test`, 'not-a-login-password', 'Usuario de prueba', role],
      )
    ).rows[0];
  }
  const admin = await user('admin');
  const customer = await user('customer');
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
    address: 'Local de prueba, Copiapó',
    hours: 'Horario de prueba',
  });
  const metadata = {
    catalog_group: 'test-fortuna-matte',
    catalog_name: 'Fundas Fortuna Matte',
    brand: 'Fortuna',
    options: { Formato: 'Japonés', Color: 'Rojo' },
    tags: ['Fundas', 'Yu-Gi-Oh!'],
    specifications: [
      { label: 'Cantidad', value: '60 fundas' },
      { label: 'Terminación', value: 'Mate' },
    ],
    source_url: 'https://example.test/catalogo/fundas/',
  };
  const input = (overrides: Record<string, unknown> = {}) => ({
    name: 'Fundas rojas japonesas',
    description: 'Fundas de prueba con inventario independiente.',
    sku: `CATALOG-${randomUUID()}`,
    category: 'Accesorios',
    price: 5000,
    stock: 0,
    kind: 'store',
    images: [imageUrl],
    ...overrides,
  });
  const make = async (overrides: Record<string, unknown> = {}, publish = true) => {
    const product = await catalog.saveProduct(admin, input(overrides));
    return publish ? catalog.publishProduct(product.id) : product;
  };

  await t.test('un artículo sin metadatos conserva valores vacíos compatibles', async () => {
    const product = await make({ stock: 7 });
    assert.deepEqual(
      {
        catalog_group: product.catalog_group,
        catalog_name: product.catalog_name,
        brand: product.brand,
        options: product.options,
        tags: product.tags,
        specifications: product.specifications,
        source_url: product.source_url,
      },
      {
        catalog_group: '',
        catalog_name: '',
        brand: '',
        options: {},
        tags: [],
        specifications: [],
        source_url: '',
      },
    );
    assert.equal(product.stock, 7);
    assert.equal(product.reserved, 0);
  });

  await t.test(
    'crear, publicar con stock cero y reabrir conserva opciones, ficha e imágenes',
    async () => {
      const product = await make(metadata);
      assert.equal(product.status, 'published');
      assert.equal(product.available, 0);
      await closeDb();
      db = await getDb();
      const reread = await catalog.getProduct(product.slug);
      for (const key of Object.keys(metadata) as (keyof typeof metadata)[])
        assert.deepEqual(reread[key], metadata[key]);
      assert.deepEqual(reread.images, [imageUrl]);
      await assert.rejects(
        () =>
          commerce.reserveOrder(customer, {
            items: [{ product_id: product.id, quantity: 1 }],
            delivery: { method: 'pickup' },
            idempotency_key: randomUUID(),
          }),
        { status: 409 },
      );
    },
  );

  await t.test(
    'editar desde un formulario antiguo conserva metadatos y vaciarlos explícitamente los elimina',
    async () => {
      const product = await make(metadata);
      const edited = await catalog.saveProduct(
        admin,
        input({
          sku: product.sku,
          stock: 4,
          name: 'Nombre editado',
          version: product.version,
        }),
        product.id,
      );
      for (const key of Object.keys(metadata) as (keyof typeof metadata)[])
        assert.deepEqual(edited[key], metadata[key]);
      assert.equal(edited.stock, 4);
      const cleared = await catalog.saveProduct(
        admin,
        {
          ...edited,
          catalog_group: '',
          catalog_name: '',
          brand: '',
          options: {},
          tags: [],
          specifications: [],
          source_url: '',
        },
        product.id,
      );
      assert.equal(cleared.catalog_group, '');
      assert.equal(cleared.catalog_name, '');
      assert.equal(cleared.brand, '');
      assert.deepEqual(cleared.options, {});
      assert.deepEqual(cleared.tags, []);
      assert.deepEqual(cleared.specifications, []);
      assert.equal(cleared.source_url, '');
    },
  );

  await t.test(
    'publicar con una versión antigua no publica cambios o retiros del administrador',
    async () => {
      const draft = await make(metadata, false);
      const edited = await catalog.saveProduct(
        admin,
        {
          ...draft,
          name: 'Cambio pendiente de revisión',
          price: 6500,
          stock: 3,
        },
        draft.id,
      );
      await assert.rejects(() => catalog.publishProduct(draft.id, draft.version), { status: 409 });
      const stillDraft = await catalog.getProduct(draft.id, true);
      assert.equal(stillDraft.status, 'draft');
      assert.equal(stillDraft.price, 6500);
      assert.equal(stillDraft.stock, 3);
      assert.equal(stillDraft.version, edited.version);
      const published = await catalog.publishProduct(draft.id, edited.version);
      assert.equal(published.status, 'published');
      const withdrawn = await catalog.withdrawProduct(draft.id);
      await assert.rejects(() => catalog.publishProduct(draft.id, published.version), {
        status: 409,
      });
      const stillWithdrawn = await catalog.getProduct(draft.id, true);
      assert.equal(stillWithdrawn.status, 'withdrawn');
      assert.equal(stillWithdrawn.version, withdrawn.version);
      // Existing editors that send {} still deliberately publish the current article.
      assert.equal((await catalog.publishProduct(draft.id)).status, 'published');
    },
  );

  await t.test(
    'grupo, marca, etiqueta y búsqueda filtran variantes sin exponer borradores o retirados',
    async () => {
      const family = {
        ...metadata,
        catalog_group: 'test-search-family',
        catalog_name: 'Familia Buscable',
        brand: 'Marca buscable',
        tags: ['Etiqueta de búsqueda'],
      };
      const visible = await make({ ...family, options: { Diseño: 'Nebulosa' } });
      const draft = await make(family, false);
      const withdrawn = await make(family);
      await catalog.withdrawProduct(withdrawn.id);
      const filters: Record<string, string>[] = [
        { group: family.catalog_group },
        { brand: family.brand },
        { tag: family.tags[0] },
        { q: 'Nebulosa' },
        { q: 'Familia Buscable' },
        { q: 'Etiqueta de búsqueda' },
      ];
      for (const filter of filters) {
        const found = await catalog.getProducts(false, new URLSearchParams(filter));
        assert.deepEqual(
          found.map((p) => p.id),
          [visible.id],
        );
      }
      const administrative = await catalog.getProducts(
        true,
        new URLSearchParams({ group: family.catalog_group }),
      );
      assert.deepEqual(
        new Set(administrative.map((p) => p.id)),
        new Set([visible.id, draft.id, withdrawn.id]),
      );
      assert.deepEqual(
        await catalog.getProducts(false, new URLSearchParams({ tag: 'Etiqueta' })),
        [],
      );
    },
  );

  await t.test(
    'el servidor rechaza grupos incompletos, URL peligrosa y metadatos fuera de límite',
    async () => {
      const invalid = [
        { catalog_group: 'solo-grupo' },
        { catalog_name: 'Solo nombre' },
        { catalog_group: 'No es slug', catalog_name: 'Nombre' },
        { catalog_group: 'a'.repeat(121), catalog_name: 'Nombre' },
        { catalog_group: 'grupo', catalog_name: 'a'.repeat(181) },
        { brand: 'a'.repeat(101) },
        { source_url: 'javascript:alert(1)' },
        { source_url: 'no-es-url' },
        { options: { Color: '' } },
        {
          options: Object.fromEntries(
            Array.from({ length: 7 }, (_, i) => [`Opción ${i}`, 'Valor']),
          ),
        },
        { tags: Array.from({ length: 31 }, () => 'Etiqueta') },
        { specifications: [{ label: '', value: 'Valor' }] },
      ];
      const before = (await db.query('SELECT count(*)::int AS n FROM products')).rows[0].n;
      for (const value of invalid)
        await assert.rejects(() => catalog.saveProduct(admin, input(value)));
      assert.equal((await db.query('SELECT count(*)::int AS n FROM products')).rows[0].n, before);
      const existing = await make(metadata);
      await assert.rejects(
        () => catalog.saveProduct(admin, { ...existing, catalog_group: '' }, existing.id),
        { status: 400 },
      );
      assert.equal((await catalog.getProduct(existing.slug)).catalog_group, metadata.catalog_group);
    },
  );

  await t.test(
    'reservar una variante y vender otra en POS conserva stock y precio de cada SKU',
    async () => {
      const red = await make({
        ...metadata,
        catalog_group: 'test-separate-stock',
        stock: 3,
        price: 5000,
      });
      const blue = await make({
        ...metadata,
        catalog_group: 'test-separate-stock',
        options: { Formato: 'Japonés', Color: 'Azul' },
        stock: 2,
        price: 7000,
      });
      const reserved = await commerce.reserveOrder(customer, {
        items: [{ product_id: red.id, quantity: 2 }],
        delivery: { method: 'pickup' },
        idempotency_key: randomUUID(),
      });
      const sale = await commerce.completePos(admin, {
        items: [{ product_id: blue.id, quantity: 1 }],
        payment_method: 'cash',
        cash_received: 10000,
        idempotency_key: randomUUID(),
      });
      assert.equal(reserved.total, 10000);
      assert.equal(reserved.items[0].sku, red.sku);
      assert.equal(sale.total, 7000);
      assert.equal(sale.items[0].sku, blue.sku);
      const redRead = await catalog.getProduct(red.slug);
      const blueRead = await catalog.getProduct(blue.slug);
      assert.deepEqual([redRead.stock, redRead.reserved, redRead.available], [3, 2, 1]);
      assert.deepEqual([blueRead.stock, blueRead.reserved, blueRead.available], [1, 0, 1]);
      await assert.rejects(
        () =>
          commerce.reserveOrder(customer, {
            items: [{ product_id: blue.id, quantity: 2 }],
            delivery: { method: 'pickup' },
            idempotency_key: randomUUID(),
          }),
        { status: 409 },
      );
      assert.equal((await catalog.getProduct(red.slug)).available, 1);
    },
  );
});
