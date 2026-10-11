'use client';
import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowRight, BookOpen, Layers3, PackageOpen, ChevronDown } from 'lucide-react';
import {
  editionExplorerPath,
  editionArticlePath,
  type EditionProducts,
} from '@/lib/edition-connections';
import { money, price } from '@/lib/client';
import { useRemote, availability, ProductImage, Loading } from '../shared';
import styles from './EditionConnections.module.css';

export function EditionConnections({
  code,
  explorer = false,
}: {
  code: string;
  explorer?: boolean;
}) {
  const heading = useId();
  const [requested, setRequested] = useState(false);
  const remote = useRemote<EditionProducts>(
    requested ? `/community/editions/${encodeURIComponent(code)}/products` : null,
  );
  return (
    <section className={styles.connections} aria-labelledby={heading}>
      <div className={styles.heading}>
        <div>
          <span>{code.toUpperCase()} · SERGOD STORE</span>
          <h3 id={heading}>Cartas y productos de esta edición</h3>
        </div>
        <Link href={explorer ? editionArticlePath(code) : editionExplorerPath(code)}>
          {explorer ? (
            <BookOpen size={18} aria-hidden="true" />
          ) : (
            <Layers3 size={18} aria-hidden="true" />
          )}
          {explorer ? 'Leer guía de la edición' : 'Explorar cartas en Comunidad'}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <details
        onToggle={(event) => {
          if (event.currentTarget.open) setRequested(true);
        }}
      >
        <summary>
          <PackageOpen size={19} aria-hidden="true" /> Ver productos de esta edición{' '}
          <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
        </summary>
        <div className={styles.content}>
          {!requested || remote.loading ? (
            <Loading />
          ) : remote.error ? (
            <div role="alert">
              <p>No pudimos consultar los productos relacionados.</p>
              <button className="store-text-link" onClick={remote.reload}>
                Reintentar productos
              </button>
            </div>
          ) : !remote.data?.products.length ? (
            <p className={styles.empty}>
              Por ahora no hay productos publicados de esta edición. Puedes seguir consultando sus
              cartas.
            </p>
          ) : (
            <>
              <p className={styles.note}>
                Cada presentación tiene su propio precio e idioma. Revisa su contenido y
                disponibilidad en la ficha.
              </p>
              <div className={styles.grid}>
                {remote.data.products.map((product) => {
                  const state = availability(product);
                  return (
                    <Link
                      key={product.id}
                      href={`/producto/${product.slug}`}
                      className={styles.product}
                      aria-label={`Ver ${product.name}`}
                    >
                      <ProductImage
                        src={product.images[0]}
                        name={product.name}
                        className={styles.image}
                      />
                      <div>
                        <span className={styles.kind}>
                          {product.kind === 'preorder' ? 'Preventa' : 'Tienda'}
                        </span>
                        <h4>{product.name}</h4>
                        <span className={styles.options}>
                          {Object.entries(product.options || {})
                            .filter(([key]) => /^(idioma|formato)$/i.test(key))
                            .map(([, value]) => value)
                            .join(' · ')}
                        </span>
                        <div className={styles.price}>
                          <strong>{money(price(product))}</strong>
                          {product.discount_percent > 0 && <del>{money(product.price)}</del>}
                        </div>
                        <span className={styles.stock} data-available={!state}>
                          {state ||
                            (product.kind === 'preorder' ? 'Reserva disponible' : 'Disponible')}
                        </span>
                      </div>
                      <ArrowRight className={styles.arrow} size={17} aria-hidden="true" />
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </details>
    </section>
  );
}
