'use client';

import { useCallback, useEffect, useState } from 'react';
import { MOTION_PREFERENCE_KEY } from './tokens';

export function useMotionPreferences() {
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncReduced = () => setReduced(media.matches);
    const syncStored = () => {
      try {
        setPaused(window.localStorage.getItem(MOTION_PREFERENCE_KEY) === 'true');
      } catch {
        // The preference remains usable when browser storage is unavailable.
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_PREFERENCE_KEY || event.key === null) syncStored();
    };
    syncReduced();
    syncStored();
    setReady(true);
    media.addEventListener('change', syncReduced);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', syncReduced);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(MOTION_PREFERENCE_KEY, String(next));
      } catch {
        // Pausing never depends on persistence succeeding.
      }
      return next;
    });
  }, []);

  return { ready, paused, reduced, togglePaused };
}
