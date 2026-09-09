import { useEffect, useState } from 'react';

import { currentSession, ownAccount, subscribeSession } from '../identity/api.js';
import type { Route } from './App.js';

interface SiteChromeProps {
  readonly navigate: (route: Route) => void;
  readonly route: Route;
}

const publicRoutes: readonly { readonly label: string; readonly route: Route }[] = [
  { label: 'Inicio', route: '/' },
  { label: 'Tienda', route: '/shop' },
  { label: 'Torneos', route: '/tournaments' },
  { label: 'Noticias', route: '/news' },
  { label: 'Comunidad', route: '/community' },
  { label: 'Cómics', route: '/comics' },
];

export function SiteChrome({ navigate, route }: SiteChromeProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState<'ADMIN' | 'CLIENTE' | null>(null);
  const [authenticated, setAuthenticated] = useState(() => currentSession() !== null);

  useEffect(
    () => subscribeSession((activeSession) => setAuthenticated(activeSession !== null)),
    [],
  );

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    void ownAccount()
      .then((account) => {
        if (active) setRole(account.role);
      })
      .catch(() => {
        if (active) setRole(null);
      });
    return () => {
      active = false;
    };
  }, [authenticated, route]);

  const go = (next: Route) => {
    setMenuOpen(false);
    navigate(next);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <header className="site-header">
        <button aria-label="Ir al inicio" className="brand" onClick={() => go('/')} type="button">
          <img alt="Sergod Store" src="/assets/sergod/logo_sergod_store_oficial.png" />
        </button>
        <button
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          className="menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <span aria-hidden="true">{menuOpen ? '×' : '≡'}</span>
        </button>
        <div className={menuOpen ? 'header-navigation is-open' : 'header-navigation'}>
          <nav aria-label="Navegación principal" className="primary-navigation">
            {publicRoutes.map((item) => (
              <button
                aria-current={route === item.route ? 'page' : undefined}
                key={item.route}
                onClick={() => go(item.route)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <nav aria-label="Cuenta y compra" className="utility-navigation">
            <button
              aria-current={route === '/cart' ? 'page' : undefined}
              className="cart-link"
              onClick={() => go('/cart')}
              type="button"
            >
              Carrito
            </button>
            {authenticated ? (
              <>
                <button
                  aria-current={route.startsWith('/account') ? 'page' : undefined}
                  onClick={() => go('/account/overview')}
                  type="button"
                >
                  Mi cuenta
                </button>
                {role === 'ADMIN' ? (
                  <button
                    aria-current={route.startsWith('/admin') ? 'page' : undefined}
                    className="admin-link"
                    onClick={() => go('/admin')}
                    type="button"
                  >
                    Operación
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <button onClick={() => go('/register')} type="button">
                  Registro
                </button>
                <button className="login-link" onClick={() => go('/login')} type="button">
                  Ingresar
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}

export function SiteFooter({ navigate }: Pick<SiteChromeProps, 'navigate'>) {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <img alt="Sergod Store" src="/assets/sergod/logo_sergod_store_oficial.png" />
        <p>Tienda TCG, comunidad y competencia en un solo lugar.</p>
      </div>
      <nav aria-label="Enlaces del pie">
        <button onClick={() => navigate('/shop')} type="button">
          Comprar
        </button>
        <button onClick={() => navigate('/tournaments')} type="button">
          Torneos
        </button>
        <button onClick={() => navigate('/account/overview')} type="button">
          Mi cuenta
        </button>
        <button onClick={() => navigate('/legal/terms')} type="button">
          Términos
        </button>
      </nav>
      <p className="footer-note">Sergod Store · Copiapó, Chile</p>
    </footer>
  );
}
