'use client';

import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useMotionPreferences } from '@/lib/motion/useMotionPreferences';
import header from './SectionHeader.module.css';
import styles from './StoreSectionBanner.module.css';

/** Small comic reactions registered to the original 1800 × 600 illustration. */
export function StoreSectionBanner({ title }: { title: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const artwork = useRef<HTMLImageElement>(null);
  const { ready, paused, reduced, togglePaused } = useMotionPreferences();
  const [visible, setVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const syncVisibility = () => setDocumentVisible(!document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
    });
    if (frame.current) observer.observe(frame.current);
    if (artwork.current?.complete && artwork.current.naturalWidth > 0) setLoaded(true);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  const running = ready && loaded && !paused && !reduced && visible && documentVisible;
  return (
    <>
      <div className={header.titleRow}>
        <h1 className={header.title}>{title}</h1>
        <button
          type="button"
          className={styles.control}
          onClick={togglePaused}
          aria-pressed={paused}
          disabled={reduced}
          aria-label={
            reduced
              ? 'Efectos reducidos del banner'
              : paused
                ? 'Activar efectos del banner'
                : 'Pausar efectos del banner'
          }
        >
          {paused || reduced ? (
            <Play size={12} aria-hidden="true" />
          ) : (
            <Pause size={12} aria-hidden="true" />
          )}
          <span>{reduced ? 'Sin movimiento' : paused ? 'Activar efectos' : 'Pausar efectos'}</span>
        </button>
      </div>
      <div
        ref={frame}
        className={header.frame}
        data-banner-art
        data-store-banner-motion={reduced ? 'reduced' : running ? 'running' : 'paused'}
      >
        <img
          ref={artwork}
          className={header.illustration}
          src="/art/banners/store-wide.webp"
          width="1800"
          height="600"
          alt=""
          fetchPriority="high"
          decoding="async"
          onLoad={() => setLoaded(true)}
        />
        <svg
          className={styles.effects}
          viewBox="0 0 1800 600"
          aria-hidden="true"
          focusable="false"
          data-store-banner-effects
        >
          <g className={styles.exhale} fill="#fff9ed" stroke="#684631" strokeWidth="2">
            <path d="M474 204c-13 3-19-6-12-15-13-7-8-21 3-21 0-14 18-19 24-8 12-4 20 8 11 17 11 9 5 24-7 23l3 19Z" />
            <circle cx="489" cy="228" r="4" stroke="none" />
          </g>
          <g
            className={styles.laughLeft}
            fill="none"
            stroke="#ffe0a0"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="m949 170 15 22m-34-4 15 22m-14-15 46-24" />
          </g>
          <g
            className={styles.laughRight}
            fill="none"
            stroke="#ffe0a0"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="m1209 176-15 29m32-12-13 33m-32-51 38 32" />
          </g>
          <g fill="#fff3c0">
            <path className={styles.glint} d="m136 27 3 12 12 3-12 3-3 12-3-12-12-3 12-3Z" />
            <path
              className={`${styles.glint} ${styles.glintSecond}`}
              d="m1637 48 3 12 12 3-12 3-3 12-3-12-12-3 12-3Z"
            />
            <path
              className={`${styles.glint} ${styles.glintThird}`}
              d="m1737 251 3 12 12 3-12 3-3 12-3-12-12-3 12-3Z"
            />
          </g>
        </svg>
      </div>
    </>
  );
}
