import type { MylNewsBoard, WebNewsItem } from './web-news';
import { mylArticle } from './web-news';
import { validDay } from './tournament-schedule';

export type BanlistNotice = {
  title: string;
  href: string;
  published_on: string;
  effective_on: string | null;
};
export type NewsBanlistOverview = {
  yugioh: {
    checked_at: string;
    current: { effective_on: string };
    upcoming: { effective_on: string } | null;
  } | null;
  myl: Record<
    MylNewsBoard,
    {
      current: BanlistNotice | null;
      upcoming: BanlistNotice | null;
      unconfirmed: BanlistNotice | null;
    }
  >;
};

export function banlistOverview(
  tcg: NewsBanlistOverview['yugioh'],
  items: WebNewsItem[],
  today: string,
): NewsBanlistOverview {
  if (tcg?.upcoming && tcg.upcoming.effective_on <= today)
    tcg = { ...tcg, current: tcg.upcoming, upcoming: null };
  const myl = Object.fromEntries(
    (['myl-first-era', 'myl-first-block'] as const).map((board) => {
      const notices = items
        .filter(
          (item) =>
            item.visible &&
            item.category === 'banlist' &&
            item.boards?.includes(board) &&
            mylArticle(item.url) &&
            /^[a-zA-Z0-9-]{1,80}$/.test(item.id),
        )
        .map((item): BanlistNotice => ({
          title: item.title,
          href: `/noticias/myl/${item.id}`,
          published_on: item.published_on,
          effective_on: validDay(item.effective_dates?.[board] || '')
            ? item.effective_dates![board]!
            : null,
        }));
      return [
        board,
        {
          current:
            notices
              .filter((n) => n.effective_on && n.effective_on <= today)
              .sort(
                (a, b) =>
                  b.effective_on!.localeCompare(a.effective_on!) ||
                  b.published_on.localeCompare(a.published_on),
              )[0] || null,
          upcoming:
            notices
              .filter((n) => n.effective_on && n.effective_on > today)
              .sort(
                (a, b) =>
                  a.effective_on!.localeCompare(b.effective_on!) ||
                  b.published_on.localeCompare(a.published_on),
              )[0] || null,
          unconfirmed:
            notices
              .filter((n) => !n.effective_on)
              .sort((a, b) => b.published_on.localeCompare(a.published_on))[0] || null,
        },
      ];
    }),
  ) as NewsBanlistOverview['myl'];
  return { yugioh: tcg, myl };
}
