import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { currentSession, ownAccount } from '../identity/api.js';
import { App, RouteErrorBoundary } from './App';

vi.mock('../identity/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../identity/api.js')>();
  return { ...original, currentSession: vi.fn(() => null), ownAccount: vi.fn() };
});

describe('IdentityAccess presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentSession).mockReturnValue(null);
    window.history.replaceState({}, '', '/');
  });

  it('presents the public commerce home while preserving account access', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /tu próxima jugada/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explorar tienda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument();
  });

  it('offers only verified email login and exposes no phone authentication controls', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByLabelText('Correo verificado')).toBeInTheDocument();
    expect(screen.queryByText(/teléfono verificado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/código SMS/i)).not.toBeInTheDocument();
  });

  it('keeps phone optional during registration', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Registro' }));
    expect(screen.getByLabelText('Teléfono opcional (E.164)')).not.toBeRequired();
  });

  it('does not expose bootstrap or MFA controls in public navigation', () => {
    render(<App />);
    expect(screen.queryByRole('button', { name: /primer Admin/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/MFA|factor adicional/i)).not.toBeInTheDocument();
  });

  it('keeps the cart route when it is opened as a direct link', () => {
    window.history.replaceState({}, '', '/cart');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Carrito' })).toBeInTheDocument();
  });

  it('presents an explicit 404 state for an unknown direct link', () => {
    window.history.replaceState({}, '', '/unknown-page');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /tu próxima jugada/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(screen.getByRole('heading', { name: /tu próxima jugada/i })).toBeInTheDocument();
  });

  it('does not mount account tools for an anonymous direct visit', () => {
    window.history.replaceState({}, '', '/account/overview');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Ingresa para continuar' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mis pedidos' })).not.toBeInTheDocument();
    expect(ownAccount).not.toHaveBeenCalled();
  });

  it('does not mount admin tools for an authenticated customer', async () => {
    vi.mocked(currentSession).mockReturnValue({ accessToken: 'customer-access' } as never);
    vi.mocked(ownAccount).mockResolvedValue({
      accountId: 'account-1',
      currentEmail: 'cliente@sergod.cl',
      currentPhone: null,
      emailVerificationStatus: 'VERIFIED',
      role: 'CLIENTE',
      status: 'ACTIVE',
    });
    window.history.replaceState({}, '', '/admin');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Acceso administrativo restringido' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Centro de control' })).not.toBeInTheDocument();
  });

  it('shows a recoverable route error instead of leaving the application blank', () => {
    const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const BrokenRoute = () => {
      throw new Error('Unexpected route rendering failure.');
    };

    render(
      <RouteErrorBoundary>
        <BrokenRoute />
      </RouteErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', { name: 'No pudimos mostrar esta sección' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
    errorOutput.mockRestore();
  });
});
