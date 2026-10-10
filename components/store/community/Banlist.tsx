'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, Search, X, ArrowLeft } from 'lucide-react';
import {
  banlistDay,
  banlistSource,
  normalizeCardSearch,
  restrictionLabels,
  type BanlistState,
  type BanlistCard,
} from '@/lib/banlist';
import { useRemote, Loading } from '../shared';
import styles from './Banlist.module.css';

function BanlistDialog({ close }: { close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const remote = useRemote<BanlistState | null>('/community/banlist');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('changes');
  const [next, setNext] = useState(false);
  const [selected, setSelected] = useState<BanlistCard | null>(null);
  const cardOpener = useRef<number | null>(null);
  const back = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) back.current?.focus();
    else if (cardOpener.current !== null)
      ref.current
        ?.querySelector<HTMLButtonElement>(`button[data-cid="${cardOpener.current}"]`)
        ?.focus();
  }, [selected]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    ref.current?.showModal();
    return () => {
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, []);
  const snapshot = next && remote.data?.upcoming ? remote.data.upcoming : remote.data?.current;
  const cards = snapshot?.cards ?? [];
  const filtered = cards.filter(
    (card) =>
      (filter === 'all' ||
        (filter === 'changes' ? Boolean(card.change) : String(card.copies) === filter)) &&
      normalizeCardSearch(`${card.name} ${card.detail?.englishName ?? ''}`).includes(
        normalizeCardSearch(query),
      ),
  );
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="banlist-title"
      onClose={close}
      onCancel={(event) => {
        if (selected) {
          event.preventDefault();
          setSelected(null);
        }
      }}
    >
      <header className={styles.header}>
        <div>
          <span>
            <ShieldCheck size={16} aria-hidden="true" /> REGLAS DEL DUELO · TCG
          </span>
          <h2 id="banlist-title">Banlist Yu-Gi-Oh!</h2>
        </div>
        <button
          className={styles.close}
          autoFocus
          aria-label="Cerrar banlist"
          onClick={() => ref.current?.close()}
        >
          <X size={22} />
        </button>
      </header>
      {selected?.detail ? (
        <>
          <button ref={back} className={styles.back} onClick={() => setSelected(null)}>
            <ArrowLeft size={17} /> Volver a la lista
          </button>
          <div className={styles.detail}>
            <div className={styles.artwork}>
              <img src={selected.detail.image} alt={selected.name} width="600" height="875" />
              <small>La imagen conserva su idioma original.</small>
            </div>
            <section className={styles.effect} aria-label={`Ficha de ${selected.name}`}>
              <span className={styles.restriction} data-copies={selected.copies}>
                {restrictionLabels[selected.copies]} · {selected.copies}{' '}
                {selected.copies === 1 ? 'copia' : 'copias'}
              </span>
              <h3>{selected.name}</h3>
              <p className={styles.english}>{selected.detail.englishName}</p>
              {selected.change && <p className={styles.change}>{selected.change}</p>}
              <h4>Texto de la carta en español</h4>
              {selected.detail.effects.map((effect, i) => (
                <div key={i}>
                  {selected.detail!.effects.length > 1 && (
                    <h4>{i === 0 ? 'Efecto de Péndulo' : 'Efecto de monstruo'}</h4>
                  )}
                  <p>{effect}</p>
                </div>
              ))}
              <a href={selected.detail.source} target="_blank" rel="noopener noreferrer">
                Consultar ficha oficial en Konami ↗
              </a>
            </section>
          </div>
        </>
      ) : remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <div role="alert">
          <p>{remote.error}</p>
          <button className="store-button store-button-secondary" onClick={remote.reload}>
            Reintentar
          </button>
        </div>
      ) : !snapshot ? (
        <p>La tienda está preparando la lista oficial TCG en español.</p>
      ) : (
        <>
          <div className={styles.dates}>
            <p>
              {next ? 'Entra en vigor el' : 'Vigente desde el'}{' '}
              <strong>{banlistDay(snapshot.effective_on)}</strong>
            </p>
            {remote.data?.upcoming && (
              <button className="store-text-link" onClick={() => setNext(!next)}>
                {next
                  ? 'Volver a la lista vigente'
                  : `Ver próxima lista · ${banlistDay(remote.data.upcoming.effective_on)}`}
              </button>
            )}
          </div>
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar carta en la banlist"
              placeholder="Busca una carta por su nombre…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value && filter === 'changes') setFilter('all');
              }}
            />
          </label>
          <div className={styles.filters} role="group" aria-label="Filtrar restricciones">
            {[
              ['changes', 'Cambios'],
              ['all', 'Todas'],
              ...restrictionLabels.map((label, i) => [String(i), label]),
            ].map(([value, label]) => (
              <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label}
                <span>
                  {
                    cards.filter(
                      (c) =>
                        value === 'all' ||
                        (value === 'changes' ? c.change : String(c.copies) === value),
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          <p className={styles.note}>
            El máximo indicado se cuenta entre Deck Principal, Extra y Side Deck. «Fuera de la
            lista» muestra las cartas liberadas en esta actualización.
          </p>
          <div
            className={styles.results}
            tabIndex={0}
            role="region"
            aria-label="Cartas y restricciones"
          >
            {filtered.length ? (
              <ul>
                {[...filtered]
                  .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                  .map((card) => (
                    <li key={card.cid}>
                      <button
                        className={styles.tile}
                        data-cid={card.cid}
                        disabled={!card.detail}
                        aria-label={`Ver carta: ${card.name}`}
                        onClick={() => {
                          cardOpener.current = card.cid;
                          setSelected(card);
                        }}
                      >
                        <div className={styles.thumbnail}>
                          {card.detail ? (
                            <img
                              src={card.detail.thumbnail}
                              alt={card.name}
                              width="220"
                              height="320"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <span className={styles.pending}>Imagen en preparación</span>
                          )}
                          <span
                            className={styles.copies}
                            data-copies={card.copies}
                            aria-label={`Máximo ${card.copies} ${card.copies === 1 ? 'copia' : 'copias'}`}
                          >
                            {card.copies}
                          </span>
                        </div>
                        <strong>{card.name}</strong>
                        <span className={styles.cardStatus}>{restrictionLabels[card.copies]}</span>
                        {card.change && <em>{card.change}</em>}
                      </button>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className={styles.empty}>No hay cartas que coincidan con esta búsqueda.</p>
            )}
          </div>
          <footer className={styles.footer}>
            <span>
              Última consulta:{' '}
              {new Date(remote.data!.checked_at).toLocaleString('es-CL', {
                timeZone: 'America/Santiago',
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
            <details>
              <summary>Fuente y actualización</summary>
              <p>
                Lista y textos oficiales de Konami en español. Imágenes de YGOPRODeck alojadas y
                optimizadas por SERGOD. Se actualiza desde Admin, no de forma continua.
              </p>
              <a href={banlistSource} target="_blank" rel="noopener noreferrer">
                Consultar fuente oficial ↗
              </a>
            </details>
          </footer>
        </>
      )}
    </dialog>
  );
}

export function Banlist() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={styles.trigger} onClick={() => setOpen(true)}>
        <ShieldCheck size={18} aria-hidden="true" /> Banlist TCG
      </button>
      {open && createPortal(<BanlistDialog close={() => setOpen(false)} />, document.body)}
    </>
  );
}
