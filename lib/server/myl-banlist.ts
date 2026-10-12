import {
  mylBanlistSources,
  mylCardKey,
  type MylBanlistSnapshot,
  type MylBanlistState,
  type MylBanlistPanel,
  type MylRestrictedCard,
} from '../myl-banlist';
import { mylNewsImage, type MylNewsBoard } from '../web-news';
import { validDay } from '../tournament-schedule';
import {
  newsHtmlTree,
  extractNewsBlocks,
  contentBody,
  newsText,
  type NewsNode,
} from './news-content';
import {
  compactMylBanlist,
  readMylPost,
  mylBanlistNotices,
  mylImageManifest,
} from './myl-news-source';
import { getDb } from './db';
import { withLease } from './edition-imports';
import { fail } from './core';
import { archiveMetaNewsCover, newsMediaUsage, NEWS_MEDIA_LIMIT } from './meta-news-source';

export function parseMylBanlist(html: string, url: string): MylBanlistSnapshot {
  const nodes = newsHtmlTree(html);
  const plain = (n: NewsNode): string =>
    newsText(n.content ?? (n.children || []).map(plain).join(' '));
  const cards: MylRestrictedCard[] = [];
  let copies: 0 | 1 | 2 | undefined;
  const walk = (values: NewsNode[]) => {
    for (const n of values) {
      const text = plain(n);
      if (/^h[1-6]$/.test(n.name || '') || n.name === 'p') {
        if (/^Cartas Prohibidas/i.test(text)) copies = 0;
        else if (/^Cartas Limitadas a 1 copia/i.test(text)) copies = 1;
        else if (/^Cartas Limitadas a 2 copias/i.test(text)) copies = 2;
      }
      if (n.name === 'table' && copies !== undefined) {
        const rows: NewsNode[] = [];
        const collect = (vs: NewsNode[]) =>
          vs.forEach((v) => (v.name === 'tr' ? rows.push(v) : collect(v.children || [])));
        collect(n.children || []);
        const cells = (r: NewsNode) =>
          (r.children || []).filter((c) => ['td', 'th'].includes(c.name || '')).map(plain);
        const editions = rows.length ? cells(rows[0]) : [];
        if (editions.length < 4 || editions.some((e) => !e))
          fail(409, 'Cambió una tabla MyL. Conservamos la lista anterior.');
        for (const r of rows.slice(1)) {
          const cs = cells(r);
          if (cs.length !== editions.length)
            fail(409, 'Una fila de restricciones MyL está incompleta.');
          cs.forEach((name, i) => {
            if (name) cards.push({ name, edition: editions[i], copies: copies! });
          });
        }
      } else walk(n.children || []);
    }
  };
  walk(nodes);
  if (
    !cards.length ||
    cards.length > 1000 ||
    ![0, 1, 2].every((c) => cards.some((v) => v.copies === c))
  )
    fail(409, 'No se encontraron las tres tablas completas de restricciones MyL.');
  const blocks = extractNewsBlocks(nodes, mylNewsImage);
  const text = contentBody(blocks);
  const date = text.match(
    /(?:vigente desde|regir a partir del|aplicarán desde el)[^\d]*(\d{1,2}) de (\w+)[^\d]{0,80}(20\d{2})/i,
  );
  const months = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  const m = date ? months.indexOf(date[2].toLowerCase()) + 1 : 0;
  const effective =
    date && m ? `${date[3]}-${String(m).padStart(2, '0')}-${date[1].padStart(2, '0')}` : '';
  const firstRestriction = blocks.findIndex((b) =>
    /^Cartas (?:Prohibidas|Limitadas)/i.test(b.text),
  );
  const start = blocks.findIndex((b) => /^Formato Racial soporte edición/i.test(b.text));
  const rules = blocks
    .slice(Math.max(start, 0), firstRestriction < 0 ? undefined : firstRestriction)
    .filter(
      (b) =>
        b.kind !== 'image' &&
        !/resumen.*ajustes|resumen actualizaci|antes se permit|antes estaba|feedback|formulario|agradecemos|equipo mitos|^actualización|^¡jugadores/i.test(
          b.text,
        ),
    )
    .map((b) => b.text);
  return {
    effective_on: validDay(effective) ? effective : null,
    cards,
    rules,
    images: mylImageManifest(html).map((image, i) => ({
      ...image,
      name: blocks.find((b) => b.source === image.source)?.text || `Aclaración ilustrada ${i + 1}`,
    })),
    sources: [url],
    notes: [],
  };
}

