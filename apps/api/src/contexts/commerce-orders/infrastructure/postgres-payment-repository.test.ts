import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { PgPaymentRepository } from './postgres-payment-repository.js';

const now = new Date('2026-08-20T12:00:00Z');
const accountId = '0198a8be-6677-7000-8000-000000000001';
const orderId = '0198a8be-6677-7000-8000-000000000010';

function repository(totalAmountClp: number) {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (sql.includes('FROM payment_attempts attempt') && sql.includes('idempotency_key')) {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes('FROM orders WHERE order_id')) {
      return {
        rowCount: 1,
        rows: [
          {
            account_id: accountId,
            currency: 'CLP',
            delivery_mode: 'PICKUP',
            delivery_snapshot: { mode: 'PICKUP' },
            expires_at: new Date('2026-08-20T12:15:00Z'),
            order_id: orderId,
            public_number: 'SG-2026-1',
            requires_external_payment: totalAmountClp > 0,
            state: 'PENDING_PAYMENT',
            total_amount_clp: totalAmountClp,
          },
        ],
      };
    }
    if (sql.includes('SELECT 1 FROM payment_attempts')) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
  return {
    repository: new PgPaymentRepository(pool, { now: () => now }, { generate: () => 'attempt-1' }),
    statements,
  };
}

describe('Postgres Payment repository', () => {
  it('creates external attempts idempotently for a payable Order', async () => {
    const subject = repository(15_990);
    await expect(
      subject.repository.createAttempt({
        accountId,
        context: { actorId: accountId, actorType: 'USER', correlationId: 'correlation-1' },
        idempotencyKey: 'payment-1',
        orderId,
        provider: 'FLOW',
        requestFingerprint: 'fingerprint-1',
      }),
    ).resolves.toMatchObject({
      attempt: {
        amountClp: 15_990,
        expiresAt: new Date('2026-08-20T12:15:00Z'),
        provider: 'FLOW',
        status: 'CREATED',
      },
      replayed: false,
    });
    expect(subject.statements.some((sql) => sql.includes('INSERT INTO payment_attempts'))).toBe(
      true,
    );
    expect(
      subject.statements.some((sql) => sql.includes('INSERT INTO payment_attempt_events')),
    ).toBe(true);
  });

  it('never creates an external PaymentAttempt for a zero-total Order', async () => {
    const subject = repository(0);
    await expect(
      subject.repository.createAttempt({
        accountId,
        context: { actorId: accountId, actorType: 'USER', correlationId: 'correlation-1' },
        idempotencyKey: 'payment-zero',
        orderId,
        provider: 'FLOW',
        requestFingerprint: 'fingerprint-zero',
      }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_PAYABLE' });
    expect(subject.statements.some((sql) => sql.includes('INSERT INTO payment_attempts'))).toBe(
      false,
    );
  });

  it('qualifies the attempt version when attaching a provider session', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes("SET status='REQUIRES_ACTION'")) {
        return {
          rowCount: 1,
          rows: [
            {
              account_id: accountId,
              amount_clp: 3100,
              authorized_at: null,
              created_at: now,
              currency: 'CLP',
              expires_at: null,
              failure_code: null,
              idempotency_key: 'payment-attach',
              order_id: orderId,
              payment_attempt_id: '0198a8be-6677-7000-8000-000000000011',
              provider: 'FLOW',
              provider_reference: 'flow-token',
              public_number: 'SG-2026-1',
              redirect_url: 'https://sandbox.flow.cl/app/web/pay.php?token=opaque',
              request_fingerprint: 'fingerprint',
              status: 'REQUIRES_ACTION',
              terminal_at: null,
              updated_at: now,
            },
          ],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const client = { query, release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
    const subject = new PgPaymentRepository(
      pool,
      { now: () => now },
      { generate: () => 'event-1' },
    );

    await expect(
      subject.attachProviderSession({
        attemptId: '0198a8be-6677-7000-8000-000000000011',
        expiresAt: null,
        providerReference: 'flow-token',
        redirectUrl: 'https://sandbox.flow.cl/app/web/pay.php?token=opaque',
      }),
    ).resolves.toMatchObject({ status: 'REQUIRES_ACTION' });
    expect(statements.find((sql) => sql.includes("SET status='REQUIRES_ACTION'"))).toContain(
      'version=attempt.version+1',
    );
  });
});
