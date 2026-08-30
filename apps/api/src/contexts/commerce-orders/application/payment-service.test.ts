import { describe, expect, it, vi } from 'vitest';

import { PaymentError } from '../domain/payment.js';
import type { PaymentAttemptView, PaymentGateway, PaymentRepository } from './payment-ports.js';
import { PaymentService } from './payment-service.js';

const now = new Date('2026-08-29T12:00:00.000Z');
const attempt: PaymentAttemptView = {
  accountId: '0198a8be-6677-7000-8000-000000000001',
  amountClp: 3100,
  authorizedAt: null,
  createdAt: now,
  currency: 'CLP',
  expiresAt: null,
  failureCode: null,
  orderId: '0198a8be-6677-7000-8000-000000000002',
  orderPublicNumber: 'SG-2026-000001',
  paymentAttemptId: '0198a8be-6677-7000-8000-000000000003',
  provider: 'FLOW',
  redirectUrl: null,
  status: 'CREATED',
  terminalAt: null,
  updatedAt: now,
};

describe('PaymentService provider initialization', () => {
  it('preserves a controlled Flow diagnostic while failing the attempt', async () => {
    const providerError = new PaymentError(
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'INFRASTRUCTURE',
      'Provider returned HTTP 401.',
    );
    const repository = {
      createAttempt: vi.fn().mockResolvedValue({ attempt, replayed: false }),
      failInitialization: vi.fn().mockResolvedValue(undefined),
    } as unknown as PaymentRepository;
    const gateway = {
      create: vi.fn().mockRejectedValue(providerError),
      provider: 'FLOW',
      verify: vi.fn(),
    } as unknown as PaymentGateway;
    const service = new PaymentService(repository, [gateway]);

    const result = service.createAttempt(
      {
        actorId: attempt.accountId,
        actorType: 'USER',
        correlationId: crypto.randomUUID(),
        idempotencyKey: 'flow-service-test',
      },
      attempt.accountId,
      attempt.orderId,
      { payerEmail: 'buyer@example.com', provider: 'FLOW' },
    );
    await expect(result).rejects.toBe(providerError);
    expect(repository.failInitialization).toHaveBeenCalledWith(
      attempt.paymentAttemptId,
      'PAYMENT_PROVIDER_UNAVAILABLE',
    );
  });

  it('preserves a controlled provider message without relying on its prototype', async () => {
    const repository = {
      createAttempt: vi.fn().mockResolvedValue({ attempt, replayed: false }),
      failInitialization: vi.fn().mockResolvedValue(undefined),
    } as unknown as PaymentRepository;
    const gateway = {
      create: vi.fn().mockRejectedValue({ message: 'Provider returned HTTP 400.' }),
      provider: 'FLOW',
      verify: vi.fn(),
    } as unknown as PaymentGateway;
    const service = new PaymentService(repository, [gateway]);

    await expect(
      service.createAttempt(
        {
          actorId: attempt.accountId,
          actorType: 'USER',
          correlationId: crypto.randomUUID(),
          idempotencyKey: 'flow-plain-error-test',
        },
        attempt.accountId,
        attempt.orderId,
        { payerEmail: 'buyer@example.com', provider: 'FLOW' },
      ),
    ).rejects.toMatchObject({ message: 'Provider returned HTTP 400.' });
  });

  it('reduces an unknown rejection to type and code identifiers only', async () => {
    const repository = {
      createAttempt: vi.fn().mockResolvedValue({ attempt, replayed: false }),
      failInitialization: vi.fn().mockResolvedValue(undefined),
    } as unknown as PaymentRepository;
    const gateway = {
      create: vi.fn().mockRejectedValue({ code: 'runtime.detail', name: 'Odd Error' }),
      provider: 'FLOW',
      verify: vi.fn(),
    } as unknown as PaymentGateway;
    const service = new PaymentService(repository, [gateway]);

    await expect(
      service.createAttempt(
        {
          actorId: attempt.accountId,
          actorType: 'USER',
          correlationId: crypto.randomUUID(),
          idempotencyKey: 'flow-error-shape-test',
        },
        attempt.accountId,
        attempt.orderId,
        { payerEmail: 'buyer@example.com', provider: 'FLOW' },
      ),
    ).rejects.toMatchObject({ message: 'Provider failure type ODD_ERROR:RUNTIME_DETAIL.' });
  });
});
