import { describe, expect, it } from 'vitest';

const enabled = process.env.RUN_INVENTORY_REMOTE_ACCEPTANCE === '1';
const describeRemote = enabled ? describe : describe.skip;

describeRemote('remote regular inventory acceptance', () => {
  it('verifies authenticated position, idempotent entry, corrections and public availability', async () => {
    const origin = requiredEnvironment('INVENTORY_ACCEPTANCE_API_URL').replace(/\/+$/u, '');
    const token = requiredEnvironment('INVENTORY_ACCEPTANCE_ADMIN_ACCESS_TOKEN');
    const productId = requiredEnvironment('INVENTORY_ACCEPTANCE_REGULAR_PRODUCT_ID');
    const suffix = crypto.randomUUID();

    const unauthenticated = await fetch(
      `${origin}/api/v1/admin/inventory/products/${encodeURIComponent(productId)}`,
    );
    expect(unauthenticated.status).toBe(401);

    const initial = await adminRequest(origin, token, productId, '', { method: 'GET' });
    expect(initial.status).toBe(200);
    const initialBody = (await initial.json()) as { item: { onHand: number; reserved: number } };

    const entryBody = { quantity: 2, reason: 'Aceptación remota aislada', reference: suffix };
    const entryKey = `inventory-acceptance-entry-${suffix}`;
    const entry = await adminRequest(origin, token, productId, '/stock-entries', {
      body: JSON.stringify(entryBody),
      headers: mutationHeaders(entryKey),
      method: 'POST',
    });
    expect(entry.status).toBe(201);
    const entryResult = (await entry.json()) as { movementId: string; replayed: boolean };
    expect(entryResult.replayed).toBe(false);

    const replay = await adminRequest(origin, token, productId, '/stock-entries', {
      body: JSON.stringify(entryBody),
      headers: mutationHeaders(entryKey),
      method: 'POST',
    });
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({
      movementId: entryResult.movementId,
      replayed: true,
    });

    const negative = await adminRequest(origin, token, productId, '/adjustments', {
      body: JSON.stringify({
        direction: 'NEGATIVE',
        investigationReference: suffix,
        quantity: 2,
        reason: 'Reversión de aceptación remota aislada',
      }),
      headers: mutationHeaders(`inventory-acceptance-adjustment-${suffix}`),
      method: 'POST',
    });
    expect(negative.status).toBe(201);

    const finalPosition = await adminRequest(origin, token, productId, '', { method: 'GET' });
    expect(finalPosition.status).toBe(200);
    await expect(finalPosition.json()).resolves.toMatchObject({
      item: { onHand: initialBody.item.onHand, reserved: initialBody.item.reserved },
    });

    const history = await adminRequest(origin, token, productId, '/movements?limit=100', {
      method: 'GET',
    });
    expect(history.status).toBe(200);
    const historyBody = (await history.json()) as {
      items: readonly { reference: string | null }[];
    };
    expect(historyBody.items.filter((movement) => movement.reference === suffix)).toHaveLength(2);

    const publicProduct = await fetch(
      `${origin}/api/v1/catalog/products/${encodeURIComponent(productId)}`,
    );
    expect(publicProduct.status).toBe(200);
    await expect(publicProduct.json()).resolves.toMatchObject({
      item: { availableForPurchase: expect.any(Boolean), productId },
    });
  });
});

function adminRequest(
  origin: string,
  token: string,
  productId: string,
  suffix: string,
  init: RequestInit,
) {
  return fetch(
    `${origin}/api/v1/admin/inventory/products/${encodeURIComponent(productId)}${suffix}`,
    {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...init.headers },
    },
  );
}

function mutationHeaders(idempotencyKey: string): Record<string, string> {
  return { 'content-type': 'application/json', 'idempotency-key': idempotencyKey };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required remote inventory acceptance setting: ${name}`);
  return value;
}
