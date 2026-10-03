export const motion = {
  duration: { fast: 180, normal: 300, slow: 650, hero: 1_000 },
  ease: { enter: 'outCubic', exit: 'inCubic', ambient: 'inOutSine' },
  pointer: { translation: 9, rotation: 3, smoothing: 0.085 },
  scroll: { translation: 28, smoothing: 0.12 },
  depth: { near: 1.3, lead: 1, companion: 0.7, far: 0.45 },
  entrance: {
    cardDuration: 780,
    cardDelay: { near: 0, companion: 60, lead: 100, far: 140 },
    content: {
      title: { delay: 200, duration: 650, offset: 10 },
      description: { delay: 300, duration: 550, offset: 8 },
      actions: { delay: 450, duration: 500, offset: 6 },
      categories: { delay: 600, duration: 400, offset: 4 },
    },
  },
} as const;

export const MOTION_PREFERENCE_KEY = 'sergod.motion.paused';
