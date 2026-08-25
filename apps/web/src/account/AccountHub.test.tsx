import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, authorizedRequest, ownAccount } from '../identity/api.js';
import { AccountHub } from './AccountHub.js';

vi.mock('../identity/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../identity/api.js')>();
  return { ...original, authorizedRequest: vi.fn(), ownAccount: vi.fn() };
});

const order = {
  createdAt: '2026-08-23T12:00:00.000Z',
  deliveryMode: 'PICKUP',
  lines: [
    {
      condition: 'NUEVO',
      edition: 'Base',
      language: 'Español',
      lineSubtotalClp: 19_990,
      productName: 'Caja regular',
      quantity: 1,
      sku: 'REG-001',
    },
  ],
  orderId: '0198a8be-6677-7000-8000-000000000010',
  publicNumber: 'SG-2026-000001',
  state: 'PAID',
  totalAmountClp: 19_990,
};
const preorder = {
  ...order,
  lines: [{ ...order.lines[0], productName: 'Caja en preventa', sku: 'PRE-001' }],
  orderId: '0198a8be-6677-7000-8000-000000000011',
  publicNumber: 'SG-2026-000002',
  state: 'PENDING_PAYMENT',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ownAccount).mockResolvedValue({
    accountId: '0198a8be-6677-7000-8000-000000000001',
    currentEmail: 'cliente@sergod.cl',
    currentPhone: '+56912345678',
    emailVerificationStatus: 'VERIFIED',
    role: 'CLIENTE',
    status: 'ACTIVE',
  });
  vi.mocked(authorizedRequest).mockImplementation(async (path, init) => {
    if (path.includes('orderType=REGULAR')) return { items: [order], nextCursor: null } as never;
    if (path.includes('orderType=PREORDER'))
      return { items: [preorder], nextCursor: null } as never;
    if (path === '/api/v1/loyalty/account')
      return {
        item: { availablePoints: 120, balance: 150, debt: false, reservedPoints: 30 },
      } as never;
    if (path === '/api/v1/loyalty/movements?limit=25')
      return {
        items: [
          {
            balanceAfter: 150,
            movementId: 'movement-1',
            occurredAt: '2026-08-22T12:00:00.000Z',
            pointsSigned: 50,
            reason: 'Compra',
            type: 'EARN',
          },
        ],
        nextCursor: null,
      } as never;
    if (path === '/api/v1/account/delivery-preferences' && init?.method === 'PUT')
      return {
        item: {
          agencyDestination: null,
          carrier: 'STARKEN',
          destinationCommune: null,
          recipientName: 'Sergio',
          recipientPhone: null,
        },
      } as never;
    if (path === '/api/v1/account/delivery-preferences') return { item: null } as never;
    throw new Error(`Unexpected request: ${path}`);
  });
});

describe('AccountHub', () => {
  it('shows the complete customer account from the real account APIs', async () => {
    render(<AccountHub />);

    expect(await screen.findByText('cliente@sergod.cl')).toBeInTheDocument();
    expect(await screen.findByText('SG-2026-000001')).toBeInTheDocument();
    expect(await screen.findByText('SG-2026-000002')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Acumulación')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar perfil y seguridad' })).toHaveAttribute(
      'href',
      '/account',
    );

    const paths = vi.mocked(authorizedRequest).mock.calls.map(([path]) => path);
    expect(paths).toContain('/api/v1/orders?limit=25&orderType=REGULAR');
    expect(paths).toContain('/api/v1/orders?limit=25&orderType=PREORDER');

    fireEvent.change(await screen.findByLabelText('Destinatario'), { target: { value: 'Sergio' } });
    fireEvent.change(screen.getByLabelText('Transportista'), { target: { value: 'STARKEN' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    await screen.findByText('Preferencias guardadas.');
    expect(vi.mocked(authorizedRequest)).toHaveBeenCalledWith(
      '/api/v1/account/delivery-preferences',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('keeps orders visible when the customer has no loyalty account', async () => {
    vi.mocked(authorizedRequest).mockImplementation(async (path) => {
      if (path.includes('orderType=REGULAR')) return { items: [order], nextCursor: null } as never;
      if (path.includes('orderType=PREORDER')) return { items: [], nextCursor: null } as never;
      if (path === '/api/v1/loyalty/account')
        throw new ApiError('LOYALTY_ACCOUNT_NOT_FOUND', 'not found');
      if (path === '/api/v1/loyalty/movements?limit=25')
        return { items: [], nextCursor: null } as never;
      if (path === '/api/v1/account/delivery-preferences') return { item: null } as never;
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<AccountHub />);
    expect(await screen.findByText('SG-2026-000001')).toBeInTheDocument();
    expect(
      await screen.findByText('Aún no tienes una cuenta de puntos habilitada.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('cliente@sergod.cl')).toBeInTheDocument());
  });
});
