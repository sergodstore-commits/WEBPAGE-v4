import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  accounts,
  currentSession,
  legalVersions,
  ownAccount,
  publicRequest,
  register,
} from '../identity/api.js';
import { App, RouteErrorBoundary } from './App';
import { routeWithAppearancePreview } from './appearance-preview-route.js';

vi.mock('../identity/api.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../identity/api.js')>();
  return {
    ...original,
    accounts: vi.fn(),
    currentSession: vi.fn(() => null),
    legalVersions: vi.fn(),
    ownAccount: vi.fn(),
    publicRequest: vi.fn(),
    register: vi.fn(),
  };
});

describe('IdentityAccess presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(currentSession).mockReturnValue(null);
    vi.mocked(legalVersions).mockResolvedValue([
      {
        contentLocation: '/legal/terms',
        documentId: 'document-1',
        publicTitle: 'Términos',
        title: 'Términos y condiciones',
        versionId: 'version-1',
        versionLabel: '1.0',
      },
    ]);
    vi.mocked(register).mockResolvedValue(undefined);
    vi.mocked(accounts).mockResolvedValue([]);
    vi.mocked(publicRequest).mockResolvedValue({ items: [] } as never);
    window.history.replaceState({}, '', '/');
  });

  it('presents the public commerce home while preserving account access', () => {
    render(<App />);
    expect(screen.getByRole('img', { name: 'Sergod Store' })).toBeInTheDocument();
    expect(document.querySelector('.home-logo')).toHaveAttribute(
      'src',
      '/assets/sergod/logo_sergod_store_oficial_transparente.webp',
    );
    expect(screen.getByRole('button', { name: 'Cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carrito' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Navegación principal' }),
    ).not.toBeInTheDocument();
    const launcher = within(screen.getByRole('navigation', { name: 'Accesos principales' }));
    for (const label of ['Tienda', 'Preventas', 'Noticias', 'Torneos', 'Comunidad']) {
      expect(launcher.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(
      launcher.queryByRole('button', { name: /puntos sergod|cómics/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/juega|colecciona|conéctate|más que un juego/i),
    ).not.toBeInTheDocument();
  });

  it('uses the launcher as the home navigation and restores the regular header inside sections', () => {
    render(<App />);
    const homeNavigation = within(screen.getByRole('navigation', { name: 'Accesos principales' }));
    fireEvent.click(homeNavigation.getByRole('button', { name: 'Comunidad' }));

    const sectionNavigation = within(
      screen.getByRole('navigation', { name: 'Navegación principal' }),
    );
    expect(sectionNavigation.getByRole('button', { name: 'Preventas' })).toBeInTheDocument();
    expect(sectionNavigation.getByRole('button', { name: 'Comunidad' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(sectionNavigation.getByRole('button', { name: 'Noticias' })).toBeInTheDocument();
    expect(sectionNavigation.getByRole('button', { name: 'Torneos' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Inicio Sergod Store' })).not.toBeInTheDocument();
    const communityNavigation = within(
      screen.getByRole('navigation', { name: 'Secciones de Comunidad' }),
    );
    for (const label of ['Noticias', 'Torneos', 'Quests', 'Visítanos']) {
      expect(communityNavigation.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('preserves draft appearance mode when navigating inside the real preview', () => {
    expect(routeWithAppearancePreview('/shop', '?appearance-preview=1')).toBe(
      '/shop?appearance-preview=1',
    );
    expect(routeWithAppearancePreview('/shop', '')).toBe('/shop');
  });

  it('offers only verified email login and exposes no phone authentication controls', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Cuenta' }));
    expect(screen.getByLabelText('Correo verificado')).toBeInTheDocument();
    expect(screen.queryByText(/teléfono verificado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/código SMS/i)).not.toBeInTheDocument();
  });

  it('keeps phone optional during registration', () => {
    window.history.replaceState({}, '', '/register');
    render(<App />);
    expect(screen.getByLabelText('Teléfono opcional (E.164)')).not.toBeRequired();
  });

  it('keeps one idempotency key and blocks duplicate registration submissions', async () => {
    let finishRegistration: (() => void) | undefined;
    vi.mocked(register).mockImplementation(
      () => new Promise<void>((resolve) => (finishRegistration = resolve)),
    );
    window.history.replaceState({}, '', '/register');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'cliente@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'safe-password' } });
    fireEvent.change(screen.getByLabelText('Confirmar contraseña'), {
      target: { value: 'safe-password' },
    });
    fireEvent.click(await screen.findByRole('checkbox'));
    const submit = screen.getByRole('button', { name: 'Crear cuenta' });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    await act(async () => finishRegistration?.());
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

  it('redirects the retired points address to the customer account', () => {
    window.history.replaceState({}, '', '/loyalty');
    render(<App />);

    expect(window.location.pathname).toBe('/account/overview');
    expect(screen.getByRole('heading', { name: 'Ingresa para continuar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Faccount%2Foverview',
    );
  });

  it('opens the customer account layout without waiting for an admin role check', () => {
    vi.mocked(currentSession).mockReturnValue({ accessToken: 'customer-access' } as never);
    vi.mocked(ownAccount).mockImplementation(() => new Promise(() => undefined));
    window.history.replaceState({}, '', '/account/overview');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Resumen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Código KLU y Konami ID' })).toHaveAttribute(
      'href',
      '#tournament-identifiers',
    );
    expect(screen.queryByRole('heading', { name: 'Verificando acceso' })).not.toBeInTheDocument();
  });

  it('keeps the public terms route available from a direct link', () => {
    window.history.replaceState({}, '', '/legal/terms');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Términos y condiciones' })).toBeInTheDocument();
    expect(
      screen.getByText(/nombre de fantasía.+Francisco Javier Pizarro Ávila/),
    ).toBeInTheDocument();
    expect(screen.getByText(/RUT 19\.910\.774-7/)).toBeInTheDocument();
    expect(screen.getByText(/Versión 1\.0 · vigente desde/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Términos' })).toBeInTheDocument();
  });

  it('presents an explicit 404 state for an unknown direct link', () => {
    window.history.replaceState({}, '', '/unknown-page');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Accesos principales' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(screen.getByRole('navigation', { name: 'Accesos principales' })).toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: 'Panel de operación' })).not.toBeInTheDocument();
  });

  it('presents searchable account cards with plain status labels', async () => {
    vi.mocked(currentSession).mockReturnValue({ accessToken: 'admin-access' } as never);
    vi.mocked(ownAccount).mockResolvedValue({
      accountId: 'admin-1',
      currentEmail: 'admin@sergod.cl',
      currentPhone: null,
      emailVerificationStatus: 'VERIFIED',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    vi.mocked(accounts).mockResolvedValue([
      {
        accountId: 'customer-1',
        currentEmail: 'cliente@sergod.cl',
        currentPhone: null,
        emailVerificationStatus: 'PENDING',
        role: 'CLIENTE',
        status: 'ACTIVE',
      },
    ]);
    window.history.replaceState({}, '', '/admin/accounts');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Clientes y usuarios' })).toBeInTheDocument();
    expect(await screen.findByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Correo pendiente')).toBeInTheDocument();
    expect(screen.queryByText('CLIENTE')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Buscar por correo'), {
      target: { value: 'nadie' },
    });
    expect(screen.getByText('No encontramos cuentas con ese correo.')).toBeInTheDocument();
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
