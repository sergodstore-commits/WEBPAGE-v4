import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  addLine,
  completeSale,
  createSale,
  getSale,
  prepareSale,
  removeLine,
  updateLine,
} from './api.js';
import { PosPanel } from './PosPanel.js';

const { ticket } = vi.hoisted(() => ({
  ticket: {
    item: {
      pos_sale_id: 'sale-1',
      state: 'DRAFT',
      total_amount_clp: 1000,
      subtotal_amount_clp: 1000,
    },
    lines: [] as Record<string, unknown>[],
  },
}));
vi.mock('../identity/api.js', () => ({
  authorizedRequest: vi.fn(async (path: string) =>
    path.includes('/inventory/')
      ? { item: { available: 8 } }
      : {
          items: [
            {
              productId: 'product-1',
              name: 'Caja Pokémon',
              sku: 'PKM-001',
              priceAmountClp: 1000,
              saleType: 'REGULAR',
              publicationStatus: 'PUBLISHED',
            },
          ],
          nextCursor: null,
        },
  ),
}));
vi.mock('../service-coverage/api.js', () => ({
  readCoverage: vi.fn().mockResolvedValue({
    branches: [{ branch_id: 'branch-1', name: 'Sergod Store', state: 'ACTIVE' }],
    serviceInfo: [],
  }),
}));
vi.mock('./api.js', () => ({
  createSale: vi.fn().mockResolvedValue({ id: 'sale-1' }),
  getSale: vi.fn(async () => structuredClone(ticket)),
  moneyMethods: vi.fn().mockResolvedValue({
    items: [
      { external_money_method_id: 'method-1', display_name: 'Pago presencial', state: 'ACTIVE' },
    ],
  }),
  addLine: vi.fn(async () => {
    ticket.lines = [
      {
        pos_sale_line_id: 'line-1',
        product_id: 'product-1',
        product_name_snapshot: 'Caja Pokémon',
        sku_snapshot: 'PKM-001',
        quantity: 1,
        unit_price_amount_clp: 1000,
      },
    ];
  }),
  updateLine: vi.fn(async (_sale: string, _line: string, quantity: number) => {
    const line = ticket.lines[0];
    if (line) line.quantity = quantity;
  }),
  removeLine: vi.fn(async () => {
    ticket.lines = [];
  }),
  prepareSale: vi.fn(async () => {
    ticket.item.state = 'PREPARED';
  }),
  completeSale: vi.fn(async () => {
    ticket.item.state = 'COMPLETED';
  }),
  discardSale: vi.fn(),
  sales: vi.fn().mockResolvedValue({ items: [] }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  ticket.item.state = 'DRAFT';
  ticket.lines = [];
});
async function openTicket() {
  render(<PosPanel />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Nueva venta' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Nueva venta' }));
  await screen.findByLabelText('Código, SKU o nombre');
}
it('searches SKU, edits a ticket and completes an external-paid sale without a preorder or online payment', async () => {
  await openTicket();
  expect(createSale).toHaveBeenCalledWith({ branchId: 'branch-1', saleType: 'REGULAR' });
  fireEvent.change(screen.getByLabelText('Código, SKU o nombre'), { target: { value: 'PKM-001' } });
  fireEvent.click(screen.getByRole('button', { name: /Caja Pokémon/ }));
  await waitFor(() =>
    expect(addLine).toHaveBeenCalledWith('sale-1', { productId: 'product-1', quantity: 1 }),
  );
  const input = await screen.findByLabelText('Cantidad de Caja Pokémon');
  fireEvent.change(input, { target: { value: '2' } });
  fireEvent.blur(input);
  await waitFor(() => expect(updateLine).toHaveBeenCalledWith('sale-1', 'line-1', 2));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Registrar venta y descontar stock' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Registrar venta y descontar stock' }));
  await waitFor(() =>
    expect(completeSale).toHaveBeenCalledWith('sale-1', {
      amountClp: 1000,
      externalMoneyMethodId: 'method-1',
    }),
  );
  expect(prepareSale).toHaveBeenCalledOnce();
  expect(screen.queryByText(/Puntos a canjear/)).not.toBeInTheDocument();
  await waitFor(() => expect(sessionStorage.getItem('sergod-pos-active-ticket')).toBeNull());
});
it('removes ticket lines and recovers an unfinished ticket after reload', async () => {
  sessionStorage.setItem('sergod-pos-active-ticket', 'sale-1');
  ticket.lines = [
    {
      pos_sale_line_id: 'line-1',
      product_id: 'product-1',
      product_name_snapshot: 'Caja Pokémon',
      quantity: 1,
    },
  ];
  render(<PosPanel />);
  await waitFor(() => expect(getSale).toHaveBeenCalledWith('sale-1'));
  fireEvent.click(await screen.findByRole('button', { name: 'Quitar' }));
  await waitFor(() => expect(removeLine).toHaveBeenCalledWith('sale-1', 'line-1'));
  await screen.findByText('Producto quitado del ticket.');
});
