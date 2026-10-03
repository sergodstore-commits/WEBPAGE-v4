import type { CSSProperties } from 'react';
import { cardRotation, type HeroCard } from '@/lib/hero/schema';
import { CardEffects } from './CardEffects';
import styles from './hero.module.css';

export function TradingCard3D({ card }: { card: HeroCard }) {
  const hasBack = Boolean(card.back);
  const style = {
    '--card-ratio': card.game === 'yugioh' ? '368 / 543' : '463 / 663',
    '--card-x': `${cardRotation(card.rotation.x, hasBack)}deg`,
    '--card-y': `${cardRotation(card.rotation.y, hasBack)}deg`,
    '--card-z': `${card.rotation.z}deg`,
  } as CSSProperties;

  return (
    <div
      className={`${styles.placement} ${styles[card.role]}`}
      style={style}
      data-hero-card={card.id}
      data-card-role={card.role}
      data-mobile={String(card.mobile)}
      data-has-back={String(hasBack)}
      aria-hidden="true"
    >
      <div className={styles.entrance} data-card-entrance>
        <div className={styles.scroll} data-card-scroll>
          <div className={styles.ambient} data-card-ambient>
            <div className={styles.parallax} data-card-parallax>
              {card.effect === 'glow' && <span className={styles.glow} data-card-glow />}
              <div className={styles.card}>
                <div className={`${styles.face} ${styles.front}`}>
                  {/* Exact user-supplied artwork; its dimensions reserve the card plane. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.front}
                    srcSet={
                      card.frontSmall
                        ? `${card.frontSmall} 320w, ${card.front} ${card.game === 'yugioh' ? 368 : 463}w`
                        : undefined
                    }
                    sizes="(max-width: 767px) 144px, (max-width: 1099px) 170px, 250px"
                    alt=""
                    width={card.game === 'yugioh' ? 368 : 463}
                    height={card.game === 'yugioh' ? 543 : 663}
                    decoding="async"
                    fetchPriority={card.mobile ? 'high' : 'low'}
                    draggable={false}
                  />
                  <CardEffects effect={card.effect} />
                </div>
                {card.back && (
                  <div className={`${styles.face} ${styles.back}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.back}
                      srcSet={
                        card.backSmall
                          ? `${card.backSmall} 320w, ${card.back} ${card.game === 'yugioh' ? 371 : 338}w`
                          : undefined
                      }
                      sizes="(max-width: 767px) 144px, (max-width: 1099px) 170px, 250px"
                      alt=""
                      width={card.game === 'yugioh' ? 371 : 338}
                      height={card.game === 'yugioh' ? 539 : 480}
                      decoding="async"
                      fetchPriority="low"
                      draggable={false}
                    />
                    {card.effect === 'energy' && <CardEffects effect="energy" />}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
