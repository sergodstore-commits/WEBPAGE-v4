'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import { type WebNewsItem, type WebNewsMedia, webNewsCategories } from '@/lib/web-news';
import { useRemote, Loading } from '../shared';
import styles from './News.module.css';

export default function WebNewsArticle({ id }: { id: string }) {
  const remote = useRemote<WebNewsItem>(`/news/tcg/${encodeURIComponent(id)}`);
  const [selected, setSelected] = useState<WebNewsMedia | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const item = remote.data;
  return (
    <div className={`store-page ${styles.page}`}>
      <Link href="/noticias" className={styles.articleBack}>
        <ArrowLeft size={17} />
        Volver a Noticias
      </Link>
      {remote.loading ? (
        <Loading />
      ) : remote.error || !item ? (
        <div role="alert" className={styles.error}>
          <p>Esta noticia no está disponible.</p>
          <button className="store-button store-button-secondary" onClick={remote.reload}>
            Reintentar
          </button>
        </div>
      ) : (
        <article className={styles.webArticle}>
          <header>
            <span className={styles.articleCategory}>
              YU-GI-OH! TCG · {webNewsCategories[item.category || 'news']}
            </span>
            <h1>{item.title}</h1>
            <time dateTime={item.published_on}>
              {new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'UTC' }).format(
                new Date(`${item.published_on}T12:00:00Z`),
              )}
            </time>
            <p className={styles.articleLead}>{item.summary}</p>
          </header>
          {item.image && (
            <img className={styles.articleCover} src={item.image} alt="Portada de la noticia" />
          )}
          {item.body && (
            <div className={styles.articleBody}>
              {item.body
                .split(/\n\s*\n/)
                .filter(Boolean)
                .map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
            </div>
          )}
          {item.media?.some((m) => m.image) && (
            <section aria-label="Imágenes y cartas de la noticia" className={styles.articleGallery}>
              <h2>En detalle</h2>
              <div>
                {item.media
                  .filter((m) => m.image)
                  .map((m) => (
                    <button
                      type="button"
                      key={m.source}
                      onClick={() => {
                        setSelected(m);
                        dialog.current?.showModal();
                      }}
                      aria-label={`Ampliar ${m.name}`}
                    >
                      <img src={m.image} alt={m.name} loading="lazy" />
                      <span>{m.name}</span>
                    </button>
                  ))}
              </div>
            </section>
          )}
          <footer className={styles.articleSource}>
            Preparado por SERGOD STORE · Fuente:{' '}
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              Yu-Gi-Oh! Meta ↗
            </a>
          </footer>
        </article>
      )}
      <dialog
        ref={dialog}
        className={styles.imageDialog}
        onClose={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <button
          type="button"
          className={styles.imageClose}
          aria-label="Cerrar imagen"
          onClick={() => dialog.current?.close()}
        >
          <X size={22} />
        </button>
        {selected && (
          <>
            <img src={selected.image} alt={selected.name} />
            <h2>{selected.name}</h2>
            {selected.caption && <p>{selected.caption}</p>}
          </>
        )}
      </dialog>
    </div>
  );
}
