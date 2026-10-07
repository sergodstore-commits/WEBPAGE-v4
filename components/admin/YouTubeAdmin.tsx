'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, date } from '@/lib/client';
import type { Post, YouTubeVideo } from '@/lib/types';
import { TorIntegration } from './LeagueAdmin';
import { InstagramIntegration } from './InstagramAdmin';

type Candidate = Pick<YouTubeVideo, 'video_id' | 'title' | 'recorded_at' | 'youtube_thumbnail'>;
type Live = {
  enabled: boolean;
  video_id: string;
  title: string;
  stage: 'scheduled' | 'live';
  tournament_id: string | null;
  channel_url: string;
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
  video: Candidate | YouTubeVideo;
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
      const saved = await api<YouTubeVideo>(
        existing ? `/admin/youtube/transmissions/${video.id}` : '/admin/youtube/transmissions',
        { method: existing ? 'PATCH' : 'POST', body: JSON.stringify(form) },
      );
      const read = await api<YouTubeVideo[]>('/admin/youtube/transmissions');
      if (
        !read.some((v) => v.id === saved.id && v.title === saved.title && v.status === saved.status)
      )
        throw Error('No se pudo comprobar el guardado. Recarga antes de intentar otra vez.');
      if (saved.status === 'published') {
        const first = await api<{ videos: YouTubeVideo[]; total: number }>('/tournaments');
        let found = first.videos.some((v) => v.id === saved.id);
        for (let offset = 6; !found && offset < first.total; offset += 6) {
          found = (
            await api<{ videos: YouTubeVideo[] }>(`/tournaments?offset=${offset}`)
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
            <small>Prioridad: personalizada, YouTube, imagen de SERGOD STORE. Máximo 4 MB.</small>
          </label>
        </div>
        <label className="admin-field">
          Fecha de la transmisión *
          <input
            type="datetime-local"
            required
            value={new Date(
              Date.parse(form.recorded_at) - new Date(form.recorded_at).getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16)}
            onChange={(e) => {
              if (e.target.value)
                setForm({ ...form, recorded_at: new Date(e.target.value).toISOString() });
            }}
          />
        </label>
        <p>
          Video {form.video_id} · {date(form.recorded_at)}
        </p>
        <a
          href={`https://www.youtube.com/watch?v=${form.video_id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver video en YouTube
        </a>
        {form.custom_thumbnail || video.youtube_thumbnail ? (
          <img
            className="admin-post-preview"
            src={form.custom_thumbnail || video.youtube_thumbnail}
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
            Usar miniatura de YouTube
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
export function YouTubeIntegrations() {
  const [live, setLive] = useState<Live | null>(null),
    [posts, setPosts] = useState<Post[]>([]),
    [url, setUrl] = useState(''),
    [selected, setSelected] = useState<Candidate | null>(null),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [s, p] = await Promise.all([
        api<Live>('/admin/integrations/youtube'),
        api<Post[]>('/admin/posts'),
      ]);
      setLive(s);
      setPosts(p);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void load();
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
  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>Integraciones</h1>
          <p>Elige el contenido que compartirá SERGOD STORE.</p>
        </div>
      </div>
      <Feedback value={error} error />
      <Feedback value={notice} />
      {!live ? (
        <p role="status">Cargando YouTube…</p>
      ) : (
        <>
          <section className="admin-card admin-card-body">
            <h2>YouTube</h2>
            <p>Canal: @SergodStore</p>
            <p>
              Guarda el enlace de un directo o video del canal. La web no necesita claves ni acceso
              privado a tu cuenta de Google.
            </p>
            <div className="admin-actions">
              <a
                className="admin-button secondary"
                href={live.channel_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir canal de YouTube
              </a>
              <a
                className="admin-button secondary"
                href="https://studio.youtube.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir YouTube Studio
              </a>
              <Link className="admin-button secondary" href="/admin/transmisiones">
                Transmisiones guardadas
              </Link>
            </div>
          </section>
          <section className="admin-card admin-card-body">
            <h2>Transmisión en vivo</h2>
            <p>
              Crea el directo en YouTube Studio y pega aquí su enlace. Marca «En vivo» cuando
              comience y finalízalo al terminar.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const saved = await api<Live>('/admin/integrations/youtube/live', {
                    method: 'PATCH',
                    body: JSON.stringify(live),
                  });
                  const read = await api<Live>('/admin/integrations/youtube');
                  const publicMedia = await api<{ live: Live | null }>('/tournaments');
                  if (
                    read.video_id !== saved.video_id ||
                    read.enabled !== saved.enabled ||
                    (saved.enabled && publicMedia.live?.video_id !== saved.video_id) ||
                    (!saved.enabled && publicMedia.live)
                  )
                    throw Error(
                      'No se pudo comprobar la publicación. Recarga antes de volver a guardar.',
                    );
                  setLive(read);
                  setNotice(
                    saved.enabled
                      ? 'Directo guardado y visible en Torneos.'
                      : 'Directo guardado y oculto.',
                  );
                });
              }}
            >
              <label className="admin-field">
                Enlace del directo de YouTube
                <input
                  value={live.video_id}
                  maxLength={1000}
                  placeholder="https://www.youtube.com/live/…"
                  onChange={(e) => setLive({ ...live, video_id: e.target.value })}
                />
              </label>
              <label className="admin-field">
                Título o contexto del directo
                <input
                  value={live.title}
                  maxLength={180}
                  onChange={(e) => setLive({ ...live, title: e.target.value })}
                />
              </label>
              <TournamentSelect
                posts={posts}
                value={live.tournament_id}
                onChange={(v) => setLive({ ...live, tournament_id: v })}
              />
              <div className="admin-form-grid">
                <label className="admin-field">
                  Estado del directo
                  <select
                    value={live.stage}
                    onChange={(e) => setLive({ ...live, stage: e.target.value as Live['stage'] })}
                  >
                    <option value="scheduled">Programado</option>
                    <option value="live">En vivo</option>
                  </select>
                </label>
                <label className="admin-field">
                  Mostrar directo en Torneos
                  <select
                    value={live.enabled ? 'yes' : 'no'}
                    onChange={(e) => setLive({ ...live, enabled: e.target.value === 'yes' })}
                  >
                    <option value="no">Oculto</option>
                    <option value="yes">Visible</option>
                  </select>
                </label>
              </div>
              <div className="admin-actions">
                <button className="admin-button" disabled={busy}>
                  Guardar directo
                </button>
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={busy || !live.video_id}
                  onClick={() =>
                    void action(async () => {
                      await api('/admin/integrations/youtube/finish', {
                        method: 'POST',
                        body: JSON.stringify({ recorded_at: new Date().toISOString() }),
                      });
                      const current = await api<Live>('/admin/integrations/youtube');
                      const first = await api<{ videos: YouTubeVideo[]; total: number }>(
                        '/tournaments',
                      );
                      let found = first.videos.some((v) => v.video_id === live.video_id);
                      for (let offset = 6; !found && offset < first.total; offset += 6) {
                        const page = await api<{ videos: YouTubeVideo[] }>(
                          `/tournaments?offset=${offset}`,
                        );
                        found = page.videos.some((v) => v.video_id === live.video_id);
                      }
                      if (current.enabled || !found)
                        throw Error(
                          'No se pudo comprobar el archivo publicado. Recarga antes de intentarlo otra vez.',
                        );
                      await load();
                      setNotice(
                        'Directo oculto y grabación publicada en Transmisiones anteriores.',
                      );
                    })
                  }
                >
                  Finalizar y guardar en archivo
                </button>
              </div>
            </form>
          </section>
          <section className="admin-card admin-card-body">
            <h2>Incorporar grabación de YouTube</h2>
            <p>Pega el enlace para revisar el título y la miniatura antes de publicar.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const r = await api<Omit<Candidate, 'recorded_at'>>(
                    '/admin/integrations/youtube/review',
                    { method: 'POST', body: JSON.stringify({ url }) },
                  );
                  setSelected({ ...r, recorded_at: new Date().toISOString() });
                });
              }}
            >
              <label className="admin-field">
                Enlace del video de YouTube
                <input
                  value={url}
                  required
                  maxLength={1000}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <button className="admin-button" disabled={busy}>
                Revisar video
              </button>
            </form>
          </section>
        </>
      )}
      {selected && (
        <VideoEditor
          key={selected.video_id}
          video={selected}
          posts={posts}
          cancel={() => setSelected(null)}
          done={() => {
            setSelected(null);
            setUrl('');
            setNotice('Transmisión guardada y lectura comprobada.');
          }}
        />
      )}
      <InstagramIntegration />
      <TorIntegration />
    </div>
  );
}
export function YouTubeTransmissions() {
  const [videos, setVideos] = useState<YouTubeVideo[]>([]),
    [posts, setPosts] = useState<Post[]>([]),
    [selected, setSelected] = useState<YouTubeVideo | null>(null),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const [v, p] = await Promise.all([
        api<YouTubeVideo[]>('/admin/youtube/transmissions'),
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
  async function remove(v: YouTubeVideo) {
    if (
      !window.confirm(
        `¿Borrar “${v.title}” del archivo de la web? El video de YouTube se conserva.`,
      )
    )
      return;
    try {
      await api(`/admin/youtube/transmissions/${v.id}`, { method: 'DELETE' });
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
          <p>Publica, edita o retira grabaciones de YouTube del archivo de Torneos.</p>
        </div>
        <Link className="admin-button" href="/admin/integraciones">
          Incorporar video de YouTube
        </Link>
      </div>
      <Feedback value={notice} />
      <Feedback value={error} error />
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
              Todavía no hay grabaciones guardadas. Incorpora un video de YouTube desde
              Integraciones.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
