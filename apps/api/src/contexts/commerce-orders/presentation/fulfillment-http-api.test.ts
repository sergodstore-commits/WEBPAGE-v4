import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { FulfillmentService } from '../application/fulfillment-service.js';
import { FulfillmentHttpApi } from './fulfillment-http-api.js';

const accountId = '0198a8be-6677-7000-8000-000000000001';
const fulfillmentId = '0198a8be-6677-7000-8000-000000000010';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const fulfillment = {
  transition: vi.fn().mockResolvedValue({ item: { status: 'PREPARING' } }),
} as unknown as FulfillmentService;
const server = createServer(new FulfillmentHttpApi(identity, fulfillment));
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
beforeEach(() => vi.clearAllMocks());

describe('Fulfillment HTTP API', () => {
  it('requires ADMIN and forwards a validated transition', async () => {
    const response = await fetch(
      `${origin}/api/v1/admin/fulfillments/${fulfillmentId}/transitions`,
      {
        body: JSON.stringify({ toStatus: 'PREPARING' }),
        headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    expect(response.status).toBe(200);
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'admin-token',
      capability: { kind: 'ADMIN' },
    });
    expect(fulfillment.transition).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: accountId }),
      fulfillmentId,
      { toStatus: 'PREPARING' },
    );
  });

  it('rejects invalid fulfillment identifiers before service access', async () => {
    const response = await fetch(`${origin}/api/v1/admin/fulfillments/not-a-uuid/transitions`, {
      body: JSON.stringify({ toStatus: 'PREPARING' }),
      headers: { authorization: 'Bearer admin-token', 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(response.status).toBe(422);
    expect(fulfillment.transition).not.toHaveBeenCalled();
  });
});
