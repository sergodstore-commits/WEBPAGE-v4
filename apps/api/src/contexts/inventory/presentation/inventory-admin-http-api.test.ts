import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { InventoryAdminService } from '../application/inventory-admin-service.js';
import { InventoryError } from '../domain/inventory.js';
import { InventoryAdminHttpApi } from './inventory-admin-http-api.js';

const productId = '0198a8be-6677-7000-8000-000000000001';
const accountId = '0198a8be-6677-7000-8000-000000000002';
const position = {
  available: 3,
  branchId: '0198a8be-6677-7000-8000-000000000003',
  effectiveLowStockThreshold: 2,
  inventoryPositionId: '0198a8be-6677-7000-8000-000000000004',
  lowStock: false,
  lowStockThresholdOverride: null,
  onHand: 4,
  productId,
  reserved: 1,
  thresholdSource: 'GLOBAL',
  updatedAt: '2026-08-08T12:00:00.000Z',
  version: 2,
} as const;

const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const inventory = {
  adjust: vi.fn().mockResolvedValue({ movementId: crypto.randomUUID(), position, replayed: false }),
  getPosition: vi.fn().mockResolvedValue(position),
  listMovements: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  registerStockEntry: vi
    .fn()
    .mockResolvedValue({ movementId: crypto.randomUUID(), position, replayed: false }),
  setThresholdOverride: vi.fn().mockResolvedValue({ position, replayed: false }),
};
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(
  new InventoryAdminHttpApi(identity, inventory as unknown as InventoryAdminService, logger),
);
let origin: string;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
});

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-token',
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }),
      ...init.headers,
    },
  });
}

describe('Inventory administrative HTTP API', () => {
  it('exposes only position, movement history, entry, adjustment and threshold override operations', async () => {
    const calls: readonly [string, RequestInit][] = [
      [`/api/v1/admin/inventory/products/${productId}`, { method: 'GET' }],
      [`/api/v1/admin/inventory/products/${productId}/movements?limit=10`, { method: 'GET' }],
      [
        `/api/v1/admin/inventory/products/${productId}/stock-entries`,
        {
          body: JSON.stringify({ quantity: 2, reason: 'Ingreso', reference: null }),
          method: 'POST',
        },
      ],
      [
        `/api/v1/admin/inventory/products/${productId}/adjustments`,
        {
          body: JSON.stringify({
            direction: 'NEGATIVE',
            investigationReference: 'INV-1',
            quantity: 1,
            reason: 'Corrección',
          }),
          method: 'POST',
        },
      ],
      [
        `/api/v1/admin/inventory/products/${productId}/low-stock-threshold-override`,
        { body: JSON.stringify({ lowStockThresholdOverride: 0 }), method: 'PUT' },
      ],
    ];
    for (const [path, init] of calls) {
      const response = await request(path, init);
      expect(response.status, `${init.method} ${path}`).not.toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
    }
    expect(inventory.adjust).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: accountId }),
      productId,
      expect.not.objectContaining({ actorId: expect.anything() }),
    );
  });

  it('requires authentication and Idempotency-Key and rejects uncontrolled movement payloads', async () => {
    let response = await fetch(`${origin}/api/v1/admin/inventory/products/${productId}`);
    expect(response.status).toBe(401);

    response = await fetch(`${origin}/api/v1/admin/inventory/products/${productId}/stock-entries`, {
      body: JSON.stringify({ quantity: 1, reason: 'Ingreso', reference: null }),
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(422);

    response = await request(`/api/v1/admin/inventory/products/${productId}/adjustments`, {
      body: JSON.stringify({
        actorId: accountId,
        direction: 'POSITIVE',
        investigationReference: 'INV-2',
        movementType: 'STOCK_CONSUMED',
        quantity: 1,
        reason: 'Inválido',
      }),
      method: 'POST',
    });
    expect(response.status).toBe(422);
  });

  it('maps identity and inventory failures to closed correlated errors without leaking internals', async () => {
    vi.mocked(identity.authorize).mockRejectedValueOnce(
      new IdentityAccessError('ACCESS_DENIED', 403, 'provider secret detail'),
    );
    let response = await request(`/api/v1/admin/inventory/products/${productId}`);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('provider secret');

    inventory.adjust.mockRejectedValueOnce(
      new InventoryError('INVENTORY_INSUFFICIENT_AVAILABLE', 'CONFLICT', 'table internal detail'),
    );
    response = await request(`/api/v1/admin/inventory/products/${productId}/adjustments`, {
      body: JSON.stringify({
        direction: 'NEGATIVE',
        investigationReference: 'INV-3',
        quantity: 10,
        reason: 'Corrección',
      }),
      method: 'POST',
    });
    const text = await response.text();
    expect(response.status).toBe(409);
    expect(text).toContain('STATE_CONFLICT');
    expect(text).not.toContain('table internal');
  });
});
