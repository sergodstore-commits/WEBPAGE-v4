import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getDb } from './db';
import { AppError, fail } from './core';
import { latestNews, newsGame, NEWS_PER_GAME } from '../news-retention';
import { newsBoards, type WebNewsBlock, type WebNewsCandidate } from '../web-news';
import { getWebNews, prepareWebNewsImages, saveWebNews } from './web-news';
import { prepareNewsDraft, translateNewsText, withTranslationBudget } from './news-translation';
import { contentBody } from './news-content';
import { reviewMetaNews } from './meta-news-source';
import { reviewYGOrganizationNews } from './ygorganization-news-source';
import { reviewMylNews } from './myl-news-source';
import {
  banlistPanel,
  getBanlist,
  importBanlistCard,
  publishBanlistDraft,
  refreshBanlist,
} from './banlist';
import { mylBanlistPanel, refreshMylBanlists } from './myl-banlist';
import { withLease } from './edition-imports';
import { cleanupRetiredCovers, rotateWebNews } from './news-cleanup';

export const DAILY_TRANSLATION_LIMIT = 4500;
export const contentDay = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function authorizedContentCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (process.env.VERCEL && process.env.VERCEL_ENV !== 'production')) return false;
  const supplied = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// Small durable translation units allow long articles to finish over successive free daily quotas.
export function splitTranslationBlocks(blocks: WebNewsBlock[]): WebNewsBlock[] {
  const result = blocks.flatMap((block) => {
    if (!block.original_text || block.original_text.length <= 900) return [block];
    const parts: string[] = [];
    let remaining = block.original_text;
    while (remaining.length > 900) {
      const boundary = Math.max(remaining.lastIndexOf('\n', 899), remaining.lastIndexOf(' ', 899));
      const end = boundary > 450 ? boundary + 1 : 900;
      parts.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    if (remaining) parts.push(remaining);
    return parts.map((text, index) => ({
      ...block,
      kind: block.kind === 'heading' && index ? ('paragraph' as const) : block.kind,
      text,
      original_text: text,
    }));
  });
  if (result.length > 400) fail(409, 'El artículo requiere revisión por su extensión.');
  return result;
}

type Provider = 'tcg' | 'ygorganization' | 'myl';
type Job = {
  url: string;
  id: string;
  provider: Provider;
  phase: string;
  header_done: boolean;
  candidate?: WebNewsCandidate;
};
type Summary = {
  published: number;
  retired: number;
  freed_bytes: number;
  checks: string[];
  errors: string[];
};
const message = (error: unknown) =>
  error instanceof AppError
    ? error.message
    : 'La fuente no respondió correctamente; se conserva el contenido publicado.';

// Dependencies are explicit so daily leases and isolation can be exercised without external services.
const services = {
  discover: { tcg: reviewMetaNews, ygorganization: reviewYGOrganizationNews, myl: reviewMylNews },
  ygoBanlist: async (until: number) => {
    if (!(await getBanlist(true))) await refreshBanlist(true);
    let panel = await banlistPanel(true);
    while (panel.ready < panel.total && Date.now() < until)
      panel = await importBanlistCard(3, true);
    if (panel.state && panel.ready === panel.total) await publishBanlistDraft();
  },
  mylBanlist: async (until: number) => {
    let panel = await mylBanlistPanel();
    if (!panel.preparing) panel = await refreshMylBanlists();
    while (panel.preparing && Date.now() < until) panel = await refreshMylBanlists(true);
  },
};

export async function claimContentDay(day: string, token: string, resumePartial = false) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('sergod-daily-content'))");
    const busy = (
      await tx.query(
        "SELECT 1 FROM content_daily_runs WHERE status='running' AND lease_until>now() LIMIT 1",
      )
    ).rows.length;
    if (busy) return false;
    return Boolean(
      (
        await tx.query(
          `INSERT INTO content_daily_runs(day,token,lease_until) VALUES($1,$2,now()+interval '7 minutes')
      ON CONFLICT(day) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until,status='running',
      finished_at=NULL,started_at=now()
      WHERE (content_daily_runs.finished_at IS NULL OR ($3 AND content_daily_runs.status='partial'))
      AND content_daily_runs.lease_until<now() RETURNING day`,
          [day, token, resumePartial],
        )
      ).rows.length,
    );
  });
}

