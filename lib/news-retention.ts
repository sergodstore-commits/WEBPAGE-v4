import type { WebNewsItem } from './web-news';

export const NEWS_PER_GAME = 10;
export const newsGame = (item: Pick<WebNewsItem, 'boards' | 'url'>) =>
  item.boards?.some((b) => b.startsWith('myl-')) || new URL(item.url).hostname === 'blog.myl.cl'
    ? 'myl'
    : 'yugioh';

// Original publication/release date, never import time; deterministic for equal dates.
export function latestNews<T extends Pick<WebNewsItem, 'id' | 'published_on' | 'url' | 'boards'>>(
  items: T[],
): T[] {
  const counts = { myl: 0, yugioh: 0 };
  return [...items]
    .sort((a, b) => b.published_on.localeCompare(a.published_on) || a.id.localeCompare(b.id))
    .filter((item) => ++counts[newsGame(item)] <= NEWS_PER_GAME);
}
