import type { EditionCard } from '../edition-gallery';
import { AppError, fail } from './core';
import { translateNewsText } from './news-translation';
import { sourceBytes, spanishCard, type ManifestCard } from './ygo-source';
import { z } from 'zod';
import authored from '../../data/ygo-card-translations.json';

const numbers = (text: string) =>
  (text.match(/\d+(?:[.,]\d{3})*/g) || [])
    .map((s) => s.replace(/[.,]/g, ''))
    .sort()
    .join('|');
export async function spanishOrTranslatedCard(
  pending: ManifestCard,
): Promise<
  Pick<
    EditionCard,
    | 'name'
    | 'effects'
    | 'englishEffects'
    | 'text_origin'
    | 'translation_method'
    | 'translated_at'
    | 'source'
  >
> {
  const official = pending.cid
    ? `https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${pending.cid}&request_locale=es`
    : null;
  if (official) {
    try {
      return {
        ...spanishCard((await sourceBytes(official, 500_000)).toString('utf8')),
        source: official,
        text_origin: 'official',
      };
    } catch (error) {
      if (!(error instanceof AppError) || ![409, 502].includes(error.status)) throw error;
    }
  }
  let englishEffects = pending.englishEffects;
  if (!englishEffects?.length) {
    // Old manifests did not retain desc. Verify identity before using any fallback text.
    const response = JSON.parse(
      (
        await sourceBytes(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${pending.id}`, 500_000)
      ).toString(),
    );
    const data = z
      .object({
        data: z
          .array(
            z.object({
              id: z.number().int(),
              name: z.string(),
              desc: z.string().min(10).max(12000),
            }),
          )
          .length(1),
      })
      .safeParse(response);
    if (
      !data.success ||
      data.data.data[0].id !== pending.id ||
      data.data.data[0].name !== pending.englishName
    )
      fail(
        409,
        'No hay texto español ni un efecto original en inglés verificable para esta carta. El avance se conserva.',
      );
    englishEffects = [data.data.data[0].desc];
  }
  const effects: string[] = [];
  const saved = (authored as Record<string, { name: string; english: string; effects: string[] }>)[
    String(pending.id)
  ];
  const reviewed =
    saved?.name === pending.englishName && saved.english === englishEffects.join('\n');
  if (reviewed && numbers(saved.effects.join('\n')) !== numbers(saved.english))
    fail(409, 'La traducción guardada no coincide con los valores del original.');
  for (const original of reviewed ? [] : englishEffects) {
    const translated = await translateNewsText(original);
    if (
      !translated.trim() ||
      translated.trim() === original.trim() ||
      numbers(translated) !== numbers(original)
    )
      fail(
        409,
        'La traducción de esta carta necesita revisión: no coincide con el efecto original. El avance se conserva.',
      );
    effects.push(translated);
  }
  return {
    name: pending.englishName,
    effects: reviewed ? saved.effects : effects,
    englishEffects,
    text_origin: 'translated',
    translation_method: reviewed ? 'sergod' : 'automatic',
    translated_at: new Date().toISOString(),
    source: pending.cid
      ? official!.replace('request_locale=es', 'request_locale=en')
      : `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${pending.id}`,
  };
}
