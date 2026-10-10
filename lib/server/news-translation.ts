import { z } from 'zod';
import { boundedBytes, fail } from './core';
import { getDb } from './db';
import { mylText } from './myl-news-source';
import { newsArticle, type WebNewsCandidate } from '../web-news';
import { getWebNews, saveWebNews } from './web-news';

// MyMemory accepts at most 500 UTF-8 bytes per request. No keys or paid fallback.
export function translationChunks(text: string): string[] {
  const chunks: string[] = [];
  let chunk = '';
  for (const word of text.match(/\S+\s*/gu) || []) {
    if (chunk && Buffer.byteLength(chunk + word, 'utf8') > 480) {
      chunks.push(chunk);
      chunk = '';
    }
    for (const character of word) {
      if (Buffer.byteLength(chunk + character, 'utf8') > 480) {
        chunks.push(chunk);
        chunk = '';
      }
      chunk += character;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export async function translateNewsText(text: string): Promise<string> {
  const translated: string[] = [];
  for (const chunk of translationChunks(text)) {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.search = new URLSearchParams({ q: chunk, langpair: 'en|es', mt: '1' }).toString();
    try {
      const response = await fetch(url, {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw Error();
      const data = z
        .object({
          responseStatus: z.union([z.number(), z.string()]),
          quotaFinished: z.boolean().optional(),
          responseData: z.object({ translatedText: z.string().min(1).max(4000) }),
        })
        .parse(JSON.parse(Buffer.from(await boundedBytes(response, 60_000)).toString()));
      if (Number(data.responseStatus) !== 200 || data.quotaFinished) throw Error();
      translated.push(mylText(data.responseData.translatedText));
    } catch {
      fail(
        503,
        'El traductor gratuito no respondió o agotó su cuota. Puedes preparar la noticia sin traducir y editarla; no se ha publicado nada.',
      );
    }
  }
  return translated.join(' ').trim();
}

export async function prepareNewsDraft(input: unknown) {
  const value = z
    .object({
      id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
      source: z.enum(['tcg', 'myl']),
      translate: z.boolean().default(true),
    })
    .parse(input);
  const previous = await getWebNews(true);
  if (previous.some((item) => item.id === value.id)) return previous;
  const key = value.source === 'myl' ? 'myl_news_discovery' : 'web_news_discovery';
  const row = (await (await getDb()).query('SELECT data FROM settings WHERE id=1')).rows[0];
  const candidate = (row?.data?.[key]?.items as WebNewsCandidate[] | undefined)?.find(
    (item) => item.id === value.id,
  );
  if (!candidate || !newsArticle(candidate.url))
    fail(409, 'Busca las novedades otra vez antes de preparar esta noticia.');
  const title = mylText(candidate.title).slice(0, 160);
  const summary = mylText(candidate.summary).slice(0, 600);
  if (summary.length < 10)
    fail(409, 'La fuente no incluye un resumen suficiente. Prepara esta noticia manualmente.');
  // Brief sourced notice, not a mirrored full article or invented card effects.
  const spanish = value.source === 'tcg' && value.translate;
  const translatedTitle = spanish ? await translateNewsText(title) : title;
  const translatedSummary = spanish ? await translateNewsText(summary) : summary;
  return saveWebNews(
    {
      id: candidate.id,
      url: candidate.url,
      published_on: candidate.published_on,
      category: candidate.category,
      boards: candidate.boards || ['yugioh'],
      title: translatedTitle.slice(0, 160),
      summary: translatedSummary.slice(0, 600),
      body: translatedSummary,
      original_title: title,
      original_summary: summary,
      source_image: candidate.source_image || '',
      visible: false,
    },
    candidate.id,
  );
}
