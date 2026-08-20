import type { AddressInfo } from 'node:net';

import { FixedClock } from '@sergod/foundation';
import { describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../application/identity-access-service.js';
import type { PgIdentityAccessRepository } from '../infrastructure/postgres-identity-access-repository.js';
import { createServer } from '../../../presentation/http/create-server.js';
import { IdentityHttpApi } from './identity-http-api.js';

describe('IdentityAccess HTTP contract', () => {
  it.each([
    [
      '/api/v1/identity/sessions',
      { channel: 'PHONE_PASSWORD', identifier: '+56911111111', password: 'password' },
    ],
    ['/api/v1/identity/recovery-requests', { phone: '+56911111111' }],
    [
      '/api/v1/identity/verification-requests',
      { contactType: 'PHONE', identifier: '+56911111111' },
    ],
  ])('rejects unsupported phone authentication on %s', async (path, body) => {
    const login = vi.fn();
    const service = { login } as unknown as IdentityAccessService;
    const repository = {} as PgIdentityAccessRepository;
    const api = new IdentityHttpApi(
      service,
      repository,
      new FixedClock(new Date('2026-07-31T12:00:00.000Z')),
      60_000,
      {
        emailChange: 'http://localhost:5173/auth/callback/email-change',
        recovery: 'http://localhost:5173/auth/callback/recovery',
        registration: 'http://localhost:5173/auth/callback/confirm',
      },
    );
    const server = createServer(api);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'PHONE_AUTHENTICATION_NOT_SUPPORTED' },
      });
      expect(login).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
