import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { publicRequest } from '../identity/api.js';
import { HomeShowcase } from './HomeShowcase.js';

vi.mock('../identity/api.js', () => ({ publicRequest: vi.fn() }));

describe('HomeShowcase', () => {
  let frame: FrameRequestCallback;
  const cancel = vi.fn();
  const request = vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    vi.mocked(publicRequest).mockResolvedValue({ items: [] });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('animates without rendering fictional products and cancels frames on pause/unmount', async () => {
    const { container, unmount } = render(<HomeShowcase />);
    await act(async () => undefined);
    expect(screen.getByText(/cartas decorativas/)).toBeInTheDocument();
    const card = container.querySelector('.home-showcase__card') as HTMLElement;
    const before = card.style.transform;
    act(() => {
      frame(100);
      frame(150);
    });
    expect(card.style.transform).not.toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar movimiento automático' }));
    expect(screen.getByRole('region')).toHaveAttribute('data-moving', 'false');
    expect(cancel).toHaveBeenCalled();
    const paused = card.style.transform;
    fireEvent.click(screen.getByRole('button', { name: 'Girar a la derecha' }));
    expect(card.style.transform).not.toBe(paused);
    fireEvent.click(screen.getByRole('button', { name: 'Reanudar movimiento automático' }));
    expect(screen.getByRole('region')).toHaveAttribute('data-moving', 'true');
    const count = cancel.mock.calls.length;
    unmount();
    expect(cancel.mock.calls.length).toBeGreaterThan(count);
  });

  it('uses only admin-selected banners and keeps their destination functional', async () => {
    vi.mocked(publicRequest).mockResolvedValue({
      items: [
        {
          slideId: 'slide-1',
          altText: 'Visitar Preventas',
          linkPath: '/preorders',
        },
      ],
    });
    const { container } = render(<HomeShowcase />);
    await screen.findByText('Banners de Sergod Store');
    const image = container.querySelector('img') as HTMLImageElement;
    expect(image).toHaveAttribute('src', '/api/v1/home-carousel/slide-1/content');
    expect(screen.getByRole('link', { name: 'Visitar Preventas' })).toHaveAttribute(
      'href',
      '/preorders',
    );
    fireEvent.error(image);
    expect(image).toHaveAttribute('hidden');
    expect(publicRequest).toHaveBeenCalledTimes(1);
    expect(publicRequest).toHaveBeenCalledWith('/api/v1/home-carousel');
  });

  it('keeps the scene usable when the catalog is unavailable', async () => {
    vi.mocked(publicRequest).mockRejectedValue(new Error('offline'));
    render(<HomeShowcase />);
    await act(async () => undefined);
    expect(screen.getByText(/cartas decorativas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Girar a la izquierda' })).toBeEnabled();
  });

  it('respects reduced motion while retaining manual navigation', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    const { container } = render(<HomeShowcase />);
    await act(async () => undefined);
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reanudar movimiento automático' })).toBeDisabled();
    const card = container.querySelector('.home-showcase__card') as HTMLElement;
    const before = card.style.transform;
    fireEvent.click(screen.getByRole('button', { name: 'Girar a la izquierda' }));
    expect(card.style.transform).not.toBe(before);
  });

  it('suspends on focus and when the browser is hidden', async () => {
    render(<HomeShowcase />);
    await act(async () => undefined);
    const control = screen.getByRole('button', { name: 'Girar a la izquierda' });
    fireEvent.focus(control);
    expect(screen.getByRole('region')).toHaveAttribute('data-moving', 'false');
    fireEvent.blur(control);
    await waitFor(() => expect(screen.getByRole('region')).toHaveAttribute('data-moving', 'true'));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByRole('region')).toHaveAttribute('data-moving', 'false');
    hidden.mockRestore();
  });
});
