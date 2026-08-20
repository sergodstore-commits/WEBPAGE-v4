import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResendEmailGateway } from './resend-email-gateway.js';

afterEach(() => vi.unstubAllGlobals());

describe('Resend email gateway', () => {
  it('sends the outbox notification identifier as the provider idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const gateway = new ResendEmailGateway('api-key', 'Sergod <ventas@example.com>', null);

    await gateway.send({
      html: '<p>Pedido creado</p>',
      idempotencyKey: 'notification-1',
      subject: 'Pedido creado',
      text: 'Pedido creado',
      to: 'buyer@example.com',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({
      'idempotency-key': 'notification-1',
    });
  });
});
