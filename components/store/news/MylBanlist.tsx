'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck } from 'lucide-react';
import { useRemote, Loading } from '../shared';
import { banlistDay, normalizeCardSearch } from '@/lib/banlist';
import { newsBoards, type MylNewsBoard, type WebNewsMedia } from '@/lib/web-news';
import type { MylBanlistState } from '@/lib/myl-banlist';
import styles from '../community/Banlist.module.css';
import own from './MylBanlist.module.css';

function MylBanlistDialog({ board, close }: { board: MylNewsBoard; close: () => void }) {
  const remote = useRemote<MylBanlistState | null>('/news/banlist/myl');
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [next, setNext] = useState(false);
  const [selected, setSelected] = useState<WebNewsMedia | null>(null);
  useEffect(() => {
    const previous = document.body.style.overflow,
      opener = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    ref.current?.showModal();
    return () => {
      document.body.style.overflow = previous;
      opener?.focus();
    };
  }, []);
  const format = remote.data?.formats[board];
  const snapshot = next && format?.upcoming ? format.upcoming : format;
  const labels = ['Prohibidas', '1 copia', '2 copias', 'Liberadas'];
  const cards = (snapshot?.cards || [])
    .filter(
      (c) =>
        (filter === 'all' || (filter === 'changes' && c.change) || String(c.copies) === filter) &&
        normalizeCardSearch(c.name + ' ' + c.edition).includes(normalizeCardSearch(query)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="myl-banlist-title" onClose={close}>
      <header className={styles.header}>
        <div>
          <span>
            <ShieldCheck size={16} /> RACIAL EDICIÓN
          </span>
          <h2 id="myl-banlist-title">Banlist {newsBoards[board]}</h2>
        </div>
        <button
          autoFocus
          className={styles.close}
          aria-label="Cerrar banlist"
          onClick={() => ref.current?.close()}
        >
          <X size={22} />
        </button>
      </header>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <div role="alert">
          <p>No pudimos cargar la lista.</p>
          <button onClick={remote.reload}>Reintentar</button>
        </div>
      ) : !snapshot ? (
        <p>La tienda está preparando la lista oficial de este formato.</p>
      ) : (
        <>
          <div className={styles.dates}>
            <p>
              {next ? 'Próxima vigencia:' : 'Vigente desde:'}{' '}
              <strong>
                {snapshot.effective_on ? banlistDay(snapshot.effective_on) : 'Por confirmar'}
              </strong>
            </p>
            {format?.upcoming && (
              <button className={styles.back} onClick={() => setNext(!next)}>
                {next ? 'Ver vigente' : 'Ver próxima lista'}
              </button>
            )}
          </div>
          {selected ? (
            <div className={own.enlarged}>
              <button className={styles.back} onClick={() => setSelected(null)}>
                Volver a restricciones
              </button>
              <img src={selected.image} alt={selected.name} />
              <p>{selected.caption || selected.name}</p>
            </div>
          ) : (
            <>
              <label className={styles.search}>
                <input
                  type="search"
                  aria-label="Buscar carta MyL en la banlist"
                  placeholder="Nombre de carta o edición…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className={styles.filters} role="group" aria-label="Filtrar restricciones MyL">
                {[
                  ['all', 'Todas'],
                  ['changes', 'Cambios'],
                  ...labels.map((l, i) => [String(i), l]),
                ].map(([id, label]) => (
                  <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <div
                className={styles.results}
                role="region"
                tabIndex={0}
                aria-label="Cartas y restricciones MyL"
              >
                <p className={styles.note}>{cards.length} cartas · Racial Edición</p>
                <ul className={own.cards}>
                  {cards.map((c) => (
                    <li key={c.name}>
                      <div className={own.card}>
                        <span className={styles.copies} data-copies={c.copies}>
                          {c.copies}
                        </span>
                        <strong>{c.name}</strong>
                        <span>{c.edition}</span>
                        <small>{labels[c.copies]}</small>
                        {c.change && <em>{c.change}</em>}
                      </div>
                    </li>
                  ))}
                </ul>
                {!cards.length && <p>No hay cartas que coincidan con la búsqueda.</p>}
                <details className={own.rules}>
                  <summary>Reglas y aclaraciones del formato</summary>
                  {snapshot.rules.map((r, i) => (
                    <p key={i}>{r}</p>
                  ))}
                  <p>
                    Estas son las imágenes incluidas en la fuente oficial; no corresponden a todas
                    las cartas restringidas.
                  </p>
                  <div className={own.images}>
                    {snapshot.images
                      .filter((m) => m.image)
                      .map((m) => (
                        <button
                          key={m.source}
                          aria-label={`Ampliar ${m.name}`}
                          onClick={() => setSelected(m)}
                        >
                          <img src={m.image} alt={m.name} loading="lazy" />
                        </button>
                      ))}
                  </div>
                </details>
              </div>
            </>
          )}
          <footer className={styles.footer}>
            <span>
              Última consulta: {new Date(remote.data!.checked_at).toLocaleDateString('es-CL')}
            </span>
            <details>
              <summary>Fuentes y actualización</summary>
              {snapshot.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
              <p>
                Actualizada desde el panel administrativo. Las cartas liberadas en el último aviso
                se muestran con 3 copias.
              </p>
              {snapshot.sources.map((url, i) => (
                <p key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {i ? 'Aviso oficial de cambios' : 'Lista base oficial'} ↗
                  </a>
                </p>
              ))}
            </details>
          </footer>
        </>
      )}
    </dialog>
  );
}
export function MylBanlist({ board, className }: { board: MylNewsBoard; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className || styles.trigger} onClick={() => setOpen(true)}>
        <span>
          <strong>{newsBoards[board]}</strong>
          <small>Racial Edición · Ver cartas y restricciones ↗</small>
        </span>
      </button>
      {open &&
        createPortal(
          <MylBanlistDialog board={board} close={() => setOpen(false)} />,
          document.body,
        )}
    </>
  );
}
