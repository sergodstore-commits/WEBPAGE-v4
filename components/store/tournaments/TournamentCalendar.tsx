'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-react';
import { date } from '@/lib/client';
import type { Post } from '@/lib/types';
import styles from './TournamentCalendar.module.css';

const zone = 'America/Santiago';
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: zone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const monthFormat = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});
const longDayFormat = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function localDay(value: string | Date) {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return null;
  const parts = dayFormat.formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function TournamentCalendar({ posts }: { posts: Post[] }) {
  const today = localDay(new Date())!;
  const currentMonth = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
  const [month, setMonth] = useState(currentMonth);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const first = new Date(Date.UTC(Math.floor(month / 12), month % 12, 1));
  const year = first.getUTCFullYear(),
    monthNumber = first.getUTCMonth();
  const prefix = `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
  const count = new Date(Date.UTC(year, monthNumber + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
    const number = i - offset + 1;
    return number > 0 && number <= count ? `${prefix}-${String(number).padStart(2, '0')}` : null;
  });
  const events = new Map<string, Post[]>();
  for (const post of posts) {
    if (post.status !== 'published' || post.kind !== 'tournament' || !post.event_at) continue;
    const day = localDay(post.event_at);
    if (day?.startsWith(prefix)) events.set(day, [...(events.get(day) || []), post]);
  }
  for (const list of events.values())
    list.sort((a, b) => Date.parse(a.event_at!) - Date.parse(b.event_at!));
  const total = [...events.values()].reduce((sum, list) => sum + list.length, 0);
  const monthTitle = monthFormat.format(first);
  const selectedEvents = selected ? events.get(selected) || [] : [];
  function move(next: number) {
    setMonth(next);
    setSelected(null);
  }

  return (
    <div
      className={`${styles.calendar} ${expanded ? styles.expanded : ''}`}
      aria-label="Calendario de torneos"
    >
      <div className={styles.toolbar}>
        <div className={styles.navigation}>
          <button type="button" aria-label="Mes anterior" onClick={() => move(month - 1)}>
            <ChevronLeft size={18} />
          </button>
          <p aria-live="polite" aria-atomic="true">
            {monthTitle}
          </p>
          <button type="button" aria-label="Mes siguiente" onClick={() => move(month + 1)}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => move(currentMonth)}
            aria-label="Volver al mes actual"
          >
            Hoy
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="tournament-calendar-month"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            {expanded ? 'Compactar' : 'Ampliar'}
          </button>
        </div>
      </div>
      <table id="tournament-calendar-month" className={styles.month}>
        <caption className={styles.srOnly}>
          Calendario de torneos de {monthTitle}. Horario de Chile.
        </caption>
        <thead>
          <tr>
            {weekdays.map((day) => (
              <th key={day} scope="col">
                <abbr title={day}>{day.slice(0, 3)}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: days.length / 7 }, (_, week) => (
            <tr key={week}>
              {days.slice(week * 7, week * 7 + 7).map((day, column) => {
                if (!day) return <td key={column} className={styles.outside} aria-hidden="true" />;
                const list = events.get(day) || [];
                const limit = expanded ? 3 : 1;
                return (
                  <td key={day}>
                    <button
                      type="button"
                      className={`${styles.day} ${list.length ? styles.hasEvents : ''}`}
                      aria-label={`${longDayFormat.format(new Date(`${day}T12:00:00Z`))}: ${list.length ? list.map((p) => p.title).join(', ') : 'sin eventos'}`}
                      aria-pressed={selected === day}
                      aria-controls={selected === day ? 'tournament-day-details' : undefined}
                      aria-current={day === today ? 'date' : undefined}
                      onClick={(event) => {
                        selectedButton.current = event.currentTarget;
                        setSelected(selected === day ? null : day);
                      }}
                    >
                      <time dateTime={day}>{Number(day.slice(-2))}</time>
                      {list.slice(0, limit).map((post) => (
                        <span className={styles.event} key={post.id}>
                          {post.title}
                        </span>
                      ))}
                      {list.length > limit && (
                        <span className={styles.more}>+{list.length - limit} más</span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.hint}>
        {total
          ? `${total} ${total === 1 ? 'evento publicado' : 'eventos publicados'} este mes. Pulsa un día para ver los detalles.`
          : 'Sin eventos publicados este mes.'}
      </p>
      {selected && (
        <section
          id="tournament-day-details"
          className={styles.details}
          aria-labelledby="tournament-selected-date"
          aria-live="polite"
        >
          <div className={styles.detailsHeading}>
            <h3 id="tournament-selected-date" className={styles.selectedDate}>
              {longDayFormat.format(new Date(`${selected}T12:00:00Z`))}
            </h3>
            <button
              type="button"
              aria-label="Cerrar detalles del día"
              onClick={() => {
                setSelected(null);
                selectedButton.current?.focus();
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          {selectedEvents.length ? (
            <ul>
              {selectedEvents.map((post) => (
                <li key={post.id}>
                  <Link href={`/publicacion/${post.slug}`}>
                    {post.title} <span aria-hidden="true">→</span>
                  </Link>
                  <p>
                    {date(post.event_at)}
                    {post.location ? ` · ${post.location}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p>No hay eventos publicados para este día.</p>
          )}
        </section>
      )}
    </div>
  );
}
