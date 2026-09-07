import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { currentSession } from '../identity/api.js';
import { readPublicStore } from '../service-coverage/api.js';
import {
  createCheckoutOrder,
  createPaymentAttempt,
  readCheckoutSummary,
  replaceDeliveryIntent,
} from './api.js';
import { CheckoutPanel } from './CheckoutPanel.js';

vi.mock('../identity/api.js', () => ({
  currentSession: vi.fn(() => ({ accessToken: 'test-access' })),
}));

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

vi.mock('../service-coverage/api.js', () => ({
  readPublicStore: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentSession).mockReturnValue({ accessToken: 'test-access' } as never);
  vi.mocked(readPublicStore).mockResolvedValue({
    item: {
      branchId: '0198c500-0000-7000-8000-000000000002',
      name: 'Sergod Store',
      openingHours: 'Lunes a sábado',
      publicAddress: 'Av. Principal 123',
    },
  });
  window.history.replaceState({}, '', '/checkout');
});

it('starts from an authenticated cart group and does not present shipping as free', () => {
  render(<CheckoutPanel />);
  expect(
    screen.getByRole('heading', { name: 'Revisión, entrega y beneficios' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Revisar carrito' })).toHaveAttribute('href', '/cart');
  expect(screen.queryByLabelText('Grupo del carrito')).not.toBeInTheDocument();
  expect(screen.queryByText(/envío gratis/iu)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/dirección/iu)).not.toBeInTheDocument();
});

it('requires an authenticated customer before exposing checkout controls', () => {
  vi.mocked(currentSession).mockReturnValue(null);

  render(<CheckoutPanel />);

  expect(
    screen.getByRole('heading', { name: 'Ingresa para continuar tu compra' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', '/login');
  expect(readCheckoutSummary).not.toHaveBeenCalled();
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

it('offers only Flow when an order requires external payment', async () => {
  window.history.replaceState({}, '', '/checkout?group=0198a8be-6677-7000-8000-000000000003');
  vi.mocked(readCheckoutSummary).mockResolvedValue({
    item: {
      canCreateOrder: true,
      shippingPaymentMode: null,
      totalAmountClp: 10_000,
    },
  });
  vi.mocked(createCheckoutOrder).mockResolvedValue({
    item: {
      orderId: '0198a8be-6677-7000-8000-000000000004',
      publicNumber: 'SG-2026-000001',
      requiresExternalPayment: true,
    },
  });
  vi.mocked(createPaymentAttempt).mockResolvedValue({ item: { redirectUrl: '' } });

  render(<CheckoutPanel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

  expect(await screen.findByRole('heading', { name: 'Pago seguro con Flow' })).toBeInTheDocument();
  expect(screen.queryByText(/Webpay/iu)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Correo del pagador'), {
    target: { value: 'cliente@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ir al pago seguro' }));

  expect(createPaymentAttempt).toHaveBeenCalledWith('0198a8be-6677-7000-8000-000000000004', {
    payerEmail: 'cliente@example.com',
    provider: 'FLOW',
  });
});

it('separates pickup from freight-collect agency fields without requesting an address', async () => {
  window.history.replaceState({}, '', '/checkout?group=0198a8be-6677-7000-8000-000000000003');
  vi.mocked(readCheckoutSummary).mockResolvedValue({
    item: {
      canCreateOrder: false,
      shippingPaymentMode: null,
      totalAmountClp: 19_990,
    },
  });
  vi.mocked(replaceDeliveryIntent).mockResolvedValue({} as never);

  render(<CheckoutPanel />);
  const mode = await screen.findByLabelText('Modalidad');
  expect(await screen.findByLabelText('Tienda configurada')).toHaveTextContent('Sergod Store');
  const deliveryForm = screen.getByRole('button', { name: 'Guardar entrega' }).closest('form');
  if (!deliveryForm) throw new Error('Delivery form was not rendered.');
  fireEvent.submit(deliveryForm);
  await waitFor(() =>
    expect(replaceDeliveryIntent).toHaveBeenCalledWith('0198a8be-6677-7000-8000-000000000003', {
      branchId: '0198c500-0000-7000-8000-000000000002',
      mode: 'PICKUP',
    }),
  );

  fireEvent.change(mode, { target: { value: 'SHIPPING' } });

  expect(screen.queryByLabelText('Tienda configurada')).not.toBeInTheDocument();
  expect(screen.getByText('Despacho exclusivamente a agencia')).toBeInTheDocument();
  expect(screen.queryByLabelText(/dirección/iu)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Destinatario'), { target: { value: 'Cliente' } });
  fireEvent.change(screen.getByLabelText('Comuna o ciudad'), { target: { value: 'Copiapó' } });
  fireEvent.change(screen.getByLabelText('Agencia de destino'), {
    target: { value: 'Agencia centro' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar entrega' }));

  expect(replaceDeliveryIntent).toHaveBeenCalledWith(
    '0198a8be-6677-7000-8000-000000000003',
    expect.objectContaining({
      agencyDestination: 'Agencia centro',
      destinationType: 'CARRIER_AGENCY',
      mode: 'SHIPPING',
      shippingIncludedInOrderTotal: false,
      shippingPaymentMode: 'FREIGHT_COLLECT',
    }),
  );
});
