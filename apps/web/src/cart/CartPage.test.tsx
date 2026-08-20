import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { publicRequest } from '../identity/api.js';
import { CartPage } from './CartPage.js';

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

it('renders a real cart group and updates a line with an idempotent command', async () => {
  vi.mocked(publicRequest).mockResolvedValue({
    item: {
      groups: [
        {
          cartGroupId: '0198a8be-6677-7000-8000-000000000003',
          groupType: 'REGULAR',
          lines: [
            {
              cartLineId: '0198a8be-6677-7000-8000-000000000002',
              estimatedLineTotalClp: 4990,
              productName: 'Booster regular',
              quantity: 1,
              saleType: 'REGULAR',
              sku: 'SKU-1',
              unitPriceClp: 4990,
            },
          ],
          state: 'ACTIVE',
        },
      ],
      ownerKind: 'ANONYMOUS',
      state: 'ACTIVE',
    },
  } as never);

  render(<CartPage />);
  expect(await screen.findByText('Booster regular')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar una unidad de Booster regular' }));

  expect(publicRequest).toHaveBeenCalledWith(
    '/api/v1/cart/lines/0198a8be-6677-7000-8000-000000000002',
    expect.objectContaining({ method: 'PUT' }),
  );
  const mutation = vi.mocked(publicRequest).mock.calls[1]?.[1];
  expect(JSON.parse(String(mutation?.body))).toEqual({ quantity: 2 });
  expect(mutation?.headers).toHaveProperty('idempotency-key');
});
