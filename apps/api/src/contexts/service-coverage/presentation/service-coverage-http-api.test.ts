import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { ServiceCoverageService } from '../application/service-coverage-service.js';
import { ServiceCoverageHttpApi } from './service-coverage-http-api.js';

const accountId = '0198c300-0000-7000-8000-000000000001';
const resourceId = '0198c300-0000-7000-8000-000000000002';
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId } }),
} as unknown as IdentityAccessService;
const service = {
  list: vi.fn().mockResolvedValue({
    nationwideShipping: {
      carriers: ['CHILEXPRESS', 'STARKEN'],
      coverage: 'NATIONWIDE_CHILE',
      destinationType: 'CARRIER_AGENCY',
      mode: 'SHIPPING',
      shippingCostAmountClp: 0,
      shippingIncludedInOrderTotal: false,
      shippingLabel: 'NO INCLUIDO — ENVÍO POR PAGAR',
      shippingPaymentMode: 'FREIGHT_COLLECT',
    },
    serviceInfo: [],
  }),
  publicStore: vi.fn().mockResolvedValue({
    item: {
      branchId: '0198c300-0000-7000-8000-000000000003',
      name: 'Sergod Store',
      openingHours: 'Lunes a sábado',
      publicAddress: 'Av. Principal 123',
      publicContacts: '+56 9 1234 5678',
    },
  }),
  saveInfo: vi.fn().mockResolvedValue({ id: resourceId, replayed: false }),
  transitionInfo: vi.fn().mockResolvedValue({ id: resourceId, replayed: false }),
};
const logger = { error: vi.fn() };
const server = createServer(
  new ServiceCoverageHttpApi(identity, service as unknown as ServiceCoverageService, logger),
);
let origin: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => vi.clearAllMocks());
afterAll(
  async () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    ),
);

