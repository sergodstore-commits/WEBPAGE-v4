import { createHmac } from 'node:crypto';

import type { PaymentProvider } from '@sergod/contracts';

import type { PaymentGateway, VerifiedProviderResult } from '../application/payment-ports.js';
import { normalizeFlowStatus, normalizeWebpayStatus, PaymentError } from '../domain/payment.js';

interface FlowConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly confirmationUrl: string;
  readonly returnUrl: string;
  readonly secretKey: string;
}

export class FlowPaymentGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'FLOW';

  constructor(private readonly config: FlowConfig) {}

  async create(input: {
    readonly amountClp: number;
    readonly attemptId: string;
    readonly orderReference: string;
    readonly payerEmail: string;
  }) {
    const parameters = {
      amount: String(input.amountClp),
      apiKey: this.config.apiKey,
      commerceOrder: input.orderReference,
      email: input.payerEmail,
      optional: JSON.stringify({ paymentAttemptId: input.attemptId }),
      subject: `Pedido ${input.orderReference}`,
      urlConfirmation: this.config.confirmationUrl,
      urlReturn: this.config.returnUrl,
    };
    const response = await fetch(`${this.config.baseUrl}/payment/create`, {
      body: signedForm(parameters, this.config.secretKey),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await parseJson<FlowCreateResponse>(response);
    if (!nonEmpty(payload.token) || !nonEmpty(payload.url)) {
      throw providerFailure('Flow create response is incomplete.');
    }
    return {
      expiresAt: null,
      providerReference: payload.token,
      redirectUrl: `${payload.url}?token=${encodeURIComponent(payload.token)}`,
    };
  }

  async verify(input: {
    readonly providerReference?: string;
    readonly token?: string;
  }): Promise<VerifiedProviderResult> {
    const token = input.token ?? input.providerReference;
    if (!nonEmpty(token)) throw providerFailure('Flow token is missing.');
    const parameters = { apiKey: this.config.apiKey, token };
    const response = await fetch(
      `${this.config.baseUrl}/payment/getStatus?${signedForm(parameters, this.config.secretKey)}`,
      {
        headers: { accept: 'application/json' },
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      },
    );
    const payload = await parseJson<FlowStatusResponse>(response);
    return {
      amountClp: integer(payload.amount),
      currency: payload.currency,
      orderReference: payload.commerceOrder,
      providerReference: token,
      status: normalizeFlowStatus(payload.status),
    };
  }
}

interface WebpayConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly commerceCode: string;
  readonly returnUrl: string;
}

export class WebpayPaymentGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'WEBPAY';

  constructor(private readonly config: WebpayConfig) {}

  async create(input: {
    readonly amountClp: number;
    readonly attemptId: string;
    readonly orderReference: string;
  }) {
    const payload = await this.request<WebpayCreateResponse>('/transactions', 'POST', {
      amount: input.amountClp,
      buy_order: input.orderReference,
      return_url: this.config.returnUrl,
      session_id: input.attemptId,
    });
    if (!nonEmpty(payload.token) || !nonEmpty(payload.url)) {
      throw providerFailure('Webpay create response is incomplete.');
    }
    return {
      expiresAt: null,
      providerReference: payload.token,
      redirectUrl: `${payload.url}?token_ws=${encodeURIComponent(payload.token)}`,
    };
  }

  async verify(input: {
    readonly mode: 'CALLBACK' | 'RECONCILE' | 'RETURN';
    readonly providerReference?: string;
    readonly token?: string;
  }): Promise<VerifiedProviderResult> {
    const token = input.token ?? input.providerReference;
    if (!nonEmpty(token)) throw providerFailure('Webpay token is missing.');
    const path = `/transactions/${encodeURIComponent(token)}`;
    let payload: WebpayStatusResponse;
    if (input.mode === 'RETURN') {
      try {
        payload = await this.request<WebpayStatusResponse>(path, 'PUT', {});
      } catch {
        // The provider may have committed before the client lost the response, or
        // the browser may replay its return. Status is authoritative and safe to retry.
        payload = await this.request<WebpayStatusResponse>(path, 'GET');
      }
    } else {
      payload = await this.request<WebpayStatusResponse>(path, 'GET');
    }
    return {
      amountClp: integer(payload.amount),
      currency: 'CLP',
      orderReference: payload.buy_order,
      providerReference: token,
      status: normalizeWebpayStatus(payload.status, payload.response_code ?? null),
    };
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: object,
  ): Promise<T> {
    const response = await fetch(
      `${this.config.baseUrl}/rswebpaytransaction/api/webpay/v1.2${path}`,
      {
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'Tbk-Api-Key-Id': this.config.commerceCode,
          'Tbk-Api-Key-Secret': this.config.apiKey,
        },
        method,
        signal: AbortSignal.timeout(10_000),
      },
    );
    return parseJson<T>(response);
  }
}

