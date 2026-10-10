export type WebNewsItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  published_on: string;
  visible: boolean;
  article_path?: string;
  source_label?: string;
};

export function yugiohMetaArticle(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !['www.yugiohmeta.com', 'yugiohmeta.com'].includes(u.hostname) ||
      !/^\/articles\/[a-zA-Z0-9%_/-]+$/.test(u.pathname)
    )
      return null;
    return `https://www.yugiohmeta.com${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return null;
  }
}

export function localWebArticle(url: string) {
  return yugiohMetaArticle(url) === 'https://www.yugiohmeta.com/articles/sets/tcg/betb'
    ? '/noticias/beyond-the-brave'
    : null;
}

// Original editorial summary. Full galleries are prepared separately and reviewed.
export const initialWebNews: WebNewsItem[] = [
  {
    id: 'beyond-the-brave',
    title: 'Beyond the Brave: explora las cartas de la edición',
    summary:
      'Explora las 100 cartas de Beyond the Brave. Busca por nombre o rareza y abre cada carta para ver su imagen ampliada y su efecto en español.',
    url: 'https://www.yugiohmeta.com/articles/sets/tcg/betb',
    published_on: '2026-09-26',
    visible: true,
  },
];
