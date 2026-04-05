export const MAX_GEN_ATTEMPTS = 150;
export const ALPHABET         = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Grid configurations ───────────────────────────────────────────────────────

export const GRID_CONFIGS = {
  small:  { size:  7, targetWords: 10, handSize: 10, bonusSize: 2, wildCount: 2, minWordLen: 3, maxWordLen: 5 },
  normal: { size: 11, targetWords: 20, handSize: 14, bonusSize: 2, wildCount: 3, minWordLen: 4, maxWordLen: 6 },
  large:  { size: 15, targetWords: 30, handSize: 16, bonusSize: 3, wildCount: 4, minWordLen: 4, maxWordLen: 8 },
} as const;

export type GridSizeKey = keyof typeof GRID_CONFIGS;

// ── Difficulty presets ────────────────────────────────────────────────────────

export const DIFFICULTY_PRESETS = {
  easy:   0.2,
  medium: 0.55,
  hard:   0.85,
} as const;

export type DifficultyKey = keyof typeof DIFFICULTY_PRESETS;