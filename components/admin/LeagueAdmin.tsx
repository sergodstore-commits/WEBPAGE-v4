'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import styles from './LeagueAdmin.module.css';
import { obtainKonamiReport } from '@/lib/konami-connector';
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
  archive,
}: {
  board: RankingBoard;
  tournaments: LeagueTournament[];
  disabled: boolean;
  reload: () => Promise<LeagueTournament[]>;
  archive: (t: LeagueTournament, archived: boolean) => Promise<void>;
}) {
  const list = tournaments.filter((t) => t.board === board && !t.archived);
  const persisted = list
    .filter((t) => t.included_in_ranking)
    .map((t) => t.id)
    .sort()
    .join(',');
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const changed = [...selected].sort().join(',') !== persisted;
  const visible = list.filter((t) =>
    `${t.title} ${day(t.played_on)}`
      .toLocaleLowerCase('es')
      .includes(search.trim().toLocaleLowerCase('es')),
  );
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
    <fieldset className={styles.selection} disabled={disabled || busy}>
      <legend>
        {boards[board].game} · {boards[board].name}
      </legend>
      <div className={styles.selectionStatus}>
        <strong>
          {selected.length} de {list.length} torneos seleccionados
        </strong>
        <span>{changed ? 'Cambios sin guardar' : 'Selección guardada'}</span>
        <Link href={`/comunidad?ranking=${board}`} className="admin-inline-link">
          Ver ranking
        </Link>
      </div>
      {!list.length ? (
        <p>Todavía no hay ligas guardadas para este ranking.</p>
      ) : (
        <>
          <label className="admin-field">
            Buscar torneo en {boards[board].name}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o fecha"
            />
          </label>
          <div className={styles.choices}>
            {visible.map((t) => (
              <div key={t.id} className={styles.choice} data-selected={selected.includes(t.id)}>
                <label className={styles.choiceLabel}>
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
                    <strong>{t.title}</strong>
                    <small>
                      {day(t.played_on)} · {t.players} jugadores
                    </small>
                  </span>
                </label>
                <button
                  type="button"
                  className="admin-button secondary"
                  disabled={changed}
                  aria-label={`Archivar torneo ${t.title}`}
                  onClick={() => void archive(t, true)}
                >
                  Archivar
                </button>
              </div>
            ))}
          </div>
          {!visible.length && <p>No hay torneos que coincidan con la búsqueda.</p>}
          <div className="admin-actions">
            <button
              className="admin-button secondary"
              type="button"
              disabled={!visible.length}
              onClick={() => {
                setSelected((ids) => [...new Set([...ids, ...visible.map((t) => t.id)])]);
                setNotice('');
              }}
            >
              Marcar visibles
            </button>
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
              disabled={!changed}
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
        Primera Era y Primer Bloque se guardan por separado. Actualizar agrega los torneos nuevos a
        la lista; tú eliges cuáles suman al ranking.
      </p>
      {error && (
        <p role="alert" className="admin-feedback error">
          {error}
        </p>
      )}
      <Link className="admin-button" href="/admin/liga?revisar=tor">
        Actualizar torneos de MyL
      </Link>
    </section>
  );
}
export function LeagueAdmin() {
  const [saved, setSaved] = useState<LeagueTournament[]>([]),
    [preview, setPreview] = useState<LeaguePreview | null>(null),
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
  const [manualOpen, setManualOpen] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false);
  const [progress, setProgress] = useState(''),
    [collectionErrors, setCollectionErrors] = useState<string[]>([]);
  type Collected = {
    external_id: string;
    state: 'added' | 'existing' | 'archived' | 'error';
    error?: string;
  };
  async function collect(input: unknown) {
    return (
      await api<{ results: Collected[] }>('/admin/league/collect', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    ).results;
  }
  function collectionNotice(results: Collected[]) {
    setCollectionErrors(
      results
        .filter((r) => r.state === 'error')
        .map((r) => `${r.external_id || 'Reporte'}: ${r.error}`),
    );
    setNotice(
      `Consulta terminada: ${results.filter((r) => r.state === 'added').length} torneos nuevos, ${results.filter((r) => r.state === 'existing').length} ya guardados y ${results.filter((r) => r.state === 'archived').length} archivados. Marca los que suman y guarda la selección.${results.some((r) => r.state === 'error') ? ' Hay torneos pendientes; puedes reintentar sin duplicar.' : ''}`,
    );
  }
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
    setCollectionErrors([]);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setProgress('');
      setBusy(false);
    }
  }
  async function review(page = 1) {
    const collected: Collected[] = [],
      seen = new Set<string>(),
      pages = new Set<number>();
    try {
      for (;;) {
        if (pages.has(page) || pages.size >= 1000)
          throw Error('TOR repitió una página. Vuelve a intentar la consulta.');
        pages.add(page);
        setProgress(`Consultando MyL · página ${page} · ${collected.length} torneos procesados…`);
        const result = await api<{ tournaments: TorCandidate[]; next_page: number | null }>(
          '/admin/league/tor/review',
          { method: 'POST', body: JSON.stringify({ page }) },
        );
        const ids = result.tournaments
          .filter((t) => !seen.has(t.external_id))
          .map((t) => {
            seen.add(t.external_id);
            return Number(t.external_id);
          });
        for (let i = 0; i < ids.length; i++) {
          setProgress(`Guardando MyL · ${collected.length} torneos procesados…`);
          collected.push(...(await collect({ source: 'tor', ids: [ids[i]] })));
        }
        if (!result.next_page) break;
        page = result.next_page;
      }
      await load();
      collectionNotice(collected);
    } catch (e) {
      await load();
      throw Error(
        `${collected.filter((r) => r.state === 'added').length} torneos nuevos guardados. ${message(e)} Puedes reintentar sin duplicarlos.`,
      );
    }
  }
  useEffect(() => {
    let alive = true;
    load()
      .then(() => {
        if (!alive) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get('obtenerKonami') === '1') {
          url.searchParams.delete('obtenerKonami');
          window.history.replaceState(window.history.state, '', url);
          void obtainKonami();
        }
      })
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
      if (text.trimStart().startsWith('<')) {
        setBusy(true);
        const result = await api<LeaguePreview>('/admin/league/file/preview', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
        setFileForm({
          text,
          title: result.title,
          played_on: result.played_on,
          event_id: result.external_id,
          position_points: '',
        });
        setPreview(result);
        return;
      }
      setFileForm((f) => ({ ...f, text }));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function obtainKonami() {
    // Chromium reports the original document URL to external extensions after SPA navigation.
    const loaded = performance.getEntriesByType('navigation')[0]?.name;
    if (loaded && new URL(loaded).pathname !== '/admin/liga') {
      const url = new URL(window.location.href);
      url.searchParams.set('obtenerKonami', '1');
      window.location.assign(url.href);
      return;
    }
    await action(async () => {
      setPreview(null);
      setProgress('Buscando torneos finalizados en Konami…');
      const batch = await obtainKonamiReport();
      const results: Collected[] = [];
      try {
        for (const report of batch.reports) {
          setProgress(`Guardando Yu-Gi-Oh! · ${results.length + 1} de ${batch.reports.length}…`);
          results.push(...(await collect({ source: 'file', reports: [report] })));
        }
        await load();
        collectionNotice(results);
        setCollectionErrors((old) => [...old, ...batch.errors]);
      } catch (e) {
        await load();
        throw Error(
          `${results.filter((r) => r.state === 'added').length} torneos guardados. ${message(e)} Puedes reintentar sin duplicarlos.`,
        );
      }
    });
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
    setNotice(
      !result.included_in_ranking
        ? `${result.revision > 1 ? 'Resultados reemplazados' : 'Resultados guardados'}. Marca esta liga en su ranking y guarda la selección para sumar sus puntos.`
        : result.revision > 1
          ? 'Resultados reemplazados y ranking recalculado. Lectura pública comprobada.'
          : 'Torneo agregado a la Liga. Guardado y lectura pública comprobados.',
    );
  }
  async function archive(t: LeagueTournament, archived: boolean) {
    await action(async () => {
      await api(`/admin/league/${t.id}`, { method: 'PATCH', body: JSON.stringify({ archived }) });
      const stored = await load();
      if (stored.find((s) => s.id === t.id)?.archived !== archived)
        throw Error('No se pudo comprobar el archivo del torneo. Recarga la lista.');
      const ranking = await api<{ tournaments: { id: string }[] }>(`/rankings?board=${t.board}`);
      if (archived && ranking.tournaments.some((r) => r.id === t.id))
        throw Error('No se pudo comprobar que el torneo dejó de sumar.');
      setNotice(
        archived
          ? 'Torneo archivado. Sus resultados se conservan y deja de sumar.'
          : 'Torneo restaurado. Márcalo y guarda la selección si quieres sumar sus puntos.',
      );
    });
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
      {progress && (
        <p role="status" className="admin-feedback">
          {progress}
        </p>
      )}
      {collectionErrors.length > 0 && (
        <div role="alert" className="admin-feedback error">
          <strong>Torneos pendientes</strong>
          <ul>
            {collectionErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
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
      <div className={styles.sources}>
        <section className="admin-card admin-card-body" id="yugioh-import">
          <h2>Yu-Gi-Oh! · Konami</h2>
          <p>
            Mantén Konami abierto y conectado en Brave. El botón busca todos los torneos finalizados
            y guarda los nuevos en la lista.
          </p>
          <button className="admin-button" disabled={busy} onClick={() => void obtainKonami()}>
            {busy ? 'Procesando…' : 'Obtener resultados de Konami'}
          </button>
          <details>
            <summary>Conectar el navegador una sola vez</summary>
            <p>
              Descarga y descomprime el complemento. En brave://extensions, chrome://extensions o
              edge://extensions, activa «Modo de desarrollador», pulsa «Cargar descomprimida» y
              selecciona su carpeta. Después recarga la tienda y Konami. El navegador integrado de
              Codex no admite este complemento.
            </p>
            <p>
              Solo consulta resultados de Konami cuando pulsas el botón y los entrega a este panel.
              No guarda contraseñas. Agrega resultados a la lista sin sumarlos al ranking hasta que
              los selecciones.
            </p>
            <a href="/downloads/sergod-konami-connector.zip" download className="admin-inline-link">
              Descargar complemento de SERGOD STORE
            </a>
          </details>
        </section>
        <section className="admin-card admin-card-body">
          <h2>Mitos y Leyendas · TOR</h2>
          <p>Consulta los torneos finalizados de Primera Era y Primer Bloque.</p>
          <button
            className="admin-button"
            disabled={busy}
            onClick={() => void action(() => review())}
          >
            {busy ? 'Consultando…' : 'Actualizar torneos de MyL'}
          </button>
        </section>
      </div>
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
        <h2>Todos los torneos · Elegir cuáles suman</h2>
        <p>
          Marca los torneos del ciclo actual y guarda cada selección. Desmarcar conserva sus
          resultados; archivar los quita de esta lista hasta que decidas restaurarlos.
        </p>
        <div className={styles.selections}>
          {!loading &&
            (['yugioh', 'myl-first-era', 'myl-first-block'] as RankingBoard[]).map((board) => (
              <RankingSelection
                key={board}
                board={board}
                tournaments={saved}
                disabled={busy}
                reload={load}
                archive={archive}
              />
            ))}
        </div>
      </section>
      <details className={`admin-card admin-card-body ${styles.fold}`}>
        <summary>Archivados · {saved.filter((t) => t.archived).length}</summary>
        {saved
          .filter((t) => t.archived)
          .map((t) => (
            <div key={t.id} className={styles.choice}>
              <span>
                <strong>{t.title}</strong>
                <small>
                  {boards[t.board].name} · {day(t.played_on)}
                </small>
              </span>
              <button
                className="admin-button secondary"
                disabled={busy}
                aria-label={`Restaurar torneo ${t.title}`}
                onClick={() => void archive(t, false)}
              >
                Restaurar
              </button>
            </div>
          ))}
        <p>Los torneos archivados no se suman ni vuelven a la lista al actualizar.</p>
      </details>
      <details
        className={`admin-card admin-card-body ${styles.fold}`}
        open={manualOpen}
        onToggle={(e) => setManualOpen(e.currentTarget.open)}
        id="league-manual"
      >
        <summary>Cargar archivo o pegar resultados Yu-Gi-Oh!</summary>
        <p>
          Alternativa al botón de Konami. El archivo KTS completa fecha, nombre y victorias. También
          puedes cargar CSV/TSV o pegar una tabla.
        </p>
        <details>
          <summary>Formatos y puntos</summary>
          <p>
            Cada victoria suma 3 puntos; derrotas y dobles derrotas suman 0. Si el archivo solo
            contiene puestos, define sus puntos abajo. Un torneo ya guardado se actualiza sin
            duplicarlo.
          </p>
          <a href="/ranking-yugioh-ejemplo.csv" download className="admin-inline-link">
            Descargar encabezados de ejemplo
          </a>
        </details>
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
                disabled={busy}
                accept=".Tournament,.tournament,.xml,.csv,.tsv,.txt,text/xml,application/xml,text/csv,text/tab-separated-values,text/plain"
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
            </label>
          </div>
          {!fileForm.text.trimStart().startsWith('<') && (
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
          )}
          {!fileForm.text.trimStart().startsWith('<') && (
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
                Deja vacío si la tabla incluye Puntos o Victoria. Define todos los puestos, uno por
                línea. Puedes asignar 0 puntos. Los valores del ejemplo no se aplican
                automáticamente.
              </small>
            </label>
          )}
          <button className="admin-button" disabled={busy}>
            Previsualizar resultados Yu-Gi-Oh!
          </button>
        </form>
      </details>
      <details
        className={`admin-card admin-card-body ${styles.fold}`}
        open={historyOpen}
        onToggle={(e) => setHistoryOpen(e.currentTarget.open)}
      >
        <summary>Torneos guardados · {saved.length}</summary>
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
                              setManualOpen(true);
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
                                .getElementById('league-manual')
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
      </details>
    </div>
  );
}
