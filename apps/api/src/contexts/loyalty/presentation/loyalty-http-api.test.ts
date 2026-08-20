import type { AddressInfo } from 'node:net';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { IdentityAccessError } from '../../identity-access/application/identity-access-service.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createServer } from '../../../presentation/http/create-server.js';
import type { LoyaltyService } from '../application/loyalty-service.js';
import { LoyaltyHttpApi } from './loyalty-http-api.js';

const id = '0198a8be-6677-7000-8000-000000000001';
const service = {
  activateConfiguration: vi
    .fn()
    .mockResolvedValue({ item: { loyaltyConfigurationId: id }, replayed: false }),
  correctAccount: vi
    .fn()
    .mockResolvedValue({ account: { accountId: id }, movementId: id, replayed: false }),
  createConfiguration: vi
    .fn()
    .mockResolvedValue({ item: { loyaltyConfigurationId: id }, replayed: false }),
  editConfiguration: vi
    .fn()
    .mockResolvedValue({ item: { loyaltyConfigurationId: id }, replayed: false }),
  getActiveConfiguration: vi.fn().mockResolvedValue({ loyaltyConfigurationId: id }),
  getAdminAccount: vi.fn().mockResolvedValue({ accountId: id }),
  getConfiguration: vi.fn().mockResolvedValue({ loyaltyConfigurationId: id }),
  getOwnAccount: vi.fn().mockResolvedValue({ accountId: id }),
  listAdminMovements: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listConfigurations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  listOwnMovements: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
};
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId: id } }),
} as unknown as IdentityAccessService;
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(
  new LoyaltyHttpApi(identity, service as unknown as LoyaltyService, logger),
);
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

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer test-token',
      ...(init.body === undefined
        ? {}
        : { 'content-type': 'application/json', 'idempotency-key': 'loyalty-key' }),
      ...init.headers,
    },
  });
}

describe('Loyalty HTTP API', () => {
  it('exposes the approved customer and administrative operations with correlation', async () => {
    const configuration = {
      branchId: id,
      earnClpPerPoint: 1000,
      maximumRedeemBasisPoints: null,
      minimumRedeemPoints: 0,
      redeemClpPerPoint: 100,
    };
    const edit = { ...configuration };
    delete (edit as { branchId?: string }).branchId;
    const calls: readonly [string, RequestInit][] = [
      ['/api/v1/loyalty/account', { method: 'GET' }],
      ['/api/v1/loyalty/movements?limit=10', { method: 'GET' }],
      ['/api/v1/admin/loyalty/configurations?limit=10', { method: 'GET' }],
      [`/api/v1/admin/loyalty/configurations/active?branchId=${id}`, { method: 'GET' }],
      [
        '/api/v1/admin/loyalty/configurations',
        { body: JSON.stringify(configuration), method: 'POST' },
      ],
      [`/api/v1/admin/loyalty/configurations/${id}`, { method: 'GET' }],
      [
        `/api/v1/admin/loyalty/configurations/${id}`,
        { body: JSON.stringify(edit), method: 'PATCH' },
      ],
      [
        `/api/v1/admin/loyalty/configurations/${id}/state-transitions`,
        { body: JSON.stringify({ nextState: 'ACTIVE' }), method: 'POST' },
      ],
      [`/api/v1/admin/loyalty/accounts/${id}`, { method: 'GET' }],
      [`/api/v1/admin/loyalty/accounts/${id}/movements?limit=10`, { method: 'GET' }],
      [
        `/api/v1/admin/loyalty/accounts/${id}/corrections`,
        {
          body: JSON.stringify({ pointsSigned: 4, reason: 'Documented correction' }),
          method: 'POST',
        },
      ],
    ];
    for (const [path, init] of calls) {
      const response = await request(path, init);
      expect(response.status, `${init.method} ${path}`).toBeLessThan(300);
      expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
    }
  });

  it('requires explicit pagination, authentication, Idempotency-Key and strict bodies', async () => {
    expect((await request('/api/v1/loyalty/movements')).status).toBe(422);
    expect((await request('/api/v1/admin/loyalty/configurations?limit=10&secret=x')).status).toBe(
      422,
    );
    expect((await fetch(`${origin}/api/v1/loyalty/account`)).status).toBe(401);
    expect(
      (
        await request(`/api/v1/admin/loyalty/accounts/${id}/corrections`, {
          body: JSON.stringify({ pointsSigned: 2, reason: 'Reason' }),
          headers: { 'idempotency-key': '' },
          method: 'POST',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(`/api/v1/admin/loyalty/accounts/${id}/corrections`, {
          body: JSON.stringify({ orderId: id, pointsSigned: 2, reason: 'Reason' }),
          method: 'POST',
        })
      ).status,
    ).toBe(422);
  });

  it('maps authorization failures without exposing internal details', async () => {
    const deniedIdentity = {
      authorize: vi
        .fn()
        .mockRejectedValue(new IdentityAccessError('ACCESS_DENIED', 403, 'internal detail')),
    } as unknown as IdentityAccessService;
    const deniedServer = createServer(
      new LoyaltyHttpApi(deniedIdentity, service as unknown as LoyaltyService, logger),
    );
    await new Promise<void>((resolve) => deniedServer.listen(0, '127.0.0.1', resolve));
    const deniedOrigin = `http://127.0.0.1:${(deniedServer.address() as AddressInfo).port}`;
    const response = await fetch(`${deniedOrigin}/api/v1/admin/loyalty/configurations?limit=10`, {
      headers: { authorization: 'Bearer test' },
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('internal detail');
    await new Promise<void>((resolve, reject) =>
      deniedServer.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  });
});
