import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ServiceCoveragePanel } from './ServiceCoveragePanel.js';

vi.mock('./api.js', () => ({
  readCoverage: vi.fn().mockResolvedValue({
    serviceInfo: [
      {
        public_address: 'Av. Principal 123',
        public_service_info_id: '0198c500-0000-7000-8000-000000000003',
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
  expect(await screen.findByText('Av. Principal 123')).toBeInTheDocument();
  expect(screen.getAllByText('Publicado').length).toBeGreaterThan(0);
  expect(document.querySelector('pre')).not.toBeInTheDocument();
});
