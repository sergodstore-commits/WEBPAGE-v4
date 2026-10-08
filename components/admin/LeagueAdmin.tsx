'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import {
  boards,
  type LeaguePreview,
  type LeagueTournament,
  type TorCandidate,
  type RankingBoard,
} from '@/lib/rankings';

const message = (e: unknown) =>
  e instanceof Error ? e.message : 'No se pudo completar la operación.';
const day = (value: string) =>
  new Date(value + 'T15:00:00Z').toLocaleDateString('es-CL', { timeZone: 'America/Santiago' });
function RankingSelection({
  board,
  tournaments,
  disabled,
  reload,
}: {
  board: RankingBoard;
  tournaments: LeagueTournament[];
  disabled: boolean;
  reload: () => Promise<LeagueTournament[]>;
}) {
  const list = tournaments.filter((t) => t.board === board);
  const persisted = list
    .filter((t) => t.included_in_ranking)
    .map((t) => t.id)
    .sort()
    .join(',');
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    setSelected(persisted ? persisted.split(',') : []);
  }, [persisted]);
  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/admin/league/selection', {
        method: 'PATCH',
        body: JSON.stringify({ board, tournament_ids: selected }),
      });
      const saved = await reload();
      const actual = saved
        .filter((t) => t.board === board && t.included_in_ranking)
        .map((t) => t.id)
        .sort()
        .join(',');
      const ranking = await api<{ tournaments: { id: string }[] }>(`/rankings?board=${board}`);
      if (
        actual !== [...selected].sort().join(',') ||
        ranking.tournaments
          .map((t) => t.id)
          .sort()
          .join(',') !== actual
      )
        throw Error(
          'La selección se guardó, pero no se pudo comprobar el ranking. Recarga para revisar.',
        );
      setNotice(
        selected.length
          ? `Selección guardada: ${selected.length} ligas suman en este ranking. Lectura pública comprobada.`
          : 'Selección guardada: este ranking comienza de cero. Los resultados anteriores se conservan.',
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="admin-card admin-card-body" disabled={disabled || busy}>
      <legend>
        {boards[board].game} · {boards[board].name}
      </legend>
      <p>
        {selected.length} ligas seleccionadas. Solo suman puntos de {boards[board].name}.
      </p>
      {!list.length ? (
        <p>Todavía no hay ligas guardadas para este ranking.</p>
      ) : (
        <>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {list.map((t) => (
              <label
                key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={(e) => {
                    setSelected((ids) =>
                      e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id),
                    );
                    setNotice('');
                  }}
                />
                <span>
                  {t.title} · {day(t.played_on)}
                </span>
              </label>
            ))}
          </div>
          <div className="admin-actions">
            <button
              className="admin-button secondary"
              type="button"
              onClick={() => {
                setSelected([]);
                setNotice('');
              }}
            >
              Desmarcar todas
            </button>
            <button
              className="admin-button"
              type="button"
              disabled={[...selected].sort().join(',') === persisted}
              onClick={() => void save()}
            >
              {busy ? 'Guardando…' : 'Guardar selección'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="admin-feedback error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-feedback success">
          {notice}
        </p>
      )}
    </fieldset>
  );
}
export function TorIntegration() {
  const [store, setStore] = useState<number | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    api<{ store_id: number }>('/admin/integrations/tor')
      .then((r) => setStore(r.store_id))
      .catch((e) => setError(message(e)));
  }, []);
  return (
    <section className="admin-card admin-card-body">
      <h2>TOR MyL</h2>
      <p>Ligas públicas de SERGOD STORE · Store ID: {store ?? '…'}</p>
      <p>
        Primera Era y Primer Bloque se guardan por separado. Revisar no importa ni publica
        resultados automáticamente.
      </p>
      {error && (
        <p role="alert" className="admin-feedback error">
          {error}
        </p>
      )}
      <Link className="admin-button" href="/admin/liga?revisar=tor">
        Revisar TOR
      </Link>
    </section>
  );
}
export function LeagueAdmin() {
  const [saved, setSaved] = useState<LeagueTournament[]>([]),
    [candidates, setCandidates] = useState<TorCandidate[]>([]),
    [preview, setPreview] = useState<LeaguePreview | null>(null),
    [next, setNext] = useState<number | null>(null),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true);
  const [fileForm, setFileForm] = useState({
    title: '',
    played_on: '',
    event_id: '',
    text: '',
    position_points: '',
  });
  async function load() {
    const list = await api<LeagueTournament[]>('/admin/league');
    setSaved(list);
    return list;
  }
  useEffect(() => {
    if (preview) document.getElementById('league-preview')?.scrollIntoView({ block: 'start' });
  }, [preview?.id]);
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
  async function review(page = 1) {
    const result = await api<{ tournaments: TorCandidate[]; next_page: number | null }>(
      '/admin/league/tor/review',
      { method: 'POST', body: JSON.stringify({ page }) },
    );
    setCandidates((old) =>
      page === 1
        ? result.tournaments
        : [
            ...old,
            ...result.tournaments.filter((t) => !old.some((o) => o.external_id === t.external_id)),
          ],
    );
    setNext(result.next_page);
    setReviewed(true);
    setNotice('Consulta completada. Revisa un standing antes de agregarlo a la Liga.');
  }
  useEffect(() => {
    let alive = true;
    load()
      .catch((e) => {
        if (alive) setError(message(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    if (new URLSearchParams(window.location.search).get('revisar') === 'tor')
      void action(() => review());
    return () => {
      alive = false;
    };
  }, []);
  async function chooseTor(id: string) {
    const result = await api<LeaguePreview>('/admin/league/tor/preview', {
      method: 'POST',
      body: JSON.stringify({ tournament_id: Number(id) }),
    });
    setPreview(result);
  }
  async function readFile(file?: File) {
    if (!file) return;
    setError('');
    setPreview(null);
    if (file.size > 500000) {
      setError('El archivo debe pesar como máximo 500 KB.');
      return;
    }
    try {
      const text = await file.text();
      setFileForm((f) => ({ ...f, text }));
    } catch {
      setError('No se pudo leer el archivo. Intenta nuevamente.');
    }
  }
  async function stageFile(e: FormEvent) {
    e.preventDefault();
    void action(async () =>
      setPreview(
        await api<LeaguePreview>('/admin/league/file/preview', {
          method: 'POST',
          body: JSON.stringify(fileForm),
        }),
      ),
    );
  }
  async function commit() {
    if (!preview) return;
    const result = await api<LeagueTournament>('/admin/league/commit', {
      method: 'POST',
      body: JSON.stringify({ preview_id: preview.id, replace: preview.base_revision > 0 }),
    });
    const list = await load();
    if (
      !list.some(
        (t) =>
          t.id === result.id &&
          t.revision === result.revision &&
          t.players === preview.results.length,
      )
    )
      throw Error(
        'El torneo se guardó, pero no se pudo comprobar la lectura. Recarga antes de reintentar.',
      );
    const ranking = await api<{ tournaments: { id: string }[] }>(`/rankings?board=${result.board}`);
    if (result.included_in_ranking !== ranking.tournaments.some((t) => t.id === result.id))
      throw Error('El torneo se guardó, pero no se pudo comprobar su ranking público.');
    setPreview(null);
    setCandidates((old) =>
      old.map((t) =>
        t.external_id === result.external_id
          ? { ...t, imported: true, revision: result.revision }
          : t,
      ),
    );
    setNotice(
      !result.included_in_ranking
        ? `${result.revision > 1 ? 'Resultados reemplazados' : 'Resultados guardados'}. Marca esta liga en su ranking y guarda la selección para sumar sus puntos.`
        : result.revision > 1
          ? 'Resultados reemplazados y ranking recalculado. Lectura pública comprobada.'
          : 'Torneo agregado a la Liga. Guardado y lectura pública comprobados.',
    );
  }
  async function remove(t: LeagueTournament) {
    if (
      !window.confirm(
        `¿Eliminar “${t.title}” de la Liga? Sus puntos se retirarán del ranking. El torneo externo se conserva.`,
      )
    )
      return;
    void action(async () => {
      await api(`/admin/league/${t.id}`, { method: 'DELETE' });
      await load();
      setPreview(null);
      setCandidates((old) =>
        old.map((c) =>
          c.external_id === t.external_id ? { ...c, imported: false, revision: 0 } : c,
        ),
      );
      setNotice('Torneo eliminado. El ranking se recalculó sin sus resultados.');
    });
  }
  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>Liga SERGOD STORE</h1>
          <p>Revisa resultados finales y conserva los puntos por torneo.</p>
        </div>
        <Link href="/comunidad" className="admin-button secondary">
          Ver rankings públicos
        </Link>
      </div>
      {error && (
        <div className="admin-feedback error" role="alert">
          {error}
          <button
            className="admin-button secondary"
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await load();
              })
            }
          >
            Reintentar lectura
          </button>
        </div>
      )}
      {notice && (
        <p className="admin-feedback success" role="status">
          {notice}
        </p>
      )}
      <section className="admin-card admin-card-body">
        <h2>Mitos y Leyendas · TOR</h2>
        <p>
          Solo Ligas públicas terminadas o reportadas. Se usa el standing acumulado de la última
          ronda disponible, sin sumar rondas entre sí.
        </p>
        <button
          className="admin-button"
          disabled={busy}
          onClick={() => void action(() => review())}
        >
          {busy ? 'Consultando…' : 'Revisar TOR'}
        </button>
        {reviewed && (
          <>
            <h3>Torneos encontrados</h3>
            {!candidates.length && <p>No hay Ligas válidas en esta página.</p>}
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Torneo</th>
                    <th>Juego</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((t) => (
                    <tr key={t.external_id}>
                      <td>{t.title}</td>
                      <td>{boards[t.board].name}</td>
                      <td>{day(t.played_on)}</td>
                      <td>{t.imported ? 'Ya agregado' : t.status}</td>
                      <td>
                        <button
                          className="admin-button secondary"
                          disabled={busy}
                          aria-label={`${t.imported ? 'Actualizar resultados' : 'Revisar standing'} de ${t.title}`}
                          onClick={() => void action(() => chooseTor(t.external_id))}
                        >
                          {t.imported ? 'Actualizar resultados' : 'Ver standing final'}
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
                disabled={busy}
                onClick={() => void action(() => review(next))}
              >
                Consultar más torneos
              </button>
            )}
          </>
        )}
      </section>
      <section className="admin-card admin-card-body" id="yugioh-import">
        <h2>Yu-Gi-Oh! · Importar resultados</h2>
        <p>
          Ranking interno de SERGOD STORE. No se conecta una cuenta OTS ni se presenta como ranking
          oficial de Konami.
        </p>
        <p>
          Importa el CSV de resultados de Konami, un TSV o una tabla con Jugador y Puntos finales.
          Si el reporte solo trae posiciones, define abajo los puntos de cada puesto. Usa un ID de
          jugador consistente cuando esté disponible.{' '}
          <a href="/ranking-yugioh-ejemplo.csv" download className="admin-inline-link">
            Descargar encabezados de ejemplo
          </a>
        </p>
        <form onSubmit={stageFile}>
          <div className="admin-form-grid">
            <label className="admin-field">
              Nombre del torneo *
              <input
                required
                minLength={2}
                maxLength={180}
                value={fileForm.title}
                onChange={(e) => {
                  setPreview(null);
                  setFileForm({ ...fileForm, title: e.target.value });
                }}
              />
            </label>
            <label className="admin-field">
              Fecha del torneo *
              <input
                type="date"
                required
                value={fileForm.played_on}
                onChange={(e) => {
                  setPreview(null);
                  setFileForm({ ...fileForm, played_on: e.target.value });
                }}
              />
            </label>
            <label className="admin-field">
              Identificador del torneo (opcional)
              <input
                maxLength={120}
                value={fileForm.event_id}
                onChange={(e) => {
                  setPreview(null);
                  setFileForm({ ...fileForm, event_id: e.target.value });
                }}
              />
              <small>
                El CSV de Konami usa el ID incluido en el reporte. Para otros archivos, sin ID se
                genera uno con nombre y fecha. Para corregir usa el torneo guardado de abajo.
              </small>
            </label>
            <label className="admin-field">
              Archivo de resultados
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
            </label>
          </div>
          <label className="admin-field">
            Tabla de resultados *
            <textarea
              required
              rows={7}
              maxLength={500000}
              value={fileForm.text}
              placeholder={'Posicion\tJugador\tPuntos\tKonami ID\n'}
              onChange={(e) => {
                setPreview(null);
                setFileForm({ ...fileForm, text: e.target.value });
              }}
            />
          </label>
          <label className="admin-field">
            Puntos por posición (solo si el archivo no incluye puntos)
            <textarea
              rows={4}
              maxLength={50000}
              value={fileForm.position_points}
              placeholder={'1=10\n2=8\n3=6'}
              onChange={(e) => {
                setPreview(null);
                setFileForm({ ...fileForm, position_points: e.target.value });
              }}
            />
            <small>
              Define todos los puestos, uno por línea. Puedes asignar 0 puntos. Los valores del
              ejemplo no se aplican automáticamente.
            </small>
          </label>
          <button className="admin-button" disabled={busy}>
            Previsualizar resultados Yu-Gi-Oh!
          </button>
        </form>
      </section>
      {preview && (
        <section
          id="league-preview"
          className="admin-card admin-card-body"
          aria-labelledby="league-preview-heading"
        >
          <h2 id="league-preview-heading">Standing final · Vista previa</h2>
          <h3>{preview.title}</h3>
          <p>
            {boards[preview.board].game} · {boards[preview.board].name} · {day(preview.played_on)} ·{' '}
            {preview.results.length} jugadores
            {preview.final_round ? ` · Última ronda: ${preview.final_round}` : ''}
          </p>
          {preview.base_revision > 0 && (
            <p className="admin-feedback">
              Este torneo ya está guardado. Confirmar reemplazará sus resultados; no volverá a sumar
              los mismos puntos.
            </p>
          )}
          {preview.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <p>
            Esta vista previa vence en 15 minutos. Los ID de jugadores no se muestran en el ranking
            público.
          </p>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Posición</th>
                  <th>Jugador</th>
                  <th>Puntos finales</th>
                </tr>
              </thead>
              <tbody>
                {preview.results.map((r) => (
                  <tr key={r.player_key}>
                    <td>{r.position}</td>
                    <td>{r.name}</td>
                    <td>{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="admin-actions end">
            <button
              className="admin-button secondary"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              Descartar vista previa
            </button>
            <button className="admin-button" disabled={busy} onClick={() => void action(commit)}>
              {busy
                ? 'Guardando…'
                : preview.base_revision > 0
                  ? 'Confirmar actualización'
                  : 'Agregar a Liga'}
            </button>
          </div>
        </section>
      )}
      <section className="admin-card admin-card-body">
        <h2>Ligas que suman en el ranking</h2>
        <p>
          Marca las ligas del ciclo actual y guarda la selección de cada ranking. Para comenzar otro
          ciclo, desmarca las anteriores y marca las nuevas. Desmarcar conserva los resultados
          guardados.
        </p>
        {!loading &&
          (Object.keys(boards) as RankingBoard[]).map((board) => (
            <RankingSelection
              key={board}
              board={board}
              tournaments={saved}
              disabled={busy}
              reload={load}
            />
          ))}
      </section>
      <section className="admin-card admin-card-body">
        <h2>Torneos guardados</h2>
        {loading ? (
          <p role="status">Cargando torneos…</p>
        ) : !saved.length ? (
          <p>Todavía no hay torneos agregados. Revisa TOR o importa un reporte Yu-Gi-Oh!.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Torneo</th>
                  <th>Ranking</th>
                  <th>Fecha</th>
                  <th>Jugadores</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {saved.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.title}
                      <small> · Versión {t.revision}</small>
                    </td>
                    <td>
                      {boards[t.board].game} · {boards[t.board].name}
                    </td>
                    <td>{day(t.played_on)}</td>
                    <td>{t.players}</td>
                    <td>
                      <div className="admin-actions">
                        <button
                          className="admin-button secondary"
                          disabled={busy}
                          aria-label={`Actualizar resultados de ${t.title}`}
                          onClick={() => {
                            if (t.source === 'tor') void action(() => chooseTor(t.external_id));
                            else {
                              setPreview(null);
                              setFileForm({
                                title: t.title,
                                played_on: t.played_on,
                                event_id: t.external_id,
                                text: '',
                              position_points: '',
                              });
                              setNotice(
                                'Selecciona el archivo corregido de este torneo y previsualiza. Se reemplazarán los resultados al confirmar.',
                              );
                              document
                                .getElementById('yugioh-import')
                                ?.scrollIntoView({ block: 'start' });
                            }
                          }}
                        >
                          Actualizar resultados
                        </button>
                        <button
                          className="admin-button secondary"
                          disabled={busy}
                          aria-label={`Eliminar torneo ${t.title}`}
                          onClick={() => void remove(t)}
                        >
                          Eliminar
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
    </div>
  );
}
