import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { siteAppearanceLayoutSchema } from '@sergod/contracts';

import { authorizedRequest, publicRequest } from '../identity/api.js';
import { AppearanceEditor } from './AppearanceEditor.js';
import { AppearanceElement, AppearanceLayers, AppearancePageElements } from './SiteAppearance.js';
import { defaultAppearanceLayout } from './appearance-model.js';
import { useSiteAppearance } from './useSiteAppearance.js';

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
  it('inicia con una biblioteca neutral y sin recursos visuales heredados', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');

    const gallery = within(screen.getByLabelText('Elementos visuales disponibles'));
    expect(gallery.getByText('No hay elementos que coincidan.')).toBeInTheDocument();
    expect(screen.getByText('0 elementos disponibles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir imagen' })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'Plantillas visuales editables' })).toBeNull();
  });

  it('ignora una respuesta pública incompleta y conserva un diseño seguro', async () => {
    vi.mocked(publicRequest).mockResolvedValue({ items: [] });
    function Consumer() {
      return <span>{useSiteAppearance().home.layers.length}</span>;
    }
    render(<Consumer />);
    expect(screen.getByText('0')).toBeInTheDocument();
    await waitFor(() => expect(publicRequest).toHaveBeenCalled());
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('muestra la página real elegida y permite alternar a teléfono', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');
    const homePreview = screen.getByTitle('Vista real de Portada');
    expect(homePreview).toHaveAttribute('src', '/?appearance-preview=1');

    fireEvent.click(screen.getByRole('button', { name: 'Noticias' }));
    expect(screen.getByTitle('Vista real de Noticias')).toHaveAttribute(
      'src',
      '/news?appearance-preview=1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Teléfono' }));
    expect(screen.getByTitle('Vista real de Noticias').parentElement).toHaveClass('is-mobile');
  });

  it('ofrece alineación, valores exactos y duplicado para operar una capa con rapidez', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');
    fireEvent.click(screen.getByRole('button', { name: 'Añadir texto' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Alineación de la capa' })).getByText('Centro'),
    );
    expect(screen.getByRole('slider', { name: /Posición horizontal/u })).toHaveValue('36');
    const sizeControl = screen.getByText('Tamaño: 28').closest('.appearance-range');
    if (!sizeControl) throw new Error('No se encontró el control exacto de tamaño.');
    fireEvent.change(within(sizeControl as HTMLElement).getByRole('spinbutton'), {
      target: { value: '40' },
    });
    expect(screen.getByRole('slider', { name: /Tamaño/u })).toHaveValue('40');
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar capa' }));
    expect(
      within(screen.getByRole('list', { name: 'Lista de capas' })).getAllByRole('button'),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Traer al frente' }));
    expect(screen.getByRole('slider', { name: /Orden de capa/u })).toHaveValue('30');
  });

  it('permite recolocar elementos visuales existentes sin exponer controles funcionales', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');
    const elements = within(
      screen.getByRole('list', { name: 'Elementos existentes de la página' }),
    );
    fireEvent.click(elements.getByRole('button', { name: /Título principal/u }));
    fireEvent.change(screen.getByRole('slider', { name: /Desplazamiento horizontal/u }), {
      target: { value: '12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }));
    await waitFor(() => expect(authorizedRequest).toHaveBeenCalledTimes(2));
    const request = JSON.parse(String(vi.mocked(authorizedRequest).mock.calls[0]?.[1]?.body)) as {
      value: string;
    };
    const saved = siteAppearanceLayoutSchema.parse(JSON.parse(request.value));
    expect(saved.home.elements?.find(({ id }) => id === 'home-title')?.offsetX).toBe(12);
    expect(
      screen.getByText(/Navegación, compras y formularios permanecen protegidos/u),
    ).toBeInTheDocument();
  });

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

  it('publica una versión persistente después de añadir una capa de texto', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');

    fireEvent.click(screen.getByRole('button', { name: 'Añadir texto' }));
    expect(
      screen.getByRole('button', { name: /Seleccionar capa Nuevo texto/u }),
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

  it('renderiza una capa de texto independiente', () => {
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
        ]}
      />,
    );
    expect(container.querySelector('.appearance-layer-text')?.textContent).toBe('Evento destacado');
    expect(container.querySelector('.appearance-layer-asset')).toBeNull();
  });

  it('aplica la posición guardada al elemento existente correspondiente', () => {
    const layout = {
      ...defaultAppearanceLayout,
      home: {
        ...defaultAppearanceLayout.home,
        elements: defaultAppearanceLayout.home.elements?.map((element) =>
          element.id === 'home-title' ? { ...element, offsetX: 14, zIndex: 9 } : element,
        ),
      },
    };
    vi.mocked(publicRequest).mockResolvedValue({ layout });
    const { container } = render(
      <AppearancePageElements page="home">
        <AppearanceElement id="home-title">
          <h1>Vista editable</h1>
        </AppearanceElement>
      </AppearancePageElements>,
    );
    return waitFor(() => {
      expect(container.querySelector('h1')).toHaveStyle({
        transform: 'translate(14%, 0%)',
        width: '100%',
        zIndex: '9',
      });
    });
  });
});
