'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, date } from '@/lib/client';
import type { Post, TwitchVideo } from '@/lib/types';
import { TorIntegration } from './LeagueAdmin';
import { InstagramIntegration } from './InstagramAdmin';

type Status = {
  configured: boolean;
  connected: boolean;
  channel: string;
  validated_at: string | null;
  callback_url: string;
  live: { enabled: boolean; title: string; channel: string; tournament_id: string | null };
};
type Candidate = Pick<TwitchVideo, 'video_id' | 'title' | 'recorded_at' | 'twitch_thumbnail'> & {
  imported: boolean;
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : 'No se pudo completar la operación.';
function Feedback({ value, error = false }: { value: string; error?: boolean }) {
  return value ? (
    <p className={`admin-feedback ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {value}
    </p>
  ) : null;
}
function TournamentSelect({
  value,
  onChange,
  posts,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  posts: Post[];
}) {
  return (
    <label className="admin-field">
      Torneo relacionado (opcional)
      <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Sin relación</option>
        {posts
          .filter((p) => p.kind === 'tournament')
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
      </select>
    </label>
  );
}
function VideoEditor({
  video,
  posts,
  done,
  cancel,
}: {
  video: Candidate | TwitchVideo;
  posts: Post[];
  done: () => void;
  cancel: () => void;
}) {
  const existing = 'id' in video;
  const [form, setForm] = useState({
    video_id: video.video_id,
    title: video.title,
    recorded_at: video.recorded_at,
    custom_thumbnail: existing ? video.custom_thumbnail : '',
    tournament_id: existing ? video.tournament_id : null,
    status: existing ? video.status || 'draft' : 'draft',
  });
  const [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const r = await api<{ url: string }>('/admin/uploads', { method: 'POST', body });
      setForm((f) => ({ ...f, custom_thumbnail: r.url }));
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const saved = await api<TwitchVideo>(
        existing ? `/admin/transmissions/${video.id}` : '/admin/transmissions',
        { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(form) },
      );
      const read = await api<TwitchVideo[]>('/admin/transmissions');
      if (
        !read.some((v) => v.id === saved.id && v.title === saved.title && v.status === saved.status)
      )
        throw Error('No se pudo comprobar el guardado. Recarga antes de intentar otra vez.');
      if (saved.status === 'published') {
        const first = await api<{ videos: TwitchVideo[]; total: number }>('/tournaments');
        let found = first.videos.some((v) => v.id === saved.id);
        for (let offset = 6; !found && offset < first.total; offset += 6) {
          found = (
            await api<{ videos: TwitchVideo[] }>(`/tournaments?offset=${offset}`)
          ).videos.some((v) => v.id === saved.id);
        }
        if (!found)
          throw Error('La transmisión se guardó, pero no se pudo comprobar su publicación.');
      }
      done();
    } catch (e) {
      setNotice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card admin-card-body">
      <h2>{existing ? 'Editar transmisión' : 'Previsualizar e incorporar transmisión'}</h2>
      <Feedback value={notice} error />
      <form onSubmit={save}>
        <div className="admin-form-grid">
          <label className="admin-field">
            Título de la transmisión *
            <input
              required
              maxLength={180}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="admin-field">
            Estado de la transmisión
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
            >
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="withdrawn">Retirado</option>
            </select>
          </label>
          <TournamentSelect
            posts={posts}
            value={form.tournament_id}
            onChange={(v) => setForm({ ...form, tournament_id: v })}
          />
          <label className="admin-field">
            Miniatura personalizada (opcional)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <small>Prioridad: personalizada, Twitch, imagen de SERGOD STORE. Máximo 4 MB.</small>
          </label>
        </div>
        <p>
          VOD {form.video_id} · {date(form.recorded_at)}
        </p>
        {form.custom_thumbnail || video.twitch_thumbnail ? (
          <img
            className="admin-post-preview"
            src={form.custom_thumbnail || video.twitch_thumbnail}
            alt="Miniatura de la transmisión"
          />
        ) : (
          <p>Se mostrará la imagen de SERGOD STORE.</p>
        )}
        {form.custom_thumbnail && (
          <button
            type="button"
            className="admin-button secondary"
            onClick={() => setForm({ ...form, custom_thumbnail: '' })}
          >
            Usar miniatura de Twitch
          </button>
        )}
        <div className="admin-actions end">
          <button type="button" className="admin-button secondary" disabled={busy} onClick={cancel}>
            Cancelar
          </button>
          <button className="admin-button" disabled={busy}>
            {busy
              ? 'Guardando…'
              : form.status === 'published'
                ? 'Guardar y publicar transmisión'
                : 'Guardar transmisión'}
          </button>
        </div>
      </form>
    </section>
  );
}
export function TwitchIntegrations() {
  const [status, setStatus] = useState<Status | null>(null),
    [posts, setPosts] = useState<Post[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [reviewed, setReviewed] = useState(false),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<Candidate | null>(null),
    [live, setLive] = useState({ enabled: false, title: '', tournament_id: null as string | null });
  async function load() {
    setError('');
    try {
      const [r, p] = await Promise.all([
        api<Status>('/admin/integrations/twitch'),
        api<Post[]>('/admin/posts'),
      ]);
      setStatus(r);
      setLive(r.live);
      setPosts(p);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void load();
    const result = new URLSearchParams(window.location.search).get('twitch');
    if (result)
      setNotice(result === 'connected' ? 'Canal de Twitch conectado y comprobado.' : result);
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
  async function review(next?: string) {
    const r = await api<{ videos: Candidate[]; cursor: string | null }>(
      '/admin/integrations/twitch/review',
      { method: 'POST', body: JSON.stringify({ cursor: next }) },
    );
    setCandidates((old) =>
      next
        ? [...old, ...r.videos.filter((v) => !old.some((i) => i.video_id === v.video_id))]
        : r.videos,
    );
    setCursor(r.cursor);
    setReviewed(true);
    setNotice('Consulta completada. Selecciona una transmisión para revisar y guardar.');
  }
  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>Integraciones</h1>
          <p>Conecta servicios y elige el contenido que compartirá SERGOD STORE.</p>
        </div>
      </div>
      {error && (
        <div className="admin-feedback error" role="alert">
          {error}
          <button className="admin-button secondary" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      <Feedback value={notice} />
      {!status ? (
        <p role="status">Cargando Twitch…</p>
      ) : (
        <section className="admin-card admin-card-body">
          <h2>Twitch</h2>
          <p>Estado: {status.connected ? 'Conectado' : 'Desconectado'}</p>
          {status.channel && <p>Canal: {status.channel}</p>}
          {!status.configured && (
            <div className="admin-feedback" style={{ display: 'block', overflowWrap: 'anywhere' }}>
              <p>
                Para conectar, registra una aplicación confidencial en Twitch y configura
                TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET e INTEGRATIONS_ENCRYPTION_KEY en el servidor.
              </p>
              <p>
                URL de retorno:{' '}
                <code style={{ overflowWrap: 'anywhere' }}>{status.callback_url}</code>
              </p>
              <a
                href="https://dev.twitch.tv/console/apps"
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir aplicaciones de Twitch
              </a>
            </div>
          )}
          <div className="admin-actions">
            <button
              className="admin-button"
              disabled={busy || !status.configured}
              onClick={() =>
                void action(async () => {
                  const r = await api<{ url: string }>('/admin/integrations/twitch/connect', {
                    method: 'POST',
                    body: '{}',
                  });
                  window.location.assign(r.url);
                })
              }
            >
              Conectar Twitch
            </button>
            <button
              className="admin-button secondary"
              disabled={busy || !status.connected || !status.configured}
              onClick={() => void action(() => review())}
            >
              {busy ? 'Consultando…' : 'Revisar Twitch'}
            </button>
            <button
              className="admin-button secondary"
              disabled={busy || !status.connected}
              onClick={() => {
                if (
                  window.confirm(
                    '¿Desconectar Twitch? Se ocultará el bloque en vivo. Las transmisiones guardadas se conservan.',
                  )
                )
                  void action(async () => {
                    await api('/admin/integrations/twitch/disconnect', {
                      method: 'POST',
                      body: '{}',
                    });
                    setCandidates([]);
                    setReviewed(false);
                    await load();
                    setNotice('Twitch desconectado. El archivo guardado se conserva.');
                  });
              }}
            >
              Desconectar
            </button>
            <Link className="admin-button secondary" href="/admin/transmisiones">
              Transmisiones guardadas
            </Link>
          </div>
        </section>
      )}
      {status?.connected && (
        <section className="admin-card admin-card-body">
          <h2>Transmisión en vivo</h2>
          <p>
            Activa el bloque cuando el canal esté transmitiendo. Ocúltalo cuando termine o no
            quieras mostrarlo.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await api('/admin/integrations/twitch/live', {
                  method: 'PATCH',
                  body: JSON.stringify(live),
                });
                await load();
                setNotice(
                  live.enabled
                    ? 'Transmisión en vivo comprobada y visible.'
                    : 'Bloque en vivo oculto.',
                );
              });
            }}
          >
            <label className="admin-field">
              Título o contexto del directo
              <input
                maxLength={180}
                value={live.title}
                onChange={(e) => setLive({ ...live, title: e.target.value })}
              />
            </label>
            <TournamentSelect
              posts={posts}
              value={live.tournament_id}
              onChange={(v) => setLive({ ...live, tournament_id: v })}
            />
            <label className="admin-field">
              Mostrar transmisión en vivo
              <select
                value={live.enabled ? 'yes' : 'no'}
                onChange={(e) => setLive({ ...live, enabled: e.target.value === 'yes' })}
              >
                <option value="no">Oculta</option>
                <option value="yes">Visible</option>
              </select>
            </label>
            <button className="admin-button" disabled={busy}>
              Guardar directo
            </button>
          </form>
        </section>
      )}
      {selected && (
        <VideoEditor
          key={selected.video_id}
          video={selected}
          posts={posts}
          done={() => {
            const id = selected.video_id;
            setSelected(null);
            setCandidates((old) =>
              old.map((v) => (v.video_id === id ? { ...v, imported: true } : v)),
            );
            setNotice('Transmisión guardada y lectura comprobada.');
          }}
          cancel={() => setSelected(null)}
        />
      )}
      {reviewed && (
        <section className="admin-card admin-card-body">
          <h2>VOD encontrados</h2>
          {!candidates.length && (
            <p>
              No se encontraron VOD en el canal. Twitch puede retirar las transmisiones según su
              disponibilidad.
            </p>
          )}
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Transmisión</th>
                  <th>Fecha</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((v) => (
                  <tr key={v.video_id}>
                    <td>{v.title}</td>
                    <td>{date(v.recorded_at)}</td>
                    <td>
                      {v.imported ? (
                        'Ya incorporada'
                      ) : (
                        <button
                          className="admin-button secondary"
                          disabled={busy}
                          onClick={() => setSelected(v)}
                        >
                          Revisar {v.title}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursor && (
            <button
              className="admin-button secondary"
              disabled={busy}
              onClick={() => void action(() => review(cursor))}
            >
              Consultar más VOD
            </button>
          )}
        </section>
      )}
      <InstagramIntegration />
      <TorIntegration />
    </div>
  );
}
export function TwitchTransmissions() {
  const [videos, setVideos] = useState<TwitchVideo[]>([]),
    [posts, setPosts] = useState<Post[]>([]),
    [selected, setSelected] = useState<TwitchVideo | null>(null),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [v, p] = await Promise.all([
        api<TwitchVideo[]>('/admin/transmissions'),
        api<Post[]>('/admin/posts'),
      ]);
      setVideos(v);
      setPosts(p);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function remove(v: TwitchVideo) {
    if (
      !window.confirm(
        `¿Borrar “${v.title}” del archivo de SERGOD STORE? El video de Twitch se conserva.`,
      )
    )
      return;
    try {
      await api(`/admin/transmissions/${v.id}`, { method: 'DELETE' });
      setSelected(null);
      await load();
      setNotice('Transmisión eliminada del archivo.');
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>Transmisiones</h1>
          <p>Publica, edita o retira VOD del archivo de Torneos.</p>
        </div>
        <Link className="admin-button" href="/admin/integraciones">
          Revisar Twitch
        </Link>
      </div>
      <Feedback value={notice} />
      {error && (
        <p role="alert" className="admin-feedback error">
          {error}
        </p>
      )}
      {selected && (
        <VideoEditor
          key={selected.id}
          video={selected}
          posts={posts}
          cancel={() => setSelected(null)}
          done={() => {
            setSelected(null);
            void load();
            setNotice('Cambios guardados y lectura comprobada.');
          }}
        />
      )}
      {loading ? (
        <p role="status">Cargando transmisiones…</p>
      ) : (
        <section className="admin-card">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Transmisión</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={v.id}>
                    <td>{v.title}</td>
                    <td>{date(v.recorded_at)}</td>
                    <td>
                      {v.status === 'published'
                        ? 'Publicado'
                        : v.status === 'withdrawn'
                          ? 'Retirado'
                          : 'Borrador'}
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          className="admin-button secondary"
                          onClick={() => setSelected(v)}
                          aria-label={`Editar transmisión ${v.title}`}
                        >
                          Editar
                        </button>
                        <button
                          className="admin-button secondary"
                          onClick={() => void remove(v)}
                          aria-label={`Borrar transmisión ${v.title}`}
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
          {!videos.length && (
            <p className="admin-card-body">
              Todavía no hay transmisiones guardadas. Revisa Twitch para elegir las primeras.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
