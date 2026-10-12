'use client';
import { ListChecks } from 'lucide-react';
import { Banlist } from '../community/Banlist';
import { MylBanlist } from './MylBanlist';
import { useRemote } from '../shared';
import { banlistDay } from '@/lib/banlist';
import type { NewsBanlistOverview } from '@/lib/news-banlist';
import styles from './NewsBanlist.module.css';

export function NewsBanlist() {
  const remote = useRemote<NewsBanlistOverview>('/news/banlist');
  return (
    <section className={styles.hub} aria-labelledby="news-banlist-heading">
      <header>
        <span className={styles.icon}>
          <ListChecks size={23} aria-hidden="true" />
        </span>
        <div>
          <h2 id="news-banlist-heading">Banlist por formato</h2>
          <p>Consulta las restricciones y sus fechas de vigencia.</p>
        </div>
      </header>
      <div className={styles.formats}>
        <div className={styles.format}>
          <Banlist className={styles.access}>
            <span>
              <strong>Yu-Gi-Oh! TCG</strong>
              <small>
                {remote.data?.yugioh
                  ? 'Vigente desde ' + banlistDay(remote.data.yugioh.current.effective_on)
                  : 'Lista oficial en español'}{' '}
                · Ver cartas y restricciones ↗
              </small>
            </span>
          </Banlist>
        </div>
        {(['myl-first-era', 'myl-first-block'] as const).map((board) => (
          <div className={styles.format} key={board}>
            <MylBanlist board={board} className={styles.access} />
          </div>
        ))}
      </div>
    </section>
  );
}
