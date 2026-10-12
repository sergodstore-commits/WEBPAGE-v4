'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Trophy, Medal, ArrowRight, Layers3 } from 'lucide-react';
import type { Post } from '@/lib/types';
import { date } from '@/lib/client';
import { academyHouses, duelHouse } from '@/lib/duel-academy';
import { boards, rankingOrderRule, type RankingBoard, type PublicRanking } from '@/lib/rankings';
import { useRemote, Loading, Empty, ProductImage } from '../shared';
import { SectionHeader } from '../SectionHeader';
import styles from './Community.module.css';

const EditionExplorer = dynamic(
  () => import('./EditionExplorer').then((module) => module.EditionExplorer),
  {
    loading: () => <Loading />,
  },
);

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
function PlayerPoints({
  player,
  close,
}: {
  player: PublicRanking['rows'][number];
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={styles.playerDialog}
      aria-labelledby="player-points-title"
      onClose={close}
    >
      <div className={styles.playerHeading}>
        <div>
          <span>Puntos por torneo · Yu-Gi-Oh!</span>
          <h2 id="player-points-title">{player.name}</h2>
        </div>
        <button
          className="store-button store-button-secondary"
          onClick={() => ref.current?.close()}
          autoFocus
          aria-label="Cerrar detalle del jugador"
        >
          Cerrar
        </button>
      </div>
      <p className={styles.playerTotal}>
        <strong>{player.points}</strong> puntos en {player.tournaments}{' '}
        {player.tournaments === 1 ? 'torneo' : 'torneos'}
      </p>
      <p className={styles.note}>
        Solo aparecen los torneos seleccionados que suman al ranking actual.
      </p>
      <ul className={styles.playerEvents}>
        {player.contributions?.map((t) => (
          <li key={t.tournament_id}>
            <div>
              <strong>{t.title}</strong>
              <span>
                {day(t.played_on)} · Puesto {t.position}° en el torneo
              </span>
            </div>
            <strong>
              {t.points} <small>{t.points === 1 ? 'punto' : 'puntos'}</small>
            </strong>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
function RankingTable({
  rows,
  label,
  clickable,
  onPlayer,
  compact = false,
}: {
  rows: PublicRanking['rows'];
  label: string;
  clickable: boolean;
  onPlayer: (player: PublicRanking['rows'][number]) => void;
  compact?: boolean;
}) {
  return (
    <table className={styles.table} aria-label={label}>
      <thead>
        <tr>
          <th aria-label="Posición">{compact ? '#' : 'Posición'}</th>
          <th>Jugador</th>
          <th aria-label="Torneos jugados" title="Torneos jugados">
            {compact ? 'T.' : 'Torneos jugados'}
          </th>
          <th>Puntos</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>
              {clickable && r.contributions?.length ? (
                <button
                  className={styles.positionButton}
                  onClick={() => onPlayer(r)}
                  aria-label={`Ver puntos por torneo de ${r.name}`}
                >
                  {r.position}°
                  {r.provisional && (
                    <sup aria-label="Puesto provisional por igualdad completa">†</sup>
                  )}
                </button>
              ) : (
                <>
                  {r.position}°
                  {r.provisional && (
                    <sup aria-label="Puesto provisional por igualdad completa">†</sup>
                  )}
                </>
              )}
            </td>
            <td>
              <span className={compact ? styles.playerName : undefined} title={r.name}>
                {r.name}
              </span>
            </td>
            <td>{r.tournaments}</td>
            <td>
              <strong>{r.points}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function Community() {
  const params = useSearchParams();
  const explore = params.get('vista') === 'ediciones';
  const ranking = params.get('ranking');
  const rankingQuery = ranking && Object.hasOwn(boards, ranking) ? `?ranking=${ranking}` : '';
  return (
    <div className={`store-page ${styles.page}`}>
      <SectionHeader section="community" title="Comunidad" />
      <nav className={styles.views} aria-label="Secciones de Comunidad">
        <Link
          href={`/comunidad${rankingQuery}`}
          scroll={false}
          aria-current={!explore ? 'page' : undefined}
        >
          <Trophy size={18} aria-hidden="true" /> Rankings
        </Link>
        <Link
          href={`/comunidad?vista=ediciones${rankingQuery ? `&ranking=${ranking}` : ''}`}
          scroll={false}
          aria-current={explore ? 'page' : undefined}
        >
          <Layers3 size={18} aria-hidden="true" /> Explorar cartas
        </Link>
      </nav>
      {explore ? <EditionExplorer /> : <CommunityRankings />}
    </div>
  );
}
function CommunityRankings() {
  const params = useSearchParams(),
    key = params.get('ranking') || 'myl-first-era';
  const board: RankingBoard = Object.hasOwn(boards, key) ? (key as RankingBoard) : 'myl-first-era';
  const ranking = useRemote<PublicRanking>(`/rankings?board=${board}`),
    posts = useRemote<Post[]>('/posts?kind=community');
  const [search, setSearch] = useState(''),
    [limit, setLimit] = useState(50),
    [selected, setSelected] = useState<string | null>(null),
    [eventsLimit, setEventsLimit] = useState(10);
  const [player, setPlayer] = useState<PublicRanking['rows'][number] | null>(null);
  const history = useRef<HTMLDetailsElement>(null);
  const showResults = params.get('resultados') === '1';
  useEffect(() => {
    if (showResults && history.current && !ranking.loading && ranking.data?.board === board) {
      history.current.open = true;
      history.current.scrollIntoView({ block: 'start' });
    }
  }, [showResults, board, ranking.loading, ranking.data]);
  const selectedBoard = boards[board];
  const limits = ranking.data?.academy;
  const duelHouses = academyHouses(limits);
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
    setPlayer(null);
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
    <>
      <nav className={styles.navigation} aria-label="Elegir ranking">
        <div>
          <h2>Mitos y Leyendas · Puntos de liga</h2>
          <div>
            {link('myl-first-era')}
            {link('myl-first-block')}
          </div>
        </div>
        <div>
          <h2>Yu-Gi-Oh! Ranking</h2>
          <div>{link('yugioh')}</div>
        </div>
      </nav>
      <section className={styles.ranking} aria-labelledby="ranking-title">
        <div className={styles.heading}>
          <div>
            <span>{selectedBoard.game}</span>
            <h2 id="ranking-title">
              {board === 'yugioh' ? 'La Academia de Duelos' : selectedBoard.name}
            </h2>
          </div>
          <Trophy aria-hidden="true" />
        </div>
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
                  {board !== 'yugioh' && (
                    <div className={styles.podium} aria-label="Primeros lugares">
                      {ranking.data.rows
                        .filter((r) => r.position <= 3)
                        .map((r, i) => (
                          <article key={i} data-position={r.position}>
                            <span>
                              <Medal size={18} aria-hidden="true" />
                              {r.position}°
                              {r.provisional && (
                                <sup aria-label="Puesto provisional por igualdad completa">†</sup>
                              )}
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
                  )}
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
                      {ranking.data.tournaments.length === 1 ? 'torneo' : 'torneos'}
                    </p>
                  </div>
                  {board === 'yugioh' ? (
                    <div className={styles.academyWrapper}>
                      <p className={styles.note}>
                        Tu casa depende de los puntos acumulados en los torneos seleccionados. El
                        puesto sigue siendo el del ranking general.
                      </p>
                      <div
                        className={styles.academy}
                        tabIndex={0}
                        role="region"
                        aria-label="Casas Slifer, Ra y Obelisk"
                      >
                        {duelHouses.map((house) => {
                          const members = ranking.data!.rows.filter(
                            (r) => duelHouse(r.points, limits) === house.id,
                          );
                          const matches = filtered.filter(
                            (r) => duelHouse(r.points, limits) === house.id,
                          );
                          return (
                            <section
                              key={house.id}
                              className={styles.house}
                              data-house={house.id}
                              aria-labelledby={`house-${house.id}`}
                            >
                              <img
                                className={styles.houseArt}
                                src={`/art/academy/${house.id}.webp`}
                                alt=""
                                width={720}
                                height={960}
                                loading="lazy"
                              />
                              <div className={styles.houseContent}>
                                <div className={styles.houseHeading}>
                                  <div>
                                    <h3 id={`house-${house.id}`}>{house.name}</h3>
                                  </div>
                                  <p>
                                    {members.length}{' '}
                                    {members.length === 1 ? 'jugador' : 'jugadores'}
                                  </p>
                                </div>
                                <div
                                  className={styles.houseScroll}
                                  tabIndex={0}
                                  role="region"
                                  aria-label={`Jugadores de ${house.name}`}
                                >
                                  {matches.length ? (
                                    <RankingTable
                                      rows={matches}
                                      label={`Clasificación ${house.name}`}
                                      compact
                                      clickable
                                      onPlayer={setPlayer}
                                    />
                                  ) : (
                                    <p className={styles.houseEmpty}>
                                      {members.length
                                        ? 'No hay jugadores que coincidan con esa búsqueda en esta casa.'
                                        : 'Todavía no hay jugadores en esta casa.'}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <RankingTable
                      rows={filtered.slice(0, limit)}
                      label={`Clasificación ${selectedBoard.name}`}
                      clickable={false}
                      onPlayer={setPlayer}
                    />
                  )}
                  {!filtered.length && (
                    <p role="status">No hay jugadores que coincidan con esa búsqueda.</p>
                  )}
                  {board !== 'yugioh' && filtered.length > limit && (
                    <button
                      className="store-button store-button-secondary"
                      onClick={() => setLimit((n) => n + 50)}
                    >
                      Ver más jugadores
                    </button>
                  )}
                  {board === 'yugioh' && (
                    <p className={styles.note}>
                      Pulsa el puesto de un jugador para ver sus puntos por torneo.
                    </p>
                  )}
                  <details className={styles.rankingRules}>
                    <summary>Cómo se ordena el ranking</summary>
                    <p>{rankingOrderRule}</p>
                    <p>
                      Los puestos son únicos y consecutivos. En una igualdad completa se conserva un
                      orden estable, marcado como provisional (†); ese orden no representa un mejor
                      resultado deportivo.
                    </p>
                  </details>
                  {ranking.data.rows.some((r) => r.provisional) && (
                    <p className={styles.note}>
                      † Puesto provisional: los puntos y standings usados para desempatar son
                      idénticos.
                    </p>
                  )}
                </>
              )}
              {ranking.data.updated_at && (
                <p className={styles.updated}>
                  Última actualización: {date(ranking.data.updated_at)}
                </p>
              )}
              {ranking.data.tournaments.length > 0 && (
                <details key={board} ref={history} id="torneos-ranking" className={styles.history}>
                  <summary>
                    Torneos que aportan al ranking · {ranking.data.tournaments.length}
                  </summary>
                  <p className={styles.rule}>
                    Acumulado de las ligas seleccionadas por la tienda. Cada torneo aporta sus
                    puntos finales una sola vez. Solo se suman las ligas de {selectedBoard.name}.
                  </p>
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
                </details>
              )}
            </>
          )
        )}
      </section>
      {board === 'yugioh' && player && (
        <PlayerPoints player={player} close={() => setPlayer(null)} />
      )}
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
    </>
  );
}
