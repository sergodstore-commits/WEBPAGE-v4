export type HeroCardEffect = 'none' | 'foil' | 'glow' | 'energy';
export type HeroCardRole = 'lead' | 'companion' | 'near' | 'far';

/** A presentation model, independent of inventory and commercial availability. */
export type HeroCard = {
  id: string;
  game: 'yugioh' | 'mitos';
  front: string;
  frontSmall?: string;
  back?: string;
  backSmall?: string;
  role: HeroCardRole;
  effect: HeroCardEffect;
  mobile: boolean;
  rotation: { x: number; y: number; z: number };
};

/** Keep every combined tilt below the edge when a back image is unavailable. */
export function cardRotation(value: number, hasBack: boolean) {
  return hasBack ? value : Math.max(-45, Math.min(45, value));
}
