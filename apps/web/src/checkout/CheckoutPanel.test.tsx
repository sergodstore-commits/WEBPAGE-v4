import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CheckoutPanel } from './CheckoutPanel.js';

vi.mock('./api.js', () => ({
  clearCheckoutCoupon: vi.fn(),
  clearCheckoutPoints: vi.fn(),
  clearDeliveryIntent: vi.fn(),
  readCheckoutSummary: vi.fn(),
  replaceDeliveryIntent: vi.fn(),
  revalidateCheckout: vi.fn(),
  selectCheckoutCoupon: vi.fn(),
  selectCheckoutPoints: vi.fn(),
}));

it('starts from an authenticated cart group and does not present shipping as free', () => {
  render(<CheckoutPanel />);
  expect(
    screen.getByRole('heading', { name: 'Revisión, entrega y beneficios' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Grupo del carrito')).toBeInTheDocument();
  expect(screen.queryByText(/envío gratis/iu)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/dirección/iu)).not.toBeInTheDocument();
});
