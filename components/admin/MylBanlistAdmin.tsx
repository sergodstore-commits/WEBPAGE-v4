'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { newsBoards } from '@/lib/web-news';
import { banlistDay } from '@/lib/banlist';
import type { MylBanlistPanel } from '@/lib/myl-banlist';
export function MylBanlistAdmin({
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [panel, setPanel] = useState<MylBanlistPanel | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const stop = useRef(false);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    api<MylBanlistPanel>('/admin/news/banlist/myl')
      .then(setPanel)
      .catch((e) => setError(e.message));
    return () => {
      stop.current = true;
    };
  }, []);
  async function refresh() {
    setBusy(true);
    setError('');
    setNotice('');
    stop.current = false;
    try {
      let next = panel?.preparing
        ? panel
        : await api<MylBanlistPanel>('/admin/news/banlist/myl', { method: 'POST' });
      setPanel(next);
      while (next.preparing && !stop.current) {
        const previous = next.ready;
        next = await api<MylBanlistPanel>('/admin/news/banlist/myl/images', { method: 'POST' });
        setPanel(next);
        if (next.preparing && next.ready <= previous)
          throw Error('La preparación no avanzó. El progreso se conserva.');
      }
      setNotice(
        stop.current
          ? 'Preparación pausada. Puedes reanudarla.'
          : 'Listas completas de MyL actualizadas en Noticias → Banlist.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos actualizar las listas MyL.');
      const latest = await api<MylBanlistPanel>('/admin/news/banlist/myl').catch(() => null);
      if (latest) setPanel(latest);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-card admin-card-body" aria-labelledby="myl-banlist-admin-heading">
      <h2 id="myl-banlist-admin-heading">Banlist Mitos y Leyendas</h2>
      <p>
        Primera Era y Primer Bloque · Racial Edición. Combina las tablas oficiales con los avisos
        posteriores de cambios y guarda sus imágenes en WebP. La última lista completa permanece
        visible durante la preparación.
      </p>
      {panel?.state &&
        (['myl-first-era', 'myl-first-block'] as const).map((board) => (
          <p key={board}>
            {newsBoards[board]}: {panel.state!.formats[board].cards.length} cartas · Vigencia:{' '}
            {panel.state!.formats[board].effective_on
              ? banlistDay(panel.state!.formats[board].effective_on!)
              : 'por confirmar'}
          </p>
        ))}
      {panel && (
        <p role="status">
          Imágenes: {panel.ready} de {panel.total} · {(panel.storage_bytes / 1000000).toFixed(1)} de
          15 MB compartidos con Noticias.
        </p>
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
      <div className="admin-actions">
        <button className="admin-button" disabled={busy || disabled} onClick={() => void refresh()}>
          {busy
            ? 'Preparando listas MyL…'
            : panel?.preparing
              ? 'Reanudar banlist MyL'
              : 'Actualizar banlist MyL'}
        </button>
        {busy && (
          <button
            className="admin-button secondary"
            onClick={() => {
              stop.current = true;
            }}
          >
            Pausar preparación
          </button>
        )}
        <a
          href="/noticias?seccion=myl-first-era&categoria=banlist"
          className="admin-button secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver en Noticias ↗
        </a>
      </div>
    </section>
  );
}
