import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './App';

describe('IdentityAccess presentation', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'));

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
});
