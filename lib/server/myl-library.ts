import {
  mylDefinition,
  mylLibraryDefinitions,
  type MylLibraryCard,
  type MylLibraryDocument,
  type MylLibraryPanel,
} from '../myl-library';
import { mylNewsImage } from '../web-news';
import type { EditionChoice } from '../edition-gallery';
import { newsHtmlTree, newsText, type NewsNode } from './news-content';
import { getDb } from './db';
import { fail } from './core';
import { readMylPost } from './myl-news-source';
import { withLease } from './edition-imports';
import {
  archiveMetaNewsCover,
  mylLibraryMediaUsage,
  MYL_LIBRARY_MEDIA_LIMIT,
} from './meta-news-source';

type State = Record<string, { draft?: MylLibraryDocument; published?: MylLibraryDocument }>;
async function itemFor(code: string): Promise<State[string]> {
  return (
    (
      await (
        await getDb()
      ).query("SELECT data->'myl_library'->$1 AS library FROM settings WHERE id=1", [code])
    ).rows[0]?.library || {}
  );
}
async function save(code: string, item: State[string]) {
  await (
    await getDb()
  ).query(
    "UPDATE settings SET data=jsonb_set(data,'{myl_library}',COALESCE(data->'myl_library','{}'::jsonb) || $1::jsonb,true) WHERE id=1",
    [JSON.stringify({ [code]: item })],
  );
}
// Read the article tree, never execute HTML or accept arbitrary image destinations.
export function parseMylLibrary(code: string, html: string): MylLibraryCard[] {
  if (!mylDefinition(code)) fail(404, 'Producto MyL no disponible.');
  let section = '',
    list = false,
    presentation = '';
  const cards = new Map<string, MylLibraryCard>();
  const plain = (n: NewsNode): string =>
    newsText(n.content || (n.children || []).map(plain).join(' '));
  const visit = (nodes: NewsNode[]) => {
    for (const n of nodes) {
      if (/^h[1-6]$/.test(n.name || '') || n.name === 'p') {
        const text = plain(n);
        if (/^h[1-6]$/.test(n.name || '')) {
          section = text;
          if (/^Listado de cartas Primer Bloque/i.test(text)) list = true;
          else if (code === 'myl-lpb4' && list) list = false;
        }
        if (
          code === 'myl-lpb4' &&
          list &&
          /^(Secretas|Legendarias|Premium|Mega Reales|Reales|Cortesanos?|Vasallos|Set Clásico)$/i.test(
            text,
          )
        )
          section = text;
        if (code === 'myl-ra') {
          if (/^Cartas producto Relatos.*Amanecer/i.test(text)) presentation = 'amanecer';
          if (/^Cartas producto Relatos.*Invasores/i.test(text)) presentation = 'invasores';
          if (/^Cartas producto Relatos.*Sabiduría/i.test(text)) presentation = 'sabiduria';
        }
        if (code === 'myl-ultratumba' && /spoilers.*Tinieblas/i.test(text))
          presentation = 'tinieblas';
        if (code === 'myl-ultratumba' && /inclusiones.*Abismo/i.test(text)) presentation = 'abismo';
      }
      if (n.name === 'img') {
        const source = mylNewsImage(String(n.attrs?.['data-src'] || n.attrs?.src || ''));
        if (!source) fail(409, 'Una imagen de cartas no pertenece al blog oficial de MyL.');
        const file = decodeURIComponent(new URL(source).pathname.split('/').at(-1)!);
        let cardCode = '',
          role: MylLibraryCard['role'] = 'pool',
          name = '',
          target = presentation;
        if (
          code === 'myl-lpb4' &&
          (list || /^(Novedades: Cartas|Novedades: Nuevas)/i.test(section))
        ) {
          const match = file.match(/^(LPB4|SCLPB4)[_-](\d{2,3})(?:[-_.])/i);
          if (
            match &&
            Number(match[2]) >= 1 &&
            Number(match[2]) <= (match[1].toUpperCase() === 'LPB4' ? 320 : 80)
          )
            cardCode = `${match[1].toUpperCase()}-${match[2].padStart(3, '0')}`;
        } else if (
          code === 'myl-lpe4' &&
          /^(Novedades: Cartas|Novedades: Nuevas)/i.test(section) &&
          /LPE4/i.test(file)
        ) {
          cardCode = file.replace(/(?:-\d+)?\.png$/i, '').toUpperCase();
        } else if (code === 'myl-lpb4' && /Display de Sobres/i.test(section)) {
          const promo = file.match(/^(\d{2})-(.+)\.png$/i);
          if (promo) {
            cardCode = `LPB4-BAB${promo[1]}`;
            name = promo[2].replace(/-/g, ' ');
            role = 'reserve';
          }
        } else if (
          code === 'myl-lpe4' &&
          /Display de Sobres|Beneficio de reserva de 3 Display/i.test(section)
        ) {
          const promo = file.match(/^LPE4_(\d{3})\.png$/i);
          if (promo) {
            cardCode = `LPE4-P${promo[1]}`;
            role = 'reserve';
            if (/Beneficio de reserva de 3/i.test(section)) target = 'tres-displays';
          }
        } else if (code === 'myl-ra') {
          const match = file.match(/^ARAX_(\d{2})(?:[-_.])/i);
          if (match && /^Cartas producto Relatos/i.test(section)) {
            cardCode = `ARAX-${match[1]}`;
            role = 'fixed';
          } else if (/^Buy a Box fijas|^Cartas Buy a Box al azar/i.test(section)) {
            const promo = file.match(/^(\d+)-(.+?)_Promo/i);
            if (promo) {
              cardCode = `RA-P${promo[1]}`;
              name = promo[2].replace(/-/g, ' ');
              role = 'reserve';
              target = /Amanecer/i.test(section)
                ? 'amanecer'
                : /Invasores/i.test(section)
                  ? 'invasores'
                  : /Sabidur/i.test(section)
                    ? 'sabiduria'
                    : '';
            }
          }
        } else if (code === 'myl-ultratumba') {
          const match = file.match(/^(\d{2})-(.+)\.png$/i);
          if (match && presentation && !/Torneos/i.test(section)) {
            cardCode = `ULTRA-${match[1]}`;
            name = match[2].replace(/-/g, ' ');
            role = 'fixed';
          } else if (/^(Bayard|Midgard)-Buy-a-Box/i.test(file)) {
            name = file.split('-')[0];
            cardCode = `ULTRA-${name.toUpperCase()}`;
            role = 'reserve';
            target = name === 'Bayard' ? 'tinieblas' : 'abismo';
          }
        }
        if (cardCode) {
          const alt = newsText(String(n.attrs?.alt || ''));
          cards.set(cardCode, {
            code: cardCode,
            name: name || (alt && !/^image|^carta|^LPB|^LPE/i.test(alt) ? alt : cardCode),
            section,
            presentation: target || undefined,
            role,
            source,
          });
        }
      }
      visit(n.children || []);
    }
  };
  visit(newsHtmlTree(html));
  if (!cards.size || cards.size > 500 || ![...cards.values()].some((c) => c.role !== 'reserve'))
    fail(
      409,
      'El listado de MyL no tiene una cobertura verificable. Se conserva la versión publicada.',
    );
  if (
    code === 'myl-ra' &&
    mylDefinition(code)!.presentations.some(
      (p) =>
        [...cards.values()].filter((c) => c.role === 'fixed' && c.presentation === p.id).length !==
        12,
    )
  )
    fail(409, 'El listado de Relatos está incompleto. Se conserva la versión publicada.');
  return [...cards.values()].sort((a, b) => a.code.localeCompare(b.code));
}
export async function mylLibraryPanel(): Promise<MylLibraryPanel> {
  const summaries = (
    await (
      await getDb()
    ).query(`SELECT entry.key AS code,
    jsonb_array_length(coalesce(entry.value->'draft',entry.value->'published')->'cards') AS total,
    (SELECT count(*)::int FROM jsonb_array_elements(coalesce(entry.value->'draft',entry.value->'published')->'cards') card WHERE card->>'image' IS NOT NULL) AS ready,
    entry.value->'published' IS NOT NULL AS published,
    coalesce(entry.value->'draft',entry.value->'published')->>'updated' AS updated
    FROM settings CROSS JOIN LATERAL jsonb_each(coalesce(data->'myl_library','{}'::jsonb)) entry WHERE id=1`)
  ).rows;
  return {
    items: mylLibraryDefinitions.map((d) => {
      const item = summaries.find((s) => s.code === d.code);
      return {
        ...d,
        total: item?.total || 0,
        ready: item?.ready || 0,
        published: Boolean(item?.published),
        updated: item?.updated || null,
      };
    }),
    storage_bytes: await mylLibraryMediaUsage(),
    storage_limit: MYL_LIBRARY_MEDIA_LIMIT,
  };
}
export async function prepareMylLibrary(code: string, refresh = false) {
  const definition = mylDefinition(code);
  if (!definition) fail(404, 'Producto MyL no disponible.');
  return withLease(async () => {
    const db = await getDb();
    const hasDraft = (
      await db.query(
        "SELECT data->'myl_library'->$1->'draft' IS NOT NULL AS present FROM settings WHERE id=1",
        [code],
      )
    ).rows[0]?.present;
    if (refresh || !hasDraft) {
      const item = await itemFor(code);
      const source = await readMylPost(definition.source);
      const cards = parseMylLibrary(code, source.html);
      const old = new Map(
        (item.draft?.cards || item.published?.cards || []).map((c) => [c.source, c]),
      );
      item.draft = {
        ...definition,
        updated: new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Santiago',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()),
        cards: cards.map((c) => ({
          ...c,
          image: old.get(c.source)?.image,
          thumbnail: old.get(c.source)?.thumbnail,
        })),
      };
      await save(code, item);
    } else {
      const pending = (
        await db.query(
          "SELECT card.value AS card, (card.ordinality-1)::int AS index FROM settings CROSS JOIN LATERAL jsonb_array_elements(data->'myl_library'->$1->'draft'->'cards') WITH ORDINALITY card WHERE id=1 AND card.value->>'image' IS NULL ORDER BY card.ordinality LIMIT 1",
          [code],
        )
      ).rows[0];
      if (pending) {
        const card = pending.card as MylLibraryCard;
        const image = await archiveMetaNewsCover(card.source, 'myl-library');
        card.image = image.image;
        card.thumbnail = image.thumbnail || image.image;
        await db.query(
          'UPDATE settings SET data=jsonb_set(data,$1::text[],$2::jsonb,false) WHERE id=1',
          [['myl_library', code, 'draft', 'cards', String(pending.index)], JSON.stringify(card)],
        );
      }
    }
    return mylLibraryPanel();
  });
}
export async function publishMylLibrary(code: string, published: boolean) {
  if (!mylDefinition(code)) fail(404, 'Producto MyL no disponible.');
  return withLease(async () => {
    const item = await itemFor(code);
    if (
      !item ||
      (published && (!item.draft?.cards.length || item.draft.cards.some((c) => !c.image)))
    )
      fail(409, 'Completa las imágenes disponibles antes de publicar la biblioteca.');
    if (published) item.published = structuredClone(item.draft!);
    else delete item.published;
    await save(code, item);
    return mylLibraryPanel();
  });
}
export async function publicMylLibrary(code: string): Promise<MylLibraryDocument> {
  if (!mylDefinition(code)) fail(404, 'Producto MyL no disponible.');
  const doc = (
    await (
      await getDb()
    ).query("SELECT data->'myl_library'->$1->'published' AS document FROM settings WHERE id=1", [
      code,
    ])
  ).rows[0]?.document as MylLibraryDocument | undefined;
  if (!doc) fail(404, 'Esta biblioteca MyL no está publicada.');
  return doc;
}
export async function previewMylLibrary(code: string): Promise<MylLibraryDocument> {
  if (!mylDefinition(code)) fail(404, 'Producto MyL no disponible.');
  const doc = (await itemFor(code)).draft;
  if (!doc?.cards.length || doc.cards.some((c) => !c.image))
    fail(409, 'Completa las imágenes antes de revisar la galería.');
  return doc;
}
export async function mylLibraryChoices(): Promise<EditionChoice[]> {
  return (
    await (
      await getDb()
    ).query(`SELECT entry.key AS code,
    entry.value->'published'->>'name' AS name,
    entry.value->'published'->>'release_date' AS release_date,
    entry.value->'published'->>'board' AS game,
    (entry.value->'published'->>'expected')::int AS expected,
    (SELECT count(*)::int FROM jsonb_array_elements(entry.value->'published'->'cards') card WHERE card->>'role'<>'reserve') AS total,
    (SELECT jsonb_agg(coalesce(card->>'thumbnail',card->>'image')) FROM (SELECT card FROM jsonb_array_elements(entry.value->'published'->'cards') card WHERE card->>'role'<>'reserve' LIMIT 3) covers) AS cover_cards
    FROM settings CROSS JOIN LATERAL jsonb_each(coalesce(data->'myl_library','{}'::jsonb)) entry
    WHERE id=1 AND entry.value->'published' IS NOT NULL`)
  ).rows as EditionChoice[];
}
