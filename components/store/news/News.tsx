'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Camera, Newspaper, Play, X } from 'lucide-react';
import { date } from '@/lib/client';
import type { NewsAsset, NewsItem } from '@/lib/news';
import { instagramEmbedUrl } from '@/lib/news';
import { useRemote, Loading, ProductImage } from '../shared';
import { SectionHeader } from '../SectionHeader';
import styles from './News.module.css';
import { WebNewsColumn } from './WebNewsColumn';

export function NewsMedia({ assets, permalink = '' }: { assets: NewsAsset[]; permalink?: string }) {
  const [index, setIndex] = useState(0),
    [failed, setFailed] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [assets]);
  const move = (n: number) => {
    setIndex((v) => (v + n + assets.length) % assets.length);
    setFailed(false);
  };
  const asset = assets[index];
  const embed = instagramEmbedUrl(permalink);
  if (embed)
    return (
      <div className={styles.embeddedMedia} aria-label="Publicación de Instagram">
        <iframe
          key={embed}
          src={embed}
          title="Publicación de SERGOD STORE en Instagram"
          loading="lazy"
          allow="autoplay; fullscreen; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <a href={permalink} target="_blank" rel="noopener noreferrer">
          Ver publicación en Instagram
        </a>
        <small>Si no se muestra aquí, abre la publicación en Instagram.</small>
      </div>
    );
  return (
    <div className={styles.media} aria-label="Medios de la noticia">
      <div
        className={styles.stage}
        tabIndex={assets.length > 1 ? 0 : undefined}
        aria-label={assets.length > 1 ? 'Carrusel de la noticia' : undefined}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            move(1);
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            move(-1);
          }
        }}
        onTouchStart={(e) => {
          const p = e.touches[0];
          start.current = { x: p.clientX, y: p.clientY };
        }}
        onTouchEnd={(e) => {
          const p = e.changedTouches[0],
            s = start.current;
          start.current = null;
          if (
            s &&
            assets.length > 1 &&
            Math.abs(p.clientX - s.x) > 45 &&
            Math.abs(p.clientX - s.x) > Math.abs(p.clientY - s.y)
          )
            move(p.clientX < s.x ? 1 : -1);
        }}
      >
        {!asset || failed ? (
          <div className={styles.unavailable}>
            <Newspaper size={32} />
            <p>Este archivo no pudo mostrarse.</p>
            {permalink && (
              <a href={permalink} target="_blank" rel="noopener noreferrer">
                Ver publicación en Instagram
              </a>
            )}
          </div>
        ) : asset.type === 'video' ? (
          <video
            key={asset.url}
            src={asset.url}
            poster={asset.poster || undefined}
            controls
            playsInline
            preload="none"
            onError={() => setFailed(true)}
            aria-label={`Video ${index + 1} de la noticia`}
          />
        ) : (
          <img
            key={asset.url}
            src={asset.url}
            alt={`Imagen ${index + 1} de la noticia`}
            onError={() => setFailed(true)}
            draggable={false}
          />
        )}
      </div>
      {assets.length > 1 && (
        <div className={styles.controls}>
          <button type="button" onClick={() => move(-1)} aria-label="Imagen o video anterior">
            <ArrowLeft size={18} />
          </button>
          <div aria-label="Seleccionar medio">
            {assets.map((_, i) => (
              <button
                type="button"
                key={i}
                aria-label={`Mostrar medio ${i + 1}`}
                aria-current={index === i ? 'true' : undefined}
                onClick={() => {
                  setIndex(i);
                  setFailed(false);
                }}
              />
            ))}
          </div>
          <span aria-live="polite">
            {index + 1} / {assets.length}
          </span>
          <button type="button" onClick={() => move(1)} aria-label="Imagen o video siguiente">
            <ArrowRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
export function News() {
  const remote = useRemote<NewsItem[]>('/news'),
    params = useSearchParams(),
    router = useRouter();
  const [limit, setLimit] = useState(9);
  const dialog = useRef<HTMLDialogElement>(null);
  const list = [...(remote.data || [])].sort(
    (a, b) => b.recorded_at.localeCompare(a.recorded_at) || a.id.localeCompare(b.id),
  );
  const selected = list.find((p) => p.id === params.get('publicacion'));
  const sections = [
    ['yugioh', 'Yu-Gi-Oh! TCG'],
    ['sergod', 'SERGOD STORE'],
    ['myl-first-era', 'MyL Primera Era'],
    ['myl-first-block', 'MyL Primer Bloque'],
  ] as const;
  const requested = params.get('seccion');
  const active = selected
    ? 'sergod'
    : sections.some(([id]) => id === requested)
      ? requested!
      : 'yugioh';
  function navigate(section: string, publication?: string) {
    const query = new URLSearchParams({ seccion: section });
    if (publication) query.set('publicacion', publication);
    router.replace(`/noticias?${query}`, { scroll: false });
  }
  function close() {
    navigate('sergod');
  }
  useEffect(() => {
    if (!selected || !dialog.current) return;
    dialog.current.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected?.id]);
  function choose(id: string) {
    navigate('sergod', id);
  }
  return (
    <div className={`store-page ${styles.page}`}>
      <SectionHeader
        section="news"
        title="Noticias"
        images={(list[0]?.assets || [])
          .filter((asset) => asset.type === 'image')
          .map((asset) => asset.url)
          .slice(0, 1)}
      />
      <nav className={styles.sectionTabs} aria-label="Secciones de noticias">
        {sections.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={active === id} onClick={() => navigate(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className={styles.columns}>
        {active === 'yugioh' && <WebNewsColumn />}
        {active === 'sergod' && (
          <section className={styles.storeNews} aria-labelledby="store-news-heading">
            <h2 id="store-news-heading" className={styles.storeHeading}>
              SERGOD STORE
            </h2>
            {remote.loading ? (
              <Loading />
            ) : remote.error ? (
              <div role="alert" className={styles.error}>
                <p>{remote.error}</p>
                <button className="store-button store-button-secondary" onClick={remote.reload}>
                  Reintentar noticias
                </button>
              </div>
            ) : !list.length ? (
              <section className={styles.empty} aria-label="Noticias de la tienda">
                <Newspaper size={26} aria-hidden="true" />
                <div>
                  <h2>Pronto tendremos novedades</h2>
                  <p>Las noticias de la tienda aparecerán aquí cuando estén publicadas.</p>
                </div>
              </section>
            ) : (
              <>
                {selected && (
                  <dialog
                    ref={dialog}
                    className={styles.storeDialog}
                    aria-label="Detalle de la noticia"
                    onCancel={close}
                    onClose={close}
                    onClick={(event) => {
                      if (event.target === event.currentTarget) close();
                    }}
                  >
                    <button
                      type="button"
                      className={styles.closeNews}
                      onClick={close}
                      aria-label="Cerrar noticia"
                    >
                      <X size={22} />
                    </button>
                    <section
                      tabIndex={-1}
                      className={styles.feature}
                      data-has-text={Boolean(selected.title || selected.caption)}
                      aria-label="Noticia seleccionada"
                    >
                      <NewsMedia
                        key={selected.id}
                        assets={selected.assets}
                        permalink={selected.permalink}
                      />
                      <div className={styles.caption}>
                        <span className={styles.eyebrow}>
                          {selected.id === list[0]?.id ? 'PUBLICACIÓN DESTACADA' : 'DEL ARCHIVO'}
                        </span>
                        <time dateTime={selected.recorded_at}>{date(selected.recorded_at)}</time>
                        {selected.title && (
                          <h2>
                            {selected.legacy_slug ? (
                              <Link href={`/publicacion/${selected.legacy_slug}`}>
                                {selected.title}
                              </Link>
                            ) : (
                              selected.title
                            )}
                          </h2>
                        )}
                        {selected.caption && <p>{selected.caption}</p>}
                        <div className={styles.links}>
                          {selected.permalink && (
                            <a href={selected.permalink} target="_blank" rel="noopener noreferrer">
                              <Camera size={17} />
                              Ver en Instagram{selected.username ? ` · @${selected.username}` : ''}
                            </a>
                          )}
                          {selected.tournament_id && (
                            <Link href={`/torneo/${selected.tournament_id}`}>
                              Ver torneo
                              <ArrowRight size={16} />
                            </Link>
                          )}
                          {selected.league_tournament_id && selected.ranking_board && (
                            <Link href={`/comunidad?ranking=${selected.ranking_board}`}>
                              Ver clasificación
                              <ArrowRight size={16} />
                            </Link>
                          )}
                        </div>
                      </div>
                    </section>
                  </dialog>
                )}
                {list.length > 0 && (
                  <section className={styles.archive} aria-labelledby="news-archive-heading">
                    <div className={styles.heading}>
                      <div>
                        <h2 id="news-archive-heading">Publicaciones</h2>
                      </div>
                      <span>
                        {list.length} {list.length === 1 ? 'publicación' : 'publicaciones'}
                      </span>
                    </div>
                    <div className={styles.grid}>
                      {list.slice(0, limit).map((p) => (
                        <button
                          type="button"
                          className={styles.card}
                          key={p.id}
                          onClick={() => choose(p.id)}
                          aria-label={`Ver noticia: ${(p.title || p.caption || 'Publicación de Instagram').slice(0, 90)}`}
                        >
                          <div className={styles.thumbnail}>
                            <ProductImage
                              src={
                                p.thumbnail ||
                                (p.assets[0]?.type === 'video'
                                  ? p.assets[0].poster
                                  : p.assets[0]?.url)
                              }
                              name="Miniatura de noticia"
                            />
                            {(p.media_type === 'VIDEO' ||
                              p.assets.some((a) => a.type === 'video')) && (
                              <span>
                                <Play size={15} />
                                Video
                              </span>
                            )}
                            {p.assets.length > 1 && <small>{p.assets.length} medios</small>}
                          </div>
                          <time dateTime={p.recorded_at}>{date(p.recorded_at)}</time>
                          {p.title && <h3>{p.title}</h3>}
                          <p>
                            {(p.caption || (p.title ? '' : 'Publicación de Instagram')).slice(
                              0,
                              150,
                            )}
                            {p.caption.length > 150 ? '…' : ''}
                          </p>
                          <span className={styles.read}>
                            Ver noticia
                            <ArrowRight size={16} />
                          </span>
                        </button>
                      ))}
                    </div>
                    {list.length > limit && (
                      <button
                        className="store-button store-button-secondary"
                        onClick={() => setLimit((n) => n + 9)}
                      >
                        Ver más noticias
                      </button>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
        )}
        {(active === 'myl-first-era' || active === 'myl-first-block') && (
          <WebNewsColumn key={active} board={active} />
        )}
      </div>
    </div>
  );
}
