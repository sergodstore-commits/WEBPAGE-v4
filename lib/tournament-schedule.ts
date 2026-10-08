import type { Post } from './types';

const clock = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export function chileLocal(value: string | Date) {
  const parts = clock.formatToParts(new Date(value));
  const p = (key: string) => parts.find((v) => v.type === key)!.value;
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}
export function validDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(`${day}T12:00:00Z`)) &&
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
  );
}
export function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
// Resolve against IANA time-zone rules, including Chile's seasonal clock changes.
export function chileInstant(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !validDay(local.slice(0, 10)))
    throw new Error('Indica una fecha y hora válidas de Chile.');
  const base = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(base)) throw new Error('Indica una fecha y hora válidas de Chile.');
  // Santiago's contemporary civil offsets. Verify each candidate with the zone database.
  for (const hours of [3, 4]) {
    const candidate = new Date(base + hours * 3600000);
    if (chileLocal(candidate) === local) return candidate.toISOString();
  }
  throw new Error('Esa hora no existe en Chile por el cambio de horario. Elige otra hora.');
}
export function isOccurrence(post: Post, day: string) {
  if (!post.repeat_weekly || !post.event_at || !validDay(day)) return false;
  const start = chileLocal(post.event_at).slice(0, 10);
  return (
    day >= start &&
    (!post.repeat_until || day <= post.repeat_until) &&
    (Date.parse(`${day}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) % (7 * 86400000) === 0 &&
    !(post.excluded_dates || []).includes(day)
  );
}
export function occurrence(post: Post, day: string): Post {
  return {
    ...post,
    id: `${post.id}:${day}`,
    series_id: post.id,
    slug: `${post.slug}--on-${day}`,
    event_at: chileInstant(`${day}T${chileLocal(post.event_at!).slice(11)}`),
  };
}
export function expandSchedule(posts: Post[], from: string, to: string, filterSingles = false) {
  const result: Post[] = [];
  for (const post of posts) {
    if (!post.repeat_weekly || post.kind !== 'tournament' || !post.event_at) {
      if (
        !filterSingles ||
        (post.event_at &&
          chileLocal(post.event_at).slice(0, 10) >= from &&
          chileLocal(post.event_at).slice(0, 10) <= to)
      )
        result.push(post);
      continue;
    }
    const start = chileLocal(post.event_at).slice(0, 10);
    const elapsed = Math.max(
      0,
      Math.ceil(
        (Date.parse(`${from}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / (7 * 86400000),
      ),
    );
    for (let day = addDays(start, elapsed * 7); day <= to; day = addDays(day, 7)) {
      if (isOccurrence(post, day)) result.push(occurrence(post, day));
    }
  }
  return result;
}
