import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, publicRequest } from '../identity/api.js';
import { StorePage } from './PublicPages.js';

vi.mock('../identity/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../identity/api.js')>();
  return {
    ...original,
    authorizedRequest: vi.fn(),
    currentSession: vi.fn(() => null),
    publicRequest: vi.fn(),
  };
});

beforeEach(() => vi.clearAllMocks());

describe('public Store cart action', () => {
  it('creates an anonymous cart when required and retries the line command', async () => {
    vi.mocked(publicRequest).mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/catalog/products?')) {
        return {
          items: [
            {
              availableForPurchase: true,
              game: { name: 'Pokémon' },
              name: 'Booster regular',
              priceAmountClp: 4990,
              productId: '0198a8be-6677-7000-8000-000000000010',
              saleType: 'REGULAR',
            },
          ],
        } as never;
      }
      const lineCalls = vi
        .mocked(publicRequest)
        .mock.calls.filter(([requestedPath]) => requestedPath === '/api/v1/cart/lines').length;
      if (path === '/api/v1/cart/lines' && lineCalls === 1) {
        throw new ApiError('CART_SESSION_REQUIRED', 'Cart session required.');
      }
      return {} as never;
    });

    render(<StorePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar al carrito' }));

    await screen.findByText('Booster regular fue agregado al carrito.');
    const paths = vi.mocked(publicRequest).mock.calls.map(([path]) => path);
    expect(paths.filter((path) => path === '/api/v1/cart/lines')).toHaveLength(2);
    expect(paths).toContain('/api/v1/cart');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Agregar al carrito' })).toBeEnabled(),
    );
  });
});