export function applyMylNotice(
  snapshot: MylBanlistSnapshot,
  html: string,
  board: MylNewsBoard,
  date: string,
  url: string,
) {
  const compact = compactMylBanlist(extractNewsBlocks(newsHtmlTree(html), mylNewsImage), date);
  const effective = compact.effective_dates?.[board];
  if (!effective || (snapshot.effective_on && effective < snapshot.effective_on)) return snapshot;
  const cards = [...snapshot.cards];
  let currentBoard: MylNewsBoard | undefined,
    racial = false;
  for (const block of compact.blocks) {
    if (block.kind === 'heading') {
      if (block.text === 'Primer Bloque') currentBoard = 'myl-first-block';
      else if (block.text === 'Primera Era') currentBoard = 'myl-first-era';
      else racial = /^Racial Edición$/i.test(block.text);
    }
    if (currentBoard !== board || !racial || block.kind !== 'list') continue;
    const change = block.text.match(/^(.+?): (prohibida|[123] copias?) \(antes: (\d)\)$/);
    if (!change) fail(409, 'No pudimos verificar un cambio MyL. Conservamos la lista anterior.');
    const key = mylCardKey(change[1]);
    const existing = cards.filter((c) => mylCardKey(c.name) === key);
    const copies = (
      change[2] === 'prohibida' ? 0 : Number(change[2][0])
    ) as MylRestrictedCard['copies'];
    const edition = existing[0]?.edition || 'Edición no indicada en el aviso';
    for (let i = cards.length - 1; i >= 0; i--)
      if (mylCardKey(cards[i].name) === key) cards.splice(i, 1);
    cards.push({
      name: change[1],
      edition,
      copies,
      change: `Antes: ${change[3]} → Ahora: ${copies}`,
    });
  }
  return {
    ...snapshot,
    cards,
    effective_on: effective,
    sources: [...new Set([...snapshot.sources, url])],
    notes: [
      'Lista base contrastada con el aviso oficial más reciente. Los cambios del aviso prevalecen sobre las tablas anteriores.',
    ],
  };
}
async function readState() {
  return (
    await (
      await getDb()
    ).query(
      "SELECT data->'myl_banlists' AS state, data->'myl_banlist_draft' AS draft FROM settings WHERE id=1",
    )
  ).rows[0] as { state: MylBanlistState | null; draft: MylBanlistState | null };
}
export async function getMylBanlists() {
  const state = (await readState()).state;
  if (!state) return null;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return {
    ...state,
    formats: Object.fromEntries(
      Object.entries(state.formats).map(([board, f]) => [
        board,
        f.upcoming?.effective_on && f.upcoming.effective_on <= today ? f.upcoming : f,
      ]),
    ) as MylBanlistState['formats'],
  };
}
const images = (state: MylBanlistState | null) =>
  Object.values(state?.formats || {}).flatMap((f) => [...f.images, ...(f.upcoming?.images || [])]);
async function save(key: 'myl_banlists' | 'myl_banlist_draft', state: MylBanlistState) {
  await (
    await getDb()
  ).query(`UPDATE settings SET data=jsonb_set(data,'{${key}}',$1::jsonb,true) WHERE id=1`, [
    JSON.stringify(state),
  ]);
}
export async function mylBanlistPanel(): Promise<MylBanlistPanel> {
  const row = await readState(),
    list = images(row.draft || row.state);
  return {
    state: row.state || null,
    preparing: Boolean(row.draft),
    ready: list.filter((m) => m.image).length,
    total: list.length,
    storage_bytes: await newsMediaUsage(),
    storage_limit: NEWS_MEDIA_LIMIT,
  };
}
export async function refreshMylBanlists(batch = false) {
  return withLease(async () => {
    let { state, draft } = await readState();
    if (!batch) {
      const notices = await mylBanlistNotices();
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const formats = {} as MylBanlistState['formats'];
      for (const board of ['myl-first-era', 'myl-first-block'] as const) {
        const source = mylBanlistSources[board];
        const post = await readMylPost(source);
        let current = parseMylBanlist(post.html, source),
          upcoming: MylBanlistSnapshot | undefined;
        const orderedNotices = notices
          .map((notice) => ({
            ...notice,
            effective: compactMylBanlist(
              extractNewsBlocks(newsHtmlTree(notice.html), mylNewsImage),
              notice.date,
            ).effective_dates?.[board],
          }))
          .filter((notice) => notice.effective)
          .sort((a, b) => a.effective!.localeCompare(b.effective!) || a.date.localeCompare(b.date));
        for (const notice of orderedNotices) {
          const next = applyMylNotice(
            upcoming || current,
            notice.html,
            board,
            notice.date,
            notice.url,
          );
          if (next.effective_on && next.effective_on > today) upcoming = next;
          else current = next;
        }
        // A duplicate card with different limits is an error unless a newer official notice resolved it.
        for (const snapshot of [current, upcoming].filter(Boolean) as MylBanlistSnapshot[]) {
          const seen = new Map<string, number>();
          for (const card of snapshot.cards) {
            const key = mylCardKey(card.name);
            if (seen.has(key) && seen.get(key) !== card.copies)
              fail(
                409,
                `La fuente tiene límites contradictorios para ${card.name}. Conservamos la última lista verificada.`,
              );
            seen.set(key, card.copies);
          }
          snapshot.cards = [
            ...new Map(snapshot.cards.map((c) => [mylCardKey(c.name), c])).values(),
          ];
        }
        formats[board] = { ...current, ...(upcoming ? { upcoming } : {}) };
      }
      draft = { checked_at: new Date().toISOString(), formats };
      const cached = new Map(
        images(state)
          .filter((m) => m.image)
          .map((m) => [m.source, m]),
      );
      for (const m of images(draft)) {
        const old = cached.get(m.source);
        if (old) Object.assign(m, { image: old.image, bytes: old.bytes });
      }
      await save('myl_banlist_draft', draft);
    } else {
      if (!draft) return mylBanlistPanel();
      const pending = images(draft).find((m) => !m.image);
      if (pending) {
        const saved = await archiveMetaNewsCover(pending.source);
        for (const m of images(draft))
          if (m.source === pending.source)
            Object.assign(m, { image: saved.image, bytes: saved.image_bytes });
        await save('myl_banlist_draft', draft);
      }
    }
    if (draft && images(draft).every((m) => m.image)) {
      await save('myl_banlists', draft);
      await (await getDb()).query("UPDATE settings SET data=data-'myl_banlist_draft' WHERE id=1");
    }
    return mylBanlistPanel();
  });
}
