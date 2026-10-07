'use client';
import Link from 'next/link';
import { Plus, ArrowRight, Eye } from 'lucide-react';
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
  const options = Boolean(p.catalog_group) || variants.length > 1;
  const closed = variants.every((variant) => availability(variant)) ? availability(p) : '';
  const minimum = Math.min(...variants.map(price));
  const maximum = Math.max(...variants.map(price));
  const available = variants.reduce(
    (sum, variant) => sum + (availability(variant) ? 0 : variant.available),
    0,
  );
  const title = options ? familyName(p) : p.name;
  const reservation = catalogStyle && p.kind === 'preorder' ? preorderFamily(variants) : null;
  return (
    <article className={`store-product-card ${catalogStyle ? styles.card : ''}`}>
      <Link href={`/producto/${p.slug}`} className="store-product-visual">
        <ProductImage src={p.images[0]} name={title} />
        {!options && p.discount_percent > 0 && (
          <span className="store-discount">−{p.discount_percent}%</span>
        )}
        {p.kind === 'preorder' && <span className="store-kind-label">Preventa</span>}
      </Link>
      <div className="store-product-content">
        <p className="store-product-category">{p.category || 'Coleccionables'}</p>
        <Link href={`/producto/${p.slug}`} className="store-product-title">
          {title}
        </Link>
        <div className="store-product-price">
          <strong>
            {minimum !== maximum ? `${money(minimum)} – ${money(maximum)}` : money(minimum)}
          </strong>
          {!options && p.discount_percent > 0 && <del>{money(p.price)}</del>}
        </div>
        {options && (
          <small className="store-muted">
            {variants.length} {variants.length === 1 ? 'opción' : 'opciones'}
          </small>
        )}
        {reservation && (
          <div className={styles.reservation}>
            <span className={styles.reservationState}>{reservation.label}</span>
            {reservation.opensAt && reservation.closesAt ? (
              <dl>
                <div>
                  <dt>Apertura</dt>
                  <dd>{date(reservation.opensAt)}</dd>
                </div>
                <div>
                  <dt>Cierre</dt>
                  <dd>{date(reservation.closesAt)}</dd>
                </div>
              </dl>
            ) : (
              <p>{options ? 'Fechas según opción. Revisa la ficha.' : 'Fechas por confirmar.'}</p>
            )}
            {reservation.state === 'open' && (
              <p>
                {reservation.available} cupos para reservar{options ? ' entre las opciones' : ''}.
              </p>
            )}
            <p className={styles.delivery}>
              {reservation.deliveryTerms || 'Consulta las condiciones de entrega de cada opción.'}
            </p>
          </div>
        )}
        <div className={`store-product-bottom ${catalogStyle ? styles.bottom : ''}`}>
          {!reservation && (
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
              <Plus size={19} />
              {catalogStyle && <span>{closed ? 'Agotado' : 'Añadir'}</span>}
            </button>
          )}
        </div>
        {quickView && (
          <button
            className={`store-text-link store-quick-link ${catalogStyle ? styles.quick : ''}`}
            onClick={() => quickView(p)}
            aria-label={`Vista rápida de ${title}`}
          >
            {catalogStyle && <Eye size={15} aria-hidden="true" />} Vista rápida
          </button>
        )}
      </div>
    </article>
  );
}
