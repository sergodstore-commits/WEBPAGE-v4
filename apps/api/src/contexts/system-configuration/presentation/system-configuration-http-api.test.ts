import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IdentityAccessError,
  type IdentityAccessService,
} from '../../identity-access/application/identity-access-service.js';
import { createServer } from '../../../presentation/http/create-server.js';
import type { SystemConfigurationService } from '../application/system-configuration-service.js';
import { SystemConfigurationError } from '../domain/system-configuration.js';
import { SystemConfigurationHttpApi } from './system-configuration-http-api.js';

const id = '0198a8be-6677-7000-8000-000000000001';
const item = {
  activatedAt: null,
  activatedBy: null,
  branchId: null,
  configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
  correlationId: '0198a8be-6677-7000-8000-000000000002',
  createdAt: '2026-08-12T00:00:00.000Z',
  createdBy: id,
  retiredAt: null,
  retiredBy: null,
  scope: 'GLOBAL',
  state: 'DRAFT',
  systemConfigurationId: id,
  value: 5760,
  valueType: 'INTEGER',
  versionNumber: 1,
} as const;
const identity = {
  authorize: vi.fn().mockResolvedValue({ account: { accountId: id } }),
} as unknown as IdentityAccessService;
const service = {
  createVersion: vi.fn().mockResolvedValue({ item, replayed: false }),
  editDraft: vi.fn().mockResolvedValue({ item, replayed: false }),
  getActive: vi.fn().mockResolvedValue({ ...item, state: 'ACTIVE' }),
  getPublicSiteAppearance: vi.fn().mockResolvedValue({ layout: null }),
  getVersion: vi.fn().mockResolvedValue(item),
  listDefinitions: vi.fn().mockResolvedValue({ items: [] }),
  listVersions: vi.fn().mockResolvedValue({ items: [item], nextCursor: null }),
  transition: vi.fn().mockResolvedValue({ item: { ...item, state: 'ACTIVE' }, replayed: false }),
};
const logger = { error: vi.fn(), info: vi.fn() };
const server = createServer(
  new SystemConfigurationHttpApi(
    identity,
    service as unknown as SystemConfigurationService,
    logger,
  ),
);
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

function request(path: string, init: RequestInit = {}) {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer valid-token',
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
  });
}

describe('SystemConfiguration HTTP API', () => {
  it('exposes only the active appearance document without authentication', async () => {
    const response = await fetch(`${origin}/api/v1/site-appearance`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ layout: null });
    expect(identity.authorize).not.toHaveBeenCalled();
    expect((await fetch(`${origin}/api/v1/site-appearance`, { method: 'POST' })).status).toBe(404);
  });

  it('exposes bounded reads and all version mutations with ADMIN authorization', async () => {
    const routes: readonly [string, RequestInit, number][] = [
      ['/api/v1/admin/system-configurations/definitions', { method: 'GET' }, 200],
      ['/api/v1/admin/system-configurations?limit=10', { method: 'GET' }, 200],
      [
        '/api/v1/admin/system-configurations/active?configurationKey=ANONYMOUS_CART_INACTIVITY_MINUTES',
        { method: 'GET' },
        200,
      ],
      [`/api/v1/admin/system-configurations/${id}`, { method: 'GET' }, 200],
      [
        '/api/v1/admin/system-configurations',
        {
          body: JSON.stringify({
            configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
            reason: 'Four days',
            value: 5760,
          }),
          headers: { 'idempotency-key': 'create' },
          method: 'POST',
        },
        201,
      ],
      [
        `/api/v1/admin/system-configurations/${id}`,
        {
          body: JSON.stringify({ reason: 'Edit draft', value: 5760 }),
          headers: { 'idempotency-key': 'edit' },
          method: 'PATCH',
        },
        200,
      ],
      [
        `/api/v1/admin/system-configurations/${id}/state-transitions`,
        {
          body: JSON.stringify({ nextState: 'ACTIVE', reason: 'Enable cart gate' }),
          headers: { 'idempotency-key': 'activate' },
          method: 'POST',
        },
        200,
      ],
    ];
    for (const [path, init, status] of routes) {
      expect((await request(path, init)).status, `${init.method} ${path}`).toBe(status);
    }
    expect(identity.authorize).toHaveBeenCalledWith({
      accessToken: 'valid-token',
      capability: { kind: 'ADMIN' },
    });
  });

  it('requires authentication, explicit pagination, idempotency and strict typed bodies', async () => {
    vi.mocked(identity.authorize).mockRejectedValueOnce(
      new IdentityAccessError('SESSION_INVALID', 401, 'private token detail'),
    );
    let response = await request('/api/v1/admin/system-configurations?limit=10');
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('private token detail');

    expect((await request('/api/v1/admin/system-configurations')).status).toBe(422);
    response = await request('/api/v1/admin/system-configurations', {
      body: JSON.stringify({
        configurationKey: 'ANONYMOUS_CART_INACTIVITY_MINUTES',
        reason: 'Missing key',
        value: 5760,
      }),
      method: 'POST',
    });
    expect(response.status).toBe(422);

    response = await request('/api/v1/admin/system-configurations', {
      body: JSON.stringify({
        configurationKey: 'UNKNOWN',
        reason: 'Unknown',
        value: 5760,
      }),
      headers: { 'idempotency-key': 'unknown' },
      method: 'POST',
    });
    expect(response.status).toBe(422);
  });

  it('maps authorization, conflicts and dependencies to correlated safe errors', async () => {
    vi.mocked(identity.authorize).mockRejectedValueOnce(
      new IdentityAccessError('ACCESS_DENIED', 403, 'private authorization detail'),
    );
    expect((await request('/api/v1/admin/system-configurations?limit=10')).status).toBe(403);

    service.getVersion.mockRejectedValueOnce(
      new SystemConfigurationError('PRIVATE', 'INFRASTRUCTURE', 'database secret'),
    );
    const response = await request(`/api/v1/admin/system-configurations/${id}`);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain('database secret');
    expect(body).not.toContain('valid-token');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: expect.any(String),
        error: 'DEPENDENCY_UNAVAILABLE',
      }),
      expect.any(String),
    );
  });
});
