export const motion = {
  duration: { fast: 180, normal: 300, slow: 650, hero: 1_000 },
  ease: { enter: 'outCubic', exit: 'inCubic', ambient: 'inOutSine' },
  pointer: { translation: 9, rotation: 3, smoothing: 0.085 },
  scroll: { translation: 28, smoothing: 0.12 },
} as const;

export const MOTION_PREFERENCE_KEY = 'sergod.motion.paused';
