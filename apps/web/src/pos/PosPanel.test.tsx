import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { addLine } from './api.js';
import { PosPanel } from './PosPanel.js';

const { accountId, branchId, campaignId, lineId, methodId, productId, saleId } = vi.hoisted(() => ({
  accountId: '0198c500-0000-7000-8000-000000000007',
  branchId: '0198c500-0000-7000-8000-000000000002',
  campaignId: '0198c500-0000-7000-8000-000000000005',
  lineId: '0198c500-0000-7000-8000-000000000006',
  methodId: '0198c500-0000-7000-8000-000000000004',
  productId: '0198c500-0000-7000-8000-000000000003',
  saleId: '0198c500-0000-7000-8000-000000000001',
}));
vi.mock('../identity/api.js', () => ({
  accounts: vi.fn().mockResolvedValue([
    {
      accountId,
      currentEmail: 'cliente@sergodstore.cl',
      currentPhone: null,
      emailVerificationStatus: 'VERIFIED',
      role: 'CLIENTE',
      status: 'ACTIVE',
    },
  ]),
}));
vi.mock('../service-coverage/api.js', () => ({
  readCoverage: vi.fn().mockResolvedValue({
    serviceInfo: [{ branch_id: branchId, public_address: 'Sucursal Centro' }],
  }),
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
  findSku: vi.fn().mockResolvedValue({
    item: {
      name: 'Caja Pokémon',
      price_amount_clp: '39990',
      product_id: productId,
      sale_type: 'PREORDER',
      sku: 'PKM-001',
    },
  }),
  getSale: vi.fn().mockResolvedValue({
    item: {
      branch_id: branchId,
      pos_sale_id: saleId,
      sale_type: 'PREORDER',
    },
    lines: [
      {
        pos_sale_line_id: lineId,
        product_id: productId,
        product_name_snapshot: 'Caja Pokémon',
        quantity: 1,
        sku_snapshot: 'PKM-001',
      },
    ],
    settlements: [],
  }),
  moneyMethods: vi.fn().mockResolvedValue({
    items: [
      {
        code_normalized: 'TRANSFER',
        display_name: 'Transferencia bancaria',
        external_money_method_id: methodId,
        state: 'ACTIVE',
      },
    ],
  }),
  preorderCampaigns: vi.fn().mockResolvedValue({
    items: [
      {
        capacity: 10,
        committed: 2,
        estimatedArrivalText: 'Octubre 2026',
        preorderCampaignId: campaignId,
        temporarilyReserved: 1,
      },
    ],
  }),
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
  await waitFor(() => expect(within(form).getByLabelText('Sucursal')).toBeEnabled());
  fireEvent.change(within(form).getByLabelText('Sucursal'), { target: { value: branchId } });
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
  expect(screen.getByRole('option', { name: 'cliente@sergodstore.cl' })).toHaveValue(accountId);
  expect(screen.getAllByRole('option', { name: 'Transferencia bancaria' }).length).toBeGreaterThan(
    0,
  );
  expect(
    screen.getAllByRole('option', { name: 'PKM-001 · Caja Pokémon · 1 unidad(es)' }).length,
  ).toBeGreaterThan(0);
  expect(document.querySelector('pre')).not.toBeInTheDocument();

  const searchForm = screen.getByRole('heading', { name: 'Buscar por SKU' }).closest('form');
  if (!searchForm) throw new Error('SKU search form was not rendered.');
  fireEvent.change(within(searchForm).getByLabelText('SKU'), { target: { value: 'PKM-001' } });
  fireEvent.submit(searchForm);

  const addForm = screen.getByRole('heading', { name: 'Agregar línea' }).closest('form');
  if (!addForm) throw new Error('Add line form was not rendered.');
  await waitFor(() =>
    expect(within(addForm).getByText('PKM-001 · Caja Pokémon')).toBeInTheDocument(),
  );
  fireEvent.change(within(addForm).getByLabelText('Campaña de preventa'), {
    target: { value: campaignId },
  });
  fireEvent.change(within(addForm).getByLabelText('Cantidad'), { target: { value: '2' } });
  fireEvent.submit(addForm);
  await waitFor(() =>
    expect(vi.mocked(addLine)).toHaveBeenCalledWith(saleId, {
      preorderCampaignId: campaignId,
      productId,
      quantity: 2,
    }),
  );
}, 10_000);
