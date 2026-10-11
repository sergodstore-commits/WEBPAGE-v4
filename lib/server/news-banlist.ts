import { getDb } from './db';
import { banlistOverview } from '../news-banlist';

export async function getNewsBanlistOverview() {
  // Dates and published notices only. Do not load the card cache or contact external sources.
  const { rows } = await (
    await getDb()
  ).query(`SELECT
    CASE WHEN data->'ygo_banlist'->'current' IS NOT NULL THEN jsonb_build_object(
      'checked_at', data->'ygo_banlist'->'checked_at',
      'current', jsonb_build_object('effective_on', data->'ygo_banlist'->'current'->'effective_on'),
      'upcoming', CASE WHEN data->'ygo_banlist'->'upcoming'->>'effective_on' IS NOT NULL
        THEN jsonb_build_object('effective_on', data->'ygo_banlist'->'upcoming'->'effective_on') ELSE NULL END
    ) ELSE NULL END AS tcg,
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', value->'id', 'title', value->'title', 'url', value->'url',
      'published_on', value->'published_on', 'effective_dates', value->'effective_dates',
      'boards', value->'boards', 'category', value->'category', 'visible', true
    )), '[]'::jsonb) FROM jsonb_array_elements(coalesce(data->'web_news', '[]'::jsonb))
      WHERE value->>'visible' = 'true' AND value->>'category' = 'banlist') AS notices
    FROM settings WHERE id=1`);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return banlistOverview(rows[0]?.tcg || null, rows[0]?.notices || [], today);
}
