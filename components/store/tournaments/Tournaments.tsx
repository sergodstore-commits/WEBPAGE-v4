'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  Play,
  Trophy,
  ArrowLeft,
  MapPin,
  ExternalLink,
  X,
  Radio,
  Video,
} from 'lucide-react';
import { api, date, money } from '@/lib/client';
import type { Post, TournamentMedia, YouTubeVideo } from '@/lib/types';
import { useRemote, Loading, RemoteError, ProductImage } from '../shared';
import { SectionHeader } from '../SectionHeader';
import styles from './Tournaments.module.css';
import { TournamentCalendar } from './TournamentCalendar';
function Thumbnail({ video }: { video: YouTubeVideo }) {
  const sources = [
    video.custom_thumbnail,
    video.youtube_thumbnail,
    '/brand/sergod-logo-480.webp',
  ].filter(Boolean);
  const [index, setIndex] = useState(0);
  return (
    <div className={styles.thumbnail}>
      <img
        src={sources[Math.min(index, sources.length - 1)]}
        alt={video.title}
        loading="lazy"
        onError={() => setIndex((i) => Math.min(i + 1, sources.length - 1))}
      />
      <span className={styles.playOverlay} aria-hidden="true">
        <Play size={22} fill="currentColor" />
      </span>
    </div>
  );
}

function Player({ videoId, title }: { videoId: string; title: string }) {
  return (
    <div className={styles.player}>
      <iframe
        title={title}
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&playsinline=1`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <a
        className={styles.externalPlayer}
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Abrir en YouTube <ExternalLink size={14} />
      </a>
    </div>
  );
}
function VideoDialog({ video, close }: { video: YouTubeVideo; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current,
      active = document.activeElement as HTMLElement | null,
      old = document.body.style.overflow;
    d?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      d?.close();
      document.body.style.overflow = old;
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="vod-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="vod-title">{video.title}</h2>
        <button aria-label="Cerrar transmisión" onClick={close}>
          <X />
        </button>
      </header>
      <Player videoId={video.video_id} title={video.title} />
      <p>{date(video.recorded_at)}</p>
    </dialog>
  );
}
export function Tournaments() {
  const posts = useRemote<Post[]>('/posts?kind=tournament'),
    media = useRemote<TournamentMedia>('/tournaments');
  const [selected, setSelected] = useState<YouTubeVideo | null>(null),
    [extra, setExtra] = useState<YouTubeVideo[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const videos = [...(media.data?.videos || []), ...extra];
  async function more() {
    setBusy(true);
    setError('');
    try {
      const r = await api<TournamentMedia>(`/tournaments?offset=${videos.length}`);
      setExtra((old) => [...old, ...r.videos.filter((v) => !videos.some((i) => i.id === v.id))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el archivo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`store-page ${styles.page}`}>
      <SectionHeader section="tournaments" title="Torneos" />
      <section className={styles.section} aria-labelledby="upcoming-heading">
        <div className={styles.sectionHeading}>
          <CalendarDays />
          <h2 id="upcoming-heading">Próximos torneos</h2>
        </div>
        <div className={styles.scheduleLayout}>
          <div className={styles.calendarPanel}>
            {posts.loading ? (
              <Loading />
            ) : posts.error ? (
              <RemoteError error={posts.error} reload={posts.reload} />
            ) : (
              <TournamentCalendar posts={posts.data || []} />
            )}
          </div>
          <section className={styles.live} aria-labelledby="live-heading">
            <div className={styles.panelHeading}>
              <Radio size={20} aria-hidden="true" />
              <h2 id="live-heading">Transmisión en vivo</h2>
              <span>YouTube</span>
            </div>
            {media.loading ? (
              <Loading />
            ) : media.error ? (
              <RemoteError error={media.error} reload={media.reload} />
            ) : media.data?.live ? (
              <>
                <span className={styles.liveBadge} data-stage={media.data.live.stage}>
                  {media.data.live.stage === 'live' ? '● EN VIVO' : 'PRÓXIMA TRANSMISIÓN'}
                </span>
                <p className={styles.liveTitle}>{media.data.live.title}</p>
                <Player videoId={media.data.live.video_id} title={media.data.live.title} />
              </>
            ) : (
              <div className={styles.offline}>
                <span className={styles.offlineBadge}>Fuera de línea</span>
                <img
                  src="/brand/sergod-logo-480.webp"
                  alt="SERGOD STORE"
                  width="480"
                  height="240"
                />
                <p>Nos vemos en la próxima partida.</p>
                <span>Torneos y encuentros de nuestra comunidad en YouTube.</span>
                <a
                  href={media.data?.channel_url || 'https://www.youtube.com/@SergodStore'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visitar el canal de YouTube <ExternalLink size={14} />
                </a>
              </div>
            )}
          </section>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="archive-heading">
        <div className={styles.sectionHeading}>
          <Play />
          <h2 id="archive-heading">Transmisiones anteriores</h2>
        </div>
        {media.loading ? (
          <Loading />
        ) : media.error ? (
          <RemoteError error={media.error} reload={media.reload} />
        ) : videos.length ? (
          <>
            <div className={styles.videos}>
              {videos.map((v) => (
                <button
                  key={v.id}
                  className={styles.videoCard}
                  onClick={() => setSelected(v)}
                  aria-label={`Ver transmisión: ${v.title}`}
                >
                  <Thumbnail video={v} />
                  <div>
                    <span>
                      <Play size={15} /> REPLAY
                    </span>
                    <h3>{v.title}</h3>
                    <time dateTime={v.recorded_at}>{date(v.recorded_at)}</time>
                  </div>
                </button>
              ))}
            </div>
            {videos.length < (media.data?.total || 0) && (
              <button
                className="store-button store-button-secondary"
                disabled={busy}
                onClick={more}
              >
                {busy ? 'Cargando…' : 'Ver más transmisiones'}
              </button>
            )}
            {error && <p role="alert">{error}</p>}
          </>
        ) : (
          <p className={styles.archiveEmpty}>
            <Video size={20} aria-hidden="true" />
            Las grabaciones aparecerán aquí cuando la tienda las publique.
          </p>
        )}
      </section>
      {selected && <VideoDialog video={selected} close={() => setSelected(null)} />}
    </div>
  );
}
export function TournamentDetail({ post: p }: { post: Post }) {
  return (
    <article className={`store-page ${styles.detail}`}>
      <Link className="store-text-link" href="/torneos">
        <ArrowLeft size={16} /> Volver a torneos
      </Link>
      <header className={styles.intro}>
        <span>TORNEOS SERGOD STORE</span>
        <h1>{p.title}</h1>
      </header>
      <div className={styles.meta}>
        {p.event_at && (
          <span>
            <CalendarDays size={18} />
            {date(p.event_at)}
          </span>
        )}
        {p.location && (
          <span>
            <MapPin size={18} />
            {p.location}
          </span>
        )}
      </div>
      {p.entry_price != null && <p>Inscripción: {money(p.entry_price)}</p>}
      {p.image && <ProductImage className={styles.poster} src={p.image} name={p.title} />}
      <div className={styles.body}>{p.body}</div>
    </article>
  );
}
