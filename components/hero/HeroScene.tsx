'use client';

import { useEffect, useRef } from 'react';
import type { JSAnimation, Scope } from 'animejs';
import { homeHeroCards } from '@/lib/hero/presets';
import { motion } from '@/lib/motion/tokens';
import { TradingCard3D } from './TradingCard3D';
import styles from './hero.module.css';

type Props = { running: boolean; reduced: boolean; ready: boolean };

export default function HeroScene({ running, reduced, ready }: Props) {
  const scene = useRef<HTMLDivElement>(null);
  const controls = useRef<JSAnimation[]>([]);
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (!ready || reduced || !scene.current) return;
    const root = scene.current;
    const mobile = window.matchMedia('(max-width: 767px)');
    let alive = true;
    let scope: Scope | undefined;

    const start = async () => {
      const { animate, createScope } = await import('animejs');
      if (!alive) return;
      const build = () => {
        scope?.revert();
        controls.current = [];
        scope = createScope({ root }).add(() => {
          const cards = root.querySelectorAll<HTMLElement>('[data-hero-card]');
          cards.forEach((card, index) => {
            if (mobile.matches && card.dataset.mobile === 'false') return;
            const entrance = card.querySelector<HTMLElement>('[data-card-entrance]')!;
            const ambient = card.querySelector<HTMLElement>('[data-card-ambient]')!;
            controls.current.push(
              animate(entrance, {
                translateY: [24, 0],
                duration: motion.duration.hero,
                delay: index * 75,
                ease: motion.ease.enter,
                autoplay: false,
              }),
              animate(ambient, {
                translateY: [0, index % 2 === 0 ? -12 : 10],
                rotateZ: [0, index % 2 === 0 ? 1.5 : -1],
                duration: 7_000 + index * 850,
                ease: motion.ease.ambient,
                alternate: true,
                loop: true,
                autoplay: false,
              }),
            );
            const foil = card.querySelector<HTMLElement>('[data-card-foil]');
            if (foil) {
              controls.current.push(
                animate(foil, {
                  translateX: ['-65%', '65%'],
                  duration: 9_000,
                  ease: motion.ease.ambient,
                  alternate: true,
                  loop: true,
                  autoplay: false,
                }),
              );
            }
            const glow = card.querySelector<HTMLElement>('[data-card-glow]');
            if (glow) {
              controls.current.push(
                animate(glow, {
                  opacity: [0.28, 0.5],
                  duration: 7_800,
                  alternate: true,
                  loop: true,
                  ease: motion.ease.ambient,
                  autoplay: false,
                }),
              );
            }
            const energy = card.querySelectorAll<SVGPathElement>('[data-card-energy]');
            energy.forEach((path) => {
              controls.current.push(
                animate(path, {
                  strokeDashoffset: [1, -1],
                  opacity: [0, 0.65, 0],
                  duration: 2_500,
                  delay: 3_200,
                  loopDelay: 7_500,
                  loop: true,
                  ease: 'linear',
                  autoplay: false,
                }),
              );
            });
          });
        });
        if (runningRef.current) controls.current.forEach((control) => control.resume());
      };
      build();
      mobile.addEventListener('change', build);
      removeMediaListener = () => mobile.removeEventListener('change', build);
    };
    let removeMediaListener = () => {};
    // A failed optional animation chunk still leaves the complete static scene visible.
    void start().catch(() => {});
    return () => {
      alive = false;
      removeMediaListener();
      scope?.revert();
      controls.current = [];
    };
  }, [ready, reduced]);

  useEffect(() => {
    controls.current.forEach((control) => (running ? control.resume() : control.pause()));
  }, [running]);

  useEffect(() => {
    const root = scene.current;
    if (!root || !running || reduced) return;
    const surface = root.closest<HTMLElement>('[data-testid="home-hero"]');
    if (!surface) return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const planes = Array.from(root.querySelectorAll<HTMLElement>('[data-card-parallax]'));
    const scrollPlanes = Array.from(root.querySelectorAll<HTMLElement>('[data-card-scroll]'));
    const depth = [1, 0.7, 1.3, 0.45];
    let pointerPosition: { x: number; y: number } | null = null;
    let targetX = 0;
    let targetY = 0;
    let targetScroll = 0;
    let x = 0;
    let y = 0;
    let scroll = 0;
    let frame = 0;
    let layoutDirty = true;
    const draw = () => {
      if (!desktop.matches) {
        frame = 0;
        return;
      }
      if (layoutDirty) {
        // One geometry read per scheduled frame, before every transform write.
        const bounds = surface.getBoundingClientRect();
        targetScroll = Math.max(0, Math.min(1, -bounds.top / Math.max(1, bounds.height)));
        if (pointerPosition && pointer.matches) {
          targetX = Math.max(
            -1,
            Math.min(1, ((pointerPosition.x - bounds.left) / bounds.width - 0.5) * 2),
          );
          targetY = Math.max(
            -1,
            Math.min(1, ((pointerPosition.y - bounds.top) / bounds.height - 0.5) * 2),
          );
        } else {
          targetX = 0;
          targetY = 0;
        }
        layoutDirty = false;
      }
      x += (targetX - x) * motion.pointer.smoothing;
      y += (targetY - y) * motion.pointer.smoothing;
      scroll += (targetScroll - scroll) * motion.scroll.smoothing;
      planes.forEach((plane, index) => {
        const layerDepth = index < 2 ? 1 : 0.55;
        // Rotation stays within 3 degrees; front-only base angles are clamped to 45.
        plane.style.transform = `translate3d(${x * motion.pointer.translation * layerDepth}px, ${y * motion.pointer.translation * layerDepth}px, 0) rotateX(${-y * motion.pointer.rotation}deg) rotateY(${x * motion.pointer.rotation}deg)`;
      });
      scrollPlanes.forEach((plane, index) => {
        plane.style.transform = `translate3d(0, ${scroll * motion.scroll.translation * (depth[index] ?? 0.7)}px, 0)`;
      });
      if (Math.abs(targetX - x) + Math.abs(targetY - y) + Math.abs(targetScroll - scroll) > 0.002) {
        frame = window.requestAnimationFrame(draw);
      } else frame = 0;
    };
    const queue = () => {
      layoutDirty = true;
      if (!frame && desktop.matches) frame = window.requestAnimationFrame(draw);
    };
    const move = (event: PointerEvent) => {
      if (!desktop.matches || !pointer.matches) return;
      pointerPosition = { x: event.clientX, y: event.clientY };
      queue();
    };
    const leave = () => {
      pointerPosition = null;
      queue();
    };
    const clearPlanes = () => {
      [...planes, ...scrollPlanes].forEach((plane) => plane.style.removeProperty('transform'));
    };
    const onMediaChange = () => {
      pointerPosition = null;
      if (!desktop.matches) {
        window.cancelAnimationFrame(frame);
        frame = 0;
        x = y = scroll = targetX = targetY = targetScroll = 0;
        clearPlanes();
      } else queue();
    };
    queue();
    surface.addEventListener('pointermove', move, { passive: true });
    surface.addEventListener('pointerleave', leave);
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue, { passive: true });
    desktop.addEventListener('change', onMediaChange);
    pointer.addEventListener('change', onMediaChange);
    return () => {
      window.cancelAnimationFrame(frame);
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', leave);
      window.removeEventListener('scroll', queue);
      window.removeEventListener('resize', queue);
      desktop.removeEventListener('change', onMediaChange);
      pointer.removeEventListener('change', onMediaChange);
      clearPlanes();
    };
  }, [running, reduced]);

  return (
    <div ref={scene} className={styles.scene} data-testid="hero-scene" aria-hidden="true">
      {homeHeroCards.map((card) => (
        <TradingCard3D key={card.id} card={card} />
      ))}
    </div>
  );
}
