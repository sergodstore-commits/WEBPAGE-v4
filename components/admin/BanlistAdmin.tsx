'use client';
import { useEffect, useState } from 'react';
import { api, date } from '@/lib/client';
import { banlistDay, type BanlistState } from '@/lib/banlist';

export function BanlistAdmin() {
  const [state, setState] = useState<BanlistState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    try {
      setState(await api('/admin/news/banlist'));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos cargar la banlist.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function refresh() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setState(await api('/admin/news/banlist', { method: 'POST' }));
      setNotice(
        'Lista verificada. Ya se puede consultar en Comunidad. Las consultas se reutilizan durante 5 minutos.',
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
        Actualiza la lista oficial de Konami en español. Solo guarda nombres, restricciones y
        fechas; no descarga imágenes ni utiliza IA.
      </p>
      {state && (
        <p>
          Lista vigente: <strong>{banlistDay(state.current.effective_on)}</strong> ·{' '}
          {state.current.cards.length} cartas · Última consulta: {date(state.checked_at)}.
        </p>
      )}
      {state?.upcoming && (
        <p>
          Próxima lista: {banlistDay(state.upcoming.effective_on)}. Se mostrará como vigente a
          partir de esa fecha.
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
          {busy ? 'Consultando Konami…' : 'Actualizar banlist TCG'}
        </button>
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
