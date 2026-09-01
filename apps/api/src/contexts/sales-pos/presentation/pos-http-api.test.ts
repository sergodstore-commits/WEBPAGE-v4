import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { PosService } from '../application/pos-service.js';
import { PosHttpApi } from './pos-http-api.js';

const accountId = '0198c200-0000-7000-8000-000000000001';
const entityId = '0198c200-0000-7000-8000-000000000002';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const service = {
  addLine: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  complete: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  create: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  createMethod: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  daily: vi.fn().mockResolvedValue({ gross_pos_sales_clp: 0 }),
  deleteMethod: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  discard: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  editMethod: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  findSku: vi.fn().mockResolvedValue({ item: { product_id: entityId } }),
  get: vi.fn().mockResolvedValue({ item: { pos_sale_id: entityId }, lines: [], settlements: [] }),
  getMethod: vi.fn().mockResolvedValue({ item: { external_money_method_id: entityId } }),
  list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listMethods: vi.fn().mockResolvedValue({ items: [] }),
  prepare: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  removeLine: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  returnToDraft: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  setBuyer: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  setCoupon: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  setLoyalty: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  transitionMethod: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
  updateLine: vi.fn().mockResolvedValue({ id: entityId, replayed: false }),
};
const server = createServer(new PosHttpApi(identity, service as unknown as PosService));
let origin: string;

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(
  async () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    ),
);

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

describe('POS administrative HTTP API', () => {
  it('exposes the bounded administrative workflow with correlation and no-store', async () => {
    const calls: readonly [string, RequestInit][] = [
      ['/api/v1/admin/pos/products/by-sku?sku=SKU-1', { method: 'GET' }],
      ['/api/v1/admin/pos/sales?limit=25', { method: 'GET' }],
      [
        '/api/v1/admin/pos/sales',
        { body: JSON.stringify({ branchId: entityId, saleType: 'REGULAR' }), method: 'POST' },
      ],
      [`/api/v1/admin/pos/sales/${entityId}`, { method: 'GET' }],
      [
        `/api/v1/admin/pos/sales/${entityId}/lines`,
        { body: JSON.stringify({ productId: entityId, quantity: 1 }), method: 'POST' },
      ],
      [
        `/api/v1/admin/pos/sales/${entityId}/lines/${entityId}`,
        { body: JSON.stringify({ quantity: 2 }), method: 'PATCH' },
      ],
      [
        `/api/v1/admin/pos/sales/${entityId}/lines/${entityId}`,
        { method: 'DELETE', headers: { 'idempotency-key': crypto.randomUUID() } },
      ],
      [
        `/api/v1/admin/pos/sales/${entityId}/buyer`,
        {
          body: JSON.stringify({
            accountId: null,
            buyerName: null,
            buyerEmail: null,
            buyerPhone: null,
            delivery: null,
          }),
          method: 'POST',
        },
      ],
      [
        `/api/v1/admin/pos/sales/${entityId}/coupon`,
        { body: JSON.stringify({ couponCode: null }), method: 'POST' },
      ],
      [
        `/api/v1/admin/pos/sales/${entityId}/loyalty`,
        { body: JSON.stringify({ points: 0 }), method: 'POST' },
      ],
      [`/api/v1/admin/pos/sales/${entityId}/prepare`, { body: '{}', method: 'POST' }],
      [
        `/api/v1/admin/pos/sales/${entityId}/return-to-draft`,
        { body: JSON.stringify({ reason: 'Correction' }), method: 'POST' },
      ],
      [`/api/v1/admin/pos/sales/${entityId}/complete`, { body: '{}', method: 'POST' }],
      [
        `/api/v1/admin/pos/sales/${entityId}/discard`,
        { body: JSON.stringify({ reason: 'Unused' }), method: 'POST' },
      ],
      ['/api/v1/admin/pos/external-money-methods', { method: 'GET' }],
      [
        '/api/v1/admin/pos/external-money-methods',
        {
          body: JSON.stringify({
            code: 'CASH',
            name: 'Cash',
            description: null,
            publicInstructions: null,
          }),
          method: 'POST',
        },
      ],
      [`/api/v1/admin/pos/external-money-methods/${entityId}`, { method: 'GET' }],
      [
        `/api/v1/admin/pos/external-money-methods/${entityId}`,
        {
          body: JSON.stringify({
            name: 'Edited',
            description: null,
            publicInstructions: null,
          }),
          method: 'PATCH',
        },
      ],
      [
        `/api/v1/admin/pos/external-money-methods/${entityId}/state-transitions`,
        { body: JSON.stringify({ nextState: 'ACTIVE', reason: 'Approved' }), method: 'POST' },
      ],
      [
        `/api/v1/admin/pos/external-money-methods/${entityId}`,
        { method: 'DELETE', headers: { 'idempotency-key': crypto.randomUUID() } },
      ],
      [`/api/v1/admin/pos/daily-summary?branchId=${entityId}&date=2026-08-11`, { method: 'GET' }],
    ];
    for (const [path, init] of calls) {
      const response = await request(path, init);
      expect(response.status, `${init.method} ${path}`).not.toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
    }
  });

  it('requires Admin authorization, Idempotency-Key and strict contracts', async () => {
    const deniedIdentity = {
      authorize: vi
        .fn()
        .mockRejectedValue(new IdentityAccessError('AUTHENTICATION_REQUIRED', 401, 'denied')),
    } as unknown as IdentityAccessService;
    const denied = createServer(new PosHttpApi(deniedIdentity, service as unknown as PosService));
    await new Promise<void>((resolve) => denied.listen(0, '127.0.0.1', resolve));
    try {
      const address = denied.address() as AddressInfo;
      expect(
        (await fetch(`http://127.0.0.1:${address.port}/api/v1/admin/pos/sales?limit=10`)).status,
      ).toBe(401);
    } finally {
      await new Promise<void>((resolve) => denied.close(() => resolve()));
    }
    expect(
      (
        await fetch(`${origin}/api/v1/admin/pos/sales`, {
          body: JSON.stringify({ branchId: entityId, saleType: 'REGULAR' }),
          headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
          method: 'POST',
        })
      ).status,
    ).toBe(422);
    expect((await request('/api/v1/admin/pos/sales?limit=0', { method: 'GET' })).status).toBe(422);
    const card = await request(`/api/v1/admin/pos/sales/${entityId}/complete`, {
      body: JSON.stringify({
        amountClp: 100,
        externalMoneyMethodId: entityId,
        cardNumber: '4111111111111111',
      }),
      method: 'POST',
    });
    expect(card.status).toBe(422);
    expect(service.complete).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cardNumber: expect.anything() }),
    );
    const invalidDelivery = await request(`/api/v1/admin/pos/sales/${entityId}/buyer`, {
      body: JSON.stringify({
        accountId: null,
        buyerEmail: 'buyer@example.test',
        buyerName: 'Buyer',
        buyerPhone: null,
        delivery: {
          address: 'Domicilio no permitido',
          commune: 'Copiapó',
          mode: 'SHIPPING',
          recipientName: 'Buyer',
        },
      }),
      method: 'POST',
    });
    expect(invalidDelivery.status).toBe(422);
    expect(service.setBuyer).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        delivery: expect.objectContaining({ address: expect.anything() }),
      }),
    );
  });
});
