import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { PaymentService } from '../application/payment-service.js';
import { PaymentHttpApi } from './payment-http-api.js';

const processProviderResult = vi.fn().mockResolvedValue({ item: { status: 'SUCCEEDED' } });
const payments = { processProviderResult } as unknown as PaymentService;
const identity = { authorize: vi.fn() } as unknown as IdentityAccessService;
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(new PaymentHttpApi(identity, payments, logger));
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

describe('Payments HTTP provider routes', () => {
  it('accepts the real Flow return route without customer authentication', async () => {
    const response = await fetch(`${origin}/api/v1/payments/flow/return?token=flow-token`);
    expect(response.status).toBe(200);
    expect(processProviderResult).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'SYSTEM' }),
      'FLOW',
      { mode: 'RETURN', token: 'flow-token' },
    );
  });

  it('accepts Flow confirmation form posts and rejects missing tokens', async () => {
    const accepted = await fetch(`${origin}/api/v1/payments/flow/confirmation`, {
      body: new URLSearchParams({ token: 'callback-token' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });
    expect(accepted.status).toBe(200);
    const rejected = await fetch(`${origin}/api/v1/payments/flow/return`);
    expect(rejected.status).toBe(422);
    await expect(rejected.json()).resolves.toMatchObject({
      error: { code: 'PAYMENT_PROVIDER_TOKEN_REQUIRED' },
    });
  });
});
