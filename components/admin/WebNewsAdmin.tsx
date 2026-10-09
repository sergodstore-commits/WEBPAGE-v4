'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { yugiohMetaArticle, type WebNewsItem } from '@/lib/web-news';

const blank = (): WebNewsItem => ({
  id: '',
  title: '',
  summary: '',
  url: '',
  published_on: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
  visible: true,
});

export function WebNewsAdmin() {
  const [items, setItems] = useState<WebNewsItem[] | null>(null);
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  async function load() {
    try {
      setItems(await api<WebNewsItem[]>('/admin/news/web-sources'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar las noticias web.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function change(next: WebNewsItem[]) {
    setItems(next);
    setDirty(true);
    setNotice('');
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const saved = await api<WebNewsItem[]>('/admin/news/web-sources', {
        method: 'PATCH',
        body: JSON.stringify(items),
      });
      setItems(saved);
      setDirty(false);
      setNotice('Selección publicada. Las noticias ocultas se conservan en el panel.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card admin-card-body" aria-labelledby="web-news-admin-heading">
      <h2 id="web-news-admin-heading">Actualidad Yu-Gi-Oh!</h2>
      <p>
        Tarjetas de la columna derecha de Noticias. Añade un resumen propio en español y enlaza el
        artículo original; no copies el artículo completo.
      </p>
      <p>
        Beyond the Brave ya cuenta con una guía propia y galería completa en español. Su tarjeta
        enlaza automáticamente a la guía, además de conservar la fuente original.
      </p>
      <p>
        <a
          href="https://www.yugiohmeta.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="admin-button secondary"
        >
          Consultar Yu-Gi-Oh! Meta ↗
        </a>
      </p>
      {error && (
        <p role="alert" className="admin-feedback error">
          {error}{' '}
          {!items && (
            <button className="admin-button secondary" onClick={() => void load()}>
              Reintentar
            </button>
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-feedback success">
          {notice}
        </p>
      )}
      {items === null ? (
        <p>Cargando selección…</p>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const url = yugiohMetaArticle(draft.url);
              if (!url) {
                setError('Usa el enlace de un artículo de yugiohmeta.com/articles/.');
                return;
              }
              if (items.some((item) => item.url === url && item.id !== draft.id)) {
                setError('Ese artículo ya está en la lista.');
                return;
              }
              const item = {
                ...draft,
                url,
                title: draft.title.trim(),
                summary: draft.summary.trim(),
                id: draft.id || crypto.randomUUID(),
              };
              change(
                draft.id
                  ? items.map((old) => (old.id === draft.id ? item : old))
                  : [item, ...items],
              );
              setDraft(blank());
              setError('');
            }}
          >
            <fieldset disabled={busy} style={{ border: 0, padding: 0, display: 'grid', gap: 12 }}>
              <label className="admin-field">
                <span>Enlace del artículo</span>
                <input
                  required
                  type="url"
                  maxLength={1000}
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://www.yugiohmeta.com/articles/…"
                />
              </label>
              <label className="admin-field">
                <span>Título en español</span>
                <input
                  required
                  minLength={3}
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Resumen propio en español</span>
                <textarea
                  required
                  minLength={10}
                  maxLength={600}
                  rows={3}
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Fecha del artículo</span>
                <input
                  required
                  type="date"
                  value={draft.published_on}
                  onChange={(e) => setDraft({ ...draft, published_on: e.target.value })}
                />
              </label>
              <div className="admin-actions">
                <button
                  className="admin-button secondary"
                  disabled={!draft.id && items.length >= 80}
                >
                  {draft.id ? 'Aplicar edición a la lista' : 'Añadir a la lista'}
                </button>
                {draft.id && (
                  <button
                    type="button"
                    className="admin-button secondary"
                    onClick={() => setDraft(blank())}
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </fieldset>
          </form>
          <div className="admin-table-scroll" style={{ marginTop: 20 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Mostrar</th>
                  <th>Noticia</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={item.visible}
                        disabled={busy}
                        aria-label={`Mostrar ${item.title}`}
                        onChange={(e) =>
                          change(
                            items.map((old) =>
                              old.id === item.id ? { ...old, visible: e.target.checked } : old,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{item.title}</strong>
                      <p>{item.summary}</p>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        Ver fuente ↗
                      </a>
                    </td>
                    <td>
                      <button
                        className="admin-button secondary"
                        disabled={busy}
                        onClick={() => setDraft({ ...item })}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!items.length && <p>No hay artículos seleccionados.</p>}
          <p className="admin-muted">
            Antes de guardar, revisa el español y los nombres oficiales de las cartas. No hay
            traducción automática ni importación de imágenes.
          </p>
          <button className="admin-button" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? 'Guardando…' : 'Guardar selección de actualidad'}
          </button>
          {dirty && <p role="status">Hay cambios pendientes de guardar.</p>}
        </>
      )}
    </section>
  );
}
