import { z } from 'zod';
import { getDb } from './db';
import { initialWebNews, yugiohMetaArticle } from '../web-news';
import { validDay } from '../tournament-schedule';

const schema = z
  .array(
    z.object({
      id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
      title: z.string().trim().min(3).max(160),
      summary: z.string().trim().min(10).max(600),
      url: z
        .string()
        .max(1000)
        .transform((value, ctx) => {
          const url = yugiohMetaArticle(value);
          if (!url) {
            ctx.addIssue({
              code: 'custom',
              message: 'Usa el enlace HTTPS de un artículo de Yu-Gi-Oh! Meta.',
            });
            return z.NEVER;
          }
          return url;
        }),
      published_on: z.string().refine(validDay, 'Indica una fecha válida.'),
      visible: z.boolean(),
    }),
  )
  .max(80)
  .refine(
    (items) =>
      new Set(items.map((i) => i.id)).size === items.length &&
      new Set(items.map((i) => i.url)).size === items.length,
    'No repitas artículos ni identificadores.',
  );

export async function getWebNews(admin = false) {
  const row = (await (await getDb()).query('SELECT data FROM settings WHERE id=1')).rows[0];
  const items = schema.parse(row?.data?.web_news ?? initialWebNews);
  return admin ? items : items.filter((item) => item.visible);
}

export async function saveWebNews(input: unknown) {
  const items = schema.parse(input);
  await (
    await getDb()
  ).query("UPDATE settings SET data=jsonb_set(data,'{web_news}',$1::jsonb,true) WHERE id=1", [
    JSON.stringify(items),
  ]);
  return items;
}
