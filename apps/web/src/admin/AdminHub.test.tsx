import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizedRequest, authorizedResponse } from '../identity/api.js';
import { AdminHub, AdminStandaloneLayout } from './AdminHub.js';
import { itemIdentifier, readableText } from './presentation.js';

vi.mock('../identity/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../identity/api.js')>();
  return { ...original, authorizedRequest: vi.fn(), authorizedResponse: vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizedResponse).mockResolvedValue({
    body: { items: [] },
    headers: new Headers({ etag: '"resources-v1"' }),
    status: 200,
  } as never);
  vi.mocked(authorizedRequest).mockImplementation(async (path, init) => {
    if (path.startsWith('/api/v1/admin/content') && !init?.method)
      return {
        items: [
          {
            body: 'Texto inicial.',
            editorialEntryId: '0198a8be-6677-7000-8000-000000000301',
            excerpt: 'Resumen inicial.',
            metadata: {
              document: {
                blocks: [
                  {
                    id: '0198a8be-6677-7000-8000-000000000302',
                    text: 'Texto inicial.',
                    type: 'TEXT',
                  },
                ],
                version: 1,
              },
            },
            slug: 'noticia-inicial',
            status: 'DRAFT',
            title: 'Noticia inicial',
            type: 'NEWS',
          },
        ],
        nextCursor: null,
      } as never;
    if (path === '/api/v1/admin/service-coverage')
      return {
        branches: [
          {
            branch_id: '0198a8be-6677-7000-8000-000000000401',
            name: 'Sergod Store',
            state: 'ACTIVE',
          },
        ],
        serviceInfo: [],
      } as never;
    if (init?.method) return { item: {} } as never;
    if (path.startsWith('/api/v1/admin/orders'))
      return {
        items: [{ orderId: 'order-1', publicNumber: 'SG-2026-000010', state: 'PAID' }],
        nextCursor: null,
      } as never;
    if (path.startsWith('/api/v1/admin/payment-attempts'))
      return {
        items: [{ paymentAttemptId: 'payment-1', provider: 'FLOW', status: 'PENDING' }],
        nextCursor: null,
      } as never;
    if (path.startsWith('/api/v1/admin/catalog/products'))
      return {
        items: [
          {
            categoryId: '0198a8be-6677-7000-8000-000000000102',
            gameId: '0198a8be-6677-7000-8000-000000000101',
            name: 'Preventa aceptaci�n Fase 7',
            priceAmountClp: 39990,
            productId: 'product-1',
            publicationStatus: 'PUBLISHED',
            sku: 'PKM-001',
          },
        ],
        nextCursor: null,
      } as never;
    if (path.startsWith('/api/v1/admin/catalog/tcg-games'))
      return {
        items: [{ gameId: '0198a8be-6677-7000-8000-000000000101', name: 'Pokémon' }],
        nextCursor: null,
      } as never;
    if (path.startsWith('/api/v1/admin/catalog/categories'))
      return {
        items: [{ categoryId: '0198a8be-6677-7000-8000-000000000102', name: 'Sellado' }],
        nextCursor: null,
      } as never;
    if (path.startsWith('/api/v1/admin/audit-entries'))
      return {
        items: [
          {
            action: 'ORDER_PAID',
            auditEntryId: 'audit-1',
            resourceType: 'ORDER',
            result: 'SUCCESS',
          },
        ],
        nextCursor: null,
      } as never;
    return { items: [], nextCursor: null } as never;
  });
});

