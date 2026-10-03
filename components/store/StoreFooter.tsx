import Link from 'next/link';
import { ArrowUpRight, Clock3, MapPin, Phone } from 'lucide-react';
import type { Settings } from '@/lib/types';
import styles from './BrandShell.module.css';

export function StoreFooter({ settings }: { settings: Settings }) {
  const carrierNames = [
    ...new Set(
      settings.carriers.filter((carrier) => carrier.enabled).map((carrier) => carrier.name),
    ),
  ];

  return (
    <footer className={styles.footer}>
      <div className={styles.footerMain}>
        <div className={styles.footerIdentity}>
          <Link href="/" className={styles.footerBrand} aria-label="SERGOD STORE, inicio">
            <img
              src="/brand/sergod-logo-480.webp"
              alt="SERGOD STORE"
              width="1536"
              height="768"
              loading="lazy"
            />
          </Link>
          <p>
            Cartas que coleccionas.
            <br />
            Una comunidad que compartes.
          </p>
          {settings.email && (
            <a className={styles.contactLink} href={`mailto:${settings.email}`}>
              {settings.email}
            </a>
          )}
        </div>
        <div className={styles.footerColumn}>
          <h2>Explora</h2>
          <Link href="/tienda">Tienda</Link>
          <Link href="/preventas">Preventas</Link>
          <Link href="/comunidad">Comunidad</Link>
          <Link href="/noticias">Noticias</Link>
          <Link href="/torneos">Torneos</Link>
        </div>
        <div className={styles.footerColumn}>
          <h2>Tu compra</h2>
          <Link href="/cuenta">Mi cuenta y pedidos</Link>
          <Link href="/carrito">Carrito de compras</Link>
          <p>
            Retiro en tienda
            {carrierNames.length > 0 ? ` y envíos por ${carrierNames.join(', ')}.` : '.'}
          </p>
          {settings.carriers.some((carrier) => carrier.enabled && carrier.collect) && (
            <p>Envíos por pagar: el flete se paga por separado al transportista.</p>
          )}
        </div>
        <div className={styles.footerColumn}>
          <h2>Nos vemos en la tienda</h2>
          <p className={styles.contactDetail}>
            <MapPin size={17} aria-hidden="true" />
            <span>{settings.address || 'Copiapó, Región de Atacama, Chile'}</span>
          </p>
          {settings.hours && (
            <p className={styles.contactDetail}>
              <Clock3 size={17} aria-hidden="true" />
              <span>{settings.hours}</span>
            </p>
          )}
          {settings.phone && (
            <a
              className={styles.contactDetail}
              href={`tel:${settings.phone.replace(/[^+\d]/g, '')}`}
            >
              <Phone size={17} aria-hidden="true" />
              <span>{settings.phone}</span>
            </a>
          )}
        </div>
      </div>
      <div className={styles.footerBottom}>
        <span>© {new Date().getFullYear()} SERGOD STORE</span>
        <span>Precios en pesos chilenos (CLP)</span>
        <Link href="/admin">
          Administración <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </footer>
  );
}