export async function reserveDailyTranslation(day: string, token: string, characters: number) {
  if (!Number.isInteger(characters) || characters < 0) fail(400, 'Tamaño de traducción inválido.');
  const updated = (
    await (
      await getDb()
    ).query(
      `UPDATE content_daily_runs SET translation_chars=translation_chars+$3
    WHERE day=$1 AND token=$2 AND lease_until>now() AND translation_chars+$3 <= $4 RETURNING day`,
      [day, token, characters, DAILY_TRANSLATION_LIMIT],
    )
  ).rows.length;
  if (!updated)
    fail(
      429,
      'Traducción pendiente para la próxima actualización diaria; el avance está guardado.',
    );
}

async function queueCandidates(
  provider: Provider,
  candidates: WebNewsCandidate[],
  day: string,
  recoverReadyDrafts = false,
) {
  const db = await getDb();
  const existing = await getWebNews(true);
  await db.query(
    `INSERT INTO content_news_jobs(url,id,provider,published_on,phase,header_done)
    SELECT x.url,x.id,'existing',x.published_on,'existing',true
    FROM jsonb_to_recordset($1::jsonb) AS x(url text,id text,published_on date)
    ON CONFLICT(url) DO NOTHING`,
    [JSON.stringify(existing.map(({ url, id, published_on }) => ({ url, id, published_on })))],
  );
  const seen = new Map(
    (
      await db.query('SELECT url,phase FROM content_news_jobs WHERE url=ANY($1::text[])', [
        candidates.map((c) => c.url),
      ])
    ).rows.map((r) => [r.url, r.phase] as const),
  );
  const game = provider === 'myl' ? 'myl' : 'yugioh';
  const current = latestNews(existing.filter((i) => i.visible && newsGame(i) === game));
  const cutoff = current.length === NEWS_PER_GAME ? current[current.length - 1].published_on : '';
  for (const item of latestNews(
    candidates.filter((i) => i.published_on <= day && i.published_on >= cutoff),
  )) {
    const stored = existing.find((i) => i.url === item.url);
    // An explicit recovery may adopt a fully prepared source draft from before automation.
    // Retired/published jobs, unverified drafts and incomplete translations stay untouched.
    const recover =
      recoverReadyDrafts &&
      seen.get(item.url) === 'existing' &&
      stored &&
      !stored.visible &&
      !stored.edition_code &&
      stored.original_title === item.title &&
      stored.content_version === 1 &&
      stored.content_language === 'es' &&
      stored.media_checked &&
      Boolean(stored.content_blocks?.length) &&
      !stored.content_blocks?.some((b) => b.original_text) &&
      !stored.media?.some((m) => !m.image);
    if (seen.has(item.url) && !recover) continue;
    const pending = (
      await db.query(`SELECT id,url,published_on::text FROM content_news_jobs
      WHERE phase IN ('queued','prepared') AND ${game === 'myl' ? "provider='myl'" : "provider IN ('tcg','ygorganization')"}
      ORDER BY published_on ASC,url`)
    ).rows;
    if (pending.length >= NEWS_PER_GAME) {
      if (item.published_on <= pending[0].published_on) continue;
      // A broken old source must not occupy the queue forever and block newer revelations.
      await rotateWebNews([pending[0].id]);
      await db.query(
        "UPDATE content_news_jobs SET phase='retired',candidate=NULL,updated_at=now() WHERE url=$1",
        [pending[0].url],
      );
    }
    if (recover) {
      await db.query(
        `UPDATE content_news_jobs SET provider=$2,phase='prepared',header_done=$3,
        candidate=$4::jsonb,last_error=NULL,updated_at=now() WHERE url=$1 AND phase='existing'`,
        [item.url, provider, provider === 'myl', JSON.stringify(item)],
      );
      continue;
    }
    const inserted = (
      await db.query(
        `INSERT INTO content_news_jobs(url,id,provider,published_on,candidate) VALUES($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT(url) DO NOTHING RETURNING url`,
        [item.url, item.id, provider, item.published_on, JSON.stringify(item)],
      )
    ).rows.length;
  }
}

