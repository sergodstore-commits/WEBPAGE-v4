'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, ShoppingBag, UserRound, X } from 'lucide-react';
import type { Settings, User } from '@/lib/types';
import styles from './BrandShell.module.css';

const sections = [
  { href: '/tienda', label: 'Tienda' },
  { href: '/preventas', label: 'Preventas' },
  { href: '/comunidad', label: 'Comunidad' },
  { href: '/noticias', label: 'Noticias' },
  { href: '/torneos', label: 'Torneos' },
];

export function StoreHeader({
  pathname,
  user,
  count,
  paymentMode,
}: {
  pathname: string;
  user: User | null;
  count: number;
  paymentMode?: Settings['payment_mode'];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobileRef = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 12);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      if (mobileRef.current?.contains(document.activeElement)) {
        toggleRef.current?.focus({ preventScroll: true });
      }
      setMenuOpen(false);
      previousPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      toggleRef.current?.focus({ preventScroll: true });
    };
    const desktop = window.matchMedia('(min-width: 981px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [menuOpen]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const closeMenu = () => {
    setMenuOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <a className={styles.skipLink} href="#contenido">
        Saltar al contenido
      </a>
      <header className={styles.header} data-scrolled={scrolled}>
        {paymentMode === 'sandbox' && (
          <div className={styles.sandboxNotice} role="status">
            Versión de prueba · pagos de sandbox · sin cobros reales
          </div>
        )}
        <div className={styles.headerInner}>
          <Link
            href="/"
            className={styles.brand}
            aria-label="SERGOD STORE, inicio"
            onNavigate={() => setMenuOpen(false)}
          >
            <img
              src="/brand/sergod-logo.webp"
              width="1536"
              height="768"
              alt="SERGOD STORE"
              fetchPriority="high"
            />
          </Link>
          <nav className={styles.desktopNav} aria-label="Navegación principal">
            {sections.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={styles.navLink}
                aria-current={isActive(href) ? 'page' : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className={styles.actions}>
            <Link
              href="/cuenta"
              className={`${styles.actionLink} ${styles.accountLink}`}
              aria-label="Mi cuenta"
              aria-current={isActive('/cuenta') ? 'page' : undefined}
              onNavigate={() => setMenuOpen(false)}
            >
              <UserRound size={20} strokeWidth={1.6} aria-hidden="true" />
              <span>{user ? 'Mi cuenta' : 'Ingresar'}</span>
            </Link>
            <Link
              href="/carrito"
              className={styles.actionLink}
              aria-label={`Carrito, ${count} artículos`}
              aria-current={isActive('/carrito') ? 'page' : undefined}
              onNavigate={() => setMenuOpen(false)}
            >
              <ShoppingBag size={21} strokeWidth={1.6} aria-hidden="true" />
              {count > 0 && (
                <span className={styles.cartCount} aria-hidden="true">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
            <button
              ref={toggleRef}
              type="button"
              className={`${styles.actionLink} ${styles.menuToggle}`}
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
              aria-controls="store-mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X size={23} aria-hidden="true" />
              ) : (
                <Menu size={23} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        <nav
          ref={mobileRef}
          id="store-mobile-navigation"
          className={styles.mobileNav}
          aria-label="Navegación móvil"
          hidden={!menuOpen}
        >
          {sections.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={styles.mobileLink}
              aria-current={isActive(href) ? 'page' : undefined}
              onClick={closeMenu}
            >
              {label}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          ))}
          {user?.role === 'admin' && (
            <Link href="/admin" className={styles.mobileLink} onClick={closeMenu}>
              Administrar tienda <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          )}
        </nav>
      </header>
    </>
  );
}
