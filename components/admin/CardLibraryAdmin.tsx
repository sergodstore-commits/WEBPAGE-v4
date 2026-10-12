'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { libraryFormats, type MylLibraryPanel } from '@/lib/myl-library';
import { EditionImportAdmin } from './EditionImportAdmin';
import { MylLibraryArticle } from '../store/community/MylLibraryArticle';

export function CardLibraryAdmin({ onBusyChange }: { onBusyChange?: (busy: boolean) => void }) {
  const [game, setGame] = useState('yugioh'),
    [visited, setVisited] = useState(['yugioh']),
    [busy, setBusy] = useState(false);
  const updateBusy = useCallback((value: boolean) => setBusy(value), []);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  return (
    <div>
      <div className="admin-actions" role="group" aria-label="Juego de las guías">
        {[
          ['yugioh', 'Yu-Gi-Oh! TCG'],
          ['myl', 'Mitos y Leyendas'],
        ].map(([id, label]) => (
          <button
            key={id}
            className="admin-button secondary"
            disabled={busy}
            aria-pressed={game === id}
            onClick={() => {
              setGame(id);
              setVisited((v) => (v.includes(id) ? v : [...v, id]));
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div hidden={game !== 'yugioh'}>
        {visited.includes('yugioh') && <EditionImportAdmin onBusyChange={updateBusy} />}
      </div>
      <div hidden={game !== 'myl'}>
        {visited.includes('myl') && <MylLibraryAdmin onBusyChange={updateBusy} />}
      </div>
    </div>
  );
}
function MylLibraryAdmin({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [panel, setPanel] = useState<MylLibraryPanel | null>(null),
    [code, setCode] = useState('myl-lpb4'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [preview, setPreview] = useState(false);
  const running = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    api<MylLibraryPanel>('/admin/news/myl-library')
      .then(setPanel)
      .catch((e) => setError(e.message));
    return () => {
      alive.current = false;
      running.current = false;
    };
  }, []);
  const item = panel?.items.find((i) => i.code === code);
  async function prepare(refresh: boolean) {
    running.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setPreview(false);
    try {
      let next = await api<MylLibraryPanel>(
        `/admin/news/myl-library/${code}/${refresh ? 'prepare' : 'batch'}`,
        { method: 'POST' },
      );
      if (alive.current) setPanel(next);
      while (running.current && alive.current) {
        const current = next.items.find((i) => i.code === code)!;
        if (current.total && current.ready === current.total) break;
        next = await api<MylLibraryPanel>(`/admin/news/myl-library/${code}/batch`, {
          method: 'POST',
        });
        if (alive.current) setPanel(next);
      }
      if (alive.current)
        setNotice(
          running.current
            ? 'Imágenes disponibles preparadas. Revisa la galería y publica.'
            : 'Preparación pausada. El avance está guardado.',
        );
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : 'No pudimos preparar la biblioteca.');
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function publish(value: boolean) {
    setBusy(true);
    setError('');
    try {
      const next = await api<MylLibraryPanel>(
        `/admin/news/myl-library/${code}/${value ? 'publish' : 'withdraw'}`,
        { method: 'POST' },
      );
      if (value) {
        const publicDoc = await api<{ cards: unknown[] }>(
          `/community/myl-library/${code}?verificar=${Date.now()}`,
        );
        if (!publicDoc.cards.length) throw Error('No pudimos comprobar la galería pública.');
      }
      setPanel(next);
      setNotice(
        value
          ? 'Galería publicada y lectura pública comprobada.'
          : 'Galería retirada de Comunidad. Las imágenes se conservan.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel" aria-labelledby="myl-library-admin-title">
      <h2 id="myl-library-admin-title">Biblioteca MyL · Cartas y productos</h2>
      <p>
        Actualiza la fuente oficial, revisa lo disponible y publica en Comunidad. La versión pública
        se conserva mientras se prepara una actualización.
      </p>
      {error && (
        <p className="admin-feedback error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-feedback success" role="status">
          {notice}
        </p>
      )}
      <label className="admin-field">
        <span>Producto o edición MyL</span>
        <select
          aria-label="Producto o edición MyL"
          value={code}
          disabled={busy}
          onChange={(e) => {
            setCode(e.target.value);
            setPreview(false);
            setNotice('');
            setError('');
          }}
        >
          {panel?.items.map((i) => (
            <option value={i.code} key={i.code}>
              {libraryFormats[i.board]} · {i.name}
            </option>
          ))}
        </select>
      </label>
      {item && (
        <>
          <p role="status">
            {item.ready} de {item.total} imágenes preparadas ·{' '}
            {item.published ? 'Publicado' : 'Sin publicar'}
          </p>
          <p className="admin-help">
            {item.expected} cartas anunciadas en la colección. La fuente puede mostrar una
            selección: se indica públicamente su cobertura. Las promociones de reserva se presentan
            aparte.
          </p>
          <div className="admin-actions">
            <button
              className="admin-button secondary"
              disabled={busy}
              onClick={() => void prepare(true)}
            >
              Actualizar contenido de MyL
            </button>
            {item.total > item.ready && (
              <button className="admin-button" disabled={busy} onClick={() => void prepare(false)}>
                Continuar preparación
              </button>
            )}
            {busy && running.current && (
              <button
                className="admin-button secondary"
                onClick={() => {
                  running.current = false;
                }}
              >
                Pausar preparación
              </button>
            )}
            <button
              className="admin-button secondary"
              disabled={busy || !item.total || item.ready !== item.total}
              onClick={() => setPreview((v) => !v)}
            >
              Vista previa de cartas MyL
            </button>
            <button
              className="admin-button"
              disabled={busy || !item.total || item.ready !== item.total}
              onClick={() => void publish(true)}
            >
              Publicar en Comunidad
            </button>
            {item.published && (
              <button
                className="admin-button secondary"
                disabled={busy}
                onClick={() => void publish(false)}
              >
                Retirar de Comunidad
              </button>
            )}
          </div>
          <p className="admin-help">
            Imágenes nuevas de la biblioteca: {((panel?.storage_bytes || 0) / 1_000_000).toFixed(1)}{' '}
            MB / {((panel?.storage_limit || 0) / 1_000_000).toFixed(0)} MB. Se reutilizan los
            archivos existentes. No se traduce MyL.
          </p>
          {preview && <MylLibraryArticle key={code} code={code} preview />}
        </>
      )}
    </section>
  );
}