async function advanceNews(job: Job, until: number) {
  const db = await getDb();
  await prepareNewsDraft({ id: job.id, source: job.provider, translate: false }, job.candidate);
  let item = (await getWebNews(true)).find((i) => i.id === job.id && i.url === job.url);
  if (!item) fail(409, 'El borrador no coincide con la fuente.');
  if (!item.media_checked) await prepareWebNewsImages(job.id, false, false, true);
  item = (await getWebNews(true)).find((i) => i.id === job.id)!;
  if (job.phase === 'queued') {
    const blocks = splitTranslationBlocks(item.content_blocks || []);
    await saveWebNews({ ...item, content_blocks: blocks, body: contentBody(blocks) }, job.id);
    await db.query(
      "UPDATE content_news_jobs SET phase='prepared',last_error=NULL,updated_at=now() WHERE url=$1",
      [job.url],
    );
  }
  if (!job.header_done) {
    item = (await getWebNews(true)).find((i) => i.id === job.id)!;
    if (job.provider !== 'myl') {
      const title = await translateNewsText(item.original_title || item.title);
      const summary = await translateNewsText(item.original_summary || item.summary);
      await saveWebNews(
        { ...item, title: title.slice(0, 160), summary: summary.slice(0, 600) },
        job.id,
      );
    }
    await db.query('UPDATE content_news_jobs SET header_done=true WHERE url=$1', [job.url]);
  }
  while (Date.now() < until) {
    item = (await getWebNews(true)).find((i) => i.id === job.id)!;
    if (!item.content_blocks?.some((b) => b.original_text) && !item.media?.some((m) => !m.image)) {
      if (!item.content_blocks?.length && !item.media?.length)
        fail(409, 'La fuente no incluye contenido suficiente para publicar.');
      await saveWebNews({ ...item, visible: true }, job.id);
      await db.query(
        "UPDATE content_news_jobs SET phase='published',candidate=NULL,last_error=NULL,updated_at=now() WHERE url=$1",
        [job.url],
      );
      return true;
    }
    await prepareWebNewsImages(job.id, true);
  }
  return false;
}

export async function runDailyContent(
  overrides: Partial<typeof services> = {},
  durationMs = 220_000,
  resumePartial = false,
) {
  const active = { ...services, ...overrides };
  const day = contentDay(),
    token = randomUUID();
  if (!(await claimContentDay(day, token, resumePartial))) return { skipped: true, day };
  const deadline = Date.now() + durationMs;
  const summary: Summary = { published: 0, retired: 0, freed_bytes: 0, checks: [], errors: [] };
  const db = await getDb();
  const check = async (name: string, work: () => Promise<unknown>) => {
    if (Date.now() >= deadline) return;
    try {
      await work();
      summary.checks.push(name);
    } catch (error) {
      summary.errors.push(`${name}: ${message(error)}`);
    }
  };
  try {
    await check('Limpieza', async () => {
      summary.retired += await rotateWebNews();
      summary.freed_bytes += await cleanupRetiredCovers();
    });
    // Independent sources: a failed translation/provider must never prevent MyL publication.
    for (const provider of ['myl', 'tcg', 'ygorganization'] as const)
      await check(provider, async () => {
        await queueCandidates(
          provider,
          (await active.discover[provider]()).items,
          day,
          resumePartial,
        );
      });
    await withTranslationBudget(
      (characters) => reserveDailyTranslation(day, token, characters),
      async () => {
        await check('Banlist Yu-Gi-Oh! TCG', () =>
          active.ygoBanlist(Math.min(deadline, Date.now() + 25_000)),
        );
        await check('Banlists MyL', () =>
          active.mylBanlist(Math.min(deadline, Date.now() + 25_000)),
        );
      },
    );
    await withTranslationBudget(
      (characters) => reserveDailyTranslation(day, token, characters),
      async () => {
        for (const game of ['myl', 'yugioh']) {
          const until = Math.min(deadline, Date.now() + (game === 'myl' ? 90_000 : 60_000));
          const jobs = (
            await db.query<Job>(`SELECT * FROM content_news_jobs WHERE phase IN ('queued','prepared')
          AND ${game === 'myl' ? "provider='myl'" : "provider IN ('tcg','ygorganization')"}
          ORDER BY published_on DESC,url LIMIT 10`)
          ).rows;
          for (const job of jobs) {
            if (Date.now() >= until) break;
            try {
              if (await advanceNews(job, until)) {
                summary.published++;
                summary.retired += await rotateWebNews();
              }
            } catch (error) {
              const text = message(error);
              summary.errors.push(`${game}: ${text}`);
              await db.query(
                'UPDATE content_news_jobs SET last_error=$2,updated_at=now() WHERE url=$1',
                [job.url, text],
              );
              if (error instanceof AppError && [429, 503].includes(error.status)) break;
            }
          }
        }
      },
    );
    await check('Portadas retiradas', async () => {
      summary.freed_bytes += await cleanupRetiredCovers();
    });
  } finally {
    const pending = Number(
      (
        await db.query(
          "SELECT count(*) AS n FROM content_news_jobs WHERE phase IN ('queued','prepared')",
        )
      ).rows[0].n,
    );
    await db.query(
      `UPDATE content_daily_runs SET status=$3,summary=$4::jsonb,finished_at=now(),lease_until=now()
      WHERE day=$1 AND token=$2`,
      [
        day,
        token,
        pending || (await pendingBanlists()) || summary.errors.length ? 'partial' : 'complete',
        JSON.stringify(summary),
      ],
    );
    // Bounded operational history; retained URL tombstones and cards remain permanent.
    await db.query('DELETE FROM content_daily_runs WHERE day < current_date-90');
  }
  return { skipped: false, day, ...summary };
}

