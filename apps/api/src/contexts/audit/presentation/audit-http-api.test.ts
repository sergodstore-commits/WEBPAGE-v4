import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IdentityAccessService } from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { AuditService } from '../application/audit-service.js';
import { AuditHttpApi } from './audit-http-api.js';

const identity = {
  authorize: vi
    .fn()
    .mockResolvedValue({ account: { accountId: '0198a8be-6677-7000-8000-000000000001' } }),
} as unknown as IdentityAccessService;
const audit = { list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }) };
const server = createServer(new AuditHttpApi(identity, audit as unknown as AuditService));
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

describe('Audit HTTP API', () => {
  it('requires ADMIN and accepts bounded filters', async () => {
    const response = await fetch(
      `${origin}/api/v1/admin/audit-entries?limit=10&result=FAILURE&resourceType=ORDER`,
      { headers: { authorization: 'Bearer admin-token' } },
    );
    expect(response.status).toBe(200);
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'admin-token',
      capability: { kind: 'ADMIN' },
    });
    expect(audit.list).toHaveBeenCalledWith({
      limit: 10,
      resourceType: 'ORDER',
      result: 'FAILURE',
    });
  });

  it('rejects unknown query fields before repository access', async () => {
    const response = await fetch(`${origin}/api/v1/admin/audit-entries?unexpected=true`, {
      headers: { authorization: 'Bearer admin-token' },
    });
    expect(response.status).toBe(422);
    expect(audit.list).not.toHaveBeenCalled();
  });
});
