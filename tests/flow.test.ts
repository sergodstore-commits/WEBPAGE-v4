import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

// HTTP is replaced in every case: these tests never contact Flow or initialize a database.
test('Flow · contrato HTTP y controles del servidor con respuestas simuladas', async (t) => {
  const originalFetch = globalThis.fetch;
  const saved = {
    key: process.env.FLOW_API_KEY,
    secret: process.env.FLOW_SECRET_KEY,
    environment: process.env.FLOW_ENV,
  };
  Object.assign(process.env, {
    FLOW_API_KEY: 'test-api',
    FLOW_SECRET_KEY: 'test-secret',
    FLOW_ENV: 'sandbox',
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      FLOW_API_KEY: saved.key,
      FLOW_SECRET_KEY: saved.secret,
      FLOW_ENV: saved.environment,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const { flowSignature, flowRequest } = await import('../lib/server/flow');
  const { boundedBytes, body } = await import('../lib/server/core');
  const errorStatus = (expected: number) => (error: unknown) =>
    (error as { status?: number })?.status === expected;

  await t.test('firma coincide con vector HMAC independiente, ordena claves y excluye s', () => {
    // Expected digest computed independently with Python hmac/hashlib over this canonical UTF-8 string:
    // amount12000apiKeytest-apicurrencyCLPsubjectPreventa ñ & cartas + caja
    const expected = '5541ad33430982b3e3ef80bec1c0f0d431c14e6b26e9c8453c47cbaa9eb82b3f';
    const params = {
      currency: 'CLP',
      subject: 'Preventa ñ & cartas + caja',
      apiKey: 'test-api',
      amount: 12000,
      s: 'old-signature',
    };
    assert.equal(flowSignature(params, 'test-secret'), expected);
    assert.equal(
      flowSignature(
        { amount: 12000, apiKey: 'test-api', subject: params.subject, currency: 'CLP' },
        'test-secret',
      ),
      expected,
    );
    assert.notEqual(flowSignature({ ...params, amount: 12001 }, 'test-secret'), expected);
  });

  await t.test('crear pago envía formulario firmado y total CLP al sandbox', async () => {
    let calls = 0;
    globalThis.fetch = async (resource, init) => {
      calls++;
      const url = new URL(String(resource));
      assert.equal(url.href, 'https://sandbox.flow.cl/api/payment/create');
      assert.equal(init?.method, 'POST');
      assert.equal(
        new Headers(init?.headers).get('content-type'),
        'application/x-www-form-urlencoded',
      );
      assert.equal(init?.cache, 'no-store');
      assert.ok(init?.signal instanceof AbortSignal);
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get('subject'), 'Preventa ñ & cartas + caja');
      assert.equal(form.get('currency'), 'CLP');
      assert.equal(form.get('amount'), '12000');
      assert.equal(form.get('apiKey'), 'test-api');
      assert.equal(form.get('commerceOrder'), 'order-123');
      assert.equal(form.get('email'), 'buyer@example.test');
      assert.equal(form.get('timeout'), '900');
      assert.equal(form.get('urlConfirmation'), 'https://shop.example.test/api/flow/confirmation');
      assert.equal(form.get('urlReturn'), 'https://shop.example.test/api/flow/return');
      assert.equal(
        form.get('s'),
        createHmac('sha256', 'test-secret')
          .update(
            'amount12000apiKeytest-apicommerceOrderorder-123currencyCLPemailbuyer@example.testsubjectPreventa ñ & cartas + cajatimeout900urlConfirmationhttps://shop.example.test/api/flow/confirmationurlReturnhttps://shop.example.test/api/flow/return',
          )
          .digest('hex'),
      );
      assert.equal(form.has('secretKey'), false);
      return Response.json({
        url: 'https://sandbox.flow.cl/app/web/pay.php',
        token: 'test-token',
        flowOrder: 12345,
      });
    };
    const result = await flowRequest(
      'payment/create',
      {
        commerceOrder: 'order-123',
        currency: 'CLP',
        amount: 12000,
        subject: 'Preventa ñ & cartas + caja',
        email: 'buyer@example.test',
        timeout: 900,
        urlConfirmation: 'https://shop.example.test/api/flow/confirmation',
        urlReturn: 'https://shop.example.test/api/flow/return',
      },
      'POST',
    );
    assert.equal(calls, 1);
    assert.equal(result.flowOrder, 12345);
    assert.equal(result.token, 'test-token');
  });

  await t.test(
    'consultar estado usa GET firmado y conserva símbolos al codificar token',
    async () => {
      globalThis.fetch = async (resource, init) => {
        const url = new URL(String(resource));
        assert.equal(url.origin, 'https://sandbox.flow.cl');
        assert.equal(url.pathname, '/api/payment/getStatus');
        assert.equal(init?.method, 'GET');
        assert.equal(init?.body, undefined);
        assert.equal(url.searchParams.get('token'), 'token with+symbols');
        assert.equal(url.searchParams.get('apiKey'), 'test-api');
        assert.equal(
          url.searchParams.get('s'),
          createHmac('sha256', 'test-secret')
            .update('apiKeytest-apitokentoken with+symbols')
            .digest('hex'),
        );
        return Response.json({
          status: 1,
          commerceOrder: 'test-order',
          flowOrder: 12345,
          amount: 12000,
          currency: 'CLP',
        });
      };
      assert.equal(
        (await flowRequest('payment/getStatus', { token: 'token with+symbols' })).status,
        1,
      );
    },
  );

  await t.test(
    'recuperación envía commerceId y no commerceOrder; production selecciona host correcto',
    async () => {
      process.env.FLOW_ENV = 'production';
      try {
        globalThis.fetch = async (resource) => {
          const url = new URL(String(resource));
          assert.equal(url.origin, 'https://www.flow.cl');
          assert.equal(url.pathname, '/api/payment/getStatusByCommerceId');
          assert.equal(url.searchParams.get('commerceId'), 'order-to-recover');
          assert.equal(url.searchParams.has('commerceOrder'), false);
          return Response.json({ status: 1 });
        };
        assert.equal(
          (await flowRequest('payment/getStatusByCommerceId', { commerceId: 'order-to-recover' }))
            .status,
          1,
        );
      } finally {
        process.env.FLOW_ENV = 'sandbox';
      }
    },
  );

  await t.test('sin credenciales rechaza antes de enviar una solicitud', async () => {
    delete process.env.FLOW_SECRET_KEY;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return Response.json({});
    };
    try {
      await assert.rejects(
        () => flowRequest('payment/getStatus', { token: 'test-token' }),
        errorStatus(503),
      );
    } finally {
      process.env.FLOW_SECRET_KEY = 'test-secret';
    }
    assert.equal(called, false);
  });

  await t.test(
    'interrupción de red queda como verificación pendiente sin revelar secretos',
    async () => {
      globalThis.fetch = async () => {
        throw new Error('socket failure containing a secret');
      };
      await assert.rejects(
        () => flowRequest('payment/getStatus', { token: 'test-token' }),
        (error: unknown) => {
          assert.equal((error as { status: number }).status, 502);
          assert.match((error as Error).message, /pendiente/i);
          assert.doesNotMatch((error as Error).message, /secret/);
          return true;
        },
      );
    },
  );

  await t.test(
    'errores HTTP y respuesta JSON inválida no se convierten en aprobación',
    async () => {
      for (const [httpStatus, expected] of [
        [400, 422],
        [401, 422],
        [500, 502],
        [503, 502],
      ]) {
        globalThis.fetch = async () =>
          new Response('provider detail that must not be exposed', { status: httpStatus });
        await assert.rejects(
          () => flowRequest('payment/getStatus', { token: 'test-token' }),
          errorStatus(expected),
        );
      }
      globalThis.fetch = async () =>
        new Response('<html>incomplete response</html>', { status: 200 });
      await assert.rejects(
        () => flowRequest('payment/getStatus', { token: 'test-token' }),
        errorStatus(502),
      );
    },
  );

  await t.test(
    'lectura acotada rechaza y cancela un stream grande sin Content-Length',
    async () => {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(3));
          controller.enqueue(new Uint8Array(3));
        },
        cancel() {
          cancelled = true;
        },
      });
      const request = new Request('http://localhost/api/flow/confirmation', {
        method: 'POST',
        body: stream,
        duplex: 'half',
      } as RequestInit);
      assert.equal(request.headers.has('content-length'), false);
      await assert.rejects(() => boundedBytes(request, 5), errorStatus(413));
      assert.equal(cancelled, true);
    },
  );

  await t.test(
    'parser JSON acepta datos válidos y rechaza JSON inválido o límite declarado',
    async () => {
      assert.deepEqual(
        await body(
          new Request('http://localhost/api/account', {
            method: 'POST',
            body: '{"name":"Cliente"}',
          }),
        ),
        { name: 'Cliente' },
      );
      await assert.rejects(
        () =>
          body(new Request('http://localhost/api/account', { method: 'POST', body: '{invalid' })),
        errorStatus(400),
      );
      await assert.rejects(
        () =>
          boundedBytes(
            new Request('http://localhost/api/account', {
              method: 'POST',
              body: '{}',
              headers: { 'Content-Length': '99999' },
            }),
            10,
          ),
        errorStatus(413),
      );
    },
  );
});
