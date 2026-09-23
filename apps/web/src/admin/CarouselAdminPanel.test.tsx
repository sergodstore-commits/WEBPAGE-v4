import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizedBlob, authorizedRequest } from '../identity/api.js';
import { CarouselAdminPanel } from './CarouselAdminPanel.js';

vi.mock('../identity/api.js', () => ({ authorizedBlob: vi.fn(), authorizedRequest: vi.fn() }));

const first = {
  active: true,
  altText: 'Visitar la tienda',
  heightPx: 800,
  linkPath: '/shop',
  position: 1,
  slideId: '0198a8be-6677-7000-8000-000000000501',
  version: 2,
  widthPx: 1200,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizedBlob).mockResolvedValue(new Blob(['image'], { type: 'image/webp' }));
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:test-banner'),
    revokeObjectURL: vi.fn(),
  });
  vi.mocked(authorizedRequest).mockImplementation(async (path) => {
    if (path === '/api/v1/admin/home-carousel')
      return { items: [first], revision: 'a'.repeat(64) } as never;
    return { items: [first], revision: 'a'.repeat(64) } as never;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('CarouselAdminPanel', () => {
  it('submits an explicit inactive state and reloads the saved list', async () => {
    render(<CarouselAdminPanel />);
    await screen.findByText('Banner 1');
    const form = screen.getByRole('heading', { name: 'Agregar banner' }).closest('form');
    if (!form) throw new Error('Upload form missing.');
    fireEvent.change(screen.getByLabelText('Imagen'), {
      target: { files: [new File(['banner'], 'banner.webp', { type: 'image/webp' })] },
    });
    fireEvent.change(
      screen.getByLabelText('Texto alternativo', { selector: 'input[name="altText"]' }),
      {
        target: { value: 'Nueva preventa' },
      },
    );
    fireEvent.change(screen.getByLabelText('Destino', { selector: 'select[name="linkPath"]' }), {
      target: { value: '/preorders' },
    });
    fireEvent.click(screen.getByLabelText('Publicar inmediatamente'));
    fireEvent.submit(form);

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(([, init]) => init?.method === 'POST');
      expect(call).toBeDefined();
      const body = call?.[1]?.body as FormData;
      expect(body.get('active')).toBe('false');
      expect(body.get('linkPath')).toBe('/preorders');
      expect(body.get('file')).toBeInstanceOf(File);
    });
    await screen.findByText('Banner guardado correctamente.');
  });

  it('sends complete versioned data when toggling a banner', async () => {
    render(<CarouselAdminPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));

    await waitFor(() => {
      const call = vi
        .mocked(authorizedRequest)
        .mock.calls.find(([, init]) => init?.method === 'PUT');
      expect(call?.[0]).toBe(`/api/v1/admin/home-carousel/${first.slideId}`);
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        active: false,
        altText: first.altText,
        expectedVersion: 2,
        linkPath: '/shop',
      });
    });
  });

  it('reuses the same idempotency key when a banner upload is retried', async () => {
    let attempts = 0;
    vi.mocked(authorizedRequest).mockImplementation(async (path, init) => {
      if (path === '/api/v1/admin/home-carousel' && init?.method === 'POST') {
        attempts += 1;
        if (attempts === 1) throw new Error('Conexión interrumpida.');
      }
      return { items: [first], revision: 'a'.repeat(64) } as never;
    });
    render(<CarouselAdminPanel />);
    await screen.findByText('Banner 1');
    const form = screen.getByRole('heading', { name: 'Agregar banner' }).closest('form');
    if (!form) throw new Error('Upload form missing.');
    fireEvent.change(screen.getByLabelText('Imagen'), {
      target: { files: [new File(['same'], 'banner.webp', { type: 'image/webp' })] },
    });
    fireEvent.change(
      screen.getByLabelText('Texto alternativo', { selector: 'input[name="altText"]' }),
      {
        target: { value: 'Banner' },
      },
    );
    fireEvent.submit(form);
    await screen.findByText('Conexión interrumpida.');
    fireEvent.submit(form);
    await screen.findByText('Banner guardado correctamente.');
    const keys = vi
      .mocked(authorizedRequest)
      .mock.calls.filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => (init?.headers as Record<string, string>)['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
