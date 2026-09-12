import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizedRequest, publicRequest } from '../identity/api.js';
import { AppearanceEditor } from './AppearanceEditor.js';
import { AppearanceLayers } from './SiteAppearance.js';

vi.mock('../identity/api.js', () => ({
  authorizedRequest: vi.fn(),
  publicRequest: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(publicRequest).mockResolvedValue({ layout: null });
  vi.mocked(authorizedRequest)
    .mockResolvedValueOnce({
      item: { systemConfigurationId: '0198a8be-6677-7000-8000-000000000901' },
    })
    .mockResolvedValueOnce({ item: {} });
});

describe('editor de apariencia web', () => {
  it('publica una versión persistente después de añadir una capa aprobada', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');

    fireEvent.click(screen.getByRole('button', { name: 'Añadir imagen' }));
    expect(
      screen.getByRole('button', { name: /Seleccionar capa Impacto rojo/u }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }));

    await waitFor(() => expect(authorizedRequest).toHaveBeenCalledTimes(2));
    expect(authorizedRequest).toHaveBeenNthCalledWith(
      1,
      '/api/v1/admin/system-configurations',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(String(vi.mocked(authorizedRequest).mock.calls[0]?.[1]?.body)).toContain(
      'WEB_APPEARANCE_LAYOUT',
    );
    expect(await screen.findByText(/Apariencia publicada/u)).toBeInTheDocument();
  });

  it('renderiza texto e imágenes como capas independientes', () => {
    const { container } = render(
      <AppearanceLayers
        layers={[
          {
            content: 'Evento destacado',
            hiddenOnMobile: false,
            id: 'notice',
            kind: 'TEXT',
            width: 30,
            x: 10,
            y: 20,
            zIndex: 8,
          },
          {
            assetId: 'burst-red',
            hiddenOnMobile: true,
            id: 'burst',
            kind: 'ASSET',
            width: 20,
            x: 70,
            y: 60,
            zIndex: 2,
          },
        ]}
      />,
    );
    expect(container.querySelector('.appearance-layer-text')?.textContent).toBe('Evento destacado');
    expect(container.querySelector('.appearance-layer-asset img')).toHaveAttribute(
      'src',
      expect.stringContaining('fx_01.webp'),
    );
  });
});
