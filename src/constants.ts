export const GRID_SIZE        = 11;
export const TARGET_WORDS     = 20;
export const HAND_SIZE        = 16;
export const BONUS_SIZE       = 3;
export const WILD_COUNT       = 3;
export const MAX_GEN_ATTEMPTS = 150;
export const ALPHABET         = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Difficulty presets — passed explicitly to generation functions.
 * 0 = perfectly fair (pure random)
 * 1 = fully rigged (worst possible letters, hardest possible words)
 */
export const DIFFICULTY_PRESETS = {
  easy:   0.2,
  medium: 0.55,
  hard:   0.85,
} as const;

export type DifficultyKey = keyof typeof DIFFICULTY_PRESETS;