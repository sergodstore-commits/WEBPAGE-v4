import type { Clock, UuidGenerator } from '@sergod/foundation';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createServer as createApiServer } from '../../presentation/http/create-server.js';
import {
  MaintenanceHttpApi,
  maintenanceJobNames,
  type MaintenanceJobInput,
} from './maintenance-http-api.js';

const token = 'maintenance-test-token-that-is-long-enough';
const now = new Date('2026-08-31T12:34:56.789Z');
const run = vi.fn(async (_input: MaintenanceJobInput) => {
  void _input;
  return { kind: 'COMPLETED', processed: 2 };
});
const jobs = Object.fromEntries(maintenanceJobNames.map((name) => [name, run])) as Record<
  (typeof maintenanceJobNames)[number],
  typeof run
>;
const logger = { error: vi.fn(), info: vi.fn() };
const clock: Clock = { now: () => now };
const uuids: UuidGenerator = { generate: () => '00000000-0000-4000-8000-000000000001' };
const server = createApiServer(new MaintenanceHttpApi(token, clock, uuids, jobs, logger));
let origin = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind.');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
});

describe('maintenance HTTP API', () => {
  it('requires the secret without revealing authorization details', async () => {
    let response = await fetch(`${origin}/internal/jobs/promotion-lifecycle`, { method: 'POST' });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(token);

    response = await fetch(`${origin}/internal/jobs/promotion-lifecycle`, {
      headers: { authorization: 'Bearer incorrect-private-token' },
      method: 'POST',
    });
    expect(response.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it.each(maintenanceJobNames)('runs the exact %s job with a minute bucket', async (job) => {
    run.mockClear();
    const response = await fetch(`${origin}/internal/jobs/${job}`, {
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith({
      correlationId: '00000000-0000-4000-8000-000000000001',
      scheduledFor: new Date('2026-08-31T12:34:00.000Z'),
    });
    expect(await response.json()).toMatchObject({ job, result: { kind: 'COMPLETED' } });
  });

  it('rejects unknown jobs, methods and query parameters', async () => {
    expect((await fetch(`${origin}/internal/jobs/unknown`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${origin}/internal/jobs/order-expiration`)).status).toBe(405);
    expect(
      (
        await fetch(`${origin}/internal/jobs/order-expiration?unexpected=true`, {
          headers: { authorization: `Bearer ${token}` },
          method: 'POST',
        })
      ).status,
    ).toBe(422);
  });

  it('maps dependency failures without exposing their private message', async () => {
    run.mockRejectedValueOnce(
      Object.assign(new Error(`DATABASE_URL ${token}`), { code: 'ECONNREFUSED' }),
    );
    const response = await fetch(`${origin}/internal/jobs/cart-expiration`, {
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/DATABASE_URL|maintenance-test-token/u);
    expect(logger.error).toHaveBeenLastCalledWith(
      expect.objectContaining({ technical_error_code: 'ECONNREFUSED' }),
      'Maintenance job request failed.',
    );
  });
});
