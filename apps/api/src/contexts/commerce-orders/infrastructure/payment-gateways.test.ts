import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configuredPaymentGateways,
  FlowPaymentGateway,
  WebpayPaymentGateway,
} from './payment-gateways.js';

afterEach(() => vi.unstubAllGlobals());

describe('payment provider gateways', () => {
  it('creates Flow payments with signed API confirmation and return routes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'flow-token', url: 'https://flow.invalid/pay' }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const [gateway] = configuredPaymentGateways({
      API_PUBLIC_URL: 'https://api.sergod.example/base/',
      FLOW_API_KEY: 'flow-key',
      FLOW_BASE_URL: 'https://flow.invalid/api/',
      FLOW_SECRET_KEY: 'flow-secret',
    });

    const result = await gateway?.create({
      amountClp: 12_990,
      attemptId: 'attempt-1',
      orderReference: 'SG-2026-1',
      payerEmail: 'buyer@example.com',
    });

    expect(result?.redirectUrl).toBe('https://flow.invalid/pay?token=flow-token');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = new URLSearchParams(String(init.body));
    expect(url).toBe('https://flow.invalid/api/payment/create');
    expect(form.get('urlConfirmation')).toBe(
      'https://api.sergod.example/api/v1/payments/flow/confirmation',
    );
    expect(form.get('urlReturn')).toBe('https://api.sergod.example/api/v1/payments/flow/return');
    expect(form.get('s')).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('verifies Flow state with the provider token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          amount: 5000,
          commerceOrder: 'SG-2026-2',
          currency: 'CLP',
          status: 2,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const gateway = new FlowPaymentGateway({
      apiKey: 'key',
      baseUrl: 'https://flow.invalid/api',
      confirmationUrl: 'https://api.invalid/confirmation',
      returnUrl: 'https://api.invalid/return',
      secretKey: 'secret',
    });

    await expect(gateway.verify({ token: 'verified-token' })).resolves.toMatchObject({
      amountClp: 5000,
      orderReference: 'SG-2026-2',
      providerReference: 'verified-token',
      status: 'SUCCEEDED',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/payment/getStatus?');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('token=verified-token');
  });

  it('uses Webpay POST for create and PUT only for browser return verification', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'tbk-token', url: 'https://webpay.invalid/pay' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            amount: 8490,
            buy_order: 'SG-2026-3',
            response_code: 0,
            status: 'AUTHORIZED',
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const gateway = new WebpayPaymentGateway({
      apiKey: 'api-key',
      baseUrl: 'https://webpay.invalid',
      commerceCode: 'commerce-code',
      returnUrl: 'https://api.invalid/api/v1/payments/webpay/return',
    });

    await gateway.create({ amountClp: 8490, attemptId: 'attempt-2', orderReference: 'SG-2026-3' });
    await expect(gateway.verify({ mode: 'RETURN', token: 'tbk-token' })).resolves.toMatchObject({
      amountClp: 8490,
      status: 'SUCCEEDED',
    });

    const createInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const returnInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(createInit.method).toBe('POST');
    expect(JSON.parse(String(createInit.body))).toMatchObject({
      return_url: 'https://api.invalid/api/v1/payments/webpay/return',
      session_id: 'attempt-2',
    });
    expect(createInit.headers).toMatchObject({
      'Tbk-Api-Key-Id': 'commerce-code',
      'Tbk-Api-Key-Secret': 'api-key',
    });
    expect(returnInit.method).toBe('PUT');
  });

  it('maps provider HTTP failures to a stable infrastructure error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));
    const gateway = new FlowPaymentGateway({
      apiKey: 'key',
      baseUrl: 'https://flow.invalid',
      confirmationUrl: 'https://api.invalid/confirmation',
      returnUrl: 'https://api.invalid/return',
      secretKey: 'secret',
    });
    await expect(gateway.verify({ token: 'token' })).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
    });
  });
});
