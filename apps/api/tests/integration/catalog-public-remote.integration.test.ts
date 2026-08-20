import { afterAll, describe, expect, it } from 'vitest';

import { createPostgresPool } from '../../src/platform/persistence/postgres.js';

const enabled = process.env.RUN_CATALOG_PUBLIC_REMOTE_ACCEPTANCE === '1';
const pools: ReturnType<typeof createPostgresPool>[] = [];

afterAll(async () => Promise.all(pools.map((pool) => pool.end())).then(() => undefined));

describe.skipIf(!enabled)('Remote public catalog acceptance', () => {
  it('verifies anonymous reads, public projections, query behavior, cache and Data API denial', async () => {
    const apiUrl = requiredEnvironment('CATALOG_PUBLIC_ACCEPTANCE_API_URL').replace(/\/$/u, '');
    const productId = requiredEnvironment('CATALOG_PUBLIC_ACCEPTANCE_PRODUCT_ID');
    const hiddenProductId = requiredEnvironment('CATALOG_PUBLIC_ACCEPTANCE_HIDDEN_PRODUCT_ID');
    const query = requiredEnvironment('CATALOG_PUBLIC_ACCEPTANCE_QUERY');
    const databaseUrl = requiredEnvironment('DATABASE_URL');
    const supabaseUrl = requiredEnvironment('SUPABASE_URL').replace(/\/$/u, '');
    const publishableKey = requiredEnvironment('SUPABASE_PUBLISHABLE_KEY');
    const pool = createPostgresPool(databaseUrl, { max: 2 });
    pools.push(pool);

    for (const path of ['tcg-games', 'categories', 'collections']) {
      const response = await fetch(`${apiUrl}/api/v1/catalog/${path}?limit=100`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('public, no-cache');
      expect(await response.json()).toMatchObject({ items: expect.any(Array) });
    }

    const detailResponse = await fetch(`${apiUrl}/api/v1/catalog/products/${productId}`);
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as { item: PublicProductDetail };
    expect(detail.item.productId).toBe(productId);
    expect(JSON.stringify(detail)).not.toMatch(
      /secureStorageKey|publicationStatus|uploadedBy|sha256|stock|availability/u,
    );
    const etag = detailResponse.headers.get('etag');
    expect(etag).toBeTruthy();
    const unchanged = await fetch(`${apiUrl}/api/v1/catalog/products/${productId}`, {
      headers: { 'if-none-match': etag ?? '' },
    });
    expect(unchanged.status).toBe(304);
    expect(await unchanged.text()).toBe('');

    const hidden = await fetch(`${apiUrl}/api/v1/catalog/products/${hiddenProductId}`);
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toMatchObject({ error: { code: 'CATALOG_ENTITY_NOT_FOUND' } });

    for (const sort of ['NEWEST', 'NAME_ASC', 'PRICE_ASC', 'PRICE_DESC'] as const) {
      const response = await fetch(`${apiUrl}/api/v1/catalog/products?limit=100&sort=${sort}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { items: readonly PublicProductCard[] };
      const expected = await expectedProductIds(pool, sort);
      expect(body.items.map((item) => item.productId)).toEqual(expected);
    }

    const searched = await fetch(
      `${apiUrl}/api/v1/catalog/products?limit=100&q=${encodeURIComponent(query)}`,
    );
    expect(searched.status).toBe(200);
    expect(
      ((await searched.json()) as { items: readonly PublicProductCard[] }).items.map(
        (item) => item.productId,
      ),
    ).toContain(productId);

    const filteredUrl = new URL(`${apiUrl}/api/v1/catalog/products`);
    filteredUrl.searchParams.set('limit', '100');
    filteredUrl.searchParams.set('gameId', detail.item.game.gameId);
    filteredUrl.searchParams.set('categoryId', detail.item.category.categoryId);
    if (detail.item.collection !== null) {
      filteredUrl.searchParams.set('collectionId', detail.item.collection.collectionId);
    }
    if (detail.item.language !== null)
      filteredUrl.searchParams.set('language', detail.item.language);
    if (detail.item.edition !== null) filteredUrl.searchParams.set('edition', detail.item.edition);
    if (detail.item.condition !== null) {
      filteredUrl.searchParams.set('condition', detail.item.condition);
    }
    filteredUrl.searchParams.set('saleType', detail.item.saleType);
    const filtered = await fetch(filteredUrl);
    expect(filtered.status).toBe(200);
    expect(
      ((await filtered.json()) as { items: readonly PublicProductCard[] }).items.map(
        (item) => item.productId,
      ),
    ).toContain(productId);

    for (const [attribute, value] of [
      ['language', detail.item.language],
      ['edition', detail.item.edition],
      ['condition', detail.item.condition],
    ] as const) {
      if (value === null) continue;
      const response = await fetch(
        `${apiUrl}/api/v1/catalog/product-filter-values?attribute=${attribute}&limit=100`,
      );
      expect(response.status).toBe(200);
      expect(
        ((await response.json()) as { items: readonly { value: string }[] }).items.map(
          (item) => item.value,
        ),
      ).toContain(value);
    }

    const firstPage = await fetch(`${apiUrl}/api/v1/catalog/products?limit=1`);
    const firstBody = (await firstPage.json()) as {
      items: readonly PublicProductCard[];
      nextCursor: string | null;
    };
    if (firstBody.nextCursor !== null) {
      const secondPage = await fetch(
        `${apiUrl}/api/v1/catalog/products?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      );
      expect(secondPage.status).toBe(200);
      const secondBody = (await secondPage.json()) as { items: readonly PublicProductCard[] };
      expect(secondBody.items[0]?.productId).not.toBe(firstBody.items[0]?.productId);
    }

    const denied = await fetch(`${supabaseUrl}/rest/v1/products?select=product_id&limit=1`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${publishableKey}` },
    });
    expect(denied.status).not.toBe(200);
  });
});

interface PublicProductCard {
  readonly productId: string;
}

interface PublicProductDetail extends PublicProductCard {
  readonly category: { readonly categoryId: string };
  readonly collection: { readonly collectionId: string } | null;
  readonly condition: string | null;
  readonly edition: string | null;
  readonly game: { readonly gameId: string };
  readonly language: string | null;
  readonly saleType: 'PREORDER' | 'REGULAR';
}

async function expectedProductIds(
  pool: ReturnType<typeof createPostgresPool>,
  sort: 'NAME_ASC' | 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC',
): Promise<readonly string[]> {
  const order =
    sort === 'NEWEST'
      ? 'p.created_at DESC, p.product_id DESC'
      : sort === 'NAME_ASC'
        ? 'public.sergod_catalog_search_normalize(p.name) COLLATE "C" ASC, p.product_id ASC'
        : sort === 'PRICE_ASC'
          ? 'p.price_amount_clp ASC, p.product_id ASC'
          : 'p.price_amount_clp DESC, p.product_id ASC';
  const result = await pool.query<{ product_id: string }>(
    `SELECT p.product_id FROM products p
      JOIN tcg_games g ON g.game_id = p.game_id
      JOIN categories c ON c.category_id = p.category_id
      LEFT JOIN collections co ON co.collection_id = p.collection_id
      JOIN product_media pm ON pm.product_id = p.product_id AND pm.is_primary
      JOIN resource_assets resource ON resource.resource_id = pm.resource_id
        AND resource.state = 'ACTIVE'
      WHERE p.publication_status = 'PUBLISHED' AND g.publication_status = 'PUBLISHED'
        AND c.publication_status = 'PUBLISHED'
        AND (p.collection_id IS NULL OR co.publication_status = 'PUBLISHED')
      ORDER BY ${order} LIMIT 100`,
  );
  return result.rows.map((row) => row.product_id);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for explicitly enabled remote acceptance.`);
  return value;
}