describe('Service coverage administrative HTTP API', () => {
  it('publishes only the configured store information without requiring a session', async () => {
    const response = await fetch(`${origin}/api/v1/service-coverage/store`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      item: {
        name: 'Sergod Store',
        openingHours: 'Lunes a sábado',
        publicAddress: 'Av. Principal 123',
      },
    });
    expect(identity.authorize).not.toHaveBeenCalled();
  });

  it('requires authentication and Idempotency-Key before administrative mutation', async () => {
    const denied = createServer(
      new ServiceCoverageHttpApi(
        {
          authorize: vi
            .fn()
            .mockRejectedValue(new IdentityAccessError('AUTHENTICATION_REQUIRED', 401, 'denied')),
        } as unknown as IdentityAccessService,
        service as unknown as ServiceCoverageService,
        logger,
      ),
    );
    await new Promise<void>((resolve) => denied.listen(0, '127.0.0.1', resolve));
    try {
      expect(
        (
          await fetch(
            `http://127.0.0.1:${(denied.address() as AddressInfo).port}/api/v1/admin/service-coverage`,
          )
        ).status,
      ).toBe(401);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          correlation_id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
          error_code: 'AUTHENTICATION_REQUIRED',
          result: 'FAILURE',
        }),
        'Service coverage request failed.',
      );
    } finally {
      await new Promise<void>((resolve) => denied.close(() => resolve()));
    }
    const withoutKey = await fetch(`${origin}/api/v1/admin/service-coverage/public-service-info`, {
      body: JSON.stringify({}),
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(withoutKey.status).toBe(422);
  });

  it('enforces strict edit reasons and preserves correlation/no-store headers', async () => {
    const response = await fetch(
      `${origin}/api/v1/admin/service-coverage/public-service-info/${resourceId}/state-transitions`,
      {
        body: JSON.stringify({
          nextState: 'PUBLISHED',
        }),
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'idempotency-key': crypto.randomUUID(),
        },
        method: 'POST',
      },
    );
    expect(response.status, await response.clone().text()).toBe(422);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('maps an invalid provider token to the public authentication error', async () => {
    const invalidLogger = { error: vi.fn() };
    const invalid = createServer(
      new ServiceCoverageHttpApi(
        {
          authorize: vi
            .fn()
            .mockRejectedValue(
              new IdentityAccessError('PROVIDER_TOKEN_INVALID', 401, 'provider detail'),
            ),
        } as unknown as IdentityAccessService,
        service as unknown as ServiceCoverageService,
        invalidLogger,
      ),
    );
    await new Promise<void>((resolve) => invalid.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(invalid.address() as AddressInfo).port}/api/v1/admin/service-coverage`,
        { headers: { authorization: 'Bearer invalid-token' } },
      );
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
      });
      expect(JSON.stringify(invalidLogger.error.mock.calls)).toContain('PROVIDER_TOKEN_INVALID');
      expect(JSON.stringify(invalidLogger.error.mock.calls)).not.toContain('provider detail');
    } finally {
      await new Promise<void>((resolve) => invalid.close(() => resolve()));
    }
  });

  it('returns 503 only for identity dependency failures and logs no sensitive detail', async () => {
    const secretDetail =
      'Bearer access-token-value password=private https://secret.example.test SELECT * FROM accounts';
    const dependencyLogger = { error: vi.fn() };
    const dependency = createServer(
      new ServiceCoverageHttpApi(
        {
          authorize: vi.fn().mockRejectedValue(
            new IdentityAccessError('IDENTITY_PROVIDER_UNAVAILABLE', 503, secretDetail, {
              cause: new Error(secretDetail),
            }),
          ),
        } as unknown as IdentityAccessService,
        service as unknown as ServiceCoverageService,
        dependencyLogger,
      ),
    );
    await new Promise<void>((resolve) => dependency.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(dependency.address() as AddressInfo).port}/api/v1/admin/service-coverage`,
        { headers: { authorization: 'Bearer test-token' } },
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Unexpected error.' },
      });
      const serializedLog = JSON.stringify(dependencyLogger.error.mock.calls);
      expect(serializedLog).toContain('IDENTITY_PROVIDER_UNAVAILABLE');
      expect(serializedLog).toContain(response.headers.get('x-correlation-id'));
      expect(serializedLog).not.toContain('access-token-value');
      expect(serializedLog).not.toContain('password=private');
      expect(serializedLog).not.toContain('secret.example.test');
      expect(serializedLog).not.toContain('SELECT * FROM accounts');
    } finally {
      await new Promise<void>((resolve) => dependency.close(() => resolve()));
    }
  });

  it('preserves 403 for a valid session without Admin permission', async () => {
    const deniedLogger = { error: vi.fn() };
    const denied = createServer(
      new ServiceCoverageHttpApi(
        {
          authorize: vi
            .fn()
            .mockRejectedValue(new IdentityAccessError('ADMIN_REQUIRED', 403, 'denied')),
        } as unknown as IdentityAccessService,
        service as unknown as ServiceCoverageService,
        deniedLogger,
      ),
    );
    await new Promise<void>((resolve) => denied.listen(0, '127.0.0.1', resolve));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(denied.address() as AddressInfo).port}/api/v1/admin/service-coverage`,
        { headers: { authorization: 'Bearer valid-token' } },
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'ACCESS_DENIED' } });
    } finally {
      await new Promise<void>((resolve) => denied.close(() => resolve()));
    }
  });

  it('continues serving Service Coverage for a valid Admin session', async () => {
    const response = await fetch(`${origin}/api/v1/admin/service-coverage`, {
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      nationwideShipping: {
        coverage: 'NATIONWIDE_CHILE',
        shippingCostAmountClp: 0,
        shippingPaymentMode: 'FREIGHT_COLLECT',
      },
      serviceInfo: [],
    });
  });

  it('returns 404 for unknown administration routes', async () => {
    const response = await fetch(`${origin}/api/v1/admin/service-coverage/not-a-route`, {
      body: JSON.stringify({}),
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
        'idempotency-key': crypto.randomUUID(),
      },
      method: 'POST',
    });
    expect(response.status).toBe(404);
  });
});
