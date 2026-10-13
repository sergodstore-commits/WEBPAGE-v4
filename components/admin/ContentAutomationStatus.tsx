'use client';
import { useRemote } from '../store/shared';
import { useState } from 'react';
import { api, date } from '@/lib/client';
import styles from './NewsWorkspace.module.css';

type Status = {
  schedule: string;
  limit: number;
  pending: number;
  preserved: number;
  retry_available: boolean;
  boards: { board: string; label: string; published: number; pending: number }[];
  pending_jobs: {
    id: string;
    title: string;
    images_ready: number;
    images_total: number;
    translation_pending: number;
    error: string | null;
  }[];
  last: null | {
    started_at: string;
    finished_at: string | null;
    status: string;
    summary: { published?: number; retired?: number; errors?: string[] };
  };
};
export function ContentAutomationStatus({
  onBusyChange,
  onComplete,
}: { onBusyChange?: (busy: boolean) => void; onComplete?: () => Promise<void> } = {}) {
  const { data, error, reload } = useRemote<Status>('/admin/news/automation');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function retry() {
    setBusy(true);
    onBusyChange?.(true);
    setNotice('');
    try {
      const result = await api<{ skipped: boolean; published?: number }>(
        '/admin/news/automation/retry',
        { method: 'POST', body: '{}' },
      );
      setNotice(
        result.skipped
          ? 'Ya hay una ejecución en curso o el día se completó.'
          : `Actualización terminada: ${result.published || 0} noticias publicadas. El avance pendiente se conserva.`,
      );
      await onComplete?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se completó la actualización.');
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      reload();
    }
  }
  if (error) return <p role="status">No se pudo consultar el estado de la actualización diaria.</p>;
  if (!data) return <p role="status">Consultando actualización diaria…</p>;
  return (
    <div className={styles.workflow} aria-label="Actualización automática de noticias">
      <strong>Actualización diaria automática</strong>
      <p>
        {data.schedule}. Máximo {data.limit} noticias de Yu-Gi-Oh! y {data.limit} de MyL en total.
      </p>
      <p>
        {data.last
          ? `Última revisión: ${date(data.last.finished_at || data.last.started_at)} · ${data.last.status === 'running' ? 'En curso' : `${data.last.summary.published || 0} publicadas`}`
          : 'Programada; esperando la primera revisión.'}
        {data.pending > 0 && ` · ${data.pending} pendientes para continuar automáticamente.`}
      </p>
      <small>Las cartas y sus galerías se conservan, aunque una noticia salga del listado.</small>
      <p>
        {data.boards
          ?.map((b) => `${b.label}: ${b.published} publicadas · ${b.pending} pendientes`)
          .join(' / ')}
      </p>
      {Boolean(data.pending_jobs?.length) && (
        <details>
          <summary>Ver avance por noticia</summary>
          <ul>
            {data.pending_jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.title}</strong>
                {' · '}
                {job.images_ready}/{job.images_total} imágenes
                {job.translation_pending > 0 && ` · ${job.translation_pending} textos por traducir`}
                {job.error && ` · ${job.error}`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(data.retry_available || busy) && (
        <details>
          <summary>Recuperar una actualización interrumpida</summary>
          <p>
            La programación diaria sigue activa. Esta opción excepcional reanuda pendientes y puede
            publicar borradores completos de las fuentes que estaban preparados antes de activar la
            automatización. Conserva la cuota de traducción del día.
          </p>
          <button type="button" onClick={retry} disabled={busy || !data.retry_available}>
            {busy ? 'Actualizando automáticamente…' : 'Ejecutar actualización automática ahora'}
          </button>
        </details>
      )}
      {(busy || notice) && (
        <p role="status">
          {busy ? 'Completando contenido e imágenes. Puede tardar unos minutos.' : notice}
        </p>
      )}
      {Boolean(data.last?.summary.errors?.length) && (
        <details>
          <summary>Ver pendientes de la última revisión</summary>
          <ul>
            {[...new Set(data.last!.summary.errors)].slice(0, 5).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
