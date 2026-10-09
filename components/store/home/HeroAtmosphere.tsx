import type { CSSProperties } from 'react';
import styles from './HeroAtmosphere.module.css';

const motes = [
  [8, 72, 0],
  [18, 31, -4],
  [29, 83, -7],
  [40, 13, -2],
  [62, 87, -5],
  [74, 21, -8],
  [84, 67, -3],
  [93, 43, -6],
];

/** Decorative, asset-free scenery. The hero's existing motion control owns every animation. */
export default function HeroAtmosphere({ cycle }: { cycle: number }) {
  return (
    <div className={styles.atmosphere} data-hero-atmosphere aria-hidden="true">
      <div className={styles.hazeLeft} />
      <div className={styles.hazeRight} />
      <div className={styles.texture} />
      <div className={styles.beams} />
      <svg
        className={styles.constellation}
        viewBox="0 0 1440 800"
        preserveAspectRatio="xMidYMid slice"
      >
        <g fill="none" stroke="currentColor" strokeWidth="0.8">
          <path d="M-90 600 235 85 405 38M70 755 350 292M1080 52 1220 192 1540 432M1225 695 1390 530" />
          <path d="m228 85 7-7 7 7-7 7Zm845-33 7-7 7 7-7 7Zm145 643 7-7 7 7-7 7Z" />
        </g>
      </svg>
      <div className={styles.floor}>
        <svg viewBox="0 0 1200 260" fill="none">
          <g className={styles.inscription} stroke="currentColor">
            <ellipse cx="600" cy="130" rx="574" ry="114" />
            <ellipse cx="600" cy="130" rx="553" ry="101" />
            <ellipse cx="600" cy="130" rx="481" ry="82" />
            <path d="m600 16 13 13-13 13-13-13Zm0 202 13 13-13 13-13-13ZM26 130l26-8 26 8-26 8Zm1096 0 26-8 26 8-26 8Z" />
            <path d="m195 50 18 12m-51-5 18 12m-46-5 18 12m834-26-18 12m51-5-18 12m46-5-18 12M195 210l18-12m-51 5 18-12m-46 5 18-12m834 26-18-12m51 5-18-12m46 5-18-12" />
            <path d="m600 48 340 140H260Zm0 164L260 72h680Z" opacity="0.32" />
          </g>
          <g key={cycle} className={styles.invocation} stroke="currentColor">
            <ellipse cx="600" cy="130" rx="553" ry="101" strokeWidth="2" />
            <ellipse cx="600" cy="130" rx="481" ry="82" />
            <path d="M48 130h135m834 0h135M600 28v22m0 160v22" strokeWidth="3" />
          </g>
        </svg>
      </div>
      <div className={styles.motes}>
        {motes.map(([left, top, delay], index) => (
          <span
            key={index}
            className={styles.mote}
            style={{ '--x': `${left}%`, '--y': `${top}%`, '--delay': `${delay}s` } as CSSProperties}
          />
        ))}
      </div>
      <div className={styles.vignette} />
    </div>
  );
}
