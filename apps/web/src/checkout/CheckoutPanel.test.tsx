import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { createCheckoutOrder, readCheckoutSummary } from './api.js';
import { CheckoutPanel } from './CheckoutPanel.js';

vi.mock('./api.js', () => ({
  clearCheckoutCoupon: vi.fn(),
  clearCheckoutPoints: vi.fn(),
  clearDeliveryIntent: vi.fn(),
  createCheckoutOrder: vi.fn(),
  createPaymentAttempt: vi.fn(),
  readCheckoutSummary: vi.fn(),
  replaceDeliveryIntent: vi.fn(),
  revalidateCheckout: vi.fn(),
  selectCheckoutCoupon: vi.fn(),
  selectCheckoutPoints: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/checkout');
});

it('starts from an authenticated cart group and does not present shipping as free', () => {
  render(<CheckoutPanel />);
  expect(
    screen.getByRole('heading', { name: 'Revisión, entrega y beneficios' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Grupo del carrito')).toBeInTheDocument();
  expect(screen.queryByText(/envío gratis/iu)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/dirección/iu)).not.toBeInTheDocument();
});

it('loads the selected cart group and confirms a zero-total order without a payment form', async () => {
  window.history.replaceState({}, '', '/checkout?group=0198a8be-6677-7000-8000-000000000003');
  vi.mocked(readCheckoutSummary).mockResolvedValue({
    item: {
      canCreateOrder: true,
      shippingPaymentMode: null,
      totalAmountClp: 0,
    },
  });
  vi.mocked(createCheckoutOrder).mockResolvedValue({
    item: {
      orderId: '0198a8be-6677-7000-8000-000000000004',
      publicNumber: 'SG-2026-000001',
      requiresExternalPayment: false,
    },
  });

  render(<CheckoutPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

  expect(await screen.findByText(/confirmado sin pago externo/i)).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Elige un proveedor' })).not.toBeInTheDocument();
});
