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
  ArrowRight,
  Clock3,
} from 'lucide-react';
import { api, date, money } from '@/lib/client';
import type { Post, TournamentMedia, YouTubeVideo } from '@/lib/types';
import { useRemote, Loading, RemoteError, ProductImage } from '../shared';
import { SectionHeader } from '../SectionHeader';
import styles from './Tournaments.module.css';
import { TournamentCalendar } from './TournamentCalendar';
import { UpcomingTournaments } from './UpcomingTournaments';
import { addDays, chileLocal } from '@/lib/tournament-schedule';
import { tournamentDay, tournamentTime } from '@/lib/tournament-display';
import { boards, type RankingBoard } from '@/lib/rankings';

const resultBoards: RankingBoard[] = ['yugioh', 'myl-first-era', 'myl-first-block'];
const resultsPath = (board: RankingBoard) =>
  `/comunidad?ranking=${board}&resultados=1#torneos-ranking`;
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = chileLocal(new Date(now)).slice(0, 10);
  const posts = useRemote<Post[]>(`/posts?kind=tournament&from=${today}&to=${addDays(today, 45)}`),
    media = useRemote<TournamentMedia>('/tournaments');
  const [selected, setSelected] = useState<YouTubeVideo | null>(null),
    [extra, setExtra] = useState<YouTubeVideo[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const videos = [...(media.data?.videos || []), ...extra];
  const broadcast = media.data?.live;
  const latest = media.data?.videos[0];
  const related = posts.data?.find((post) => post.id === broadcast?.tournament_id);
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
      <nav className={styles.jumpLinks} aria-label="Secciones de Torneos">
        <a href="#transmision">
          Transmisión <Radio size={16} aria-hidden="true" />
        </a>
        <a href="#calendario">
          Calendario <CalendarDays size={16} aria-hidden="true" />
        </a>
        <a href="#resultados">
          Resultados <Trophy size={16} aria-hidden="true" />
        </a>
        <a href="#grabaciones">
          Grabaciones <Play size={16} aria-hidden="true" />
        </a>
      </nav>
      <section id="transmision" className={styles.broadcast} aria-labelledby="live-heading">
        <div className={styles.broadcastHeading}>
          <h2 id="live-heading">
            <Radio size={24} aria-hidden="true" /> Transmisión
          </h2>
          <a
            href={media.data?.channel_url || 'https://www.youtube.com/@SergodStore'}
            target="_blank"
            rel="noopener noreferrer"
          >
            Canal de YouTube <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
        {media.loading ? (
          <Loading />
        ) : media.error ? (
          <RemoteError error={media.error} reload={media.reload} />
        ) : broadcast ? (
          <>
            <div className={styles.broadcastInfo}>
              <span className={styles.liveBadge} data-stage={broadcast.stage}>
                {broadcast.stage === 'live' ? '● EN VIVO' : 'PRÓXIMA TRANSMISIÓN'}
              </span>
              <h3>{broadcast.title}</h3>
              {related && (
                <Link href={`/publicacion/${related.slug}`}>
                  Ver torneo <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
            <Player videoId={broadcast.video_id} title={broadcast.title} />
          </>
        ) : latest ? (
          <>
            <div className={styles.broadcastInfo}>
              <span className={styles.replayBadge}>ÚLTIMA GRABACIÓN</span>
              <h3>{latest.title}</h3>
              <time dateTime={latest.recorded_at}>{date(latest.recorded_at)}</time>
            </div>
            <button
              className={styles.featuredReplay}
              onClick={() => setSelected(latest)}
              aria-label={`Reproducir última grabación: ${latest.title}`}
            >
              <Thumbnail key={latest.id} video={latest} />
              <span className={styles.replayAction}>Reproducir grabación</span>
            </button>
          </>
        ) : (
          <div className={styles.offline}>
            <span className={styles.offlineBadge}>Fuera de línea</span>
            <img src="/brand/sergod-logo-480.webp" alt="SERGOD STORE" width="480" height="240" />
            <p>Nos vemos en la próxima partida.</p>
            <span>Los directos y las grabaciones publicadas aparecerán aquí.</span>
          </div>
        )}
      </section>
      <section id="calendario" className={styles.section} aria-labelledby="calendar-heading">
        <div className={styles.sectionHeading}>
          <CalendarDays />
          <h2 id="calendar-heading">Agenda de torneos</h2>
        </div>
        <div className={styles.scheduleLayout}>
          <div className={styles.calendarPanel}>
            <TournamentCalendar posts={posts.data || []} />
          </div>
          <section className={styles.nextDates} aria-labelledby="upcoming-heading">
            <h3 id="upcoming-heading">Próximos torneos</h3>
            {posts.loading ? (
              <Loading />
            ) : posts.error ? (
              <RemoteError error={posts.error} reload={posts.reload} />
            ) : (
              <UpcomingTournaments posts={posts.data || []} now={now} compact />
            )}
          </section>
        </div>
      </section>
      <section id="resultados" className={styles.section} aria-labelledby="results-heading">
        <div className={styles.sectionHeading}>
          <Trophy />
          <h2 id="results-heading">Resultados de liga</h2>
        </div>
        <p className={styles.sectionNote}>
          Consulta los torneos publicados y sus puntos en Comunidad.
        </p>
        <div className={styles.resultLinks}>
          {resultBoards.map((board) => (
            <Link key={board} href={resultsPath(board)}>
              <div>
                <span>{boards[board].game}</span>
                <h3>{board === 'yugioh' ? 'Yu-Gi-Oh!' : boards[board].name}</h3>
                <p>Ver torneos y resultados</p>
              </div>
              <ArrowRight size={20} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <section id="grabaciones" className={styles.section} aria-labelledby="archive-heading">
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
          <>
            <div>
              <CalendarDays size={18} aria-hidden="true" />
              <span>
                Fecha
                <time dateTime={p.event_at}>
                  {tournamentDay(p.event_at)}, {chileLocal(p.event_at).slice(0, 4)}
                </time>
              </span>
            </div>
            <div>
              <Clock3 size={18} aria-hidden="true" />
              <span>
                Horario<strong>{tournamentTime(p.event_at)} h · Chile</strong>
              </span>
            </div>
          </>
        )}
        {p.location && (
          <div>
            <MapPin size={18} aria-hidden="true" />
            <span>
              Lugar<strong>{p.location}</strong>
            </span>
          </div>
        )}
        {p.entry_price != null && (
          <div>
            <Trophy size={18} aria-hidden="true" />
            <span>
              Inscripción<strong>{money(p.entry_price)}</strong>
            </span>
          </div>
        )}
      </div>
      {p.image && <ProductImage className={styles.poster} src={p.image} name={p.title} />}
      {p.body && (
        <section className={styles.eventBody} aria-labelledby="event-information">
          <h2 id="event-information">Información del torneo</h2>
          <div className={styles.body}>{p.body}</div>
        </section>
      )}
      <nav className={styles.detailLinks} aria-label="Más sobre nuestros torneos">
        <Link href="/torneos#transmision">
          <Radio size={18} aria-hidden="true" /> Ver transmisiones
        </Link>
        <Link href="/torneos#resultados">
          <Trophy size={18} aria-hidden="true" /> Consultar resultados de liga
        </Link>
      </nav>
    </article>
  );
}
