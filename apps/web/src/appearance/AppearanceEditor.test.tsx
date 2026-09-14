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
  it('muestra la galería antes de crear capas y añade el recurso elegido', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');

    const gallery = within(screen.getByLabelText('Elementos visuales disponibles'));
    expect(gallery.getByRole('button', { name: 'Añadir Impacto rojo' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o tipo' }), {
      target: { value: 'banner' },
    });
    fireEvent.click(gallery.getByRole('button', { name: 'Añadir Banners 01 · lámina 03' }));

    expect(
      screen.getByRole('button', { name: 'Seleccionar capa Banners 01 · lámina 03' }),
    ).toBeInTheDocument();
  });

  it('cambia la imagen de un acceso sin convertir su ruta en una capa libre', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');

    fireEvent.click(screen.getByRole('button', { name: /Tienda.*vínculo fijo/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Usar Impacto rojo en Tienda' }));

    expect(screen.getByText('/shop')).toBeInTheDocument();
    expect(screen.getByText(/Vínculo protegido/u)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Lista de capas' })).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }));
    await waitFor(() => expect(authorizedRequest).toHaveBeenCalledTimes(2));
    const request = JSON.parse(String(vi.mocked(authorizedRequest).mock.calls[0]?.[1]?.body)) as {
      value: string;
    };
    const saved = siteAppearanceLayoutSchema.parse(JSON.parse(request.value));
    expect(saved.home.elements?.find(({ id }) => id === 'home-link-shop')?.assetId).toBe(
      'burst-red',
    );
  });

  it('ofrece todos los accesos ilustrados con destinos protegidos', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');

    expect(
      screen.getByRole('button', { name: /Preventas.*\/shop.*vínculo fijo/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Loyalty.*\/account.*vínculo fijo/u }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Quests.*\/tournaments.*vínculo fijo/u }),
    ).toBeInTheDocument();
  });

  it('añade títulos visuales como capas editables en vez de texto horneado', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');

    const presets = within(screen.getByRole('group', { name: 'Plantillas visuales editables' }));
    fireEvent.click(presets.getByRole('button', { name: /Título Torneos/u }));

    expect(
      within(screen.getByRole('list', { name: 'Lista de capas' })).getAllByRole('button'),
    ).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'Texto' })).toHaveValue('TORNEOS');
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

  it('permite recuperar una capa tapada desde la lista ordenada', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');
    fireEvent.click(screen.getByRole('button', { name: 'Añadir imagen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir texto' }));
    const list = within(screen.getByRole('list', { name: 'Lista de capas' }));
    expect(list.getAllByRole('button')[0]).toHaveTextContent('Nuevo texto');
    fireEvent.click(list.getByRole('button', { name: /Impacto rojo/u }));
    expect(screen.getByRole('combobox', { name: 'Imagen aprobada' })).toHaveValue('burst-red');
    fireEvent.click(screen.getByRole('button', { name: 'Quitar capa' }));
    expect(list.queryByRole('button', { name: /Impacto rojo/u })).toBeNull();
    expect(list.getByRole('button', { name: /Nuevo texto/u })).toBeInTheDocument();
  });

  it('agrupa los recursos aprobados y permite elegirlos mediante miniaturas', async () => {
    render(<AppearanceEditor />);
    await screen.findByText('Aún no hay una versión publicada. Puedes crear la primera.');
    fireEvent.click(screen.getByRole('button', { name: 'Añadir imagen' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría visual' }), {
      target: { value: 'Marcos' },
    });
    const thumbnails = within(screen.getByLabelText('Miniaturas de Marcos'));
    fireEvent.click(thumbnails.getByRole('button', { name: 'Marcos 01 · lámina 02' }));
    expect(screen.getByRole('combobox', { name: 'Imagen aprobada' })).toHaveValue(
      'sheet-02-frame-01',
    );
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
