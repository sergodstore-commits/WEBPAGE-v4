import { z } from 'zod';
import { getDb } from './db';
import {
  initialWebNews,
  yugiohMetaArticle,
  newsArticle,
  newsSourceImage,
  mylArticle,
  type WebNewsItem,
} from '../web-news';
import { validDay } from '../tournament-schedule';
import { communityEditions, publishedEditions, withLease } from './edition-imports';
import {
  archiveMetaNewsCover,
  articleContent,
  newsMediaUsage,
  NEWS_MEDIA_LIMIT,
} from './meta-news-source';
import { fail } from './core';
import { mylArticleContent } from './myl-news-source';
import { contentBody } from './news-content';
import { translateNewsText } from './news-translation';

const schema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
        title: z.string().trim().min(3).max(160),
        summary: z.string().trim().min(10).max(600),
        url: z
          .string()
          .max(1000)
          .transform((value, ctx) => {
            const url = newsArticle(value);
            if (!url) {
              ctx.addIssue({
                code: 'custom',
                message: 'Usa un artículo HTTPS de Yu-Gi-Oh! Meta o del blog oficial MyL.',
              });
              return z.NEVER;
            }
            return url;
          }),
        published_on: z.string().refine(validDay, 'Indica una fecha válida.'),
        visible: z.boolean(),
        category: z.enum(['news', 'reveals', 'releases', 'tournaments', 'banlist']).default('news'),
        edition_code: z
          .union([z.literal(''), z.string().regex(/^[a-z0-9-]{2,20}$/)])
          .optional()
          .transform((value) => value || undefined),
        boards: z
          .array(z.enum(['yugioh', 'myl-first-era', 'myl-first-block']))
          .min(1)
          .max(2)
          .default(['yugioh']),
        effective_dates: z
          .object({
            'myl-first-era': z.string().refine(validDay).optional(),
            'myl-first-block': z.string().refine(validDay).optional(),
          })
          .optional(),
        body: z.string().trim().max(60000).default(''),
        content_version: z.number().int().min(1).max(10).optional(),
        content_language: z.enum(['es', 'en']).optional(),
        content_blocks: z
          .array(
            z.object({
              kind: z.enum(['heading', 'paragraph', 'list', 'image']),
              text: z.string().max(12000),
              source: z
                .string()
                .max(1000)
                .refine((v) => Boolean(newsSourceImage(v)))
                .optional(),
              original_text: z.string().max(12000).optional(),
            }),
          )
          .max(400)
          .optional(),
        source_image: z
          .string()
          .max(1000)
          .refine((v) => !v || Boolean(newsSourceImage(v)), 'Portada de fuente no válida.')
          .optional(),
        original_title: z.string().max(300).optional(),
        original_summary: z.string().max(600).optional(),
        image: z.string().max(1000).optional(),
        image_bytes: z.number().int().min(0).max(160000).optional(),
        media_checked: z.boolean().optional(),
        media: z
          .array(
            z.object({
              source: z.string().max(1000),
              name: z.string().max(200),
              image: z.string().max(1000).optional(),
              bytes: z.number().int().min(0).max(160000).optional(),
              caption: z.string().max(3000).optional(),
            }),
          )
          .max(100)
          .optional(),
      })
      .superRefine((item, context) => {
        const isMyl = Boolean(mylArticle(item.url));
        if (isMyl && item.edition_code)
          context.addIssue({
            code: 'custom',
            message: 'Las guías de ediciones disponibles corresponden a Yu-Gi-Oh! TCG.',
          });
        if (
          new Set(item.boards).size !== item.boards.length ||
          item.boards.some((board) => isMyl === (board === 'yugioh'))
        )
          context.addIssue({
            code: 'custom',
            message: 'El formato seleccionado no corresponde a la fuente de la noticia.',
          });
      }),
  )
  .max(80)
  .refine(
    (items) =>
      new Set(items.map((i) => i.id)).size === items.length &&
      new Set(items.map((i) => i.url)).size === items.length,
    'No repitas artículos ni identificadores.',
  );

