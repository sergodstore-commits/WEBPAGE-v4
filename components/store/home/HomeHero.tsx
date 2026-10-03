'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import HeroScene from '@/components/hero/HeroScene';
import { useMotionPreferences } from '@/lib/motion/useMotionPreferences';
import styles from './HomeHero.module.css';

export default function HomeHero({ description }: { description?: string }) {
  const hero = useRef<HTMLElement>(null);
  const { ready, paused, reduced, togglePaused } = useMotionPreferences();
  const [visible, setVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);

  useEffect(() => {
    const syncVisibility = () => setDocumentVisible(!document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.05,
    });
    if (hero.current) observer.observe(hero.current);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  const running = ready && !paused && !reduced && visible && documentVisible;
  const state = reduced ? 'reduced' : running ? 'running' : 'paused';

  return (
    <section
      ref={hero}
      className={styles.hero}
      aria-labelledby="home-hero-heading"
      data-testid="home-hero"
      data-motion={state}
    >
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.orbit} aria-hidden="true" />
      <HeroScene running={running} reduced={reduced} ready={ready} />
      <div className={styles.content}>
        <p className={styles.eyebrow}>
          <span />
          TU TIENDA TCG EN COPIAPÓ
        </p>
        <h1 id="home-hero-heading" className={styles.heading} data-hero-enter="title">
          <span>Tu próxima partida</span>
          <span>
            empieza <em>aquí.</em>
          </span>
        </h1>
        <p className={styles.description} data-hero-enter="description">
          {description?.trim() ||
            'Cartas coleccionables, torneos y comunidad. Comparte tu pasión por el juego con SERGOD STORE.'}
        </p>
        <div className={styles.actions} data-hero-enter="actions">
          <Link href="/tienda" className={styles.primary}>
            Explorar la tienda <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <Link href="/torneos" className={styles.secondary}>
            Ver torneos <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <div
          className={styles.categories}
          aria-label="Explorar por juego"
          data-hero-enter="categories"
        >
          <Link href="/tienda?categoria=Yu-Gi-Oh!">
            Yu-Gi-Oh! <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          <span aria-hidden="true" />
          <Link href="/tienda?categoria=Mitos%20y%20Leyendas">
            Mitos y Leyendas <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className={styles.bottom}>
        <span className={styles.caption}>COLECCIONA. JUEGA. COMPARTE.</span>
        <button
          type="button"
          className={styles.pause}
          onClick={togglePaused}
          disabled={reduced}
          aria-pressed={paused}
          aria-label={
            reduced ? 'Movimiento reducido' : paused ? 'Activar movimiento' : 'Pausar movimiento'
          }
        >
          {paused || reduced ? (
            <Play size={13} aria-hidden="true" />
          ) : (
            <Pause size={13} aria-hidden="true" />
          )}
          <span>
            {reduced ? 'Movimiento reducido' : paused ? 'Activar movimiento' : 'Pausar movimiento'}
          </span>
        </button>
      </div>
    </section>
  );
}