export function configuredPaymentGateways(environment: NodeJS.ProcessEnv): PaymentGateway[] {
  const gateways: PaymentGateway[] = [];
  const flowApiKey = environment.FLOW_API_KEY;
  const flowSecretKey = environment.FLOW_SECRET_KEY;
  const flowBaseUrl = environment.FLOW_BASE_URL;
  if (nonEmpty(flowApiKey) && nonEmpty(flowSecretKey) && nonEmpty(flowBaseUrl)) {
    gateways.push(
      new FlowPaymentGateway({
        apiKey: flowApiKey,
        baseUrl: trimSlash(flowBaseUrl),
        confirmationUrl: requiredUrl(
          environment.API_PUBLIC_URL,
          '/api/v1/payments/flow/confirmation',
        ),
        returnUrl: requiredUrl(environment.API_PUBLIC_URL, '/api/v1/payments/flow/return'),
        secretKey: flowSecretKey,
      }),
    );
  }
  const webpayCommerceCode = environment.WEBPAY_COMMERCE_CODE;
  const webpayApiKey = environment.WEBPAY_API_KEY;
  if (nonEmpty(webpayCommerceCode) && nonEmpty(webpayApiKey)) {
    gateways.push(
      new WebpayPaymentGateway({
        apiKey: webpayApiKey,
        baseUrl:
          environment.WEBPAY_ENVIRONMENT === 'production'
            ? 'https://webpay3g.transbank.cl'
            : 'https://webpay3gint.transbank.cl',
        commerceCode: webpayCommerceCode,
        returnUrl: requiredUrl(environment.API_PUBLIC_URL, '/api/v1/payments/webpay/return'),
      }),
    );
  }
  return gateways;
}

function signedForm(parameters: Readonly<Record<string, string>>, secret: string): string {
  const payload = Object.keys(parameters)
    .sort()
    .map((key) => `${key}${parameters[key]}`)
    .join('');
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return new URLSearchParams({ ...parameters, s: signature }).toString();
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw providerFailure(`Provider returned HTTP ${response.status}.`);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw providerFailure('Provider response is not valid JSON.', error);
  }
}

function providerFailure(message: string, cause?: unknown): PaymentError {
  return new PaymentError('PAYMENT_PROVIDER_UNAVAILABLE', 'INFRASTRUCTURE', message, { cause });
}
function integer(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw providerFailure('Provider amount is invalid.');
  return value;
}
function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}
function trimSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}
function requiredUrl(base: string | undefined, path: string): string {
  if (!nonEmpty(base)) throw providerFailure('Public application URL is not configured.');
  return new URL(path, base).href;
}

interface FlowCreateResponse {
  readonly token: string;
  readonly url: string;
}
interface FlowStatusResponse {
  readonly amount: number;
  readonly commerceOrder: string;
  readonly currency: string;
  readonly status: number;
}
interface WebpayCreateResponse {
  readonly token: string;
  readonly url: string;
}
interface WebpayStatusResponse {
  readonly amount: number;
  readonly buy_order: string;
  readonly response_code?: number;
  readonly status: string;
}
