import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, publicRequest } from '../identity/api.js';
import {
  ComicsPage,
  CommunityPage,
  EditorialPage,
  HomeHighlights,
  NewsPage,
  StorePage,
  TournamentPage,
} from './PublicPages.js';

vi.mock('../identity/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../identity/api.js')>();
  return {
    ...original,
    authorizedRequest: vi.fn(),
    currentSession: vi.fn(() => null),
    publicRequest: vi.fn(),
  };
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('public home highlights', () => {
  it('renders only real commerce and editorial records returned by the server', async () => {
    vi.mocked(publicRequest).mockImplementation(async (path) => {
      if (path.includes('saleType=REGULAR')) {
        return { items: [homeProduct('Producto publicado', 'REGULAR')] } as never;
      }
      if (path.includes('saleType=PREORDER')) {
        return { items: [homeProduct('Preventa publicada', 'PREORDER')] } as never;
      }
      if (path.includes('type=NEWS')) {
        return { items: [homeEditorial('Noticia publicada', 'NEWS')] } as never;
      }
      if (path.includes('type=TOURNAMENT')) {
        return { items: [homeEditorial('Torneo publicado', 'TOURNAMENT')] } as never;
      }
      throw new Error(`Ruta inesperada: ${path}`);
    });
    const navigate = vi.fn();

    render(<HomeHighlights navigate={navigate} />);

    expect(await screen.findByText('Producto publicado')).toBeInTheDocument();
    expect(screen.getByText('Preventa publicada')).toBeInTheDocument();
    expect(screen.getByText('Noticia publicada')).toBeInTheDocument();
    expect(screen.getByText('Torneo publicado')).toBeInTheDocument();
    expect(screen.getAllByText('$9.990')).toHaveLength(2);
    expect(vi.mocked(publicRequest).mock.calls.map(([path]) => path)).toEqual(
      expect.arrayContaining([
        '/api/v1/catalog/products?limit=4&sort=NEWEST&saleType=REGULAR',
        '/api/v1/catalog/products?limit=4&sort=NEWEST&saleType=PREORDER',
        '/api/v1/content?limit=3&type=NEWS',
        '/api/v1/content?limit=3&type=TOURNAMENT',
      ]),
    );
    const [openTournament] = screen.getAllByRole('button', { name: 'Abrir publicación' });
    expect(openTournament).toBeDefined();
    if (openTournament === undefined) throw new Error('No se encontró el acceso al torneo.');
    fireEvent.click(openTournament);
    expect(navigate).toHaveBeenCalledWith('/tournaments');
  });

  it('shows honest empty states instead of invented highlights', async () => {
    vi.mocked(publicRequest).mockResolvedValue({ items: [] } as never);

    render(<HomeHighlights navigate={vi.fn()} />);

    expect(
      await screen.findByText('Aún no hay productos regulares publicados.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Aún no hay preventas publicadas.')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay torneos publicados.')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay noticias publicadas.')).toBeInTheDocument();
  });
});

function homeProduct(name: string, saleType: 'PREORDER' | 'REGULAR') {
  return {
    availableForPurchase: true,
    availabilityStatus: 'AVAILABLE',
    game: { gameId: crypto.randomUUID(), name: 'Pokémon', slug: 'pokemon' },
    name,
    priceAmountClp: 9990,
    preorderCampaignId: saleType === 'PREORDER' ? crypto.randomUUID() : null,
    primaryResource: {
      altText: name,
      heightPx: 800,
      resourceId: crypto.randomUUID(),
      widthPx: 600,
    },
    productId: crypto.randomUUID(),
    saleType,
  } as const;
}

function homeEditorial(title: string, type: 'NEWS' | 'TOURNAMENT') {
  return {
    body: '',
    editorialEntryId: crypto.randomUUID(),
    excerpt: `Resumen de ${title}`,
    metadata: {},
    slug: title.toLowerCase().replaceAll(' ', '-'),
    title,
    type,
  };
}

