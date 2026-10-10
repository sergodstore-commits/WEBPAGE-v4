import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import staticBetb from '../../public/editions/betb/cards.json';
import type {
  EditionCard,
  EditionDocument,
  EditionPanel,
  EditionSummary,
} from '../edition-gallery';
import { getDb, dataDir } from './db';
import { AppError, fail, hash, isProd, token } from './core';
import {
  discoverSets,
  editionManifest,
  sourceBytes,
  spanishCard,
  type ManifestCard,
} from './ygo-source';

export const EDITION_STORAGE_LIMIT = 100_000_000;
const codeSchema = z.string().regex(/^[a-z0-9-]{2,20}$/);
const nowDay = () => new Date().toISOString().slice(0, 10);
const jsonValue = (value: unknown) => JSON.stringify(value);
async function rowFor(code: string) {
  codeSchema.parse(code);
  const row = (await (await getDb()).query('SELECT * FROM ygo_editions WHERE code=$1', [code]))
    .rows[0];
  if (!row) fail(404, 'Edición no encontrada. Pulsa Buscar nuevas ediciones primero.');
  return row;
}
export async function withLease<T>(work: () => Promise<T>): Promise<T> {
  const db = await getDb(),
    lease = token();
  const locked = await db.query(
    "UPDATE ygo_import_state SET lease_token=$1,lease_until=now()+interval '90 seconds' WHERE id=1 AND (lease_until IS NULL OR lease_until<now()) RETURNING id",
    [lease],
  );
  if (!locked.rows.length)
    fail(
      409,
      'Ya hay una búsqueda o preparación en curso. Espera a que termine y vuelve a intentar.',
    );
  try {
    return await work();
  } finally {
    await db.query(
      'UPDATE ygo_import_state SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=$1',
      [lease],
    );
  }
}
export async function usedBytes() {
  return Number(
    (await (await getDb()).query('SELECT coalesce(sum(bytes),0) AS bytes FROM ygo_card_cache'))
      .rows[0].bytes,
  );
}
async function summary(row: any): Promise<EditionSummary> {
  const manifest = row.manifest as ManifestCard[];
  const ids = manifest.map((card) => card.id);
  const ready = ids.length
    ? Number(
        (
          await (
            await getDb()
          ).query('SELECT count(*) AS count FROM ygo_card_cache WHERE id=ANY($1::bigint[])', [ids])
        ).rows[0].count,
      )
    : 0;
  const codes = new Set(
    manifest.flatMap((card) => card.printings.map((printing) => printing.code)),
  );
  return {
    code: row.code,
    name: row.name,
    expected: row.expected,
    release_date: row.release_date,
    title: row.title,
    summary: row.summary,
    body: row.body,
    total: ids.length,
    ready,
    source_complete: codes.size >= row.expected,
    complete: ids.length > 0 && ready === ids.length && codes.size >= row.expected,
    last_error: row.last_error,
    published: Boolean(row.published),
  };
}
export async function editionPanel(): Promise<EditionPanel> {
  const db = await getDb();
  const state = (
    await db.query('SELECT discoveries,discovered_at FROM ygo_import_state WHERE id=1')
  ).rows[0];
  const rows = (await db.query('SELECT * FROM ygo_editions ORDER BY release_date DESC,code')).rows;
  const editions = [];
  for (const row of rows) editions.push(await summary(row));
  return {
    discoveries: state.discoveries,
    discovered_at: state.discovered_at ? new Date(state.discovered_at).toISOString() : null,
    editions,
    storage_bytes: await usedBytes(),
    storage_limit: EDITION_STORAGE_LIMIT,
  };
}
export async function searchEditions() {
  return withLease(async () => {
    const db = await getDb();
    const state = (await db.query('SELECT discovered_at FROM ygo_import_state WHERE id=1')).rows[0];
    if (
      !state.discovered_at ||
      Date.now() - new Date(state.discovered_at).getTime() > 6 * 3600000
    ) {
      const sets = await discoverSets();
      await db.query(
        'UPDATE ygo_import_state SET discoveries=$1::jsonb,discovered_at=now() WHERE id=1',
        [jsonValue(sets)],
      );
    }
    return editionPanel();
  });
}
export async function prepareEdition(code: string) {
  codeSchema.parse(code);
  return withLease(async () => {
    const db = await getDb();
    const sets = (await db.query('SELECT discoveries FROM ygo_import_state WHERE id=1')).rows[0]
      .discoveries as EditionPanel['discoveries'];
    const set = sets.find((item) => item.code === code);
    if (!set) fail(400, 'Selecciona una edición del listado de la fuente.');
    await db.query(
      `INSERT INTO ygo_editions(code,name,expected,release_date,title,summary,body) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET expected=EXCLUDED.expected,release_date=EXCLUDED.release_date`,
      [
        code,
        set.name,
        set.expected,
        set.release_date,
        `${set.name}: guía de cartas`,
        `Explora las cartas de ${set.name}, consulta sus rarezas y lee los efectos en español.`,
        `${set.name} reúne cartas para descubrir nuevas combinaciones. En esta guía de SERGOD puedes explorar la edición y consultar sus textos oficiales en español.\n\nBusca por nombre en español, en inglés o por código. Pulsa una carta para ampliar su imagen y leer su efecto.`,
      ],
    );
    const row = await rowFor(code);
    try {
      if (
        !row.checked_at ||
        Date.now() - new Date(row.checked_at).getTime() > 6 * 3600000 ||
        !row.manifest.length
      ) {
        const manifest = await editionManifest(set.name);
        await db.query(
          'UPDATE ygo_editions SET manifest=$2::jsonb,checked_at=now(),last_error=$3 WHERE code=$1',
          [
            code,
            jsonValue(manifest),
            new Set(manifest.flatMap((card) => card.printings.map((printing) => printing.code)))
              .size < set.expected
              ? 'La fuente todavía no incluye todas las cartas de la edición.'
              : '',
          ],
        );
      } else
        await db.query('UPDATE ygo_editions SET last_error=$2 WHERE code=$1', [
          code,
          (await summary(row)).source_complete
            ? ''
            : 'La fuente todavía no incluye todas las cartas de la edición.',
        ]);
    } catch (error) {
      await recordError(code, error);
    }
    return summary(await rowFor(code));
  });
}
async function recordError(code: string, error: unknown) {
  await (
    await getDb()
  ).query('UPDATE ygo_editions SET last_error=$2 WHERE code=$1', [
    code,
    error instanceof AppError
      ? error.message
      : 'No pudimos preparar la fuente. El avance se conserva; vuelve a intentar más tarde.',
  ]);
}
function objectKey(id: number, thumbnail: boolean) {
  const hex = hash(`ygo-gallery-v1:${id}:${thumbnail}`).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.webp`;
}
async function saveImage(id: number, thumbnail: boolean, bytes: Buffer) {
  const key = objectKey(id, thumbnail);
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const base = process.env.SUPABASE_URL.replace(/\/$/, ''),
      bucket = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
    const response = await fetch(
      `${base}/storage/v1/object/${encodeURIComponent(bucket)}/editions/${key}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Content-Type': 'image/webp',
          'Cache-Control': 'max-age=31536000',
          'x-upsert': 'true',
        },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok)
      fail(502, 'El almacenamiento no pudo guardar la carta. El avance se conserva.');
    return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/editions/${key}`;
  }
  if (isProd()) fail(503, 'Falta configurar el almacenamiento para las ediciones nuevas.');
  const dir = path.join(dataDir(), 'objects');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), bytes);
  return `/api/media/${key}`;
}
// Call under withLease: editions and banlist share images, texts and the storage cap.
export async function cacheYgoCard(pending: ManifestCard): Promise<EditionCard> {
  const cached = (
    await (await getDb()).query('SELECT data FROM ygo_card_cache WHERE id=$1', [pending.id])
  ).rows[0];
  if (cached) return cached.data as EditionCard;
  const existing = staticBetb.cards.find((card) => card.id === pending.id);
  let card: EditionCard,
    bytes = 0;
  if (existing) card = existing;
  else {
    if (!pending.cid)
      fail(
        409,
        `Falta la ficha oficial en español de ${pending.englishName}. Podrás reanudar cuando esté disponible.`,
      );
    const source = `https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${pending.cid}&request_locale=es`;
    const spanish = spanishCard((await sourceBytes(source, 500_000)).toString('utf8'));
    const original = await sourceBytes(pending.imageSource, 2_000_000);
    const processor = sharp(original, { limitInputPixels: 5_000_000 });
    const metadata = await processor.metadata();
    if (metadata.format !== 'jpeg')
      fail(409, 'La imagen de la fuente no tiene un formato verificable.');
    const large = await processor
      .clone()
      .rotate()
      .resize({ width: 600, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const small = await processor
      .clone()
      .rotate()
      .resize({ width: 220, withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer();
    bytes = large.length + small.length;
    if (bytes > 350_000 || (await usedBytes()) + bytes > EDITION_STORAGE_LIMIT)
      fail(
        409,
        'Se alcanzó el límite de almacenamiento de esta herramienta (100 MB). No se contratará más espacio ni se borrarán cartas automáticamente.',
      );
    const [image, thumbnail] = await Promise.all([
      saveImage(pending.id, false, large),
      saveImage(pending.id, true, small),
    ]);
    card = {
      id: pending.id,
      ...spanish,
      englishName: pending.englishName,
      printings: pending.printings,
      source,
      image,
      thumbnail,
      type: pending.type,
      attribute: pending.attribute,
      atk: pending.atk,
      def: pending.def,
      level: pending.level,
      link: pending.link,
    };
  }
  await (
    await getDb()
  ).query(
    'INSERT INTO ygo_card_cache(id,data,bytes) VALUES($1,$2::jsonb,$3) ON CONFLICT(id) DO NOTHING',
    [pending.id, jsonValue(card), bytes],
  );

  return card;
}
export function withStaticYgoCards(cached: EditionCard[]): EditionCard[] {
  return [...staticBetb.cards, ...cached] as EditionCard[];
}
export async function importEditionBatch(code: string) {
  return withLease(async () => {
    const db = await getDb(),
      row = await rowFor(code),
      manifest = row.manifest as ManifestCard[];
    if (!manifest.length) fail(409, 'Prepara la edición primero.');
    const cached = (
      await db.query('SELECT id FROM ygo_card_cache WHERE id=ANY($1::bigint[])', [
        manifest.map((card) => card.id),
      ])
    ).rows;
    const pending = manifest.find((card) => !cached.some((saved) => Number(saved.id) === card.id));
    if (!pending) return summary(row);
    try {
      await cacheYgoCard(pending);
      await db.query("UPDATE ygo_editions SET last_error='' WHERE code=$1", [code]);
    } catch (error) {
      await recordError(code, error);
    }
    return summary(await rowFor(code));
  });
}
const editorial = z.object({
  title: z.string().trim().min(3).max(160),
  summary: z.string().trim().min(10).max(600),
  body: z.string().trim().min(30).max(10000),
});
export async function editEdition(code: string, input: unknown) {
  await rowFor(code);
  const data = editorial.parse(input);
  await (
    await getDb()
  ).query('UPDATE ygo_editions SET title=$2,summary=$3,body=$4 WHERE code=$1', [
    code,
    data.title,
    data.summary,
    data.body,
  ]);
  return summary(await rowFor(code));
}
async function documentFor(row: any): Promise<EditionDocument> {
  const manifest = row.manifest as ManifestCard[],
    db = await getDb();
  const cache = (
    await db.query('SELECT id,data FROM ygo_card_cache WHERE id=ANY($1::bigint[])', [
      manifest.map((card) => card.id),
    ])
  ).rows;
  const cards = manifest
    .map(
      (card) =>
        ({
          ...cache.find((saved) => Number(saved.id) === card.id)!.data,
          printings: card.printings,
        }) as EditionCard,
    )
    .sort((a, b) => a.printings[0].code.localeCompare(b.printings[0].code));
  return {
    code: row.code,
    name: row.name,
    title: row.title,
    summary: row.summary,
    body: row.body,
    updated: nowDay(),
    cards,
  };
}
export async function previewEdition(code: string) {
  const row = await rowFor(code);
  if (!(await summary(row)).complete)
    fail(409, 'Completa las cartas y sus textos en español antes de previsualizar o publicar.');
  return documentFor(row);
}
export async function publishEdition(code: string, publish: boolean) {
  return withLease(async () => {
    await rowFor(code);
    const doc = publish ? await previewEdition(code) : null;
    await (
      await getDb()
    ).query(
      'UPDATE ygo_editions SET published=$2::jsonb,published_at=CASE WHEN $2::jsonb IS NULL THEN NULL ELSE now() END WHERE code=$1',
      [code, doc ? jsonValue(doc) : null],
    );
    return summary(await rowFor(code));
  });
}
export async function publicEdition(code: string) {
  const row = await rowFor(code);
  if (!row.published) fail(404, 'Esta guía todavía no está publicada.');
  return row.published as EditionDocument;
}
export async function publishedEditions() {
  return (
    await (
      await getDb()
    ).query(
      "SELECT code,name,published->>'title' AS title,published->>'summary' AS summary,published->>'updated' AS published_on,(SELECT jsonb_agg(card->>'thumbnail') FROM (SELECT value AS card FROM jsonb_array_elements(published->'cards') LIMIT 3) previews) AS cover_cards FROM ygo_editions WHERE published IS NOT NULL ORDER BY published_at DESC",
    )
  ).rows as {
    code: string;
    name: string;
    title: string;
    summary: string;
    published_on: string;
    cover_cards: string[];
  }[];
}
