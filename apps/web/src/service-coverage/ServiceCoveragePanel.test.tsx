import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ServiceCoveragePanel } from './ServiceCoveragePanel.js';

vi.mock('./api.js', () => ({
  readCoverage: vi.fn().mockResolvedValue({
    serviceInfo: [],
  }),
  savePublicServiceInfo: vi.fn(),
  transitionServiceInfo: vi.fn(),
}));

it('renders the administrative service coverage workflow', () => {
  render(<ServiceCoveragePanel />);
  for (const name of ['Atención pública', 'Despacho nacional', 'Publicar o retirar atención'])
    expect(screen.getByRole('heading', { name })).toBeInTheDocument();
  expect(screen.getByText('NO INCLUIDO — ENVÍO POR PAGAR')).toBeInTheDocument();
  expect(screen.queryByText(/tarifa CLP/iu)).not.toBeInTheDocument();
});
