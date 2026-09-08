import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, publicRequest } from '../identity/api.js';
import { EditorialPage, HomeHighlights, StorePage } from './PublicPages.js';

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
  });
});

describe('public editorial sections', () => {
  it('keeps tournaments informational and renders an explicit empty state', async () => {
    vi.mocked(publicRequest).mockResolvedValue({ items: [] } as never);

    render(<EditorialPage title="Torneos" type="TOURNAMENT" />);

    expect(screen.getByText(/no administra rondas/iu)).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Aún no hay publicaciones para mostrar' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /inscribir/iu })).not.toBeInTheDocument();
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
});
