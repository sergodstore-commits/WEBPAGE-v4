import { firstNewsReport, newsIdentity, newsRelationship } from '../news-deduplication';
import type { WebNewsItem } from '../web-news';
import { getDb } from './db';
import { rotateWebNews } from './news-cleanup';
import { getWebNews } from './web-news';

/** Keep an earlier public report until its replacement has actually finished publishing. */
export async function suppressDuplicateNews(item: WebNewsItem, afterPublication = false) {
  const reports = (await getWebNews(true)).filter(
    (other) =>
      other.visible && other.id !== item.id && newsRelationship(item, other) === 'duplicate',
  );
  if (!reports.length) return false;
  const first = firstNewsReport([...reports, item]);
  const duplicates = first.id === item.id ? (afterPublication ? reports : []) : [item];
  for (const duplicate of duplicates) {
    // Archives preserve card galleries; no images are deleted by deduplication.
    await rotateWebNews([duplicate.id]);
    await (
      await getDb()
    ).query(
      `UPDATE content_news_jobs SET phase='duplicate',candidate=$2::jsonb,last_error=$3,updated_at=now() WHERE url=$1`,
      [
        duplicate.url,
        JSON.stringify({ dedupe_identity: newsIdentity(duplicate), duplicate_of: first.url }),
        `Mismo anuncio: se conserva la primera publicación (${first.url}).`,
      ],
    );
  }
  return first.id !== item.id;
}
