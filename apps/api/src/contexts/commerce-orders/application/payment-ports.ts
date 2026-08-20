import type { PaymentProvider, PaymentStatus } from '@sergod/contracts';
import type { ExecutionContext } from '@sergod/foundation';

export interface PaymentAttemptView {
  readonly paymentAttemptId: string;
  readonly orderId: string;
  readonly accountId: string;
  readonly orderPublicNumber: string;
  readonly provider: PaymentProvider;
  readonly status: PaymentStatus;
  readonly amountClp: number;
  readonly currency: 'CLP';
  readonly redirectUrl: string | null;
  readonly failureCode: string | null;
  readonly expiresAt: Date | null;
  readonly authorizedAt: Date | null;
  readonly terminalAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VerifiedProviderResult {
  readonly amountClp: number;
  readonly currency: string;
  readonly orderReference: string;
  readonly providerReference: string;
  readonly status: PaymentStatus;
  readonly failureCode?: string;
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  create(input: {
    readonly amountClp: number;
    readonly attemptId: string;
    readonly orderReference: string;
    readonly payerEmail: string;
  }): Promise<{
    readonly expiresAt: Date | null;
    readonly providerReference: string;
    readonly redirectUrl: string;
  }>;
  verify(input: {
    readonly mode: 'CALLBACK' | 'RECONCILE' | 'RETURN';
    readonly providerReference?: string;
    readonly token?: string;
  }): Promise<VerifiedProviderResult>;
}

export interface PaymentRepository {
  createAttempt(input: {
    readonly accountId: string;
    readonly context: ExecutionContext;
    readonly idempotencyKey: string;
    readonly orderId: string;
    readonly provider: PaymentProvider;
    readonly requestFingerprint: string;
  }): Promise<{ readonly attempt: PaymentAttemptView; readonly replayed: boolean }>;
  attachProviderSession(input: {
    readonly attemptId: string;
    readonly expiresAt: Date | null;
    readonly providerReference: string;
    readonly redirectUrl: string;
  }): Promise<PaymentAttemptView>;
  failInitialization(attemptId: string, failureCode: string): Promise<void>;
  applyVerifiedResult(input: {
    readonly context: ExecutionContext;
    readonly provider: PaymentProvider;
    readonly result: VerifiedProviderResult;
  }): Promise<{ readonly attempt: PaymentAttemptView; readonly replayed: boolean }>;
  getForAccount(accountId: string, attemptId: string): Promise<PaymentAttemptView>;
  getForAdmin(attemptId: string): Promise<PaymentAttemptView>;
  getProviderLookupForAdmin(attemptId: string): Promise<{
    readonly attempt: PaymentAttemptView;
    readonly providerReference: string;
  }>;
  listForOrder(accountId: string, orderId: string): Promise<readonly PaymentAttemptView[]>;
  listForAdmin(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly orderId?: string;
    readonly provider?: PaymentProvider;
    readonly status?: PaymentStatus;
  }): Promise<{
    readonly items: readonly PaymentAttemptView[];
    readonly nextCursor: string | null;
  }>;
}
