import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { PreordersAdminService } from '../application/preorders-admin-service.js';
import { PreordersAdminHttpApi } from './preorders-admin-http-api.js';

const accountId = '0198b222-0000-7000-8000-000000000001';
const campaignId = '0198b222-0000-7000-8000-000000000002';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const preorders = {
  createCampaign: vi
    .fn()
    .mockResolvedValue({ item: { preorderCampaignId: campaignId }, replayed: false }),
  editCampaign: vi
    .fn()
    .mockResolvedValue({ item: { preorderCampaignId: campaignId }, replayed: false }),
  getCampaign: vi.fn().mockResolvedValue({ preorderCampaignId: campaignId }),
  listCampaigns: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  transitionOperational: vi.fn().mockResolvedValue({ item: {}, replayed: false }),
  transitionPublication: vi.fn().mockResolvedValue({ item: {}, replayed: false }),
};
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(
  new PreordersAdminHttpApi(identity, preorders as unknown as PreordersAdminService, logger),
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

describe('Preorders administrative HTTP API', () => {
  it('exposes only campaign administration operations', async () => {
    const campaign = {
      branchId: crypto.randomUUID(),
      capacity: 10,
      closesAt: '2026-08-11T12:00:00.000Z',
      estimatedArrivalText: 'Octubre 2026',
      fulfillmentGroupKey: null,
      opensAt: '2026-08-10T12:00:00.000Z',
      productId: crypto.randomUUID(),
    };
    const calls: readonly [string, RequestInit][] = [
      ['/api/v1/admin/preorders/campaigns?limit=10', { method: 'GET' }],
      ['/api/v1/admin/preorders/campaigns', { body: JSON.stringify(campaign), method: 'POST' }],
      [`/api/v1/admin/preorders/campaigns/${campaignId}`, { method: 'GET' }],
      [
        `/api/v1/admin/preorders/campaigns/${campaignId}`,
        { body: JSON.stringify(campaign), method: 'PATCH' },
      ],
      [
        `/api/v1/admin/preorders/campaigns/${campaignId}/operational-transitions`,
        { body: JSON.stringify({ nextState: 'SCHEDULED', reason: null }), method: 'POST' },
      ],
      [
        `/api/v1/admin/preorders/campaigns/${campaignId}/publication-transitions`,
        { body: JSON.stringify({ nextStatus: 'PUBLISHED', reason: null }), method: 'POST' },
      ],
    ];
    for (const [path, init] of calls) {
      const response = await request(path, init);
      expect(response.status, `${init.method} ${path}`).not.toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
    }
  });

  it('requires authentication, bounded queries and Idempotency-Key for mutations', async () => {
    expect((await fetch(`${origin}/api/v1/admin/preorders/campaigns?limit=10`)).status).toBe(401);
    expect(
      (await request('/api/v1/admin/preorders/campaigns?limit=0', { method: 'GET' })).status,
    ).toBe(422);
    const response = await fetch(`${origin}/api/v1/admin/preorders/campaigns`, {
      body: JSON.stringify({
        branchId: crypto.randomUUID(),
        capacity: 10,
        closesAt: '2026-08-11T12:00:00.000Z',
        estimatedArrivalText: 'Octubre 2026',
        fulfillmentGroupKey: null,
        opensAt: '2026-08-10T12:00:00.000Z',
        productId: crypto.randomUUID(),
      }),
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(422);
  });
});
