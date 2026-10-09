'use client';
import { ArrowUpRight, BookOpen, Newspaper } from 'lucide-react';
import type { WebNewsItem } from '@/lib/web-news';
import { useRemote, Loading } from '../shared';
import styles from './News.module.css';

export function WebNewsColumn() {
  const remote = useRemote<WebNewsItem[]>('/news/web-sources');
  return (
    <aside className={styles.worldNews} aria-labelledby="world-news-heading">
      <div className={styles.worldHeading}>
        <BookOpen size={22} aria-hidden="true" />
        <div>
          <span>ACTUALIDAD DEL JUEGO</span>
          <h2 id="world-news-heading">Yu-Gi-Oh!</h2>
        </div>
      </div>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <div role="alert">
          <p>No pudimos cargar la actualidad de Yu-Gi-Oh!.</p>
          <button className="store-text-link" onClick={remote.reload}>
            Reintentar
          </button>
        </div>
      ) : !remote.data?.length ? (
        <p className={styles.worldEmpty}>Pronto compartiremos más novedades del juego.</p>
      ) : (
        <div className={styles.bubbles}>
          {remote.data.map((item) => (
            <article key={item.id} className={styles.bubble}>
              <div className={styles.bubbleMeta}>
                <span>
                  <Newspaper size={13} aria-hidden="true" /> Yu-Gi-Oh! Meta
                </span>
                <time dateTime={item.published_on}>
                  {new Intl.DateTimeFormat('es-CL', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(`${item.published_on}T12:00:00Z`))}
                </time>
              </div>
              <h3>{item.title}</h3>
              <p>{item.summary}</p>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Leer noticia original: ${item.title} (abre una pestaña nueva)`}
              >
                Leer noticia original <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      )}
      <p className={styles.sourceNote}>
        Resúmenes en español seleccionados por SERGOD. Los artículos originales pueden estar en
        inglés.
      </p>
    </aside>
  );
}
