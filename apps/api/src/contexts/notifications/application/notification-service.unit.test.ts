import { describe, expect, it, vi } from 'vitest';

import type { EmailGateway, NotificationQueue } from './notification-service.js';
import { NotificationWorker, renderNotification } from './notification-service.js';

describe('transactional notification templates', () => {
  it('escapes customer-controlled values', () => {
    const rendered = renderNotification('ORDER_SHIPPED', {
      orderPublicNumber: '<script>alert(1)</script>',
      trackingCode: 'ABC',
    });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.text).toContain('<script>');
  });

  it('communicates payment failure without changing business state', () => {
    expect(
      renderNotification('PAYMENT_FAILED', { orderPublicNumber: 'SG-2026-1' }).subject,
    ).toMatch(/No pudimos confirmar/u);
  });
});

describe('notification worker', () => {
  it('claims, sends and acknowledges a batch', async () => {
    const queue = {
      claim: vi.fn().mockResolvedValue([
        {
          eventType: 'ORDER_CREATED',
          notificationId: 'notification-1',
          payload: { orderPublicNumber: 'SG-2026-1' },
          recipientEmail: 'buyer@example.com',
        },
      ]),
      markFailed: vi.fn(),
      markSent: vi.fn(),
    } satisfies NotificationQueue;
    const email = { send: vi.fn() } satisfies EmailGateway;
    const worker = new NotificationWorker(queue, email, () => new Date('2026-08-20T12:00:00Z'));

    await expect(worker.run(10)).resolves.toEqual({ failed: 0, sent: 1 });
    expect(queue.claim).toHaveBeenCalledWith(10);
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Pedido SG-2026-1 creado', to: 'buyer@example.com' }),
    );
    expect(queue.markSent).toHaveBeenCalledWith('notification-1');
    expect(queue.markFailed).not.toHaveBeenCalled();
  });

  it('schedules a bounded retry and continues processing after a delivery failure', async () => {
    const queue = {
      claim: vi.fn().mockResolvedValue([
        {
          eventType: 'PAYMENT_FAILED',
          notificationId: 'notification-2',
          payload: { orderPublicNumber: 'SG-2026-2' },
          recipientEmail: 'buyer@example.com',
        },
      ]),
      markFailed: vi.fn(),
      markSent: vi.fn(),
    } satisfies NotificationQueue;
    const email = {
      send: vi.fn().mockRejectedValue(new Error('provider down')),
    } satisfies EmailGateway;
    const now = new Date('2026-08-20T12:00:00Z');
    const worker = new NotificationWorker(queue, email, () => now);

    await expect(worker.run()).resolves.toEqual({ failed: 1, sent: 0 });
    expect(queue.markFailed).toHaveBeenCalledWith(
      'notification-2',
      'EMAIL_DELIVERY_FAILED',
      new Date('2026-08-20T12:05:00Z'),
    );
    expect(queue.markSent).not.toHaveBeenCalled();
  });
});
