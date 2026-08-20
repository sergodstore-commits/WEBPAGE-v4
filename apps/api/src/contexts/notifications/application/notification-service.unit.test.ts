import { describe, expect, it } from 'vitest';

import { renderNotification } from './notification-service.js';

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
