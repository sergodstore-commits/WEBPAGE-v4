import { ArrowUpRight, Layers3 } from 'lucide-react';
import Link from 'next/link';
import { localWebArticle } from '@/lib/web-news';
import { editionLink } from '@/lib/edition-links';
import type { Product } from '@/lib/types';
import styles from './EditionLink.module.css';

export function EditionLink({ product, detail = false }: { product: Product; detail?: boolean }) {
  const edition = editionLink(product);
  if (!edition) return null;
  const local = edition.internal ? edition.url : localWebArticle(edition.url);
  return (
    <div className={detail ? styles.detail : styles.compact}>
      <Link
        className={styles.link}
        href={local ?? edition.url}
        target={local ? undefined : '_blank'}
        rel={local ? undefined : 'noopener noreferrer'}
        aria-label={`Ver cartas de ${edition.name}${local ? ' en español' : ` en ${edition.source} (abre una pestaña nueva)`}`}
      >
        <Layers3 size={17} aria-hidden="true" />
        <span>
          Ver cartas de esta edición{' '}
          <small>{local ? 'Galería y efectos en español' : `en ${edition.source}`}</small>
        </span>
        <ArrowUpRight size={17} aria-hidden="true" />
      </Link>
      {detail && (
        <p>
          Consulta las cartas y sus efectos{local ? ' en español' : ' en una pestaña nueva'}. La
          lista de la edición no garantiza el contenido de cada caja ni incluye necesariamente sus
          extras promocionales.
        </p>
      )}
    </div>
  );
}
