import { newsRelationship, type NewsIdentity } from './news-deduplication';
export type WebNewsItem = {
  source_published_at?: string;
  dedupe_identity?: NewsIdentity;
  edition_code?: string;
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
  content_blocks?: WebNewsBlock[];
  content_version?: number;
  content_language?: 'es' | 'en';
  translation_pending?: boolean;
  original_content_blocks?: WebNewsBlock[];
  format?: 'TCG' | 'OCG';
  cover_cards?: string[];
  media?: WebNewsMedia[];
  media_checked?: boolean;
};
export type WebNewsBlock = {
  kind: 'heading' | 'paragraph' | 'list' | 'image';
  text: string;
  source?: string;
  original_text?: string;
};
export function newsContentBody(blocks: WebNewsBlock[]) {
  return blocks
    .filter((b) => b.kind !== 'image')
    .map((b) =>
      b.kind === 'heading'
        ? `## ${b.text}`
        : b.kind === 'list'
          ? b.text
              .split('\n')
              .map((s) => `• ${s}`)
              .join('\n')
          : b.text,
    )
    .join('\n\n');
}
// Keep the public version entirely in the source language until Spanish is complete.
// The working translation and original share the same optimized image files.
export function publicNewsContent(item: WebNewsItem): WebNewsItem {
  const { original_content_blocks, dedupe_identity, ...value } = item;
  return item.translation_pending && original_content_blocks?.length
    ? {
        ...value,
        title: item.original_title || item.title,
        summary: item.original_summary || item.summary,
        content_blocks: original_content_blocks,
        body: newsContentBody(original_content_blocks),
        content_language: 'en',
      }
    : value;
}
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
  yugioh: 'Yu-Gi-Oh! TCG / OCG',
  'myl-first-era': 'MyL Primera Era',
  'myl-first-block': 'MyL Primer Bloque',
} as const;
export type NewsBoard = keyof typeof newsBoards;
export type MylNewsBoard = Exclude<NewsBoard, 'yugioh'>;
export type WebNewsCandidate = {
  source_published_at?: string;
  format?: 'TCG' | 'OCG';
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
  return (
    yugiohMetaArticle(value) ||
    mylArticle(value) ||
    ygorganizationArticle(value) ||
    instagramNewsArticle(value)
  );
}
export function newsSourceImage(value: string) {
  return (
    metaNewsImage(value) ||
    mylNewsImage(value) ||
    ygorganizationImage(value) ||
    instagramNewsImage(value)
  );
}
export function instagramNewsArticle(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      !['instagram.com', 'www.instagram.com'].includes(u.hostname) ||
      u.username ||
      u.password ||
      u.port ||
      !/^\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)
    )
      return null;
    return `https://www.instagram.com${u.pathname.replace(/\/$/, '')}/`;
  } catch {
    return null;
  }
}
export function instagramNewsImage(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      u.hash ||
      !['cdninstagram.com', 'fbcdn.net'].some((host) => u.hostname.endsWith(`.${host}`)) ||
      !/\.(?:png|jpe?g|webp)$/i.test(u.pathname)
    )
      return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function ygorganizationArticle(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'ygorganization.com' ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash ||
      !/^\/[a-z0-9_-]+\/?$/i.test(u.pathname) ||
      /^\/(?:api|feed|category|tag|search|login|wp-admin|wp-json)\/?$/i.test(u.pathname)
    )
      return null;
    return `https://ygorganization.com${u.pathname.replace(/\/$/, '')}`;
  } catch {
    return null;
  }
}

export function ygorganizationImage(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== 'https:' ||
      u.hostname !== 'cdn.ygorganization.com' ||
      u.username ||
      u.password ||
      u.port ||
      u.search ||
      u.hash ||
      !/^\/\d{4}\/\d{2}\/[a-z0-9%_.()'-]+\.(?:png|jpe?g|webp)$/i.test(u.pathname) ||
      decodeURIComponent(u.pathname).split('/').includes('..')
    )
      return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function newsSourceLabel(url: string) {
  return mylArticle(url)
    ? 'Blog oficial Mitos y Leyendas'
    : ygorganizationArticle(url)
      ? 'YGOrganization'
      : instagramNewsArticle(url)
        ? 'Yu-Gi-Oh! Europa · Instagram oficial'
        : 'Yu-Gi-Oh! Meta';
}

// Advisory only: different reports about the same set must remain selectable.
export function possibleNewsDuplicate(candidate: WebNewsCandidate, items: WebNewsItem[]) {
  const verified = items.find(
    (item) => item.url !== candidate.url && newsRelationship(candidate, item) === 'duplicate',
  );
  if (verified) return verified;
  const words = (text: string) =>
    new Set(
      text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(
          (word) =>
            word.length > 2 &&
            ![
              'tcg',
              'the',
              'and',
              'new',
              'cards',
              'revealed',
              'first',
              'look',
              'news',
              'announced',
            ].includes(word),
        ),
    );
  const left = words(candidate.title);
  return items.find((item) => {
    if (
      item.url === candidate.url ||
      mylArticle(item.url) ||
      newsSourceLabel(item.url) === newsSourceLabel(candidate.url) ||
      Math.abs(Date.parse(item.published_on) - Date.parse(candidate.published_on)) > 7 * 86400000
    )
      return false;
    const right = words(item.original_title || item.title);
    const common = [...left].filter((word) => right.has(word)).length;
    return common >= 3 && common / Math.max(left.size, right.size) >= 0.65;
  });
}
