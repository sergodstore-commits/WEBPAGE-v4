'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, date } from '@/lib/client';
import type { InstagramCandidate, InstagramStatus, NewsItem } from '@/lib/news';
import type { Post } from '@/lib/types';
import type { LeagueTournament } from '@/lib/rankings';
import { boards } from '@/lib/rankings';
import { NewsMedia } from '../store/news/News';
import { WebNewsAdmin } from './WebNewsAdmin';
import { EditionImportAdmin } from './EditionImportAdmin';
import { BanlistAdmin } from './BanlistAdmin';
import styles from './NewsWorkspace.module.css';

const message = (e: unknown) =>
  e instanceof Error ? e.message : 'No se pudo completar la operación.';
function NewsEditor({
  item,
  done,
  cancel,
}: {
  item: InstagramCandidate | NewsItem;
  done: () => void;
  cancel: () => void;
}) {
  const existing = 'id' in item;
  const [form, setForm] = useState({
    status: existing ? item.status || 'draft' : 'draft',
    tournament_id: existing ? item.tournament_id : null,
    league_tournament_id: existing ? item.league_tournament_id : null,
  });
  const [posts, setPosts] = useState<Post[]>([]),
    [league, setLeague] = useState<LeagueTournament[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api<Post[]>('/admin/posts'), api<LeagueTournament[]>('/admin/league')])
      .then(([p, l]) => {
        setPosts(p.filter((v) => v.kind === 'tournament'));
        setLeague(l);
      })
      .catch((e) => setError(message(e)));
  }, []);
  useEffect(() => {
    document.getElementById('instagram-news-preview')?.scrollIntoView({ block: 'start' });
  }, []);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const saved = await api<NewsItem>(existing ? `/admin/news/${item.id}` : '/admin/news', {
        method: existing ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, ...(!existing ? { preview_id: item.preview_id } : {}) }),
      });
      const list = await api<NewsItem[]>('/admin/news');
      if (!list.some((p) => p.id === saved.id && p.status === form.status))
        throw Error(
          'La noticia se guardó, pero su lectura no pudo comprobarse. Recarga antes de reintentar.',
        );
      const visible = await api<NewsItem[]>('/news');
      if (visible.some((p) => p.id === saved.id) !== (form.status === 'published'))
        throw Error('La noticia se guardó, pero no pudo comprobarse su estado público.');
      done();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="admin-card admin-card-body"
      id="instagram-news-preview"
      aria-labelledby="instagram-preview-heading"
    >
      <h2 id="instagram-preview-heading">
        {existing ? 'Editar noticia de Instagram' : 'Vista previa de Instagram'}
      </h2>
      <p>
        {date(item.recorded_at)} · {'media_type' in item ? item.media_type : 'Publicación guardada'}
      </p>
      <div style={{ maxWidth: 560, margin: '20px 0' }}>
        <NewsMedia assets={item.assets} permalink={item.permalink} />
      </div>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {item.caption || 'Publicación sin texto adicional.'}
      </p>
      <p>
        Los archivos permanecen en Instagram. Guardamos el enlace, texto y fecha para mostrar la
        publicación en Noticias. Si se elimina o se vuelve privada, dejará de mostrarse.
      </p>
      {!existing && (
        <p>
          Vista previa válida durante 15 minutos. No se copian fotos ni videos al almacenamiento de
          la tienda.
        </p>
      )}
      <div className="admin-form-grid">
        <label className="admin-field">
          <span>Estado de la noticia</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
          >
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
            <option value="withdrawn">Retirado</option>
          </select>
        </label>
        <label className="admin-field">
          <span>Torneo relacionado (opcional)</span>
          <select
            value={form.tournament_id || ''}
            onChange={(e) => setForm({ ...form, tournament_id: e.target.value || null })}
          >
            <option value="">Sin relación</option>
            {posts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Resultados de Liga relacionados (opcional)</span>
          <select
            value={form.league_tournament_id || ''}
            onChange={(e) => setForm({ ...form, league_tournament_id: e.target.value || null })}
          >
            <option value="">Sin relación</option>
            {league.map((p) => (
              <option key={p.id} value={p.id}>
                {boards[p.board].name} · {p.title} · ID {p.external_id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="admin-feedback error">
          {error}
        </p>
      )}
      <div className="admin-actions end">
        <button className="admin-button secondary" disabled={busy} onClick={cancel}>
          Cancelar
        </button>
        <button className="admin-button" disabled={busy} onClick={() => void save()}>
          {busy
            ? 'Guardando…'
            : existing
              ? 'Guardar cambios'
              : form.status === 'published'
                ? 'Importar y publicar'
                : 'Guardar noticia'}
        </button>
      </div>
    </section>
  );
}
export function InstagramIntegration({
  news = false,
  onSaved,
}: { news?: boolean; onSaved?: () => void } = {}) {
  const [status, setStatus] = useState<InstagramStatus | null>(null),
    [candidates, setCandidates] = useState<InstagramCandidate[]>([]),
    [selected, setSelected] = useState<InstagramCandidate | null>(null),
    [next, setNext] = useState<string | null>(null),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [known, setKnown] = useState<NewsItem[]>([]),
    [included, setIncluded] = useState<string[]>([]);
  const existing = (p: InstagramCandidate) => known.find((n) => n.media_id === p.media_id);
  const pending = candidates.some(
    (p) => included.includes(p.media_id) !== (existing(p)?.status === 'published'),
  );
  const resetSelection = (items: NewsItem[]) =>
    setIncluded(
      items
        .filter((n) => n.status === 'published')
        .map((n) => n.media_id!)
        .filter(Boolean),
    );
  async function load() {
    const s = await api<InstagramStatus>('/admin/integrations/instagram');
    setStatus(s);
  }
  useEffect(() => {
    void load().catch((e) => setError(message(e)));
    const outcome = new URLSearchParams(window.location.search).get('instagram');
    if (outcome)
      setNotice(
        outcome === 'connected'
          ? 'Instagram conectado. Revisa publicaciones para elegir Noticias.'
          : outcome,
      );
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function review(cursor?: string) {
    const stored = await api<NewsItem[]>('/admin/news');
    const r = await api<{
      candidates: InstagramCandidate[];
      next_cursor: string | null;
      scanned: number;
    }>('/admin/integrations/instagram/review', {
      method: 'POST',
      body: JSON.stringify(cursor ? { cursor } : {}),
    });
    setCandidates((old) =>
      cursor
        ? [...old, ...r.candidates.filter((p) => !old.some((o) => o.media_id === p.media_id))]
        : r.candidates,
    );
    setNext(r.next_cursor);
    setKnown(stored);
    setIncluded((old) =>
      cursor
        ? [
            ...new Set([
              ...old,
              ...stored
                .filter((n) => n.status === 'published')
                .map((n) => n.media_id!)
                .filter(Boolean),
            ]),
          ]
        : stored
            .filter((n) => n.status === 'published')
            .map((n) => n.media_id!)
            .filter(Boolean),
    );
    setReviewed(true);
    setSelected(null);
    setNotice(
      `Lista actualizada: ${r.scanned} publicaciones consultadas. Marca las que quieres mostrar y guarda la selección.`,
    );
  }
  async function saveSelection() {
    let completed = 0;
    try {
      for (const p of candidates) {
        const saved = existing(p),
          wanted = included.includes(p.media_id);
        if (wanted === (saved?.status === 'published')) continue;
        await api(saved ? `/admin/news/${saved.id}` : '/admin/news', {
          method: saved ? 'PATCH' : 'POST',
          body: JSON.stringify(
            saved
              ? {
                  status: wanted ? 'published' : 'withdrawn',
                  tournament_id: saved.tournament_id,
                  league_tournament_id: saved.league_tournament_id,
                }
              : { preview_id: p.preview_id, status: 'published' },
          ),
        });
        completed++;
      }
      const stored = await api<NewsItem[]>('/admin/news');
      setKnown(stored);
      const publicItems = await api<NewsItem[]>('/news');
      for (const p of candidates) {
        const saved = stored.find((n) => n.media_id === p.media_id),
          wanted = included.includes(p.media_id);
        if (
          (saved?.status === 'published') !== wanted ||
          (saved ? publicItems.some((n) => n.id === saved.id) : false) !== wanted
        )
          throw Error('No se pudo comprobar la selección pública. Actualiza para revisar.');
      }
      onSaved?.();
      setNotice('Selección guardada. Lectura y visibilidad en Noticias comprobadas.');
    } catch (e) {
      const stored = await api<NewsItem[]>('/admin/news').catch(() => null);
      if (stored) setKnown(stored);
      onSaved?.();
      throw Error(
        `${completed ? `${completed} cambios guardados. ` : ''}${message(e)} Los cambios restantes siguen pendientes.`,
      );
    }
  }
  return (
    <section className="admin-card admin-card-body" aria-labelledby="instagram-integration-heading">
      <h2 id="instagram-integration-heading">
        {news ? 'Elegir publicaciones de Instagram' : 'Instagram'}
      </h2>
      <p>
        Estado:{' '}
        {status?.connected
          ? status.expired
            ? 'Autorización vencida'
            : 'Conectado'
          : 'Desconectado'}
        {status?.username ? ` · @${status.username}` : ''}
      </p>
      {!news && (
        <>
          {!status?.configured && (
            <p>
              Conexión pendiente: configura la aplicación de Meta y la clave de cifrado en el
              servidor. La cuenta debe ser profesional.
            </p>
          )}
          {status?.login_mode === 'facebook' && (
            <p>
              Conexión mediante Facebook. Autoriza solo la página de SERGOD STORE, vinculada al
              Instagram profesional de la tienda. Se leerán publicaciones; no se publicará ni se
              accederá a mensajes.
            </p>
          )}
          {status?.callback_url && (
            <p style={{ overflowWrap: 'anywhere' }}>Callback: {status.callback_url}</p>
          )}
        </>
      )}
      <div className="admin-actions">
        {!news && (
          <button
            className="admin-button"
            disabled={busy || !status?.configured}
            onClick={() =>
              void action(async () => {
                const r = await api<{ url: string }>('/admin/integrations/instagram/connect', {
                  method: 'POST',
                  body: '{}',
                });
                window.location.assign(r.url);
              })
            }
          >
            {status?.connected ? 'Volver a conectar Instagram' : 'Conectar Instagram'}
          </button>
        )}
        <button
          className="admin-button secondary"
          disabled={busy || pending || !status?.configured || !status.connected || status.expired}
          onClick={() => void action(() => review())}
        >
          {busy ? 'Consultando…' : 'Actualizar publicaciones'}
        </button>
        {!news && (
          <>
            <button
              className="admin-button secondary"
              disabled={busy || !status?.connected}
              onClick={() => {
                if (window.confirm('¿Desconectar Instagram? Las noticias guardadas se conservan.'))
                  void action(async () => {
                    await api('/admin/integrations/instagram/disconnect', {
                      method: 'POST',
                      body: '{}',
                    });
                    await load();
                    setCandidates([]);
                    setSelected(null);
                    setReviewed(false);
                    setNotice('Instagram desconectado. Las noticias publicadas se conservan.');
                  });
              }}
            >
              Desconectar Instagram
            </button>
            <Link className="admin-button secondary" href="/admin/noticias">
              Noticias guardadas
            </Link>{' '}
          </>
        )}
        {news && (
          <Link className="admin-button secondary" href="/admin/integraciones">
            Configurar conexión
          </Link>
        )}
      </div>
      <p>
        Fotos, carruseles y Reels de la cuenta conectada, sin filtro por hashtag. Usa «Cargar más»
        para consultar publicaciones anteriores. Stories no se incluyen.
      </p>
      {error && (
        <div role="alert" className="admin-feedback error">
          {error}
          <button
            className="admin-button secondary"
            disabled={busy}
            onClick={() => void action(load)}
          >
            Reintentar conexión
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="admin-feedback success">
          {notice}
        </p>
      )}
      {reviewed && (
        <>
          <h3>Publicaciones de Instagram · {candidates.length}</h3>
          <p>
            Marca para mostrar en Noticias. Desmarcar retira de la web y conserva la publicación
            original. Los cambios se aplican al guardar.
          </p>
          {!candidates.length && <p>No hay publicaciones disponibles en esta página.</p>}
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Mostrar en Noticias</th>
                  <th>Publicación</th>
                  <th>Fecha</th>
                  <th>Formato</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((p) => (
                  <tr key={p.media_id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Mostrar publicación ${p.media_id} en Noticias`}
                        disabled={busy}
                        checked={included.includes(p.media_id)}
                        onChange={(e) => {
                          setIncluded((ids) =>
                            e.target.checked
                              ? [...ids, p.media_id]
                              : ids.filter((id) => id !== p.media_id),
                          );
                          setNotice('');
                        }}
                      />
                    </td>
                    <td>{p.caption.slice(0, 120) || 'Publicación de Instagram'}</td>
                    <td>{date(p.recorded_at)}</td>
                    <td>
                      {p.media_type}
                      <br />
                      <small>
                        {existing(p)?.status === 'published'
                          ? 'Visible en la web'
                          : existing(p)
                            ? 'Guardada, sin mostrar'
                            : 'Sin incorporar'}
                      </small>
                    </td>
                    <td>
                      <button
                        className="admin-button secondary"
                        disabled={busy}
                        aria-label={`Previsualizar publicación ${p.media_id}`}
                        onClick={() => setSelected(p)}
                      >
                        Previsualizar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {next && (
            <button
              className="admin-button secondary"
              disabled={busy || pending}
              onClick={() => void action(() => review(next))}
            >
              Cargar más publicaciones
            </button>
          )}
        </>
      )}
      {reviewed && candidates.length > 0 && (
        <div className="admin-actions">
          <button
            className="admin-button"
            disabled={busy || !pending}
            onClick={() => void action(saveSelection)}
          >
            {busy ? 'Guardando…' : 'Guardar selección de Noticias'}
          </button>
          <button
            className="admin-button secondary"
            disabled={busy || !pending}
            onClick={() => {
              resetSelection(known);
              setNotice('');
            }}
          >
            Descartar cambios
          </button>
          <span>{pending ? 'Cambios sin guardar' : 'Selección guardada'}</span>
        </div>
      )}
      {selected && (
        <NewsEditor
          key={selected.preview_id}
          item={existing(selected) || selected}
          cancel={() => setSelected(null)}
          done={() => {
            void api<NewsItem[]>('/admin/news')
              .then((items) => {
                setKnown(items);
                resetSelection(items);
              })
              .catch((e) => setError(message(e)));
            onSaved?.();
            setSelected(null);
            setNotice('Noticia guardada. Estado público y lectura comprobados.');
          }}
        />
      )}
    </section>
  );
}
export function InstagramNewsPage() {
  const [workspace, setWorkspace] = useState('web');
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('herramienta');
    if (tab && ['web', 'instagram', 'editions', 'banlist'].includes(tab)) setWorkspace(tab);
  }, []);
  const [list, setList] = useState<NewsItem[]>([]),
    [selected, setSelected] = useState<NewsItem | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  async function load() {
    setList(await api<NewsItem[]>('/admin/news'));
  }
  useEffect(() => {
    load()
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);
  async function remove(item: NewsItem) {
    if (
      !window.confirm(
        '¿Borrar esta noticia de SERGOD STORE? La publicación original de Instagram se conserva.',
      )
    )
      return;
    try {
      await api(`/admin/news/${item.id}`, { method: 'DELETE' });
      await load();
      setSelected(null);
      setNotice('Noticia eliminada de SERGOD STORE.');
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>Noticias</h1>
          <p>Busca contenido, revisa el borrador y publica en su sección.</p>
        </div>
      </div>
      <nav className={styles.tabs} aria-label="Herramientas de contenido">
        {[
          ['web', 'Noticias web', 'Yu-Gi-Oh! TCG y MyL'],
          ['instagram', 'SERGOD STORE', 'Publicaciones de Instagram'],
          ['editions', 'Guías de cartas', 'Contenido de sobres y cajas'],
          ['banlist', 'Banlist TCG', 'Lista oficial de Konami'],
        ].map(([id, title, help]) => (
          <button
            key={id}
            type="button"
            className={styles.tab}
            aria-pressed={workspace === id}
            onClick={() => {
              setWorkspace(id);
              const url = new URL(window.location.href);
              url.searchParams.set('herramienta', id);
              window.history.replaceState(null, '', url);
            }}
          >
            <strong>{title}</strong>
            <small>{help}</small>
          </button>
        ))}
      </nav>
      <details className={styles.inventory}>
        <summary>¿Qué importa cada herramienta?</summary>
        <ul>
          <li>
            Noticias web: busca en Yu-Gi-Oh! Meta y el blog MyL. Solo descarga imágenes de noticias
            que prepares.
          </li>
          <li>
            SERGOD STORE: consulta Instagram y publica tu selección. Fotos y videos permanecen en
            Instagram.
          </li>
          <li>
            Guías de cartas: obtiene ediciones de YGOPRODeck, efectos oficiales en español de Konami
            y guarda imágenes WebP.
          </li>
          <li>Banlist TCG: actualiza la lista oficial de Konami y su galería para Comunidad.</li>
          <li>
            <Link href="/admin/liga">Ligas: resultados de Konami y TOR</Link>. Importa torneos;
            eliges cuáles suman puntos.
          </li>
        </ul>
      </details>
      <div hidden={workspace !== 'web'}>
        <WebNewsAdmin />
      </div>
      <div hidden={workspace !== 'editions'}>
        <EditionImportAdmin />
      </div>
      <div hidden={workspace !== 'banlist'}>
        <BanlistAdmin />
      </div>
      <div hidden={workspace !== 'instagram'}>
        <InstagramIntegration
          news
          onSaved={() => {
            void load().catch((e) => setError(message(e)));
          }}
        />
        <p>
          Las publicaciones manuales existentes siguen en{' '}
          <Link
            style={{ color: '#176d86', textDecoration: 'underline' }}
            href="/admin/publicaciones"
          >
            Publicaciones
          </Link>
          .
        </p>
        {error && (
          <div role="alert" className="admin-feedback error">
            {error}
            <button
              className="admin-button secondary"
              onClick={() =>
                void load()
                  .then(() => setError(''))
                  .catch((e) => setError(message(e)))
              }
            >
              Reintentar noticias
            </button>
          </div>
        )}
        {notice && (
          <p role="status" className="admin-feedback success">
            {notice}
          </p>
        )}
        {selected && (
          <NewsEditor
            key={selected.id}
            item={selected}
            cancel={() => setSelected(null)}
            done={() => {
              setSelected(null);
              void load().catch((e) => setError(message(e)));
              setNotice('Cambios guardados y lectura comprobada.');
            }}
          />
        )}
        {loading ? (
          <p role="status">Cargando noticias…</p>
        ) : (
          <section className="admin-card admin-card-body">
            {!list.length ? (
              <p>Todavía no hay noticias de Instagram guardadas.</p>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Noticia</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id}>
                        <td>{p.caption.slice(0, 150) || 'Publicación de Instagram'}</td>
                        <td>{date(p.recorded_at)}</td>
                        <td>
                          {p.status === 'published'
                            ? 'Publicado'
                            : p.status === 'withdrawn'
                              ? 'Retirado'
                              : 'Borrador'}
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button
                              className="admin-button secondary"
                              aria-label={`Editar noticia ${p.media_id}`}
                              onClick={() => setSelected(p)}
                            >
                              Editar
                            </button>
                            <button
                              className="admin-button secondary"
                              aria-label={`Borrar noticia ${p.media_id}`}
                              onClick={() => void remove(p)}
                            >
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
