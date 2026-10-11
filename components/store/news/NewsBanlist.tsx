'use client';
import Link from 'next/link';
import { ArrowUpRight, ListChecks, ShieldCheck, ScrollText } from 'lucide-react';
import { Banlist } from '../community/Banlist';
import { useRemote } from '../shared';
import { banlistDay } from '@/lib/banlist';
import type { NewsBanlistOverview } from '@/lib/news-banlist';
import styles from './NewsBanlist.module.css';

export function NewsBanlist() {
  const remote = useRemote<NewsBanlistOverview>('/news/banlist');
  const tcg = remote.data?.yugioh;
  return (
    <aside className={styles.panel} aria-labelledby="news-banlist-heading">
      <header>
        <span className={styles.icon}>
          <ListChecks size={23} aria-hidden="true" />
        </span>
        <div>
          <h2 id="news-banlist-heading">Banlist</h2>
          <p>Restricciones por formato</p>
        </div>
      </header>
      <div className={styles.formats}>
        <div className={styles.format}>
          <Banlist className={styles.access}>
            <ShieldCheck size={19} aria-hidden="true" />
            <span>
              <strong>Yu-Gi-Oh! TCG</strong>
              <small>
                {remote.loading
                  ? 'Consultando vigencia…'
                  : tcg
                    ? `Vigente desde ${banlistDay(tcg.current.effective_on)}`
                    : 'Consultar lista oficial preparada'}
              </small>
            </span>
            <ArrowUpRight size={17} aria-hidden="true" />
          </Banlist>
          {tcg?.upcoming && (
            <p className={styles.next}>
              Próximo cambio:{' '}
              <time dateTime={tcg.upcoming.effective_on}>
                {banlistDay(tcg.upcoming.effective_on)}
              </time>
            </p>
          )}
        </div>
        {(['myl-first-era', 'myl-first-block'] as const).map((board) => {
          const entry = remote.data?.myl[board];
          const notice = entry?.current || entry?.unconfirmed || entry?.upcoming;
          const name = board === 'myl-first-era' ? 'MyL Primera Era' : 'MyL Primer Bloque';
          const status = remote.loading
            ? 'Consultando avisos…'
            : entry?.current
              ? `Vigente desde ${banlistDay(entry.current.effective_on!)}`
              : entry?.unconfirmed
                ? 'Aviso publicado · vigencia por confirmar'
                : entry?.upcoming
                  ? `Próxima lista: ${banlistDay(entry.upcoming.effective_on!)}`
                  : 'Aún sin aviso publicado';
          return (
            <div className={styles.format} key={board}>
              <Link
                className={styles.access}
                href={notice?.href || `/noticias?seccion=${board}&categoria=banlist`}
              >
                <ScrollText size={19} aria-hidden="true" />
                <span>
                  <strong>{name}</strong>
                  <small>{status}</small>
                </span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              {entry?.current && entry.upcoming && (
                <Link className={styles.next} href={entry.upcoming.href}>
                  Próximo cambio: {banlistDay(entry.upcoming.effective_on!)}
                </Link>
              )}
              {entry?.current &&
                entry.unconfirmed &&
                entry.unconfirmed.published_on > entry.current.published_on && (
                  <Link className={styles.next} href={entry.unconfirmed.href}>
                    Nuevo aviso · vigencia por confirmar
                  </Link>
                )}
            </div>
          );
        })}
      </div>
      {remote.error ? (
        <p role="alert" className={styles.note}>
          No pudimos comprobar la vigencia. <button onClick={remote.reload}>Reintentar</button>
        </p>
      ) : (
        <p className={styles.note}>
          MyL: avisos revisados de cada formato. Las noticias sobre cambios permanecen en su
          sección.
        </p>
      )}
    </aside>
  );
}
