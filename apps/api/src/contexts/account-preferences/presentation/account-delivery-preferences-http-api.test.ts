import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { AccountDeliveryPreferencesService } from '../application/account-delivery-preferences-service.js';
import { AccountDeliveryPreferencesHttpApi } from './account-delivery-preferences-http-api.js';

const accountId = '0198a8be-6677-7000-8000-000000000001';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const preferences = {
  get: vi.fn().mockResolvedValue({ item: null }),
  save: vi.fn().mockResolvedValue({ item: { defaultMode: 'FREIGHT_COLLECT' } }),
} as unknown as AccountDeliveryPreferencesService;
const server = createServer(new AccountDeliveryPreferencesHttpApi(identity, preferences));
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

describe('Account delivery preferences HTTP API', () => {
  it('reads the authenticated account preferences', async () => {
    const response = await fetch(`${origin}/api/v1/account/delivery-preferences`, {
      headers: { authorization: 'Bearer account-token' },
    });
    expect(response.status).toBe(200);
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'account-token',
      capability: { kind: 'ACCOUNT_SELF' },
    });
    expect(preferences.get).toHaveBeenCalledWith(accountId);
  });

  it('validates and persists FREIGHT_COLLECT without an address or charged shipping', async () => {
    const body = {
      agencyDestination: 'Sucursal Centro',
      carrier: 'STARKEN',
      destinationCommune: null,
      recipientName: 'Buyer',
      recipientPhone: '+56911111111',
    };
    const response = await fetch(`${origin}/api/v1/account/delivery-preferences`, {
      body: JSON.stringify(body),
      headers: { authorization: 'Bearer account-token', 'content-type': 'application/json' },
      method: 'PUT',
    });
    expect(response.status).toBe(200);
    expect(preferences.save).toHaveBeenCalledWith(accountId, body);
  });
});
