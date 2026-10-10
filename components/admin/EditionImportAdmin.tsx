'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import type { EditionPanel, EditionSummary } from '@/lib/edition-gallery';
import styles from './EditionImportAdmin.module.css';

const emptyDraft = { title: '', summary: '', body: '' };
export function EditionImportAdmin() {
  const [panel, setPanel] = useState<EditionPanel | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [reviewed, setReviewed] = useState(false);
  const running = useRef(false),
    alive = useRef(true);
  async function load() {
    try {
      const data = await api<EditionPanel>('/admin/news/editions');
      if (alive.current) setPanel(data);
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : 'No pudimos cargar las ediciones.');
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      running.current = false;
    };
  }, []);
  const selected = panel?.editions.find((item) => item.code === code);
  useEffect(() => {
    setDraft(
      selected
        ? { title: selected.title, summary: selected.summary, body: selected.body }
        : emptyDraft,
    );
    setReviewed(false);
  }, [code, selected?.code]);
  const dirty = Boolean(
    selected &&
    (draft.title !== selected.title ||
      draft.summary !== selected.summary ||
      draft.body !== selected.body),
  );
  const choices = new Map((panel?.discoveries ?? []).map((item) => [item.code, item]));
  panel?.editions.forEach((item) => choices.set(item.code, item));
  const options = [...choices.values()].sort((a, b) =>
    b.release_date.localeCompare(a.release_date),
  );
  function update(item: EditionSummary) {
    if (!alive.current) return;
    setPanel((previous) =>
      previous
        ? {
            ...previous,
            editions: [...previous.editions.filter((old) => old.code !== item.code), item],
          }
        : previous,
    );
  }
  async function action(name: string, work: () => Promise<void>) {
    setBusy(name);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : 'La operación no pudo terminar.');
    } finally {
      if (alive.current) setBusy('');
    }
  }
  async function prepare() {
    running.current = true;
    setReviewed(false);
    await action('prepare', async () => {
      let state = await api<EditionSummary>(`/admin/news/editions/${code}/prepare`, {
        method: 'POST',
      });
      update(state);
      while (
        alive.current &&
        running.current &&
        !state.last_error &&
        state.source_complete &&
        state.ready < state.total
      ) {
        const previous = state.ready;
        state = await api<EditionSummary>(`/admin/news/editions/${code}/batch`, { method: 'POST' });
        update(state);
        if (state.ready <= previous) break;
      }
      if (alive.current) {
        if (state.last_error) setError(state.last_error);
        else
          setNotice(
            state.complete
              ? 'Galería completa. Revisa el artículo y las cartas antes de publicar.'
              : !state.source_complete
                ? 'La fuente todavía no incluye todas las cartas. Vuelve a preparar cuando estén disponibles.'
                : 'Preparación pausada. El avance se conserva para reanudar.',
          );
        await load();
      }
    });
    running.current = false;
  }
  function change(field: keyof typeof draft, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setReviewed(false);
  }
  return (
    <section
      className={`admin-card admin-card-body ${styles.panel}`}
      aria-labelledby="edition-import-heading"
    >
      <div className={styles.heading}>
        <div>
          <h2 id="edition-import-heading">Guías de nuevas ediciones</h2>
          <p>Busca, prepara la galería en español y publica después de revisarla.</p>
        </div>
        <button
          className="admin-button"
          disabled={Boolean(busy)}
          onClick={() =>
            void action('search', async () => {
              const next = await api<EditionPanel>('/admin/news/editions/search', {
                method: 'POST',
              });
              setPanel(next);
              setNotice(`Encontramos ${next.discoveries.length} ediciones recientes o anunciadas.`);
            })
          }
        >
          {busy === 'search' ? 'Buscando…' : 'Buscar nuevas ediciones'}
        </button>
      </div>
      {error && (
        <p className="admin-feedback error" role="alert">
          {error} {!panel && <button onClick={() => void load()}>Reintentar</button>}
        </p>
      )}
      {notice && (
        <p className="admin-feedback success" role="status">
          {notice}
        </p>
      )}
      {!panel ? (
        <p>Cargando ediciones…</p>
      ) : (
        <>
          <div className={styles.info}>
            <span>
              Imágenes nuevas: {(panel.storage_bytes / 1_000_000).toFixed(1)} /{' '}
              {panel.storage_limit / 1_000_000} MB
            </span>
            <span>
              {panel.discovered_at
                ? `Fuente consultada: ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(panel.discovered_at))}`
                : 'Aún no has buscado ediciones.'}
            </span>
          </div>
          <details>
            <summary>Disponibilidad y almacenamiento</summary>
            <p>
              La búsqueda se conserva durante 6 horas. Se consultan ediciones TCG de los últimos 6
              meses y próximas ediciones anunciadas por YGOPRODeck. Si una caja no aparece, todavía
              no está en esa fuente.
            </p>
            <p>
              Los efectos usan el texto oficial español de Konami, sin IA de pago. Si falta una
              traducción, la preparación se detiene y conserva el avance. Las imágenes nuevas se
              guardan en WebP en el almacenamiento configurado de la tienda; se reutilizan entre
              ediciones. El límite de esta herramienta es 100 MB adicionales: no amplía planes ni
              borra cartas automáticamente.
            </p>
          </details>
          {!!options.length && (
            <div className={styles.selection}>
              <label className="admin-field">
                <span>Edición</span>
                <select
                  disabled={Boolean(busy)}
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setError('');
                    setNotice('');
                  }}
                >
                  <option value="">Selecciona una edición…</option>
                  {options.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name} · {item.release_date}
                      {panel.editions.find((saved) => saved.code === item.code)?.published
                        ? ' · Publicada'
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="admin-button secondary"
                disabled={!code || Boolean(busy)}
                onClick={() => void prepare()}
              >
                {selected?.ready ? 'Reanudar / comprobar galería' : 'Preparar galería'}
              </button>
              {busy === 'prepare' && (
                <button
                  className="admin-button secondary"
                  disabled={!running.current}
                  onClick={() => {
                    running.current = false;
                    setNotice('Pausando al terminar la carta actual…');
                  }}
                >
                  Pausar
                </button>
              )}
            </div>
          )}
          {selected && (
            <div className={styles.editor}>
              <div className={styles.progress} role="status">
                <strong>{selected.name}</strong>
                <span>
                  {selected.ready} / {selected.total || selected.expected} cartas preparadas ·{' '}
                  {selected.published ? 'Publicada' : 'Borrador'}
                </span>
                <progress max={selected.total || selected.expected} value={selected.ready} />
              </div>
              {selected.last_error && !error && (
                <p className="admin-feedback error">{selected.last_error}</p>
              )}
              <fieldset disabled={Boolean(busy)}>
                <label className="admin-field">
                  <span>Título en español</span>
                  <input
                    minLength={3}
                    maxLength={160}
                    value={draft.title}
                    onChange={(event) => change('title', event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Resumen en español</span>
                  <textarea
                    minLength={10}
                    maxLength={600}
                    rows={2}
                    value={draft.summary}
                    onChange={(event) => change('summary', event.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span>Artículo en español</span>
                  <textarea
                    minLength={30}
                    maxLength={10000}
                    rows={5}
                    value={draft.body}
                    onChange={(event) => change('body', event.target.value)}
                  />
                </label>
              </fieldset>
              <div className={styles.actions}>
                <button
                  className="admin-button secondary"
                  disabled={Boolean(busy) || !dirty}
                  onClick={() =>
                    void action('save', async () => {
                      update(
                        await api<EditionSummary>(`/admin/news/editions/${code}`, {
                          method: 'PATCH',
                          body: JSON.stringify(draft),
                        }),
                      );
                      setNotice(
                        'Borrador guardado. La versión pública no cambia hasta pulsar Publicar.',
                      );
                    })
                  }
                >
                  Guardar borrador
                </button>
                {selected.complete && !dirty && (
                  <a
                    className="admin-button secondary"
                    href={`/noticias/ediciones/${code}?vista=admin`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Vista previa ↗
                  </a>
                )}
              </div>
              {selected.complete && (
                <label className={styles.review}>
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={Boolean(busy) || dirty}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  He revisado el artículo y la galería en español.
                </label>
              )}
              <div className={styles.actions}>
                <button
                  className="admin-button"
                  disabled={Boolean(busy) || !selected.complete || !reviewed || dirty}
                  onClick={() =>
                    void action('publish', async () => {
                      update(
                        await api<EditionSummary>(`/admin/news/editions/${code}/publish`, {
                          method: 'POST',
                        }),
                      );
                      setReviewed(false);
                      setNotice('Guía publicada en la columna Yu-Gi-Oh! de Noticias.');
                    })
                  }
                >
                  {selected.published ? 'Publicar cambios revisados' : 'Publicar guía'}
                </button>
                {selected.published && (
                  <>
                    <a
                      className="admin-button secondary"
                      href={`/noticias/ediciones/${code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver publicada ↗
                    </a>
                    <button
                      className="admin-button secondary"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void action('withdraw', async () => {
                          update(
                            await api<EditionSummary>(`/admin/news/editions/${code}/withdraw`, {
                              method: 'POST',
                            }),
                          );
                          setNotice(
                            'Guía retirada de Noticias. Conservamos el borrador y las imágenes.',
                          );
                        })
                      }
                    >
                      Retirar de Noticias
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
