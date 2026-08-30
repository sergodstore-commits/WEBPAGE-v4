import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { PaymentService } from '../application/payment-service.js';
import { PaymentError } from '../domain/payment.js';
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

  it('commits a normal Webpay return and reconciles an abnormal TBK_TOKEN return', async () => {
    const normal = await fetch(`${origin}/api/v1/payments/webpay/return?token_ws=normal-token`);
    expect(normal.status).toBe(200);
    expect(processProviderResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorType: 'SYSTEM' }),
      'WEBPAY',
      { mode: 'RETURN', token: 'normal-token' },
    );

    const abnormal = await fetch(`${origin}/api/v1/payments/webpay/return`, {
      body: new URLSearchParams({ TBK_ID_SESION: 'session', TBK_TOKEN: 'aborted-token' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });
    expect(abnormal.status).toBe(200);
    expect(processProviderResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorType: 'SYSTEM' }),
      'WEBPAY',
      { mode: 'RECONCILE', token: 'aborted-token' },
    );
  });

  it('logs the deepest controlled payment diagnostic without returning it to the client', async () => {
    processProviderResult.mockRejectedValueOnce(
      new PaymentError(
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'INFRASTRUCTURE',
        'Payment provider session could not be created.',
        {
          cause: new PaymentError(
            'PAYMENT_PROVIDER_UNAVAILABLE',
            'INFRASTRUCTURE',
            'Provider returned HTTP 400.',
          ),
        },
      ),
    );

    const response = await fetch(`${origin}/api/v1/payments/flow/return?token=opaque-token`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        message: 'Payment request could not be completed.',
      },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnostic: 'Provider returned HTTP 400.',
        error: 'PAYMENT_PROVIDER_UNAVAILABLE',
        operation: 'payments',
      }),
      'Payment request failed.',
    );
  });

  it('reduces provider network failures to an allowlisted diagnostic code', async () => {
    const networkCause = Object.assign(new Error('private transport detail'), {
      code: 'ETIMEDOUT',
    });
    processProviderResult.mockRejectedValueOnce(
      new PaymentError(
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'INFRASTRUCTURE',
        'Payment provider session could not be created.',
        { cause: new TypeError('fetch failed', { cause: networkCause }) },
      ),
    );

    const response = await fetch(`${origin}/api/v1/payments/flow/return?token=opaque-token`);

    expect(response.status).toBe(503);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ diagnostic: 'Provider network error ETIMEDOUT.' }),
      'Payment request failed.',
    );
  });
});
