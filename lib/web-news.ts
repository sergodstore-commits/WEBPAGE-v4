export type WebNewsItem = {
  boards?: NewsBoard[];
  effective_dates?: Partial<Record<MylNewsBoard, string>>;
  id: string;
  title: string;
  summary: string;
  url: string;
  published_on: string;
  visible: boolean;
  article_path?: string;
  source_label?: string;
  category?: WebNewsCategory;
  image?: string;
  image_bytes?: number;
  source_image?: string;
  original_title?: string;
  original_summary?: string;
  body?: string;
  format?: 'TCG';
  cover_cards?: string[];
  media?: WebNewsMedia[];
  media_checked?: boolean;
};
export type WebNewsMedia = {
  source: string;
  name: string;
  image?: string;
  bytes?: number;
  caption?: string;
  original_caption?: string;
};

export const webNewsCategories = {
  news: 'Actualidad',
  reveals: 'Revelaciones',
  releases: 'Lanzamientos',
  tournaments: 'Torneos',
  banlist: 'Banlist',
} as const;
export type WebNewsCategory = keyof typeof webNewsCategories;
export const newsBoards = {
  yugioh: 'Yu-Gi-Oh! TCG',
  'myl-first-era': 'MyL Primera Era',
  'myl-first-block': 'MyL Primer Bloque',
} as const;
export type NewsBoard = keyof typeof newsBoards;
export type MylNewsBoard = Exclude<NewsBoard, 'yugioh'>;
export type WebNewsCandidate = {
  boards?: NewsBoard[];
  id: string;
  url: string;
  title: string;
  summary: string;
  published_on: string;
  category: WebNewsCategory;
  source_image: string;
};

export function metaNewsImage(value: string): string | null {
  try {
    const u = new URL(value, 'https://s3.duellinksmeta.com');
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 's3.duellinksmeta.com' ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash ||
      !/^\/(?:(?:mdm_img|ygo_img|img)\/[a-zA-Z0-9%_./-]+\.(?:webp|png|jpe?g)|cards\/[a-f0-9]{24}_w420\.webp)$/i.test(
        u.pathname,
      )
    )
      return null;
    return u.toString();
  } catch {
    return null;
  }
}

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
    category: 'releases',
  },
];

export function mylArticle(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'blog.myl.cl' ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash ||
      !/^\/[a-z0-9%_-]+\/?$/i.test(u.pathname) ||
      /^\/(?:wp-json|wp-admin|wp-login|feed|comments)\/?$/i.test(u.pathname)
    )
      return null;
    return `https://blog.myl.cl${u.pathname.replace(/\/$/, '')}/`;
  } catch {
    return null;
  }
}
export function mylNewsImage(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'blog.myl.cl' ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash ||
      !/^\/wp-content\/uploads\/[a-z0-9%_./-]+\.(?:webp|png|jpe?g)$/i.test(u.pathname) ||
      decodeURIComponent(u.pathname).split('/').includes('..')
    )
      return null;
    return u.toString();
  } catch {
    return null;
  }
}
export function newsArticle(value: string) {
  return yugiohMetaArticle(value) || mylArticle(value);
}
export function newsSourceImage(value: string) {
  return metaNewsImage(value) || mylNewsImage(value);
}
