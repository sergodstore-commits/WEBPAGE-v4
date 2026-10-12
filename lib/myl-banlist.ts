import type { MylNewsBoard, WebNewsMedia } from './web-news';
export const mylBanlistSources = {
  'myl-first-era': 'https://blog.myl.cl/ban-list-primera-era-formato-racial-edicion/',
  'myl-first-block': 'https://blog.myl.cl/banlist-racial-edicion-primer-bloque/',
} as const;
export type MylRestrictedCard = {
  name: string;
  edition: string;
  copies: 0 | 1 | 2 | 3;
  change?: string;
};
export type MylBanlistSnapshot = {
  effective_on: string | null;
  cards: MylRestrictedCard[];
  rules: string[];
  images: WebNewsMedia[];
  sources: string[];
  notes: string[];
};
export type MylBanlistState = {
  checked_at: string;
  formats: Record<MylNewsBoard, MylBanlistSnapshot & { upcoming?: MylBanlistSnapshot }>;
};
export type MylBanlistPanel = {
  state: MylBanlistState | null;
  preparing: boolean;
  ready: number;
  total: number;
  storage_bytes: number;
  storage_limit: number;
};
export const mylCardKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^trauco$/, 'trauko')
    .replace(/^totem del aguila$/, 'totem de aguila');