export async function getWebNews(admin = false): Promise<WebNewsItem[]> {
  const row = (await (await getDb()).query('SELECT data FROM settings WHERE id=1')).rows[0];
  const items = schema.parse(row?.data?.web_news ?? initialWebNews);
  if (admin) return items;
  const editions = await publishedEditions();
  return [
    ...editions.map((edition) => ({
      id: `edition-${edition.code}`,
      title: edition.title,
      summary: edition.summary,
      url: `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(edition.name)}`,
      published_on: edition.published_on,
      visible: true,
      article_path: `/noticias/ediciones/${edition.code}`,
      source_label: 'YGOPRODeck',
      format: 'TCG' as const,
      category: 'releases' as const,
      edition_code: edition.code,
      cover_cards: edition.cover_cards,
    })),
    ...items
      .filter(
        (item) =>
          item.visible &&
          !(
            editions.some((edition) => edition.code === 'betb') &&
            yugiohMetaArticle(item.url) === 'https://www.yugiohmeta.com/articles/sets/tcg/betb'
          ),
      )
      .map(
        ({
          original_title,
          original_summary,
          source_image,
          body,
          media,
          image_bytes,
          media_checked,
          content_blocks,
          content_language,
          content_version,
          ...item
        }) => ({
          ...item,
          edition_code:
            item.edition_code &&
            (item.edition_code === 'betb' ||
              editions.some((edition) => edition.code === item.edition_code))
              ? item.edition_code
              : undefined,
          format: mylArticle(item.url) ? undefined : ('TCG' as const),
          category: item.category || 'releases',
          article_path:
            item.id === 'beyond-the-brave'
              ? '/noticias/beyond-the-brave'
              : `/noticias/${mylArticle(item.url) ? 'myl' : 'tcg'}/${item.id}`,
          cover_cards:
            item.id === 'beyond-the-brave'
              ? [
                  '/editions/betb/77482666-thumb.webp',
                  '/editions/betb/4881365-thumb.webp',
                  '/editions/betb/40275470-thumb.webp',
                ]
              : undefined,
        }),
      ),
  ].sort((a, b) => b.published_on.localeCompare(a.published_on));
}

export async function saveWebNews(input: unknown, itemId?: string) {
  return withLease(async () => {
    const previous = await getWebNews(true);
    const parsed = schema.parse(itemId ? [input] : input);
    if (itemId && parsed[0].id !== itemId) fail(400, 'Identificador de noticia no válido.');
    const inputItems = itemId
      ? schema.parse([...previous.filter((item) => item.id !== itemId), parsed[0]])
      : parsed;
    const items = inputItems.map((item) => {
      const old = previous.find((v) => v.id === item.id && v.url === item.url);
      return {
        ...item,
        image: old?.image,
        image_bytes: old?.image_bytes,
        media_checked: old?.media_checked,
        media: old?.media?.map((image) => ({
          ...image,
          caption: item.media?.find((m) => m.source === image.source)?.caption || '',
        })),
      };
    });
    const pending = items.filter((item) => item.visible && item.source_image && !item.image);
    if (items.some((item) => item.visible && item.original_title && !item.media_checked))
      fail(409, 'Prepara las imágenes del artículo antes de publicarlo.');
    if (items.some((item) => item.visible && item.media?.some((m) => !m.image)))
      fail(409, 'Termina de preparar las imágenes antes de publicar esta noticia.');
    if (items.some((item) => item.visible && item.content_blocks?.some((b) => b.original_text)))
      fail(
        409,
        'Termina de traducir el contenido antes de publicar esta noticia. El avance se conserva.',
      );
    if (pending.length > 1)
      fail(409, 'Publica una noticia nueva por guardado para preparar su portada.');
    for (const item of pending) Object.assign(item, await archiveMetaNewsCover(item.source_image!));
    await store(items);
    return items;
  });
}

