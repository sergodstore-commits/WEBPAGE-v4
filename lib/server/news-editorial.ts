import type { WebNewsCandidate } from '../web-news';

// Bump when discovery rules change: a recent cache must not bypass the new policy.
export const NEWS_DISCOVERY_POLICY_VERSION = 1;
export function isEditorialNewsCandidate(item: WebNewsCandidate) {
  return item.category === 'reveals' || item.category === 'releases';
}

export function editorialText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
