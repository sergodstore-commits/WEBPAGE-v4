export type WebNewsItem = {
  id: string;
  title: string;
  summary: string;
  url: string;
  published_on: string;
  visible: boolean;
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

// A short original Spanish description of the edition supplied by the owner.
// No article text, card catalog or third-party images are stored.
export const initialWebNews: WebNewsItem[] = [
  {
    id: 'beyond-the-brave',
    title: 'Beyond the Brave: explora las cartas de la edición',
    summary:
      'Consulta las cartas de Beyond the Brave organizadas por rareza. Al abrir una carta encontrarás su imagen y efecto en la fuente original.',
    url: 'https://www.yugiohmeta.com/articles/sets/tcg/betb',
    published_on: '2026-09-26',
    visible: true,
  },
];