describe('public Store cart action', () => {
  it('keeps the long filter form collapsed initially on mobile', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      })),
    );
    vi.mocked(publicRequest).mockResolvedValue({ items: [], nextCursor: null } as never);

    render(<StorePage />);

    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar filtros' }));
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar productos')).toBeInTheDocument();
  });

  it('shows an explicit empty state when the catalog cannot return products', async () => {
    vi.mocked(publicRequest).mockRejectedValue(new Error('Catálogo temporalmente no disponible.'));

    render(<StorePage />);

    expect(
      await screen.findByRole('heading', { name: 'No hay productos para mostrar' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Catálogo temporalmente no disponible.')).toBeInTheDocument();
  });

  it('creates an anonymous cart when required and retries the line command', async () => {
    vi.mocked(publicRequest).mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/catalog/products?')) {
        return {
          items: [
            {
              availableForPurchase: true,
              availabilityStatus: 'AVAILABLE',
              game: {
                gameId: '0198a8be-6677-7000-8000-000000000030',
                name: 'Pokémon',
                slug: 'pokemon',
              },
              name: 'Booster regular',
              priceAmountClp: 4990,
              preorderCampaignId: null,
              primaryResource: {
                altText: 'Booster regular',
                heightPx: 800,
                resourceId: '0198a8be-6677-7000-8000-000000000040',
                widthPx: 600,
              },
              productId: '0198a8be-6677-7000-8000-000000000010',
              saleType: 'REGULAR',
            },
          ],
          nextCursor: null,
        } as never;
      }
      const lineCalls = vi
        .mocked(publicRequest)
        .mock.calls.filter(([requestedPath]) => requestedPath === '/api/v1/cart/lines').length;
      if (path === '/api/v1/cart/lines' && lineCalls === 1) {
        throw new ApiError('CART_SESSION_REQUIRED', 'Cart session required.');
      }
      if (path.startsWith('/api/v1/catalog/')) return { items: [], nextCursor: null } as never;
      return {} as never;
    });

    render(<StorePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar al carrito' }));

    await screen.findByText('Booster regular fue agregado al carrito.');
    const paths = vi.mocked(publicRequest).mock.calls.map(([path]) => path);
    expect(paths.filter((path) => path === '/api/v1/cart/lines')).toHaveLength(2);
    expect(paths).toContain('/api/v1/cart');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Agregar al carrito' })).toBeEnabled(),
    );
  });

  it('adds an available preorder with its real campaign identifier', async () => {
    const preorderCampaignId = '0198a8be-6677-7000-8000-000000000020';
    vi.mocked(publicRequest).mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/catalog/products?')) {
        return {
          items: [
            {
              availableForPurchase: true,
              availabilityStatus: 'LAST_UNITS',
              game: {
                gameId: '0198a8be-6677-7000-8000-000000000030',
                name: 'Pokémon',
                slug: 'pokemon',
              },
              name: 'Caja en preventa',
              priceAmountClp: 49_990,
              preorderCampaignId,
              primaryResource: {
                altText: 'Caja en preventa',
                heightPx: 800,
                resourceId: '0198a8be-6677-7000-8000-000000000041',
                widthPx: 600,
              },
              productId: '0198a8be-6677-7000-8000-000000000011',
              saleType: 'PREORDER',
            },
          ],
          nextCursor: null,
        } as never;
      }
      if (path.startsWith('/api/v1/catalog/')) return { items: [], nextCursor: null } as never;
      return {} as never;
    });

    render(<StorePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar al carrito' }));
    await screen.findByText('Caja en preventa fue agregado al carrito.');

    const lineCall = vi
      .mocked(publicRequest)
      .mock.calls.find(([path]) => path === '/api/v1/cart/lines');
    expect(JSON.parse(String(lineCall?.[1]?.body))).toMatchObject({ preorderCampaignId });
  });

  it('shows the published window, arrival and available capacity for a preorder', async () => {
    const preorderCampaignId = '0198a8be-6677-7000-8000-000000000020';
    const productId = '0198a8be-6677-7000-8000-000000000011';
    const card = {
      availableForPurchase: true,
      availabilityStatus: 'AVAILABLE',
      game: {
        gameId: '0198a8be-6677-7000-8000-000000000030',
        name: 'Pokémon',
        slug: 'pokemon',
      },
      name: 'Caja en preventa',
      priceAmountClp: 49_990,
      preorderCampaignId,
      primaryResource: {
        altText: 'Caja en preventa',
        heightPx: 800,
        resourceId: '0198a8be-6677-7000-8000-000000000041',
        widthPx: 600,
      },
      productId,
      saleType: 'PREORDER',
    } as const;
    vi.mocked(publicRequest).mockImplementation(async (path) => {
      if (path === `/api/v1/catalog/products/${productId}`) {
        return {
          item: {
            ...card,
            category: { categoryId: crypto.randomUUID(), name: 'Sellados' },
            collection: null,
            condition: 'SEALED',
            description: 'Reserva sujeta a las condiciones publicadas.',
            edition: null,
            language: 'es-CL',
            preorder: {
              availableCapacity: 7,
              capacity: 10,
              closesAt: '2026-10-02T20:00:00.000Z',
              estimatedArrivalText: 'Llegada estimada en octubre',
              opensAt: '2026-09-02T20:00:00.000Z',
              preorderCampaignId,
            },
            resources: [card.primaryResource],
            sku: 'PRE-001',
          },
        } as never;
      }
      if (path.startsWith('/api/v1/catalog/products?')) {
        return { items: [card], nextCursor: null } as never;
      }
      return { items: [], nextCursor: null } as never;
    });

    render(<StorePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByText('Información de la campaña')).toBeInTheDocument();
    expect(screen.getByText('Llegada estimada en octubre')).toBeInTheDocument();
    expect(screen.getByText('7 de 10')).toBeInTheDocument();
    expect(screen.getByText('Reserva sujeta a las condiciones publicadas.')).toBeInTheDocument();
  });

  it('sends server-side filters and opens the real product detail', async () => {
    const productId = '0198a8be-6677-7000-8000-000000000012';
    const card = {
      availableForPurchase: true,
      availabilityStatus: 'LAST_UNITS',
      game: {
        gameId: '0198a8be-6677-7000-8000-000000000030',
        name: 'Pokémon',
        slug: 'pokemon',
      },
      name: 'Colección especial',
      priceAmountClp: 19_990,
      preorderCampaignId: null,
      primaryResource: {
        altText: 'Colección especial',
        heightPx: 800,
        resourceId: '0198a8be-6677-7000-8000-000000000042',
        widthPx: 600,
      },
      productId,
      saleType: 'REGULAR',
    } as const;
    vi.mocked(publicRequest).mockImplementation(async (path) => {
      if (path === `/api/v1/catalog/products/${productId}`) {
        return {
          item: {
            ...card,
            category: { categoryId: crypto.randomUUID(), name: 'Sellados' },
            collection: { collectionId: crypto.randomUUID(), name: 'Edición especial' },
            condition: 'SEALED',
            description: 'Descripción pública',
            edition: 'FIRST EDITION',
            language: 'es-CL',
            preorder: null,
            resources: [
              card.primaryResource,
              {
                altText: 'Reverso de la colección',
                heightPx: 800,
                resourceId: '0198a8be-6677-7000-8000-000000000043',
                widthPx: 600,
              },
            ],
            sku: 'SKU-001',
          },
        } as never;
      }
      if (path.startsWith('/api/v1/catalog/products?')) {
        return { items: [card], nextCursor: null } as never;
      }
      return { items: [], nextCursor: null } as never;
    });

    render(<StorePage />);
    await screen.findByText('Colección especial');
    fireEvent.change(screen.getByLabelText('Disponibilidad'), {
      target: { value: 'LAST_UNITS' },
    });
    fireEvent.change(screen.getByLabelText('Precio mínimo'), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText('Ordenar'), { target: { value: 'PRICE_ASC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    await waitFor(() => {
      const productPaths = vi
        .mocked(publicRequest)
        .mock.calls.map(([path]) => path)
        .filter((path) => path.startsWith('/api/v1/catalog/products?'));
      expect(productPaths.at(-1)).toContain('availabilityStatus=LAST_UNITS');
      expect(productPaths.at(-1)).toContain('minimumPriceClp=10000');
      expect(productPaths.at(-1)).toContain('sort=PRICE_ASC');
    });
    expect(
      screen.getByRole('button', { name: /Disponibilidad: Últimas unidades/iu }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Precio mínimo: \$10\.000/iu })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(await screen.findByText('SKU-001')).toBeInTheDocument();
    expect(screen.getByText('Descripción pública')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver imagen 2: Reverso de la colección' }));
    expect(screen.getByRole('img', { name: 'Reverso de la colección' })).toHaveAttribute(
      'src',
      '/api/v1/catalog/resources/0198a8be-6677-7000-8000-000000000043/content',
    );
  });
});

