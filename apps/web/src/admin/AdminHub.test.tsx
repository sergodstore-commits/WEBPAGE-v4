import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizedRequest } from '../identity/api.js';
import { AdminHub } from './AdminHub.js';

vi.mock('../identity/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../identity/api.js')>();
  return { ...original, authorizedRequest: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizedRequest).mockImplementation(async (path, init) => {
    if (init?.method) return { item: {} } as never;
    if (path.startsWith('/api/v1/admin/orders'))
      return {
        items: [{ orderId: 'order-1', publicNumber: 'SG-2026-000010', state: 'PAID' }],
        nextCursor: null,
      } as never;
    if (path.startsWith('/api/v1/admin/payment-attempts'))
      return {
        items: [{ paymentAttemptId: 'payment-1', provider: 'FLOW', status: 'PENDING' }],
        nextCursor: null,
      } as never;
    if (path.startsWith('/api/v1/admin/catalog/products'))
      return {
        items: [
          {
            name: 'Caja Pokémon',
            productId: 'product-1',
            publicationStatus: 'PUBLISHED',
            sku: 'PKM-001',
          },
        ],
        nextCursor: null,
      } as never;
    if (path.startsWith('/api/v1/admin/audit-entries'))
      return {
        items: [
          {
            action: 'ORDER_PAID',
            auditEntryId: 'audit-1',
            resourceType: 'ORDER',
            result: 'SUCCESS',
          },
        ],
        nextCursor: null,
      } as never;
    return { items: [], nextCursor: null } as never;
  });
});

describe('AdminHub', () => {
  it('loads every operational module and exposes real actions', async () => {
    render(<AdminHub />);
    expect(await screen.findByText('SG-2026-000010')).toBeInTheDocument();
    expect((await screen.findAllByText('Caja Pokémon')).length).toBeGreaterThan(0);
    expect(await screen.findByText('ORDER_PAID')).toBeInTheDocument();
    expect(
      vi
        .mocked(authorizedRequest)
        .mock.calls.some(([path]) => path === '/api/v1/admin/loyalty/configurations?limit=25'),
    ).toBe(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Conciliar' }));
    await screen.findByText('Operación guardada correctamente.');
    expect(vi.mocked(authorizedRequest)).toHaveBeenCalledWith(
      '/api/v1/admin/payment-attempts/payment-1/reconcile',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('keeps other modules available when one request fails', async () => {
    vi.mocked(authorizedRequest).mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/admin/payment-attempts'))
        throw new Error('Pagos no disponibles.');
      if (path.startsWith('/api/v1/admin/orders'))
        return {
          items: [{ orderId: 'order-1', publicNumber: 'SG-2026-000010', state: 'PAID' }],
          nextCursor: null,
        } as never;
      return { items: [], nextCursor: null } as never;
    });
    render(<AdminHub />);
    await waitFor(() => expect(screen.getByText('SG-2026-000010')).toBeInTheDocument());
    expect(await screen.findByText('Pagos no disponibles.')).toBeInTheDocument();
  });
});
