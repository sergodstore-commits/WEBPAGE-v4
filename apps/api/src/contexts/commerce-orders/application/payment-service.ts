import { createHash } from 'node:crypto';

import type { PaymentProvider, PaymentStatus } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

import { PaymentError } from '../domain/payment.js';
import type { PaymentAttemptView, PaymentGateway, PaymentRepository } from './payment-ports.js';

export class PaymentService {
  private readonly gateways = new Map<PaymentProvider, PaymentGateway>();

  constructor(
    private readonly repository: PaymentRepository,
    gateways: readonly PaymentGateway[],
  ) {
    for (const gateway of gateways) this.gateways.set(gateway.provider, gateway);
  }

  async createAttempt(
    context: ExecutionContext,
    accountId: string,
    orderId: string,
    input: { readonly payerEmail: string; readonly provider: PaymentProvider },
  ) {
    const idempotencyKey = requiredKey(context);
    const gateway = this.gateway(input.provider);
    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({ orderId: orderId.toLowerCase(), provider: input.provider }))
      .digest('hex');
    const created = await this.repository.createAttempt({
      accountId,
      context,
      idempotencyKey,
      orderId: orderId.toLowerCase(),
      provider: input.provider,
      requestFingerprint,
    });
    if (created.replayed || created.attempt.redirectUrl !== null) return serialize(created);
    try {
      const session = await gateway.create({
        amountClp: created.attempt.amountClp,
        attemptId: created.attempt.paymentAttemptId,
        orderReference: created.attempt.orderPublicNumber,
        payerEmail: input.payerEmail,
      });
      const attempt = await this.repository.attachProviderSession({
        attemptId: created.attempt.paymentAttemptId,
        ...session,
      });
      return serialize({ attempt, replayed: false });
    } catch (error) {
      await this.repository.failInitialization(
        created.attempt.paymentAttemptId,
        'PAYMENT_PROVIDER_UNAVAILABLE',
      );
      throw new PaymentError(
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'INFRASTRUCTURE',
        providerInitializationDiagnostic(error),
        { cause: error },
      );
    }
  }

  async processProviderResult(
    context: ExecutionContext,
    provider: PaymentProvider,
    input: {
      readonly mode: 'CALLBACK' | 'RECONCILE' | 'RETURN';
      readonly providerReference?: string;
      readonly token?: string;
    },
  ) {
    const result = await this.gateway(provider).verify(input);
    return serialize(await this.repository.applyVerifiedResult({ context, provider, result }));
  }

  async reconcile(context: ExecutionContext, attemptId: string) {
    const lookup = await this.repository.getProviderLookupForAdmin(attemptId);
    return this.processProviderResult(context, lookup.attempt.provider, {
      mode: 'RECONCILE',
      providerReference: lookup.providerReference,
    });
  }

  async getForAccount(accountId: string, attemptId: string) {
    return { item: serializeAttempt(await this.repository.getForAccount(accountId, attemptId)) };
  }

  async getForAdmin(attemptId: string) {
    return { item: serializeAttempt(await this.repository.getForAdmin(attemptId)) };
  }

  async listForOrder(accountId: string, orderId: string) {
    return {
      items: (await this.repository.listForOrder(accountId, orderId)).map(serializeAttempt),
    };
  }

  async listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly orderId?: string;
    readonly provider?: PaymentProvider;
    readonly status?: PaymentStatus;
  }) {
    const page = await this.repository.listForAdmin(input);
    return { ...page, items: page.items.map(serializeAttempt) };
  }

  private gateway(provider: PaymentProvider): PaymentGateway {
    const gateway = this.gateways.get(provider);
    if (gateway === undefined) {
      throw new PaymentError(
        'PAYMENT_PROVIDER_NOT_CONFIGURED',
        'INFRASTRUCTURE',
        'Payment provider is not configured.',
      );
    }
    return gateway;
  }
}

function providerInitializationDiagnostic(error: unknown): string {
  if (error instanceof PaymentError) return error.message;
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    if (
      typeof record.message === 'string' &&
      (/^Provider returned HTTP \d{3}\.$/u.test(record.message) ||
        ['Flow create response is incomplete.', 'Provider response is not valid JSON.'].includes(
          record.message,
        ))
    ) {
      return record.message;
    }
    if (record.message === 'fetch failed') return 'Provider network request failed.';
    if (
      record.name === 'PaymentError' &&
      record.code === 'PAYMENT_PROVIDER_UNAVAILABLE' &&
      typeof record.message === 'string'
    ) {
      return record.message;
    }
    if (
      typeof record.name === 'string' &&
      ['AbortError', 'TimeoutError', 'TypeError'].includes(record.name)
    ) {
      return 'Provider network request failed.';
    }
  }
  return 'Payment provider session could not be created.';
}

function requiredKey(context: ExecutionContext): string {
  if (context.idempotencyKey === undefined || context.idempotencyKey.trim() === '') {
    throw new PaymentError(
      'PAYMENT_IDEMPOTENCY_KEY_REQUIRED',
      'VALIDATION',
      'Idempotency-Key is required.',
    );
  }
  return context.idempotencyKey;
}

function serialize(input: { readonly attempt: PaymentAttemptView; readonly replayed: boolean }) {
  return { item: serializeAttempt(input.attempt), replayed: input.replayed };
}

function serializeAttempt(attempt: PaymentAttemptView) {
  return {
    ...attempt,
    authorizedAt: attempt.authorizedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
    expiresAt: attempt.expiresAt?.toISOString() ?? null,
    terminalAt: attempt.terminalAt?.toISOString() ?? null,
    updatedAt: attempt.updatedAt.toISOString(),
  };
}
