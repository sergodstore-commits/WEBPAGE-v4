'use client';
import { useRemote } from '../store/shared';
import { date } from '@/lib/client';
import styles from './NewsWorkspace.module.css';

type Status = {
  schedule: string;
  limit: number;
  pending: number;
  preserved: number;
  last: null | {
    started_at: string;
    finished_at: string | null;
    status: string;
    summary: { published?: number; retired?: number; errors?: string[] };
  };
};
export function ContentAutomationStatus() {
  const { data, error } = useRemote<Status>('/admin/news/automation');
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
