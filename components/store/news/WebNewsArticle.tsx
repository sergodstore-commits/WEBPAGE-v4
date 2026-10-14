'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import {
  type WebNewsItem,
  type WebNewsMedia,
  webNewsCategories,
  mylArticle,
  newsBoards,
  newsContentBody,
} from '@/lib/web-news';
import { useRemote, Loading } from '../shared';
import styles from './News.module.css';
import { EditionConnections } from '../catalog/EditionConnections';

export default function WebNewsArticle({ id }: { id: string }) {
  const remote = useRemote<WebNewsItem>(
    `/news/${id.startsWith('myl-') ? 'myl' : 'tcg'}/${encodeURIComponent(id)}`,
  );
  const [selected, setSelected] = useState<WebNewsMedia | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const item = remote.data;
  const blocks =
    item?.content_blocks && item.body?.trim() === newsContentBody(item.content_blocks).trim()
      ? item.content_blocks
      : undefined;
  const openImage = (media: WebNewsMedia) => {
    setSelected(media);
    dialog.current?.showModal();
  };
  return (
    <div className={`store-page ${styles.page}`}>
      <Link
        href={`/noticias?seccion=${remote.data?.boards?.[0] || 'yugioh'}`}
        className={styles.articleBack}
      >
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
              {mylArticle(item.url) ? 'MITOS Y LEYENDAS' : `YU-GI-OH! ${item.format || 'TCG'}`} ·{' '}
              {webNewsCategories[item.category || 'news']}
            </span>
            <h1>{item.title}</h1>
            <time dateTime={item.published_on}>
              {new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeZone: 'UTC' }).format(
                new Date(`${item.published_on}T12:00:00Z`),
              )}
            </time>
            <p className={styles.articleLead}>{item.summary}</p>
          </header>
          {item.category === 'banlist' && item.effective_dates && (
            <aside className={styles.effectiveDates} aria-label="Vigencia de la banlist">
              {Object.entries(item.effective_dates)
                .filter(([board]) => item.boards?.includes(board as keyof typeof newsBoards))
                .map(([board, day]) => (
                  <p key={board}>
                    <strong>{newsBoards[board as keyof typeof newsBoards]}</strong>: vigente desde{' '}
                    {new Intl.DateTimeFormat('es-CL', {
                      dateStyle: 'long',
                      timeZone: 'UTC',
                    }).format(new Date(`${day}T12:00:00Z`))}
                  </p>
                ))}
            </aside>
          )}
          {item.image && (
            <img className={styles.articleCover} src={item.image} alt="Portada de la noticia" />
          )}
          {blocks ? (
            <div className={styles.articleBody}>
              {blocks.map((block, index) => {
                if (block.kind === 'heading') return <h2 key={index}>{block.text}</h2>;
                if (block.kind === 'list')
                  return (
                    <ul key={index}>
                      {block.text.split('\n').map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  );
                if (block.kind === 'image') {
                  const media = item.media?.find((m) => m.source === block.source && m.image);
                  return media ? (
                    <figure className={styles.articleInlineImage} key={index}>
                      <button
                        type="button"
                        onClick={() => openImage(media)}
                        aria-label={`Ampliar ${media.name}`}
                      >
                        <img src={media.image} alt={media.name} loading="lazy" />
                      </button>
                      <figcaption>{media.name}</figcaption>
                      {media.caption && <p>{media.caption}</p>}
                    </figure>
                  ) : null;
                }
                return <p key={index}>{block.text}</p>;
              })}
            </div>
          ) : (
            item.body &&
            item.body.trim() !== item.summary.trim() && (
              <div className={styles.articleBody}>
                {item.body
                  .split(/\n\s*\n/)
                  .filter(Boolean)
                  .map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
              </div>
            )
          )}
          {item.edition_code && (
            <EditionConnections key={item.edition_code} code={item.edition_code} />
          )}
          {item.media?.some(
            (m) => m.image && !blocks?.some((b) => b.kind === 'image' && b.source === m.source),
          ) && (
            <section aria-label="Imágenes y cartas de la noticia" className={styles.articleGallery}>
              <h2>En detalle</h2>
              <div>
                {item.media
                  .filter(
                    (m) =>
                      m.image && !blocks?.some((b) => b.kind === 'image' && b.source === m.source),
                  )
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
              {mylArticle(item.url) ? 'Blog oficial Mitos y Leyendas' : 'Yu-Gi-Oh! Meta'} ↗
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
