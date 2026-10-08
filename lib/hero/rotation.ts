import assets from './rotation-assets.json';
import type { HeroCard } from './schema';

export const HERO_ROTATION_MS = 8000;
export function rotatingHeroCard(card: HeroCard, cycle: number): HeroCard {
  if (cycle === 0) return card;
  const deck = assets[card.game];
  const offset = card.role === 'near' || card.role === 'far' ? 1 : 0;
  return { ...card, ...deck[(cycle - 1 + offset) % deck.length] };
}