export async function contentAutomationStatus() {
  const db = await getDb();
  const last =
    (
      await db.query(
        'SELECT day,started_at,finished_at,status,translation_chars,summary,lease_until FROM content_daily_runs ORDER BY day DESC LIMIT 1',
      )
    ).rows[0] || null;
  const pending = Number(
    (
      await db.query(
        "SELECT count(*) AS n FROM content_news_jobs WHERE phase IN ('queued','prepared')",
      )
    ).rows[0].n,
  );
  const preserved = Number(
    (await db.query('SELECT count(*) AS n FROM news_card_archives')).rows[0].n,
  );
  const items = await getWebNews(true);
  const publicItems = (await getWebNews()).filter((item) => item.category !== 'banlist');
  const jobs = (
    await db.query<
      Job & { last_error: string | null }
    >(`SELECT id,url,provider,phase,candidate,last_error
    FROM content_news_jobs WHERE phase IN ('queued','prepared') ORDER BY published_on DESC,url LIMIT 20`)
  ).rows;
  const pendingJobs = jobs.map((job) => {
    const item = items.find((i) => i.id === job.id && i.url === job.url);
    return {
      id: job.id,
      title: item?.title || job.candidate?.title || job.id,
      boards: item?.boards || job.candidate?.boards || ['yugioh'],
      images_ready: item?.media?.filter((m) => m.image).length || 0,
      images_total: item?.media?.length || 0,
      translation_pending: item?.content_blocks?.filter((b) => b.original_text).length || 0,
      error: job.last_error,
    };
  });
  return {
    last,
    pending: pending + (await pendingBanlists()),
    preserved,
    retry_available:
      !last ||
      (['partial', 'running'].includes(last.status) && Date.parse(last.lease_until) < Date.now()),
    boards: Object.entries(newsBoards).map(([board, label]) => ({
      board,
      label,
      published: publicItems.filter(
        (i) => i.visible && (i.boards || ['yugioh']).includes(board as keyof typeof newsBoards),
      ).length,
      pending: pendingJobs.filter((j) => j.boards.includes(board as keyof typeof newsBoards))
        .length,
    })),
    pending_jobs: pendingJobs,
    limit: NEWS_PER_GAME,
    schedule: 'Cada mañana · desde las 10:00 UTC (07:00 en verano / 06:00 en invierno en Chile)',
  };
}

async function pendingBanlists() {
  const row = (
    await (
      await getDb()
    ).query(
      "SELECT (CASE WHEN data ? 'ygo_banlist_draft' THEN 1 ELSE 0 END)+(CASE WHEN data ? 'myl_banlist_draft' THEN 1 ELSE 0 END) AS n FROM settings WHERE id=1",
    )
  ).rows[0];
  return Number(row?.n || 0);
}
