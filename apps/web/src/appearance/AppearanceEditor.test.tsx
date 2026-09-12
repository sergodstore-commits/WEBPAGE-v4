import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizedRequest, publicRequest } from '../identity/api.js';
import { AppearanceEditor } from './AppearanceEditor.js';
import { AppearanceLayers } from './SiteAppearance.js';
import { defaultAppearanceLayout } from './appearance-model.js';

vi.mock('../identity/api.js', () => ({
  authorizedRequest: vi.fn(),
  publicRequest: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(publicRequest).mockResolvedValue({ layout: null });
  vi.mocked(authorizedRequest)
    .mockResolvedValueOnce({
      item: { systemConfigurationId: '0198a8be-6677-7000-8000-000000000901' },
    })
    .mockResolvedValueOnce({ item: {} });
});

describe('editor de apariencia web', () => {
  it('impide reemplazar la apariencia si su lectura falla', async () => {
    vi.mocked(publicRequest).mockRejectedValue(new Error('offline'));
    render(<AppearanceEditor />);
    expect(screen.getByRole('button', { name: 'Guardar y publicar' })).toBeDisabled();
    await screen.findByText(/Recarga antes de editar/u);
    expect(screen.getByRole('button', { name: 'Añadir imagen' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }));
    expect(authorizedRequest).not.toHaveBeenCalled();
  });

  it('reintenta la misma activación sin duplicar el borrador después de un fallo', async () => {
    vi.mocked(authorizedRequest)
      .mockReset()
      .mockResolvedValueOnce({ item: { systemConfigurationId: 'version-1' } })
      .mockRejectedValueOnce(new Error('Conexión interrumpida'))
      .mockResolvedValueOnce({ item: {} });
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }));
    await screen.findByText('Conexión interrumpida');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }));
    await screen.findByText(/Apariencia publicada\./u);
    const calls = vi.mocked(authorizedRequest).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[1]).toEqual(calls[2]);
  });

  it('recarga las capas publicadas y permite seleccionarlas sin arrastrar', async () => {
    vi.mocked(publicRequest).mockResolvedValue({
      layout: {
        ...defaultAppearanceLayout,
        home: {
          layers: [
            {
              id: 'saved-text',
              content: 'Texto guardado',
              kind: 'TEXT',
              hiddenOnMobile: false,
              width: 30,
              x: 10,
              y: 25,
              zIndex: 8,
            },
          ],
        },
      },
    });
    const first = render(<AppearanceEditor />);
    await screen.findByText('Apariencia publicada cargada.');
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar capa Texto guardado' }));
    expect(screen.getByRole('textbox', { name: 'Texto' })).toHaveValue('Texto guardado');
    first.unmount();
    render(<AppearanceEditor />);
    expect(
      await screen.findByRole('button', { name: 'Seleccionar capa Texto guardado' }),
    ).toBeInTheDocument();
  });

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

  it('mantiene capas independientes para cada sección pública', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');

    fireEvent.click(screen.getByRole('button', { name: 'Noticias' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir texto' }));
    expect(
      screen.getByRole('button', { name: /Seleccionar capa Nuevo texto/u }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Portada' }));
    expect(screen.queryByRole('button', { name: /Seleccionar capa Nuevo texto/u })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Noticias' }));
    expect(
      screen.getByRole('button', { name: /Seleccionar capa Nuevo texto/u }),
    ).toBeInTheDocument();
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
