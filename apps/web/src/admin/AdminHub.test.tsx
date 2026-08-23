import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizedRequest, authorizedResponse } from '../identity/api.js';
import { AdminHub } from './AdminHub.js';

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
            name: 'Caja Pokémon',
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
        items: [{ name: 'Pokémon', tcgGameId: '0198a8be-6677-7000-8000-000000000101' }],
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
  it('loads every operational module and exposes real actions', async () => {
    render(<AdminHub />);
    expect(await screen.findByText('SG-2026-000010')).toBeInTheDocument();
    expect((await screen.findAllByText('Caja Pokémon')).length).toBeGreaterThan(0);
    expect(await screen.findByText('ORDER_PAID')).toBeInTheDocument();
    expect(
      vi
        .mocked(authorizedRequest)
        .mock.calls.some(([path]) => path === '/api/v1/admin/loyalty/configurations?limit=25'),
    ).toBe(true);

    fireEvent.click(await screen.findByRole('button', { name: 'Conciliar' }));
    await screen.findByText('Operación guardada correctamente.');
    expect(vi.mocked(authorizedRequest)).toHaveBeenCalledWith(
      '/api/v1/admin/payment-attempts/payment-1/reconcile',
      expect.objectContaining({ method: 'POST' }),
    );
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
    render(<AdminHub />);
    await waitFor(() => expect(screen.getByText('SG-2026-000010')).toBeInTheDocument());
    expect(await screen.findByText('Pagos no disponibles.')).toBeInTheDocument();
  });

  it('sends a complete product edit with idempotency protection', async () => {
    render(<AdminHub />);
    const section = (await screen.findByRole('heading', { name: 'Editar catálogo' })).closest(
      'section',
    );
    if (!section) throw new Error('Catalog editor was not rendered.');
    const form = within(section).getByRole('heading', { name: 'Producto' }).closest('form');
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
    render(<AdminHub />);
    const section = (await screen.findByRole('heading', { name: 'Imágenes del catálogo' })).closest(
      'section',
    );
    if (!section) throw new Error('Catalog resource manager was not rendered.');
    const fields = within(section);
    fireEvent.change(fields.getByLabelText('Producto'), { target: { value: 'product-1' } });
    fireEvent.click(fields.getByRole('button', { name: 'Cargar imágenes' }));
    await waitFor(() =>
      expect(vi.mocked(authorizedResponse)).toHaveBeenCalledWith(
        '/api/v1/admin/catalog/products/product-1/resources?limit=100',
      ),
    );

    const file = new File(['image'], 'product.webp', { type: 'image/webp' });
    const uploadForm = fields.getByRole('heading', { name: 'Subir imagen' }).closest('form');
    if (!uploadForm) throw new Error('Image upload form was not rendered.');
    const uploadFields = within(uploadForm);
    fireEvent.change(uploadFields.getByLabelText('Archivo'), { target: { files: [file] } });
    fireEvent.change(uploadFields.getByLabelText('Texto alternativo'), {
      target: { value: 'Vista frontal del producto' },
    });
    fireEvent.change(uploadFields.getByLabelText('Posición'), { target: { value: '1' } });
    fireEvent.submit(uploadForm);

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(([path]) => path.endsWith('/product-1/resources'));
      expect(call?.[1]).toEqual(
        expect.objectContaining({ body: expect.any(FormData), method: 'POST' }),
      );
      const submitted = call?.[1]?.body as FormData;
      expect(submitted.get('file')).toBeInstanceOf(File);
      expect(submitted.get('altText')).toBe('Vista frontal del producto');
      expect(submitted.get('position')).toBe('1');
    });

    const moveUpButtons = await fields.findAllByRole('button', { name: 'Subir posición' });
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

    await waitFor(() => expect(vi.mocked(authorizedResponse).mock.calls.length).toBeGreaterThan(2));
    const currentFields = within(section);
    const retirementReasons = currentFields.getAllByLabelText('Motivo de retiro');
    const retireButtons = currentFields.getAllByRole('button', { name: 'Retirar' });
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
});
