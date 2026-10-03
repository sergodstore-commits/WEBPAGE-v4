import type { HeroCardEffect } from '@/lib/hero/schema';
import styles from './hero.module.css';

export function CardEffects({ effect }: { effect: HeroCardEffect }) {
  if (effect === 'foil') {
    return <span className={styles.foil} data-card-foil aria-hidden="true" />;
  }
  if (effect === 'energy') {
    return (
      <svg className={styles.energy} viewBox="0 0 200 290" fill="none" aria-hidden="true">
        <path
          data-card-energy
          d="M 8 278 L 4 240 L 7 220 L 3 203 L 4 18 Q 4 4 18 4 L 182 4 Q 196 4 196 18 L 194 59 L 198 80 L 195 105"
          pathLength="1"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return null;
}
