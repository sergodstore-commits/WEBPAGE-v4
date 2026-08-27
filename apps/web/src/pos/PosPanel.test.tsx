import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { PosPanel } from './PosPanel.js';

const { saleId } = vi.hoisted(() => ({
  saleId: '0198c500-0000-7000-8000-000000000001',
}));
vi.mock('./api.js', () => ({
  addLine: vi.fn(),
  completeSale: vi.fn(),
  createMoneyMethod: vi.fn(),
  createSale: vi.fn().mockResolvedValue({ id: saleId }),
  daily: vi.fn(),
  deleteMoneyMethod: vi.fn(),
  discardSale: vi.fn(),
  editMoneyMethod: vi.fn(),
  findSku: vi.fn(),
  getSale: vi.fn().mockResolvedValue({
    item: {
      branch_id: '0198c500-0000-7000-8000-000000000002',
      pos_sale_id: saleId,
      sale_type: 'PREORDER',
    },
    lines: [],
    settlements: [],
  }),
  moneyMethods: vi.fn(),
  prepareSale: vi.fn(),
  removeLine: vi.fn(),
  returnSaleToDraft: vi.fn(),
  sales: vi.fn(),
  setBuyer: vi.fn(),
  setCoupon: vi.fn(),
  setLoyalty: vi.fn(),
  transitionMoneyMethod: vi.fn(),
  updateLine: vi.fn(),
}));

it('renders the productive Pseudo-POS controls without collecting card data', async () => {
  render(<PosPanel />);
  expect(screen.getByRole('heading', { name: 'Venta presencial' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nuevo medio externo' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Total diario' })).toBeInTheDocument();

  const createButton = screen.getByRole('button', { name: 'Crear borrador' });
  const form = createButton.closest('form');
  if (!form) throw new Error('Create sale form was not rendered.');
  fireEvent.change(within(form).getByLabelText('Sucursal'), {
    target: { value: '0198c500-0000-7000-8000-000000000002' },
  });
  fireEvent.change(within(form).getByLabelText('Tipo'), { target: { value: 'PREORDER' } });
  fireEvent.submit(form);

  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Comprador y entrega' })).toBeInTheDocument(),
  );
  for (const name of [
    'Agregar línea',
    'Modificar línea',
    'Eliminar línea',
    'Beneficios',
    'Preparar y completar',
    'Volver a borrador',
    'Descartar venta',
  ])
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  expect(screen.queryByText(/número de tarjeta|cvv|pan/iu)).not.toBeInTheDocument();
  expect(screen.getByText(/NO INCLUIDO — ENVÍO POR PAGAR/iu)).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: /^Dirección$/iu })).not.toBeInTheDocument();
  expect(screen.getAllByText('Preventa').length).toBeGreaterThan(0);
  expect(document.querySelector('pre')).not.toBeInTheDocument();
});
