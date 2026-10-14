import type { WebNewsCandidate } from '../web-news';
import { ygorganizationArticle } from '../web-news';

// Bump when discovery rules change: a recent cache must not bypass the new policy.
export const NEWS_DISCOVERY_POLICY_VERSION = 2;
export function isEditorialNewsCandidate(item: WebNewsCandidate) {
  // YGOrganization's parser reserves "news" for verified card-text corrections/errata.
  return (
    item.category === 'reveals' ||
    item.category === 'releases' ||
    (item.category === 'news' && Boolean(ygorganizationArticle(item.url)))
  );
}

export function editorialText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
