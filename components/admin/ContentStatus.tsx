import styles from './NewsWorkspace.module.css';

export type ContentStage = 'new' | 'pending' | 'preparing' | 'review' | 'published' | 'error';
const labels: Record<ContentStage, string> = {
  new: 'Nuevo',
  pending: 'Preparación pendiente',
  preparing: 'Preparando',
  review: 'Listo para revisar',
  published: 'Publicado',
  error: 'Error',
};
export function ContentStatus({ stage }: { stage: ContentStage }) {
  return (
    <span className={styles.badge} data-state={stage}>
      {labels[stage]}
    </span>
  );
}
