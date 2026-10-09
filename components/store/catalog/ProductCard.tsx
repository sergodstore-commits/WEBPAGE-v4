'use client';
import Link from 'next/link';
import { Plus, ArrowRight, Eye, CalendarDays } from 'lucide-react';
import { date, money, price } from '@/lib/client';
import { preorderFamily } from '@/lib/preorders';
import type { Product } from '@/lib/types';
import { ProductImage, availability, familyName } from '../shared';
import styles from './ProductCard.module.css';
export function ProductCard({
  product: p,
  variants = [p],
  add,
  quickView,
  catalogStyle = false,
}: {
  product: Product;
  variants?: Product[];
  add: (p: Product, n?: number) => void;
  quickView?: (p: Product) => void;
  catalogStyle?: boolean;
}) {
  const options = variants.length > 1;
  const closed = variants.every((variant) => availability(variant)) ? availability(p) : '';
  const minimum = Math.min(...variants.map(price));
  const maximum = Math.max(...variants.map(price));
  const available = variants.reduce(
    (sum, variant) => sum + (availability(variant) ? 0 : variant.available),
    0,
  );
  const title = options ? familyName(p) : p.name;
  const reservation = catalogStyle && p.kind === 'preorder' ? preorderFamily(variants) : null;
  const shop = catalogStyle && p.kind === 'store';
  const optionValues = (keys: string[]) => [
    ...new Set(
      variants.flatMap((variant) =>
        Object.entries(variant.options || {})
          .filter(([key]) => keys.includes(key.toLowerCase()))
          .map(([, value]) => value),
      ),
    ),
  ];
  const formats = optionValues(['formato', 'tamaño', 'tamano']);
  const languages = optionValues(['idioma']);
  const summarize = (values: string[]) =>
    values.slice(0, 2).join(' / ') + (values.length > 2 ? ` +${values.length - 2}` : '');
  return (
    <article
      className={`store-product-card ${catalogStyle ? styles.card : ''} ${shop ? styles.shopCard : reservation ? styles.preorderCard : ''}`}
    >
      <Link href={`/producto/${p.slug}`} className="store-product-visual">
        <ProductImage src={p.images[0]} name={title} />
        {!options && p.discount_percent > 0 && (
          <span className="store-discount">−{p.discount_percent}%</span>
        )}
        {p.kind === 'preorder' && !reservation && (
          <span className="store-kind-label">Preventa</span>
        )}
      </Link>
      <div className="store-product-content">
        <p className="store-product-category">{p.category || 'Coleccionables'}</p>
        <Link href={`/producto/${p.slug}`} className="store-product-title" title={title}>
          {title}
        </Link>
        {catalogStyle && (formats.length > 0 || languages.length > 0) && (
          <div className={styles.optionsSummary}>
            {formats.length > 0 && <span title={formats.join(' / ')}>{summarize(formats)}</span>}
            {languages.length > 0 && (
              <span title={languages.join(' / ')}>{summarize(languages)}</span>
            )}
          </div>
        )}
        <div className={catalogStyle ? styles.priceRow : undefined}>
          <div className="store-product-price">
            <strong>
              <span>{money(minimum)}</span>
              {minimum !== maximum && (
                <>
                  {' '}
                  – <span>{money(maximum)}</span>
                </>
              )}
            </strong>
            {!options && p.discount_percent > 0 && <del>{money(p.price)}</del>}
          </div>
          {shop && (
            <span
              className={`${closed ? 'store-muted' : 'store-stock-dot'} ${styles.stockBadge}`}
              data-available={!closed}
            >
              {closed || `${available} disponibles`}
            </span>
          )}
        </div>
        {options && (!catalogStyle || languages.length > 0) && (
          <small className="store-muted">
            {variants.length} {variants.length === 1 ? 'opción' : 'opciones'}
          </small>
        )}
        {reservation && (
          <div className={styles.reservation}>
            <span className={styles.reservationState} data-state={reservation.state || 'mixed'}>
              {reservation.label}
            </span>
            {!options && p.release_date && (
              <div className={styles.release}>
                <CalendarDays size={19} aria-hidden="true" />
                <div>
                  <span>Lanzamiento</span>
                  <time dateTime={p.release_date}>
                    {new Intl.DateTimeFormat('es-CL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(p.release_date))}
                  </time>
                </div>
              </div>
            )}
            {reservation.opensAt && reservation.closesAt ? (
              <dl className={styles.reservationDates} aria-label="Período de reserva">
                <div>
                  <dt>Apertura</dt>
                  <dd>
                    <time dateTime={reservation.opensAt}>{date(reservation.opensAt)}</time>
                  </dd>
                </div>
                <div>
                  <dt>Cierre</dt>
                  <dd>
                    <time dateTime={reservation.closesAt}>{date(reservation.closesAt)}</time>
                  </dd>
                </div>
              </dl>
            ) : (
              <p>{options ? 'Fechas según opción. Revisa la ficha.' : 'Fechas por confirmar.'}</p>
            )}
            {reservation.opensAt && reservation.closesAt && (
              <span className={styles.timezone}>Hora de Chile</span>
            )}
            {reservation.state === 'open' && (
              <p className={styles.quota}>
                {reservation.available} cupos para reservar{options ? ' entre las opciones' : ''}.
              </p>
            )}
            {!options && p.max_per_customer != null && (
              <p>Máximo {p.max_per_customer} por cliente.</p>
            )}
            <span className={styles.deliveryLabel}>Entrega</span>
            <p className={styles.delivery} title={reservation.deliveryTerms || undefined}>
              {reservation.deliveryTerms || 'Consulta las condiciones de entrega de cada opción.'}
            </p>
          </div>
        )}
        <div className={catalogStyle ? styles.actions : undefined}>
          <div className={`store-product-bottom ${catalogStyle ? styles.bottom : ''}`}>
            {!reservation && !shop && (
              <span className={closed ? 'store-muted' : 'store-stock-dot'}>
                {closed || `${available} disponibles`}
              </span>
            )}
            {reservation ? (
              <Link href={`/producto/${p.slug}`} className={`store-text-link ${styles.purchase}`}>
                {options ? 'Elegir reserva' : 'Ver preventa'}{' '}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            ) : options ? (
              <Link
                href={`/producto/${p.slug}`}
                className={`store-text-link ${catalogStyle ? styles.purchase : ''}`}
              >
                Ver opciones {catalogStyle && <ArrowRight size={16} aria-hidden="true" />}
              </Link>
            ) : (
              <button
                className={`store-icon-button store-add-button ${catalogStyle ? styles.purchase : ''}`}
                aria-label={`Añadir ${p.name} al carrito`}
                title={closed || 'Añadir al carrito'}
                disabled={Boolean(closed)}
                onClick={() => add(p)}
              >
                {!(shop && closed) && <Plus size={19} aria-hidden="true" />}
                {catalogStyle && <span>{closed ? 'Agotado' : 'Añadir'}</span>}
              </button>
            )}
          </div>
          {quickView && (
            <button
              className={`store-text-link store-quick-link ${catalogStyle ? styles.quick : ''}`}
              onClick={() => quickView(p)}
              aria-label={`Vista rápida de ${title}`}
              title="Vista rápida"
            >
              {catalogStyle && <Eye size={17} aria-hidden="true" />}
              {!catalogStyle && 'Vista rápida'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
