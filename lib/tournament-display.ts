import type { Post } from './types';

const zone = 'America/Santiago';
export const tournamentDay = (value: string) =>
  new Intl.DateTimeFormat('es-CL', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(value));
export const tournamentTime = (value: string) =>
  new Intl.DateTimeFormat('es-CL', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));

export function upcomingTournaments(posts: Post[], now: number, limit = 6) {
  return posts
    .filter(
      (post) =>
        post.kind === 'tournament' &&
        post.status === 'published' &&
        post.event_at &&
        Date.parse(post.event_at) >= now,
    )
    .sort(
      (a, b) => Date.parse(a.event_at!) - Date.parse(b.event_at!) || a.slug.localeCompare(b.slug),
    )
    .slice(0, limit);
}
