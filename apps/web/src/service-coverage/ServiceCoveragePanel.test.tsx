import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ServiceCoveragePanel } from './ServiceCoveragePanel.js';
import { transitionServiceInfo } from './api.js';

const { branchId, resourceId } = vi.hoisted(() => ({
  branchId: '0198c500-0000-7000-8000-000000000002',
  resourceId: '0198c500-0000-7000-8000-000000000003',
}));

vi.mock('./api.js', () => ({
  readCoverage: vi.fn().mockResolvedValue({
    serviceInfo: [
      {
        public_address: 'Av. Principal 123',
        branch_id: branchId,
        public_service_info_id: resourceId,
        state: 'PUBLISHED',
      },
    ],
  }),
  savePublicServiceInfo: vi.fn(),
  transitionServiceInfo: vi.fn(),
}));

it('renders the administrative service coverage workflow without raw data', async () => {
  render(<ServiceCoveragePanel />);
  for (const name of ['Atención pública', 'Despacho nacional', 'Publicar o retirar atención'])
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  expect(screen.getByText('NO INCLUIDO — ENVÍO POR PAGAR')).toBeInTheDocument();
  expect(screen.queryByText(/tarifa CLP/iu)).not.toBeInTheDocument();
  expect((await screen.findAllByText('Av. Principal 123')).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Publicado').length).toBeGreaterThan(0);
  expect(screen.getAllByRole('option', { name: 'Av. Principal 123' }).length).toBe(2);
  expect(screen.queryByLabelText('Identificador')).not.toBeInTheDocument();
  expect(document.querySelector('pre')).not.toBeInTheDocument();

  const transitionForm = screen
    .getByRole('heading', { name: 'Publicar o retirar atención' })
    .closest('form');
  if (!transitionForm) throw new Error('Transition form was not rendered.');
  fireEvent.change(within(transitionForm).getByLabelText('Información de atención'), {
    target: { value: resourceId },
  });
  fireEvent.change(within(transitionForm).getByLabelText('Estado'), {
    target: { value: 'WITHDRAWN' },
  });
  fireEvent.change(within(transitionForm).getByLabelText('Motivo'), {
    target: { value: 'Horario desactualizado' },
  });
  fireEvent.submit(transitionForm);
  await waitFor(() =>
    expect(vi.mocked(transitionServiceInfo)).toHaveBeenCalledWith(
      resourceId,
      'WITHDRAWN',
      'Horario desactualizado',
    ),
  );
});
