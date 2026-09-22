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
  { label: 'Preventas', route: '/preorders' },
  { label: 'Comunidad', route: '/community' },
  { label: 'Torneos', route: '/tournaments' },
  { label: 'Noticias', route: '/news' },
];

export function SiteChrome({ navigate, route }: SiteChromeProps) {
  const shopHeader =
    route === '/shop' ||
    route === '/preorders' ||
    route === '/community' ||
    route === '/tournaments';
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
      <header
        className={
          shopHeader
            ? `site-header shop-site-header${route === '/community' ? ' community-site-header' : ''}${route === '/tournaments' ? ' tournament-site-header' : ''}`
            : 'site-header'
        }
      >
        <button aria-label="Ir al inicio" className="brand" onClick={() => go('/')} type="button">
          <img
            alt="Sergod Store"
            src="/assets/sergod/logo_sergod_store_oficial_transparente.webp"
          />
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
                aria-current={
                  route === item.route ||
                  (item.route === '/community' && ['/community/visit', '/quests'].includes(route))
                    ? 'page'
                    : undefined
                }
                key={item.route}
                onClick={() => go(item.route)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <nav aria-label="Cuenta y compra" className="utility-navigation">
            {shopHeader && (
              <button
                aria-current={route.startsWith('/account') ? 'page' : undefined}
                className="shop-site-header__account"
                onClick={() => go(authenticated ? '/account/overview' : '/login')}
                type="button"
              >
                <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="7" r="4" />
                  <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
                </svg>
                Cuenta
              </button>
            )}
            <button
              aria-current={route === '/cart' ? 'page' : undefined}
              className="cart-link"
              onClick={() => go('/cart')}
              type="button"
            >
              {shopHeader && (
                <svg
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M2 3h3l2.3 12h12.4L22 6H6" />
                  <circle cx="9" cy="20" r="1" fill="currentColor" />
                  <circle cx="19" cy="20" r="1" fill="currentColor" />
                </svg>
              )}
              <span
                className={shopHeader && route !== '/community' ? 'visually-hidden' : undefined}
              >
                Carrito
              </span>
            </button>
            {!shopHeader && authenticated ? (
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
            ) : !shopHeader ? (
              <>
                <button onClick={() => go('/register')} type="button">
                  Registro
                </button>
                <button className="login-link" onClick={() => go('/login')} type="button">
                  Ingresar
                </button>
              </>
            ) : role === 'ADMIN' ? (
              <button className="admin-link" onClick={() => go('/admin')} type="button">
                Operación
              </button>
            ) : null}
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
        <img alt="Sergod Store" src="/assets/sergod/logo_sergod_store_oficial_transparente.webp" />
        <p>Tienda TCG, comunidad y competencia en un solo lugar.</p>
      </div>
      <nav aria-label="Enlaces del pie">
        <button onClick={() => navigate('/shop')} type="button">
          Comprar
        </button>
        <button onClick={() => navigate('/preorders')} type="button">
          Preventas
        </button>
        <button onClick={() => navigate('/community')} type="button">
          Comunidad
        </button>
        <button onClick={() => navigate('/tournaments')} type="button">
          Torneos
        </button>
        <button onClick={() => navigate('/news')} type="button">
          Noticias
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