async function store(items: WebNewsItem[]) {
  await (
    await getDb()
  ).query("UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1", [
    JSON.stringify(items),
  ]);
}
export async function prepareWebNewsImages(
  id: string,
  batch = false,
  refreshContent = false,
  translate = true,
) {
  return withLease(async () => {
    const items = await getWebNews(true);
    const item = items.find((i) => i.id === id);
    if (!item) fail(404, 'Guarda primero el borrador de la noticia.');
    if (!batch) {
      const myl = Boolean(mylArticle(item.url));
      const content = myl
        ? await mylArticleContent(item.url, item.published_on)
        : await articleContent(item.url);
      const manifest = content.media;
      // Upgrade only the old excerpt-as-body imports automatically. A refresh is an explicit editor action.
      const legacy =
        !item.content_version &&
        (!item.body ||
          item.body.trim() === item.summary.trim() ||
          item.body.trim() === item.original_summary?.trim());
      if (refreshContent || legacy) {
        item.content_blocks = content.blocks.map((b) => ({
          ...b,
          ...(!myl && b.kind !== 'image' && translate ? { original_text: b.text } : {}),
        }));
        item.body = contentBody(item.content_blocks);
        item.content_language = myl ? 'es' : 'en';
        item.content_version = 1;
        const dates = myl
          ? (content as Awaited<ReturnType<typeof mylArticleContent>>).effective_dates
          : undefined;
        if (dates) item.effective_dates = { ...dates, ...item.effective_dates };
        if (myl)
          item.summary =
            item.category === 'banlist'
              ? 'Cambios de restricciones para Primera Era y Primer Bloque: límites de copias, cartas prohibidas y fechas de vigencia.'
              : `Información de ${item.boards?.includes('myl-first-block') ? 'Primer Bloque' : 'Primera Era'}: detalles de la publicación y sus imágenes.`;
        // Never expose half-translated text or missing new media while refreshing a published article.
        if (
          !myl ||
          manifest.some((m) => !item.media?.some((old) => old.source === m.source && old.image))
        )
          item.visible = false;
      }
      item.media = manifest.map((m) => ({
        ...m,
        ...item.media?.find((old) => old.source === m.source),
        name: m.name,
      }));
      item.media_checked = true;
      if (item.source_image && !item.image)
        Object.assign(item, await archiveMetaNewsCover(item.source_image));
    } else {
      if (!item.media_checked) fail(409, 'Revisa primero las imágenes de la noticia.');
      const block = item.content_blocks?.find((b) => b.original_text && b.text === b.original_text);
      if (block) {
        // One translation unit per request makes long articles resumable on the free runtime.
        const translated = await translateNewsText(block.original_text!);
        const nextBody = contentBody(
          item.content_blocks!.map((b) => (b === block ? { ...b, text: translated } : b)),
        );
        if (translated.length > 12000 || nextBody.length > 60000)
          fail(
            409,
            'La traducción supera el tamaño admitido. El avance anterior se conserva; revisa el texto en el editor.',
          );
        block.text = translated;
        delete block.original_text;
        item.body = contentBody(item.content_blocks!);
        if (!item.content_blocks?.some((b) => b.original_text)) item.content_language = 'es';
        await store(items);
      }
      const cache = new Map(
        items
          .flatMap((i) => i.media || [])
          .filter((m) => m.image)
          .map((m) => [m.source, m]),
      );
      for (const m of item.media || [])
        if (!m.image && cache.has(m.source))
          Object.assign(m, {
            image: cache.get(m.source)!.image,
            bytes: cache.get(m.source)!.bytes,
          });
      const pending = block ? [] : (item.media || []).filter((m) => !m.image).slice(0, 1);
      for (const image of pending) {
        const saved = await archiveMetaNewsCover(image.source);
        Object.assign(image, { image: saved.image, bytes: saved.image_bytes });
        await store(items);
      }
    }
    await store(items);
    return {
      items,
      ready:
        (item.media?.filter((m) => m.image).length || 0) +
        (item.content_blocks?.filter((b) => b.kind !== 'image' && !b.original_text).length || 0),
      total:
        (item.media?.length || 0) +
        (item.content_blocks?.filter((b) => b.kind !== 'image').length || 0),
      images_ready: item.media?.filter((m) => m.image).length || 0,
      images_total: item.media?.length || 0,
      storage_bytes: await newsMediaUsage(),
      storage_limit: NEWS_MEDIA_LIMIT,
    };
  });
}

export async function publicWebArticle(id: string) {
  const item = (await getWebNews(true)).find((i) => i.id === id && i.visible);
  if (!item) fail(404, 'Esta noticia no está publicada.');
  const {
    original_title,
    original_summary,
    source_image,
    image_bytes,
    media_checked,
    ...publicItem
  } = item;
  return {
    ...publicItem,
    edition_code:
      item.edition_code &&
      (await communityEditions()).some((edition) => edition.code === item.edition_code)
        ? item.edition_code
        : undefined,
    source_label: mylArticle(item.url) ? 'Blog oficial Mitos y Leyendas' : 'Yu-Gi-Oh! Meta',
    format: mylArticle(item.url) ? undefined : ('TCG' as const),
  };
}
