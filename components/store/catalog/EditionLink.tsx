import { ArrowUpRight, Layers3 } from 'lucide-react';
import { editionLink } from '@/lib/edition-links';
import type { Product } from '@/lib/types';
import styles from './EditionLink.module.css';

export function EditionLink({ product, detail = false }: { product: Product; detail?: boolean }) {
  const edition = editionLink(product);
  if (!edition) return null;
  return (
    <div className={detail ? styles.detail : styles.compact}>
      <a
        className={styles.link}
        href={edition.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Ver cartas de ${edition.name} en ${edition.source} (abre una pestaña nueva)`}
      >
        <Layers3 size={17} aria-hidden="true" />
        <span>
          Ver cartas de esta edición <small>en {edition.source}</small>
        </span>
        <ArrowUpRight size={17} aria-hidden="true" />
      </a>
      {detail && (
        <p>
          Consulta las cartas y sus efectos en una pestaña nueva. La lista de la edición no
          garantiza el contenido de cada caja ni incluye necesariamente sus extras promocionales.
        </p>
      )}
    </div>
  );
}
