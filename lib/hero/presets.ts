import type { HeroCard } from './schema';

export const homeHeroCards: readonly HeroCard[] = [
  {
    id: 'yugioh-lead',
    game: 'yugioh',
    front: '/art/hero/yugioh-front.png',
    back: '/art/hero/yugioh-back.png',
    role: 'lead',
    effect: 'foil',
    mobile: true,
    rotation: { x: 5, y: -14, z: 12 },
  },
  {
    id: 'mitos-companion',
    game: 'mitos',
    front: '/art/hero/mitos-front.png',
    back: '/art/hero/mitos-back.png',
    role: 'companion',
    effect: 'glow',
    mobile: true,
    rotation: { x: -3, y: 16, z: -13 },
  },
  {
    id: 'yugioh-near',
    game: 'yugioh',
    front: '/art/hero/yugioh-front.png',
    back: '/art/hero/yugioh-back.png',
    role: 'near',
    effect: 'none',
    mobile: false,
    rotation: { x: -9, y: 162, z: -23 },
  },
  {
    id: 'mitos-far',
    game: 'mitos',
    front: '/art/hero/mitos-front.png',
    back: '/art/hero/mitos-back.png',
    role: 'far',
    effect: 'energy',
    mobile: false,
    rotation: { x: 8, y: 198, z: 17 },
  },
];
