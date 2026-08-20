import type { PaymentProvider, PaymentStatus } from '@sergod/contracts';

export type PaymentErrorCategory = 'CONFLICT' | 'INFRASTRUCTURE' | 'NOT_FOUND' | 'VALIDATION';

export class PaymentError extends Error {
  constructor(
    readonly code: string,
    readonly category: PaymentErrorCategory,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PaymentError';
  }
}

const transitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = Object.freeze({
  CREATED: ['PENDING', 'REQUIRES_ACTION', 'FAILED'],
  PENDING: ['REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  REQUIRES_ACTION: ['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: ['SUCCEEDED'],
});

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new PaymentError(
      'PAYMENT_STATE_CONFLICT',
      'CONFLICT',
      `Payment transition ${from} -> ${to} is not allowed.`,
    );
  }
}

export function assertVerifiedPayment(input: {
  readonly actualAmountClp: number;
  readonly actualCurrency: string;
  readonly actualOrderReference: string;
  readonly expectedAmountClp: number;
  readonly expectedOrderReference: string;
}): void {
  if (input.actualCurrency !== 'CLP') {
    throw new PaymentError('PAYMENT_CURRENCY_MISMATCH', 'CONFLICT', 'Payment currency differs.');
  }
  if (input.actualAmountClp !== input.expectedAmountClp) {
    throw new PaymentError('PAYMENT_AMOUNT_MISMATCH', 'CONFLICT', 'Payment amount differs.');
  }
  if (input.actualOrderReference !== input.expectedOrderReference) {
    throw new PaymentError('PAYMENT_REFERENCE_MISMATCH', 'CONFLICT', 'Payment reference differs.');
  }
}

export function normalizeFlowStatus(status: number): PaymentStatus {
  if (status === 1) return 'PENDING';
  if (status === 2) return 'SUCCEEDED';
  if (status === 3) return 'FAILED';
  if (status === 4) return 'CANCELLED';
  throw new PaymentError('PAYMENT_PROVIDER_STATUS_UNKNOWN', 'CONFLICT', 'Unknown Flow status.');
}

export function normalizeWebpayStatus(status: string, responseCode: number | null): PaymentStatus {
  if (status === 'AUTHORIZED' && responseCode === 0) return 'SUCCEEDED';
  if (status === 'INITIALIZED') return 'REQUIRES_ACTION';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'REVERSED' || status === 'NULLIFIED' || status === 'PARTIALLY_NULLIFIED') {
    return 'CANCELLED';
  }
  throw new PaymentError('PAYMENT_PROVIDER_STATUS_UNKNOWN', 'CONFLICT', 'Unknown Webpay status.');
}

export function assertProvider(value: string): asserts value is PaymentProvider {
  if (value !== 'FLOW' && value !== 'WEBPAY') {
    throw new PaymentError(
      'PAYMENT_PROVIDER_UNSUPPORTED',
      'VALIDATION',
      'Provider is unsupported.',
    );
  }
}
