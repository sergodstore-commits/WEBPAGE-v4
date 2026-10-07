'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Trophy, Medal, Users, ArrowRight } from 'lucide-react';
import type { Post } from '@/lib/types';
import { date } from '@/lib/client';
import { boards, type RankingBoard, type PublicRanking } from '@/lib/rankings';
import { useRemote, Loading, Empty, ProductImage } from '../shared';
import styles from './Community.module.css';

const day = (v: string) =>
  new Date(v + 'T15:00:00Z').toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
function Failure({ text, retry }: { text: string; retry: () => void }) {
  return (
    <div className={styles.error} role="alert">
      <p>{text}</p>
      <button className="store-button store-button-secondary" onClick={retry}>
        Reintentar
      </button>
    </div>
  );
}
function TournamentResults({ board, id }: { board: RankingBoard; id: string }) {
  const r = useRemote<{
    title: string;
    final_round: number | null;
    results: { name: string; position: number; points: number }[];
  }>(`/rankings/${board}/${id}`);
  if (r.loading) return <Loading />;
  if (r.error) return <Failure text={r.error} retry={r.reload} />;
  if (!r.data) return null;
  return (
    <section className={styles.snapshot} aria-label={`Resultados de ${r.data.title}`}>
      <h3>{r.data.title}</h3>
      {r.data.final_round && <p>Standing final · Ronda {r.data.final_round}</p>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Posición</th>
            <th>Jugador</th>
            <th>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {r.data.results.map((p, i) => (
            <tr key={i}>
              <td>{p.position}°</td>
              <td>{p.name}</td>
              <td>{p.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
export function Community() {
  const params = useSearchParams(),
    key = params.get('ranking') || 'myl-first-era';
  const board: RankingBoard = Object.hasOwn(boards, key) ? (key as RankingBoard) : 'myl-first-era';
  const ranking = useRemote<PublicRanking>(`/rankings?board=${board}`),
    posts = useRemote<Post[]>('/posts?kind=community');
  const [search, setSearch] = useState(''),
    [limit, setLimit] = useState(50),
    [selected, setSelected] = useState<string | null>(null),
    [eventsLimit, setEventsLimit] = useState(10);
  const selectedBoard = boards[board];
  const query = search
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const filtered = (ranking.data?.rows || []).filter((r) =>
    r.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(query),
  );
  function choose() {
    setSearch('');
    setLimit(50);
    setEventsLimit(10);
    setSelected(null);
  }
  const link = (b: RankingBoard) => (
    <Link
      href={`/comunidad?ranking=${b}`}
      scroll={false}
      aria-current={board === b ? 'page' : undefined}
      onClick={choose}
    >
      {boards[b].name}
    </Link>
  );
  return (
    <div className={`store-page ${styles.page}`}>
      <header className={styles.intro}>
        <span>NUESTRA COMUNIDAD, EN JUEGO</span>
        <h1>
          Comunidad<span>.</span>
        </h1>
        <p>Liga y rankings internos de SERGOD STORE.</p>
        <Users aria-hidden="true" />
      </header>
      <nav className={styles.navigation} aria-label="Elegir ranking">
        <div>
          <h2>Mitos y Leyendas</h2>
          <div>
            {link('myl-first-era')}
            {link('myl-first-block')}
          </div>
        </div>
        <div>
          <h2>Yu-Gi-Oh!</h2>
          <div>{link('yugioh')}</div>
        </div>
      </nav>
      <section className={styles.ranking} aria-labelledby="ranking-title">
        <div className={styles.heading}>
          <div>
            <span>{selectedBoard.game}</span>
            <h2 id="ranking-title">{selectedBoard.name}</h2>
          </div>
          <Trophy aria-hidden="true" />
        </div>
        <p className={styles.rule}>
          Acumulado de los torneos agregados a la Liga. Cada torneo aporta sus puntos finales una
          sola vez.
        </p>
        {board === 'yugioh' && (
          <p className={styles.disclaimer}>
            Ranking interno de SERGOD STORE. No es un ranking oficial de Konami.
          </p>
        )}
        {ranking.loading ? (
          <Loading />
        ) : ranking.error ? (
          <Failure text={ranking.error} retry={ranking.reload} />
        ) : (
          ranking.data && (
            <>
              {!ranking.data.rows.length ? (
                <Empty
                  icon={<Medal size={30} />}
                  title="El ranking comienza contigo"
                  body="La tienda todavía no ha publicado resultados en esta categoría. Las próximas fechas están en Torneos."
                >
                  <Link href="/torneos" className="store-button store-button-secondary">
                    Ver próximos torneos
                  </Link>
                </Empty>
              ) : (
                <>
                  <div className={styles.podium} aria-label="Primeros lugares">
                    {ranking.data.rows.slice(0, 3).map((r, i) => (
                      <article key={i}>
                        <span>
                          <Medal size={18} />
                          {r.position}°
                        </span>
                        <h3>{r.name}</h3>
                        <strong>
                          {r.points} <small>puntos</small>
                        </strong>
                        <p>
                          {r.tournaments} {r.tournaments === 1 ? 'torneo' : 'torneos'}
                        </p>
                      </article>
                    ))}
                  </div>
                  <div className={styles.tools}>
                    <label>
                      Buscar jugador
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setLimit(50);
                        }}
                        placeholder="Nombre del jugador"
                      />
                    </label>
                    <p>
                      {ranking.data.rows.length} jugadores · {ranking.data.tournaments.length}{' '}
                      torneos
                    </p>
                  </div>
                  <table
                    className={styles.table}
                    aria-label={`Clasificación ${selectedBoard.name}`}
                  >
                    <thead>
                      <tr>
                        <th>Posición</th>
                        <th>Jugador</th>
                        <th>Torneos jugados</th>
                        <th>Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, limit).map((r, i) => (
                        <tr key={i}>
                          <td>{r.position}°</td>
                          <td>{r.name}</td>
                          <td>{r.tournaments}</td>
                          <td>
                            <strong>{r.points}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <p role="status">No hay jugadores que coincidan con esa búsqueda.</p>
                  )}
                  {filtered.length > limit && (
                    <button
                      className="store-button store-button-secondary"
                      onClick={() => setLimit((n) => n + 50)}
                    >
                      Ver más jugadores
                    </button>
                  )}
                  <p className={styles.note}>
                    Los jugadores con los mismos puntos comparten posición. Se muestran en orden
                    alfabético dentro del empate.
                  </p>
                </>
              )}
              {ranking.data.updated_at && (
                <p className={styles.updated}>
                  Última actualización: {date(ranking.data.updated_at)}
                </p>
              )}
              {ranking.data.tournaments.length > 0 && (
                <section className={styles.history}>
                  <h3>Torneos que aportan al ranking</h3>
                  <ul>
                    {ranking.data.tournaments.slice(0, eventsLimit).map((t) => (
                      <li key={t.id}>
                        <div>
                          <strong>{t.title}</strong>
                          <span>
                            {day(t.played_on)}
                            {t.final_round ? ` · ${t.final_round} rondas` : ''}
                          </span>
                        </div>
                        <button
                          aria-expanded={selected === t.id}
                          onClick={() => setSelected(selected === t.id ? null : t.id)}
                        >
                          {selected === t.id ? 'Ocultar resultados' : 'Ver resultados'}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {ranking.data.tournaments.length > eventsLimit && (
                    <button
                      className="store-button store-button-secondary"
                      onClick={() => setEventsLimit((n) => n + 10)}
                    >
                      Ver más torneos
                    </button>
                  )}
                  {selected && ranking.data.tournaments.some((t) => t.id === selected) && (
                    <TournamentResults key={`${board}:${selected}`} board={board} id={selected} />
                  )}
                </section>
              )}
            </>
          )
        )}
      </section>
      {posts.loading ? (
        <Loading />
      ) : posts.error ? (
        <Failure text={posts.error} retry={posts.reload} />
      ) : (
        Boolean(posts.data?.length) && (
          <section className={styles.posts}>
            <h2>De la comunidad</h2>
            <div>
              {posts.data!.map((p) => (
                <Link key={p.id} href={`/publicacion/${p.slug}`} aria-label={p.title}>
                  <ProductImage src={p.image} name={p.title} />
                  <span>{date(p.created_at)}</span>
                  <h3>{p.title}</h3>
                  <span>
                    Leer publicación <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
