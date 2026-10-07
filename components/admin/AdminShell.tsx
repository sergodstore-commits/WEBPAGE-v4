'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronRight,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Menu,
  Newspaper,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  Store,
  Trophy,
  Truck,
  Users,
  X,
} from 'lucide-react';
import type { User } from '@/lib/types';

const groups = [
  {
    label: 'Catálogo',
    items: [
      { href: '/admin/articulos', label: 'Artículos', icon: ShoppingBag },
      { href: '/admin/inventario', label: 'Inventario', icon: Package },
      { href: '/admin/preventas', label: 'Preventas', icon: ClipboardList },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { href: '/admin/pedidos', label: 'Pedidos y entregas', icon: Truck },
      { href: '/admin/pos', label: 'Venta en el local', icon: CreditCard },
      { href: '/admin/clientes', label: 'Clientes', icon: Users },
    ],
  },
  {
    label: 'Comunidad y contenido',
    items: [
      { href: '/admin/torneos', label: 'Torneos', icon: ClipboardList },
      { href: '/admin/liga', label: 'Liga SERGOD STORE', icon: Trophy },
      { href: '/admin/transmisiones', label: 'Transmisiones', icon: ExternalLink },
      { href: '/admin/noticias', label: 'Noticias', icon: Newspaper },
      { href: '/admin/publicaciones', label: 'Publicaciones', icon: Newspaper },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { href: '/admin/integraciones', label: 'Integraciones', icon: Settings },
      { href: '/admin/local', label: 'Datos del local', icon: Store },
    ],
  },
];
const home = { href: '/admin', label: 'Resumen', icon: LayoutDashboard };
// Next can remount the panel on a route change. Preserve only the requested focus destination.
let pendingFocusPath = '';

export function AdminShell({
  user,
  pathname,
  children,
}: {
  user: User;
  pathname: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const previousPath = useRef(pathname);
  const wasOpen = useRef(false);
  const active = (href: string) =>
    pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));
  const current =
    groups.flatMap((group) => group.items).find((item) => active(item.href))?.label ||
    (pathname === '/admin/correos' ? 'Correos de prueba' : 'Resumen');
  const detail =
    pathname === '/admin/articulos/nuevo'
      ? 'Nuevo artículo'
      : pathname.startsWith('/admin/articulos/')
        ? 'Editar artículo'
        : pathname.startsWith('/admin/pedidos/')
          ? 'Detalle del pedido'
          : '';

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const sync = () => {
      setMobile(query.matches);
      if (!query.matches) setOpen(false);
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      setOpen(false);
    }
  }, [pathname]);
  useEffect(() => {
    // Restore only after React has removed inert from the workspace.
    if (open) wasOpen.current = true;
    else if (pendingFocusPath === pathname) {
      pendingFocusPath = '';
      wasOpen.current = false;
      workspace.current?.querySelector<HTMLElement>('main')?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      if (!mobile) workspace.current?.querySelector<HTMLElement>('main')?.focus();
      else trigger.current?.focus();
    }
  }, [open, mobile, pathname]);
  useEffect(() => {
    if (!open || !mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('[data-menu-close]')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== 'Tab') return;
      const items = [
        ...(sidebar.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ||
          []),
      ];
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keydown);
    };
  }, [open, mobile]);
  function close() {
    setOpen(false);
  }
  function item({ href, label, icon: Icon }: typeof home) {
    return (
      <Link
        key={href}
        href={href}
        aria-current={active(href) ? 'page' : undefined}
        className={active(href) ? 'active' : ''}
      >
        <Icon size={18} />
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <div className="admin-shell admin-redesign">
      <a className="admin-skip" href="#admin-content">
        Ir al contenido
      </a>
      {open && mobile && (
        <button
          className="admin-sidebar-overlay"
          aria-label="Cerrar menú"
          onClick={close}
          tabIndex={-1}
        />
      )}
      <aside
        ref={sidebar}
        onClickCapture={(event) => {
          if (!mobile || !open || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
            return;
          const href = (event.target as Element).closest('a')?.getAttribute('href');
          if (href?.startsWith('/admin')) pendingFocusPath = href;
        }}
        id="admin-navigation"
        className={`admin-sidebar ${open ? 'open' : ''}`}
        inert={mobile && !open}
        role={mobile && open ? 'dialog' : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Menú de administración"
      >
        <div className="admin-brand-row">
          <Link href="/admin" className="admin-brand">
            <img src="/brand/sergod-logo-480.webp" alt="SERGOD STORE" width="192" height="96" />
            <small>Administración</small>
          </Link>
          <button
            data-menu-close
            className="admin-icon-button admin-menu-close"
            aria-label="Cerrar menú"
            onClick={close}
          >
            <X size={22} />
          </button>
        </div>
        <Link className="admin-button admin-new" href="/admin/articulos/nuevo">
          <Plus size={18} />
          Nuevo artículo
        </Link>
        <nav aria-label="Administración">
          {item(home)}
          {groups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(item)}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <Link href="/" className="admin-store-link">
            <ExternalLink size={16} />
            Ver tienda pública
          </Link>
          <div className="admin-user">
            <span className="admin-avatar">{user.name?.charAt(0).toUpperCase() || 'A'}</span>
            <div>
              <strong>{user.name || 'Administrador'}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        </div>
      </aside>
      <div ref={workspace} className="admin-workspace" inert={mobile && open}>
        <header className="admin-topbar">
          <button
            ref={trigger}
            className="admin-icon-button admin-menu"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={open}
            aria-controls="admin-navigation"
          >
            <Menu size={22} />
          </button>
          <div className="admin-breadcrumb" aria-label="Ubicación">
            <span>Administración</span>
            <ChevronRight size={14} />
            <strong>{current}</strong>
            {detail && (
              <>
                <ChevronRight size={14} />
                <span>{detail}</span>
              </>
            )}
          </div>
          <Link href="/" className="admin-top-public" aria-label="Visitar tienda">
            <span>Visitar tienda</span>
            <ExternalLink size={16} />
          </Link>
        </header>
        <main id="admin-content" tabIndex={-1} className="admin-main">
          {children}
        </main>
        <footer className="admin-footer">SERGOD STORE · Copiapó, Chile</footer>
      </div>
    </div>
  );
}
