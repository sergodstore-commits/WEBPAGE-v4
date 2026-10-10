'use client';
import { useEffect, useRef, useState } from 'react';
import { api, date } from '@/lib/client';
import { banlistDay, type BanlistPanel } from '@/lib/banlist';

export function BanlistAdmin() {
  const [panel, setPanel] = useState<BanlistPanel | null>(null);
  const state = panel?.state;
  const stopped = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    try {
      setPanel(await api('/admin/news/banlist'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar la banlist.');
    }
  }
  useEffect(() => {
    void load();
    return () => {
      stopped.current = true;
    };
  }, []);
  async function refresh() {
    setBusy(true);
    setError('');
    setNotice('');
    stopped.current = false;
    try {
      let next = await api<BanlistPanel>('/admin/news/banlist', { method: 'POST' });
      setPanel(next);
      while (!stopped.current && next.ready < next.total) {
        setNotice(
          `Preparando cartas: ${next.ready} de ${next.total}. Puedes pausar y reanudar después.`,
        );
        const previous = next.ready;
        next = await api<BanlistPanel>('/admin/news/banlist/cards', { method: 'POST' });
        setPanel(next);
        if (next.ready <= previous && next.ready < next.total)
          throw Error('La preparación no avanzó. El progreso se conserva; vuelve a intentar.');
      }
      setNotice(
        stopped.current
          ? 'Preparación pausada. El avance se conserva.'
          : 'Lista verificada. Galería completa disponible en Comunidad.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la lista.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card admin-card-body" aria-labelledby="banlist-admin-heading">
      <h2 id="banlist-admin-heading">Banlist Yu-Gi-Oh! TCG</h2>
      <p>
        Consulta la lista y los efectos oficiales de Konami en español. Prepara imágenes WebP y
        reutiliza las cartas de las guías. No utiliza IA.
      </p>
      {state && (
        <p>
          Lista vigente: <strong>{banlistDay(state.current.effective_on)}</strong> ·{' '}
          {state.current.total} cartas · Última consulta: {date(state.checked_at)}.
        </p>
      )}
      {state?.upcoming && (
        <p>
          Próxima lista: {banlistDay(state.upcoming.effective_on)}. Se mostrará como vigente a
          partir de esa fecha.
        </p>
      )}
      {panel && (
        <p role="status">
          Galería: {panel.ready} de {panel.total} cartas listas · Almacenamiento compartido:{' '}
          {(panel.storage_bytes / 1_000_000).toFixed(1)} de {panel.storage_limit / 1_000_000} MB.
        </p>
      )}
      {error && (
        <p className="admin-feedback error" role="alert">
          {error}{' '}
          <button className="admin-button secondary" onClick={() => void load()}>
            Reintentar carga
          </button>
        </p>
      )}
      {notice && (
        <p className="admin-feedback success" role="status">
          {notice}
        </p>
      )}
      <div className="admin-actions">
        <button className="admin-button" disabled={busy} onClick={() => void refresh()}>
          {busy ? 'Preparando galería…' : 'Actualizar banlist TCG'}
        </button>
        {busy && (
          <button
            className="admin-button secondary"
            onClick={() => {
              stopped.current = true;
            }}
          >
            Pausar después de esta carta
          </button>
        )}
        <a
          className="admin-button secondary"
          href="/comunidad?ranking=yugioh"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver en Comunidad ↗
        </a>
      </div>
    </section>
  );
}