describe('AdminHub', () => {
  it.each([
    [
      'product',
      { categoryId: 'category-1', gameId: 'game-1', productId: 'product-1' },
      'product-1',
    ],
    [
      'preorder campaign',
      { preorderCampaignId: 'campaign-1', productId: 'product-1' },
      'campaign-1',
    ],
    ['coupon', { couponId: 'coupon-1', promotionId: 'promotion-1' }, 'coupon-1'],
    ['game', { gameId: 'game-1' }, 'game-1'],
    ['fulfillment', { fulfillmentId: 'fulfillment-1', orderId: 'order-1' }, 'fulfillment-1'],
    ['payment attempt', { orderId: 'order-1', paymentAttemptId: 'payment-1' }, 'payment-1'],
  ])('uses the %s primary identifier instead of a related record', (_kind, item, expected) => {
    expect(itemIdentifier(item)).toBe(expected);
  });

  it('organizes every operational module in an accessible sidebar', async () => {
    const navigate = vi.fn();
    render(<AdminHub area="dashboard" navigate={navigate} />);

    const sidebar = screen.getByRole('complementary', { name: 'Navegación administrativa' });
    const navigation = within(sidebar).getByRole('navigation', {
      name: 'Herramientas administrativas',
    });
    expect(within(navigation).getByRole('link', { name: 'Resumen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(navigation).getByRole('link', { name: 'Inventario' })).toHaveAttribute(
      'href',
      '/admin/inventory',
    );
    expect(within(navigation).getByRole('link', { name: 'Actividad' })).toHaveAttribute(
      'href',
      '/admin/audit',
    );
    for (const name of [
      'Resumen',
      'Pedidos',
      'POS',
      'Inventario',
      'Productos',
      'Preventas',
      'Promociones',
      'Carrusel de inicio',
      'Publicaciones',
      'Clientes y usuarios',
      'Datos de la tienda',
      'Ajustes',
      'Actividad',
    ])
      expect(within(navigation).getByRole('link', { name })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: '¿Qué necesitas hacer?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /Abrir POS/ }));
    expect(navigate).toHaveBeenCalledWith('/admin/pos');
    expect(screen.queryByText('Datos de servidor')).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Menú de administración' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(navigation).getByRole('link', { name: 'Pedidos' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(navigate).toHaveBeenCalledWith('/admin/orders');
  });

  it('keeps the same sidebar visible in complementary admin tools', () => {
    render(
      <AdminStandaloneLayout
        currentRoute="/admin/pos"
        description="Caja"
        navigate={vi.fn()}
        title="POS"
      >
        <p>Contenido de caja</p>
      </AdminStandaloneLayout>,
    );

    const sidebar = screen.getByRole('complementary', { name: 'Navegación administrativa' });
    expect(within(sidebar).getByRole('link', { name: 'POS' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar).getByRole('link', { name: 'Clientes y usuarios' })).toHaveAttribute(
      'href',
      '/admin/accounts',
    );
    expect(within(sidebar).getByRole('link', { name: 'Datos de la tienda' })).toHaveAttribute(
      'href',
      '/admin/service-coverage',
    );
  });

  it('loads only the order area modules and exposes their real actions', async () => {
    render(<AdminHub area="orders" navigate={vi.fn()} />);
    expect(await screen.findByText('SG-2026-000010')).toBeInTheDocument();
    expect(
      vi
        .mocked(authorizedRequest)
        .mock.calls.some(([path]) => path === '/api/v1/admin/loyalty/configurations?limit=25'),
    ).toBe(false);
    expect(
      vi
        .mocked(authorizedRequest)
        .mock.calls.some(([path]) => path === '/api/v1/admin/catalog/products?limit=25'),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Pagos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Conciliar' }));
    await screen.findByText('Operación guardada correctamente.');
    expect(vi.mocked(authorizedRequest)).toHaveBeenCalledWith(
      '/api/v1/admin/payment-attempts/payment-1/reconcile',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pedidos' }));
    expect(screen.getByText('Pagado')).toBeInTheDocument();
  });

  it('presents operational labels and repairs only verified damaged text', async () => {
    render(<AdminHub area="catalog" navigate={vi.fn()} />);

    expect((await screen.findAllByText('Preventa aceptación Fase 7')).length).toBeGreaterThan(0);
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.queryByText('PUBLISHED')).not.toBeInTheDocument();
    expect(readableText('Categor�a aceptación')).toBe('Categoría aceptación');
    expect(readableText('Colecci�n aceptación')).toBe('Colección aceptación');
  });

  it('keeps other modules available when one request fails', async () => {
    vi.mocked(authorizedRequest).mockImplementation(async (path) => {
      if (path.startsWith('/api/v1/admin/payment-attempts'))
        throw new Error('Pagos no disponibles.');
      if (path.startsWith('/api/v1/admin/orders'))
        return {
          items: [{ orderId: 'order-1', publicNumber: 'SG-2026-000010', state: 'PAID' }],
          nextCursor: null,
        } as never;
      return { items: [], nextCursor: null } as never;
    });
    render(<AdminHub area="orders" navigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('SG-2026-000010')).toBeInTheDocument());
    fireEvent.click(await screen.findByRole('button', { name: 'Pagos · Error' }));
    expect(await screen.findByText('Pagos no disponibles.')).toBeInTheDocument();
  });

  it('shows only the editor that belongs to the selected area', async () => {
    render(<AdminHub area="promotions" navigate={vi.fn()} />);

    expect(
      (await screen.findAllByRole('heading', { name: 'Promoción porcentual general' })).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Campaña de preventa' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Configuración de puntos' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Contenido editorial' })).not.toBeInTheDocument();
  });

  it('separates dense admin areas into one task at a time', async () => {
    render(<AdminHub area="promotions" navigate={vi.fn()} />);

    expect(
      await screen.findByRole('heading', { name: 'Crear promociones y cupones' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Editar operaciones' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar promoción' }));
    expect(screen.getByRole('heading', { name: 'Editar operaciones' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Crear promociones y cupones' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Estados' }));
    expect(await screen.findByRole('heading', { name: 'Promociones' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cupones' })).toBeInTheDocument();
  });

  it('shows one inventory operation at a time with plain labels', async () => {
    render(<AdminHub area="inventory" navigate={vi.fn()} />);

    expect(
      await screen.findByRole('heading', { name: 'Ingresar productos al inventario' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Corregir una diferencia de inventario' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Corregir stock' }));
    expect(
      screen.getByRole('heading', { name: 'Corregir una diferencia de inventario' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Aviso de pocas unidades' }));
    expect(screen.getByRole('heading', { name: 'Aviso de pocas unidades' })).toBeInTheDocument();
    expect(screen.getByLabelText('Avisar cuando queden')).toBeInTheDocument();
  });

  it('sends a stock entry for the selected product to shared inventory', async () => {
    render(<AdminHub area="inventory" navigate={vi.fn()} />);
    const section = (
      await screen.findByRole('heading', { name: 'Ingresar productos al inventario' })
    ).closest('form');
    if (!section) throw new Error('Inventory form was not rendered.');
    fireEvent.change(within(section).getByLabelText('Producto'), {
      target: { value: 'product-1' },
    });
    fireEvent.change(within(section).getByLabelText('Cantidad'), { target: { value: '3' } });
    fireEvent.submit(section);

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(
          ([path]) => path === '/api/v1/admin/inventory/products/product-1/stock-entries',
        );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ quantity: 3 });
    });
  });

  it('creates a product with its category, price and sale type', async () => {
    render(<AdminHub area="catalog" navigate={vi.fn()} />);
    const form = (await screen.findByRole('heading', { name: 'Datos del producto' })).closest(
      'form',
    );
    if (!form) throw new Error('Product creation form was not rendered.');
    const fields = within(form);
    fireEvent.change(fields.getByLabelText('Juego'), {
      target: { value: '0198a8be-6677-7000-8000-000000000101' },
    });
    fireEvent.change(fields.getByLabelText('Categoría'), {
      target: { value: '0198a8be-6677-7000-8000-000000000102' },
    });
    fireEvent.change(fields.getByLabelText('Nombre'), { target: { value: 'Caja nueva' } });
    fireEvent.change(fields.getByLabelText('SKU'), { target: { value: 'NEW-001' } });
    fireEvent.change(fields.getByLabelText('Precio CLP'), { target: { value: '19990' } });
    fireEvent.change(fields.getByLabelText('Tipo'), { target: { value: 'PREORDER' } });
    fireEvent.submit(form);

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(
          ([path, init]) => path === '/api/v1/admin/catalog/products' && init?.method === 'POST',
        );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        categoryId: '0198a8be-6677-7000-8000-000000000102',
        gameId: '0198a8be-6677-7000-8000-000000000101',
        name: 'Caja nueva',
        priceAmountClp: 19990,
        saleType: 'PREORDER',
        sku: 'NEW-001',
      });
    });
  });

  it('uses the configured store automatically instead of asking for an internal branch code', async () => {
    render(<AdminHub area="preorders" navigate={vi.fn()} />);

    expect(await screen.findAllByLabelText('Tienda configurada')).not.toHaveLength(0);
    expect(screen.getAllByLabelText('Tienda configurada')[0]).toHaveTextContent('Sergod Store');
    expect(screen.queryByLabelText('Sucursal')).not.toBeInTheDocument();
  });

  it('separates total preorder capacity from the optional per-customer maximum', async () => {
    render(<AdminHub area="preorders" navigate={vi.fn()} />);
    const section = (
      await screen.findByRole('heading', { name: 'Nueva campaña de preventa' })
    ).closest('section');
    const form = section?.querySelector('form');
    if (!form) throw new Error('Preorder form was not rendered.');
    const fields = within(form);
    await waitFor(() =>
      expect(fields.getByRole('button', { name: 'Crear campaña' })).toBeEnabled(),
    );
    fireEvent.change(fields.getByLabelText('Producto'), { target: { value: 'product-1' } });
    fireEvent.change(fields.getByLabelText('Unidades disponibles en total'), {
      target: { value: '30' },
    });
    fireEvent.change(fields.getByLabelText('Máximo por cliente (opcional)'), {
      target: { value: '2' },
    });
    fireEvent.change(fields.getByLabelText('Apertura'), { target: { value: '2026-10-01T10:00' } });
    fireEvent.change(fields.getByLabelText('Cierre'), { target: { value: '2026-10-20T22:00' } });
    fireEvent.change(fields.getByLabelText('Llegada estimada'), {
      target: { value: 'Noviembre 2026' },
    });
    fireEvent.submit(form);

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(
          ([path, init]) => path === '/api/v1/admin/preorders/campaigns' && init?.method === 'POST',
        );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        capacity: 30,
        maxPerCustomer: 2,
        productId: 'product-1',
      });
    });
  });

  it('edits editorial content as ordered visual blocks instead of raw text only', async () => {
    render(<AdminHub area="content" navigate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar publicación' }));
    const selector = await screen.findByLabelText('Publicación');
    fireEvent.change(selector, {
      target: { value: '0198a8be-6677-7000-8000-000000000301' },
    });
    expect(screen.getByRole('heading', { name: 'Diseñar publicación' })).toBeInTheDocument();
    expect(screen.getAllByText('Texto inicial.')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Añadir texto' }));
    const textareas = screen.getAllByLabelText('Texto');
    const added = textareas.at(-1);
    if (!added) throw new Error('Added editorial text block was not rendered.');
    fireEvent.change(added, { target: { value: 'Segundo bloque.' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'TOURNAMENT' } });
    fireEvent.change(screen.getByLabelText('Estado del evento'), {
      target: { value: 'COMPLETED' },
    });
    fireEvent.change(screen.getByLabelText('Fecha y hora'), {
      target: { value: '2026-08-10T18:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar publicación' }));

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(
          ([path, init]) =>
            path === '/api/v1/admin/content/0198a8be-6677-7000-8000-000000000301' &&
            init?.method === 'PUT',
        );
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body.body).toBe('Texto inicial.\n\nSegundo bloque.');
      expect(body.metadata.document.blocks).toHaveLength(2);
      expect(body.metadata.document.blocks[1]).toMatchObject({
        text: 'Segundo bloque.',
        type: 'TEXT',
      });
      expect(body.metadata.event).toEqual({
        startsAt: expect.stringContaining('2026-08-10T'),
        status: 'COMPLETED',
      });
      expect(body.metadata.category).toBeUndefined();
    });
  });

  it('finishes an editorial image upload without losing the submitted form', async () => {
    render(<AdminHub area="content" navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar publicación' }));
    fireEvent.change(await screen.findByLabelText('Publicación'), {
      target: { value: '0198a8be-6677-7000-8000-000000000301' },
    });
    await screen.findByText('Publicación cargada en el editor visual.');
    const fallback = vi.mocked(authorizedRequest).getMockImplementation();
    vi.mocked(authorizedRequest).mockImplementation(async (path, init) => {
      if (!(path.endsWith('/resources') && init?.method === 'POST'))
        return fallback?.(path, init) as never;
      return {
        item: {
          body: 'Texto inicial.',
          editorialEntryId: '0198a8be-6677-7000-8000-000000000301',
          excerpt: 'Resumen inicial.',
          metadata: {
            document: {
              blocks: [
                {
                  id: '0198a8be-6677-7000-8000-000000000302',
                  text: 'Texto inicial.',
                  type: 'TEXT',
                },
                {
                  altText: 'Portada temporal',
                  id: '0198a8be-6677-7000-8000-000000000303',
                  resourceId: '0198a8be-6677-7000-8000-000000000304',
                  size: 'MEDIUM',
                  type: 'IMAGE',
                  wrap: 'CENTER',
                },
              ],
              version: 1,
            },
          },
          slug: 'noticia-inicial',
          status: 'DRAFT',
          title: 'Noticia inicial',
          type: 'NEWS',
        },
      } as never;
    });
    const file = new File(['image'], 'cover.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Archivo'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Descripción accesible'), {
      target: { value: 'Portada temporal' },
    });
    const uploadForm = screen.getByRole('heading', { name: 'Insertar imagen' }).closest('form');
    if (!uploadForm) throw new Error('Editorial upload form was not rendered.');
    fireEvent.submit(uploadForm);

    expect(
      await screen.findByText(
        'Imagen insertada en la publicación. Puedes moverla o cambiar su ajuste.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cannot read properties of null/u)).not.toBeInTheDocument();
  });

  it('creates a tournament with the date and public classification required by its page', async () => {
    render(<AdminHub area="content" navigate={vi.fn()} />);

    expect(
      await screen.findByRole('heading', { name: 'Nuevo contenido editorial' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'TOURNAMENT' } });
    fireEvent.change(screen.getByLabelText('Estado del evento'), {
      target: { value: 'UPCOMING' },
    });
    fireEvent.change(screen.getByLabelText('Fecha y hora'), {
      target: { value: '2026-10-10T18:00' },
    });
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Copa Sergod' } });
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'copa-sergod' } });
    fireEvent.change(screen.getByLabelText('Resumen'), { target: { value: 'Próxima fecha.' } });
    fireEvent.change(screen.getByLabelText('Contenido'), {
      target: { value: 'Bases del torneo.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(
          ([path, init]) => path === '/api/v1/admin/content' && init?.method === 'POST',
        );
      const body = JSON.parse(String(call?.[1]?.body));
      expect(body).toMatchObject({
        metadata: {
          event: { startsAt: expect.stringContaining('2026-10-10T'), status: 'UPCOMING' },
        },
        title: 'Copa Sergod',
        type: 'TOURNAMENT',
      });
    });
  });

  it('does not expose removed comic content in the editorial composer', async () => {
    render(<AdminHub area="content" navigate={vi.fn()} />);

    expect(
      await screen.findByRole('heading', { name: 'Nuevo contenido editorial' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /capítulo/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Slug de la serie')).not.toBeInTheDocument();
  });

  it('sends a complete product edit with idempotency protection', async () => {
    render(<AdminHub area="catalog" navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar producto' }));
    const section = (await screen.findByRole('heading', { name: 'Editar producto' })).closest(
      'section',
    );
    if (!section) throw new Error('Catalog editor was not rendered.');
    const form = within(section)
      .getByRole('heading', { name: 'Datos del producto' })
      .closest('form');
    if (!form) throw new Error('Product editor was not rendered.');
    const fields = within(form);
    fireEvent.change(fields.getByLabelText('Producto'), { target: { value: 'product-1' } });
    expect(fields.getByLabelText('SKU')).toHaveValue('PKM-001');
    expect(fields.getByLabelText('Precio CLP')).toHaveValue(39990);
    fireEvent.change(fields.getByLabelText('Juego'), {
      target: { value: '0198a8be-6677-7000-8000-000000000101' },
    });
    fireEvent.change(fields.getByLabelText('Categoría'), {
      target: { value: '0198a8be-6677-7000-8000-000000000102' },
    });
    fireEvent.change(fields.getByLabelText('Nombre'), { target: { value: 'Caja editada' } });
    fireEvent.change(fields.getByLabelText('SKU'), { target: { value: 'PKM-EDIT' } });
    fireEvent.change(fields.getByLabelText('Precio CLP'), { target: { value: '45990' } });
    expect(fields.getByLabelText('Idioma (código internacional)')).toHaveAttribute(
      'placeholder',
      'Ej.: es-CL',
    );
    fireEvent.click(fields.getByRole('button', { name: 'Guardar producto' }));

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(([path]) => path === '/api/v1/admin/catalog/products/product-1');
      expect(call?.[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({ 'idempotency-key': expect.any(String) }),
          method: 'PATCH',
        }),
      );
      expect(JSON.parse(String(call?.[1]?.body))).toEqual(
        expect.objectContaining({ name: 'Caja editada', priceAmountClp: 45990 }),
      );
    });
  });

  it('loads catalog resource metadata and uploads the real multipart body', async () => {
    vi.mocked(authorizedResponse).mockResolvedValue({
      body: {
        items: [
          {
            altText: 'Frente',
            originalFilenameSafe: 'front.webp',
            position: 1,
            resourceId: '0198a8be-6677-7000-8000-000000000201',
            state: 'ACTIVE',
          },
          {
            altText: 'Reverso',
            originalFilenameSafe: 'back.webp',
            position: 2,
            resourceId: '0198a8be-6677-7000-8000-000000000202',
            state: 'ACTIVE',
          },
        ],
        nextCursor: null,
      },
      headers: new Headers({ etag: '"resources-v1"' }),
      status: 200,
    } as never);
    render(<AdminHub area="catalog" navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Imágenes' }));
    const section = (await screen.findByRole('heading', { name: 'Galería del producto' })).closest(
      'section',
    );
    if (!section) throw new Error('Catalog resource manager was not rendered.');
    const fields = within(section);
    fireEvent.change(fields.getByLabelText('Producto'), { target: { value: 'product-1' } });
    await waitFor(() =>
      expect(vi.mocked(authorizedResponse)).toHaveBeenCalledWith(
        '/api/v1/admin/catalog/products/product-1/resources?limit=100',
      ),
    );

    const file = new File(['image'], 'product.webp', { type: 'image/webp' });
    const secondFile = new File(['image-2'], 'product-back.webp', { type: 'image/webp' });
    const uploadForm = fields.getByRole('heading', { name: 'Añadir imágenes' }).closest('form');
    if (!uploadForm) throw new Error('Image upload form was not rendered.');
    const uploadFields = within(uploadForm);
    fireEvent.change(uploadFields.getByLabelText(/Seleccionar imágenes/u), {
      target: { files: [file, secondFile] },
    });
    const descriptions = uploadFields.getAllByLabelText(/Descripción de la imagen/u);
    fireEvent.change(descriptions[0] as HTMLElement, {
      target: { value: 'Vista frontal del producto' },
    });
    fireEvent.change(descriptions[1] as HTMLElement, {
      target: { value: 'Vista posterior del producto' },
    });
    fireEvent.submit(uploadForm);

    await waitFor(() => {
      const calls = vi
        .mocked(authorizedRequest)
        .mock.calls.filter(([path]) => path.endsWith('/product-1/resources'));
      expect(calls).toHaveLength(2);
      const firstSubmitted = calls[0]?.[1]?.body as FormData;
      const secondSubmitted = calls[1]?.[1]?.body as FormData;
      expect(firstSubmitted.get('file')).toBe(file);
      expect(firstSubmitted.get('altText')).toBe('Vista frontal del producto');
      expect(firstSubmitted.get('position')).toBe('3');
      expect(secondSubmitted.get('file')).toBe(secondFile);
      expect(secondSubmitted.get('altText')).toBe('Vista posterior del producto');
      expect(secondSubmitted.get('position')).toBe('4');
    });

    const moveUpButtons = await fields.findAllByRole('button', { name: 'Mover antes' });
    const secondMoveUp = moveUpButtons[1];
    if (!secondMoveUp) throw new Error('Second resource reorder action was not rendered.');
    fireEvent.click(secondMoveUp);
    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(([path]) => path.endsWith('/product-1/resources/order'));
      expect(call?.[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({ 'if-match': '"resources-v1"' }),
          method: 'PATCH',
        }),
      );
      expect(JSON.parse(String(call?.[1]?.body)).orderedResourceIds).toEqual([
        '0198a8be-6677-7000-8000-000000000202',
        '0198a8be-6677-7000-8000-000000000201',
      ]);
    });

    await waitFor(() => expect(vi.mocked(authorizedResponse).mock.calls.length).toBeGreaterThan(1));
    const currentFields = within(section);
    for (const control of currentFields.getAllByText('Reemplazar o quitar imagen')) {
      fireEvent.click(control);
    }
    const retirementReasons = currentFields.getAllByLabelText('Motivo para quitarla');
    const retireButtons = currentFields.getAllByRole('button', { name: 'Quitar de la galería' });
    if (!retirementReasons[0] || !retireButtons[0])
      throw new Error('Resource retirement controls were not rendered.');
    fireEvent.change(retirementReasons[0], { target: { value: 'Imagen desactualizada' } });
    fireEvent.click(retireButtons[0]);
    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(([path]) => path.endsWith('000000000201/retirements'));
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ reason: 'Imagen desactualizada' });
    });

    fireEvent.change(currentFields.getByLabelText('Producto'), { target: { value: '' } });
    expect(currentFields.queryByText('front.webp')).not.toBeInTheDocument();
  });

  it('keeps only pending images after a partial batch failure and retries without duplication', async () => {
    render(<AdminHub area="catalog" navigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Imágenes' }));
    const section = (await screen.findByRole('heading', { name: 'Galería del producto' })).closest(
      'section',
    );
    if (!section) throw new Error('Catalog resource manager was not rendered.');
    const fields = within(section);
    fireEvent.change(fields.getByLabelText('Producto'), { target: { value: 'product-1' } });
    await waitFor(() => expect(authorizedResponse).toHaveBeenCalled());

    let attempts = 0;
    vi.mocked(authorizedRequest).mockImplementation(async (path, init) => {
      if (path.endsWith('/product-1/resources') && init?.method === 'POST') {
        attempts += 1;
        if (attempts === 2) throw new Error('Carga interrumpida.');
      }
      return { item: {} } as never;
    });

    const uploadForm = fields.getByRole('heading', { name: 'Añadir imágenes' }).closest('form');
    if (!uploadForm) throw new Error('Image upload form was not rendered.');
    const first = new File(['first'], 'first.webp', { type: 'image/webp' });
    const second = new File(['second'], 'second.webp', { type: 'image/webp' });
    const discarded = new File(['discarded'], 'discarded.webp', { type: 'image/webp' });
    fireEvent.change(within(uploadForm).getByLabelText(/Seleccionar imágenes/u), {
      target: { files: [first, second, discarded] },
    });
    fireEvent.click(
      within(uploadForm).getByRole('button', { name: 'Quitar discarded.webp de esta carga' }),
    );
    expect(within(uploadForm).queryByText('discarded.webp')).not.toBeInTheDocument();
    const descriptions = within(uploadForm).getAllByLabelText(/Descripción de la imagen/u);
    fireEvent.change(descriptions[0] as HTMLElement, { target: { value: 'Frente' } });
    fireEvent.change(descriptions[1] as HTMLElement, { target: { value: 'Reverso' } });
    fireEvent.submit(uploadForm);

    expect(await screen.findByText(/1 imagen se guardó; faltan 1/u)).toBeInTheDocument();
    expect(within(uploadForm).queryByText('first.webp')).not.toBeInTheDocument();
    expect(within(uploadForm).getByText('second.webp')).toBeInTheDocument();
    const failedCalls = vi
      .mocked(authorizedRequest)
      .mock.calls.filter(([path]) => path.endsWith('/product-1/resources'));
    const failedKey = (failedCalls[1]?.[1]?.headers as Record<string, string> | undefined)?.[
      'idempotency-key'
    ];

    await waitFor(() =>
      expect(within(uploadForm).getByRole('button', { name: 'Añadir a la galería' })).toBeEnabled(),
    );
    fireEvent.submit(uploadForm);
    await waitFor(() => expect(attempts).toBe(3));
    const uploadCalls = vi
      .mocked(authorizedRequest)
      .mock.calls.filter(([path]) => path.endsWith('/product-1/resources'));
    const retryKey = (uploadCalls[2]?.[1]?.headers as Record<string, string> | undefined)?.[
      'idempotency-key'
    ];
    expect(retryKey).toBe(failedKey);
    expect(await screen.findByText('1 imagen subida correctamente.')).toBeInTheDocument();
  });
});
