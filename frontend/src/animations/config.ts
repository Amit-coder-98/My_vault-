export const timing = {
  micro: 0.18,
  ui: 0.35,
  shared: 0.65,
  cinematic: 0.85,
  song: 0.24,
  background: 0.8,
  reduced: 0.12,
} as const;
export const ease = [0.22, 1, 0.36, 1] as const;
export const sharedTransition = { duration: timing.shared, ease };
export const revealTransition = { duration: timing.ui, ease };
