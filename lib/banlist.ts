import type { EditionCard } from './edition-gallery';

export const banlistSource =
  'https://www.db.yugioh-card.com/yugiohdb/forbidden_limited.action?request_locale=es';
export type BanlistCard = {
  cid: number;
  name: string;
  copies: 0 | 1 | 2 | 3;
  change?: string;
  detail?: EditionCard;
};
export type BanlistSnapshot = { effective_on: string; cards: BanlistCard[] };
export type BanlistState = {
  checked_at: string;
  current: BanlistSnapshot;
  upcoming: BanlistSnapshot | null;
};
export type BanlistPanel = {
  state: BanlistState | null;
  ready: number;
  total: number;
  storage_bytes: number;
  storage_limit: number;
};
export const restrictionLabels = [
  'Prohibidas',
  'Limitadas',
  'Semi-limitadas',
  'Fuera de la lista',
] as const;
export const normalizeCardSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export const banlistDay = (value: string) =>
  new Date(`${value}T12:00:00Z`).toLocaleDateString('es-CL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Santiago',
  });