describe('public editorial sections', () => {
  it('organizes tournaments, quests and Hall of Fame without inventing competitive operations', async () => {
    vi.mocked(publicRequest)
      .mockResolvedValueOnce({
        items: [
          {
            body: 'Bases del próximo torneo.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000101',
            excerpt: 'Próxima fecha.',
            metadata: {
              event: { startsAt: '2026-10-10T18:00:00-03:00', status: 'UPCOMING' },
            },
            slug: 'copa-sergod',
            title: 'Copa Sergod',
            type: 'TOURNAMENT',
          },
          {
            body: 'Podio y resumen del torneo.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000102',
            excerpt: 'Resultados oficiales.',
            metadata: {
              event: { startsAt: '2026-08-10T18:00:00-04:00', status: 'COMPLETED' },
            },
            slug: 'liga-agosto',
            title: 'Liga de agosto',
            type: 'TOURNAMENT',
          },
          {
            body: 'Información histórica.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000103',
            excerpt: 'Publicación anterior.',
            metadata: {},
            slug: 'torneo-historico',
            title: 'Torneo histórico',
            type: 'TOURNAMENT',
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        items: [
          {
            body: 'Reconocimiento de la comunidad.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000105',
            excerpt: 'Jugador destacado.',
            metadata: {},
            slug: 'campeon-sergod',
            title: 'Campeón Sergod',
            type: 'HALL_OF_FAME',
          },
        ],
      } as never);

    render(<TournamentPage />);

    expect(screen.getByText(/no administra rondas ni emparejamientos/iu)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Próximos torneos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Torneos realizados' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Información de torneos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Eventos y Quests' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hall of Fame' })).toBeInTheDocument();
    expect(screen.getByText('Copa Sergod')).toBeInTheDocument();
    expect(screen.getByText('Liga de agosto')).toBeInTheDocument();
    expect(screen.getByText('Torneo histórico')).toBeInTheDocument();
    expect(screen.queryByText('Quest Sergod')).not.toBeInTheDocument();
    expect(screen.getByText('Campeón Sergod')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inscribir/iu })).not.toBeInTheDocument();

    const completed = screen
      .getByRole('heading', { name: 'Torneos realizados' })
      .closest('section');
    if (!completed) throw new Error('Completed tournament section was not rendered.');
    fireEvent.click(within(completed).getByRole('button', { name: 'Ver detalle' }));
    expect(screen.getByText('Podio y resumen del torneo.')).toBeInTheDocument();
  });

  it('keeps tournaments informational and renders explicit empty sections', async () => {
    vi.mocked(publicRequest).mockResolvedValue({ items: [] } as never);

    render(<TournamentPage />);

    expect(screen.getByText(/no administra rondas ni emparejamientos/iu)).toBeInTheDocument();
    expect(await screen.findByText('Aún no hay próximos torneos publicados.')).toBeInTheDocument();
    expect(screen.getByText('Aún no hay torneos realizados publicados.')).toBeInTheDocument();
    expect(screen.queryByText('Aún no hay Eventos o Quests publicados.')).not.toBeInTheDocument();
    expect(screen.getByText('Aún no hay reconocimientos publicados.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inscribir/iu })).not.toBeInTheDocument();
  });

  it('presents Quests as its own destination without tournament content', async () => {
    vi.mocked(publicRequest).mockResolvedValue({
      items: [
        {
          body: 'Detalles de la Quest.',
          editorialEntryId: '0198a8be-6677-7000-8000-000000000104',
          excerpt: 'Quest destacada.',
          metadata: {},
          slug: 'quest-sergod',
          title: 'Quest Sergod',
          type: 'QUEST',
        },
      ],
    } as never);

    render(<TournamentPage view="quests" />);

    expect(await screen.findByRole('heading', { name: 'Quests' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Eventos y Quests' })).toBeInTheDocument();
    expect(screen.getByText('Quest Sergod')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Próximos torneos' })).not.toBeInTheDocument();
    expect(publicRequest).toHaveBeenCalledTimes(1);
    expect(publicRequest).toHaveBeenCalledWith('/api/v1/content?limit=24&type=QUEST');
  });

  it('opens the complete publication and renders its safe image layout', async () => {
    vi.mocked(publicRequest).mockResolvedValue({
      items: [
        {
          body: 'Texto compatible.',
          editorialEntryId: '0198a8be-6677-7000-8000-000000000010',
          excerpt: 'Resumen de la noticia.',
          metadata: {
            document: {
              blocks: [
                {
                  altText: 'Jugadores reunidos en Sergod Store',
                  id: '0198a8be-6677-7000-8000-000000000020',
                  placement: 'RIGHT',
                  resourceId: '0198a8be-6677-7000-8000-000000000020',
                  type: 'IMAGE',
                  width: 'MEDIUM',
                },
                {
                  id: '0198a8be-6677-7000-8000-000000000021',
                  text: 'Contenido completo de la noticia.',
                  type: 'TEXT',
                },
              ],
              version: 1,
            },
          },
          slug: 'encuentro-sergod',
          title: 'Encuentro Sergod',
          type: 'NEWS',
        },
      ],
    } as never);

    render(<EditorialPage title="Noticias" type="NEWS" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Leer publicación' }));

    expect(screen.getByText('Contenido completo de la noticia.')).toBeInTheDocument();
    const image = screen.getByRole('img', { name: 'Jugadores reunidos en Sergod Store' });
    expect(image).toHaveAttribute(
      'src',
      '/api/v1/catalog/resources/0198a8be-6677-7000-8000-000000000020/content',
    );
    expect(image.closest('figure')).toHaveClass('placement-right', 'width-medium');
  });

  it('shows a news cover, real categories and the complete selected article', async () => {
    vi.mocked(publicRequest).mockResolvedValue({
      items: [
        {
          body: 'Contenido principal.',
          editorialEntryId: '0198a8be-6677-7000-8000-000000000110',
          excerpt: 'Resumen principal.',
          metadata: {
            category: 'Novedades',
            document: {
              blocks: [
                {
                  altText: 'Mesa de juego preparada',
                  id: '0198a8be-6677-7000-8000-000000000111',
                  placement: 'FULL',
                  resourceId: '0198a8be-6677-7000-8000-000000000112',
                  type: 'IMAGE',
                  width: 'LARGE',
                },
              ],
              version: 1,
            },
          },
          slug: 'nueva-temporada',
          title: 'Nueva temporada',
          type: 'NEWS',
        },
        {
          body: 'Bases y detalles del evento.',
          editorialEntryId: '0198a8be-6677-7000-8000-000000000113',
          excerpt: 'Resumen del evento.',
          metadata: { category: 'Eventos' },
          slug: 'evento-especial',
          title: 'Evento especial',
          type: 'NEWS',
        },
      ],
    } as never);

    render(<NewsPage />);

    const cover = await screen.findByRole('img', { name: 'Mesa de juego preparada' });
    expect(cover).toHaveAttribute(
      'src',
      '/api/v1/catalog/resources/0198a8be-6677-7000-8000-000000000112/content',
    );
    expect(screen.getByRole('button', { name: 'Novedades' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eventos' }));
    expect(screen.queryByText('Nueva temporada')).not.toBeInTheDocument();
    expect(screen.getByText('Evento especial')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leer artículo' }));
    expect(screen.getByText('Bases y detalles del evento.')).toBeInTheDocument();
  });

  it('joins community activities with the configured single-store contact information', async () => {
    vi.mocked(publicRequest).mockImplementation(async (path) => {
      if (path.includes('type=COMMUNITY'))
        return {
          items: [
            {
              body: 'Todos los detalles de la actividad.',
              editorialEntryId: '0198a8be-6677-7000-8000-000000000120',
              excerpt: 'Actividad abierta a la comunidad.',
              metadata: {},
              slug: 'tarde-de-juego',
              title: 'Tarde de juego',
              type: 'COMMUNITY',
            },
          ],
        } as never;
      if (path === '/api/v1/service-coverage/store')
        return {
          item: {
            branchId: '0198a8be-6677-7000-8000-000000000121',
            name: 'Sergod Store',
            openingHours: '10:00 a 22:00',
            publicAddress: 'Los Carrera 5142, Copiapó',
            publicContacts: '+56934423169 · sergodstore@gmail.com',
          },
        } as never;
      throw new Error(`Unexpected path ${path}`);
    });
    const navigate = vi.fn();

    render(<CommunityPage navigate={navigate} />);

    expect(await screen.findByText('Tarde de juego')).toBeInTheDocument();
    expect(screen.getByText('Los Carrera 5142, Copiapó')).toBeInTheDocument();
    expect(screen.getByText('10:00 a 22:00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/56934423169',
    );
    expect(screen.getByRole('link', { name: 'Correo' })).toHaveAttribute(
      'href',
      'mailto:sergodstore@gmail.com',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Torneos y Quests' }));
    expect(navigate).toHaveBeenCalledWith('/tournaments');
    fireEvent.click(screen.getByRole('button', { name: 'Ver actividad' }));
    expect(screen.getByText('Todos los detalles de la actividad.')).toBeInTheDocument();
  });

  it('navigates from comic series to ordered chapters and the image reader', async () => {
    vi.mocked(publicRequest)
      .mockResolvedValueOnce({
        items: [
          {
            body: 'Presentación de la serie.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000130',
            excerpt: 'Una historia de la comunidad.',
            metadata: {
              document: {
                blocks: [
                  {
                    altText: 'Portada de Guardianes de Sergod',
                    id: '0198a8be-6677-7000-8000-000000000131',
                    placement: 'FULL',
                    resourceId: '0198a8be-6677-7000-8000-000000000132',
                    type: 'IMAGE',
                    width: 'LARGE',
                  },
                ],
                version: 1,
              },
            },
            slug: 'guardianes-de-sergod',
            title: 'Guardianes de Sergod',
            type: 'COMIC_SERIES',
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        items: [
          {
            body: 'Contenido del segundo capítulo.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000133',
            excerpt: 'La historia continúa.',
            metadata: { comic: { chapterNumber: 2, seriesSlug: 'guardianes-de-sergod' } },
            slug: 'guardianes-capitulo-2',
            title: 'El desafío',
            type: 'COMIC_CHAPTER',
          },
          {
            body: 'Contenido del primer capítulo.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000134',
            excerpt: 'Aquí comienza la historia.',
            metadata: { comic: { chapterNumber: 1, seriesSlug: 'guardianes-de-sergod' } },
            slug: 'guardianes-capitulo-1',
            title: 'El comienzo',
            type: 'COMIC_CHAPTER',
          },
          {
            body: 'Capítulo anterior.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000135',
            excerpt: 'Pendiente de clasificación.',
            metadata: {},
            slug: 'capitulo-anterior',
            title: 'Historia anterior',
            type: 'COMIC_CHAPTER',
          },
        ],
      } as never);

    render(<ComicsPage />);

    expect(await screen.findByText('Guardianes de Sergod')).toBeInTheDocument();
    expect(screen.getByText('Serie · 2 capítulos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Capítulos por organizar' })).toBeInTheDocument();
    expect(screen.getByText('Historia anterior')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Portada de Guardianes de Sergod' })).toHaveAttribute(
      'src',
      '/api/v1/catalog/resources/0198a8be-6677-7000-8000-000000000132/content',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver serie' }));
    const chapterButtons = screen.getAllByRole('button', { name: 'Leer capítulo' });
    expect(chapterButtons).toHaveLength(2);
    expect(chapterButtons[0]?.closest('article')).toHaveTextContent('Capítulo 1');
    expect(chapterButtons[1]?.closest('article')).toHaveTextContent('Capítulo 2');
    fireEvent.click(chapterButtons[0] as HTMLElement);
    expect(screen.getByText('Contenido del primer capítulo.')).toBeInTheDocument();
  });
});
