import { getDb, type Db } from './db';

// Existing orders keep their snapshots; only the current selling section changes.
export async function moveReleasedPreorders(db?: Db) {
  const database = db || (await getDb());
  const result = await database.query(
    `UPDATE products SET kind='store',moved_to_store_at=now(),updated_at=now()
     WHERE kind='preorder' AND status='published' AND deleted_at IS NULL
       AND auto_move_to_store AND release_date IS NOT NULL
       AND release_date <= (now() AT TIME ZONE 'America/Santiago')::date
       AND closes_at <= now()
       AND stock > reserved
     RETURNING id`,
  );
  return result.rows.length;
}
