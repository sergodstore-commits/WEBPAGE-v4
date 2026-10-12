import Link from 'next/link';
import { ArrowRight, Clock3, MapPin } from 'lucide-react';
import { money } from '@/lib/client';
import type { Post } from '@/lib/types';
import { tournamentDay, tournamentTime, upcomingTournaments } from '@/lib/tournament-display';
import styles from './Tournaments.module.css';

export function UpcomingTournaments({ posts, now }: { posts: Post[]; now: number }) {
  const upcoming = upcomingTournaments(posts, now);
  return upcoming.length ? (
    <ul className={styles.upcoming}>
      {upcoming.map((post) => (
        <li key={post.id}>
          <Link href={`/publicacion/${post.slug}`} aria-label={`Ver detalles de ${post.title}`}>
            <div className={styles.eventTop}>
              <time dateTime={post.event_at!}>{tournamentDay(post.event_at!)}</time>
              {post.event_level && post.event_level !== 'normal' && (
                <span className={styles.eventBadge}>
                  {post.event_level === 'major' ? 'Especial' : 'Destacado'}
                </span>
              )}
            </div>
            <h3>{post.title}</h3>
            <span className={styles.eventInfo}>
              <Clock3 size={16} aria-hidden="true" /> {tournamentTime(post.event_at!)} h · Chile
            </span>
            {post.location && (
              <span className={styles.eventInfo}>
                <MapPin size={16} aria-hidden="true" /> {post.location}
              </span>
            )}
            <div className={styles.eventBottom}>
              {post.entry_price != null && (
                <span>
                  Inscripción <strong>{money(post.entry_price)}</strong>
                </span>
              )}
              <span className={styles.eventAction}>
                Ver torneo <ArrowRight size={16} aria-hidden="true" />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p className={styles.archiveEmpty}>
      No hay próximas fechas publicadas para los siguientes 45 días. Puedes consultar otros meses en
      el calendario.
    </p>
  );
}
