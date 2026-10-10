import {
  banlistSource,
  type BanlistCard,
  type BanlistSnapshot,
  type BanlistState,
} from '../banlist';
import { validDay } from '../tournament-schedule';
import { getDb } from './db';
import { fail } from './core';
import { sourceBytes, spanishPlain } from './ygo-source';

const sections = ['forbidden', 'limited', 'semi_limited', 'release_of_restricted'] as const;
const sourceError = () =>
  fail(
    502,
    'La lista oficial cambió de formato o está incompleta. Conservamos la última lista verificada.',
  );
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

// Parse only the named card sections, checking the official totals before saving anything.
export function parseBanlist(html: string): BanlistSnapshot {
  if (
    !html.includes('torneo oficial de Yu-Gi-Oh! TCG') ||
    !html.includes('Lista de Cartas Prohibidas')
  )
    sourceError();
  const date = html.match(/Actualizado en\s+(\d{2})\/(\d{2})\/(\d{4})/);
  const effective_on = date ? `${date[3]}-${date[2]}-${date[1]}` : '';
  if (!validDay(effective_on)) sourceError();
  const blocks = html.split(
    /<div\s+id="list_(?:update|forbidden|limited|semi_limited|release_of_restricted)"[^>]*>/,
  );
  const ids = [
    ...html.matchAll(
      /<div\s+id="list_(update|forbidden|limited|semi_limited|release_of_restricted)"[^>]*>/g,
    ),
  ].map((m) => m[1]);
  if (new Set(ids).size !== ids.length) sourceError();
  const bySection = new Map(ids.map((id, i) => [id, blocks[i + 1]]));
  const changes = new Map<number, string>();
  const rows = (block: string) => block.split(/<div class="t_row\b[^>]*>/).slice(1);
  const updates = bySection.get('update');
  if (
    !updates ||
    rows(updates).length !==
      Number(updates.match(/Cartas que se han Actualizado:\s*(\d+) Cartas/)?.[1])
  )
    sourceError();
  for (const row of rows(updates!)) {
    const cid = Number(
      row.match(/class="link_value"[^>]*value="[^"\r\n]*[?&](?:amp;)?cid=(\d+)/)?.[1],
    );
    const change = spanishPlain(row.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/\s+/g, ' ');
    if (!cid || !change || change.length > 160 || changes.has(cid)) sourceError();
    changes.set(cid, change.replace('->', '→'));
  }
  const cards: BanlistCard[] = [];
  const seen = new Set<number>();
  for (const [copies, id] of sections.entries()) {
    const block = bySection.get(id);
    if (!block) sourceError();
    const total = Number(block!.match(/class="mai">\s*(\d+) Carta\(s\)/)?.[1] ?? NaN);
    const sectionRows = rows(block!);
    if (!Number.isInteger(total) || total > 1000 || sectionRows.length !== total) sourceError();
    for (const row of sectionRows) {
      const cid = Number(
        row.match(/class="link_value"[^>]*value="[^"\r\n]*[?&](?:amp;)?cid=(\d+)/)?.[1],
      );
      // Strip raw markup before decoding so card names containing literal <Q> stay intact.
      const rawName = row.match(/<span class="name">([\s\S]*?)<\/span>/)?.[1] ?? '';
      const name = spanishPlain(rawName, true).replace(/\s+/g, ' ').trim();
      if (!cid || cid > 999999 || seen.has(cid) || !name || name.length > 200) sourceError();
      seen.add(cid);
      cards.push({
        cid,
        name,
        copies: copies as BanlistCard['copies'],
        ...(changes.has(cid) ? { change: changes.get(cid) } : {}),
      });
    }
  }
  if (!cards.length || [...changes.keys()].some((cid) => !seen.has(cid))) sourceError();
  return { effective_on, cards };
}

export async function getBanlist(): Promise<BanlistState | null> {
  const row = (await (await getDb()).query('SELECT data FROM settings WHERE id=1')).rows[0];
  const state: BanlistState | null = row?.data?.ygo_banlist ?? null;
  if (state?.upcoming && state.upcoming.effective_on <= today())
    return { ...state, current: state.upcoming, upcoming: null };
  return state;
}

export async function refreshBanlist(): Promise<BanlistState> {
  const old = await getBanlist();
  if (old && Date.now() - Date.parse(old.checked_at) < 5 * 60_000) return old;
  const checked_at = new Date().toISOString();
  const html = (await sourceBytes(banlistSource, 1_000_000)).toString();
  const latest = parseBanlist(html);
  let current = latest,
    upcoming: BanlistSnapshot | null = null;
  if (latest.effective_on > today()) {
    upcoming = latest;
    const selector =
      html.match(/<select[^>]*id="forbiddenLimitedDate"[^>]*>([\s\S]*?)<\/select>/)?.[1] ?? '';
    const prior = [...selector.matchAll(/<option value="(\d{4}-\d{2}-\d{2})"/g)]
      .map((m) => m[1])
      .filter((d) => validDay(d) && d <= today())
      .sort()
      .pop();
    if (!prior) sourceError();
    current = parseBanlist(
      (await sourceBytes(`${banlistSource}&forbiddenLimitedDate=${prior}`, 1_000_000)).toString(),
    );
    if (current.effective_on !== prior) sourceError();
  }
  const state = { checked_at, current, upcoming };
  // A slower request cannot overwrite a more recent refresh or other store settings.
  await (
    await getDb()
  ).query(
    "UPDATE settings SET data=jsonb_set(data,'{ygo_banlist}',$1::jsonb,true) WHERE id=1 AND COALESCE(data->'ygo_banlist'->>'checked_at','') < $2",
    [JSON.stringify(state), checked_at],
  );
  return (await getBanlist())!;
}
